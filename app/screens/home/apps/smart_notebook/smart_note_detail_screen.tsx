// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    ActivityIndicator,
    Alert,
    Clipboard,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

import {SafeAreaView} from 'react-native-safe-area-context';

import {useNavigation, useRoute, type RouteProp} from '@react-navigation/native';
import CompassIcon from '@components/compass_icon';
import Markdown from '@components/markdown';
import {Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import DatabaseManager from '@database/manager';
import {useVoiceRecorder, type VoiceRecorderErrorCode} from '@hooks/use_voice_recorder';
import {getCurrentUserId} from '@queries/servers/system';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import {
    getNote,
    createNote,
    updateNote,
    uploadMedia,
    transcribeAudio,
    markdownToBlocks,
    blocksToMarkdown,
    type SmartNote,
} from './smart_notebook_api';

// ---- Types ----

type SmartNoteDetailParams = {
    noteId: string;
    noteTitle?: string;
};

// ---- Component ----

const SmartNoteDetailScreen = () => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const navigation = useNavigation();
    const route = useRoute<RouteProp<{params: SmartNoteDetailParams}, 'params'>>();
    const style = getStyleSheet(theme);

    const {noteId, noteTitle} = route.params;
    const isNew = noteId === 'new';

    // Mode: 'new' = creating new note, 'viewing' = read-only, 'editing' = edit mode
    type NoteMode = 'new' | 'viewing' | 'editing';
    const [mode, setMode] = useState<NoteMode>(isNew ? 'new' : 'viewing');

    const textInputRef = useRef<TextInput>(null);
    const [userId, setUserId] = useState('');
    const [title, setTitle] = useState(noteTitle || '');
    const [content, setContent] = useState('');
    const [originalContent, setOriginalContent] = useState(''); // For cancel comparison
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(!isNew);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [voiceProcessing, setVoiceProcessing] = useState(false);

    // ---- Init ----
    useEffect(() => {
        const init = async () => {
            try {
                const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
                const uid = await getCurrentUserId(database);
                setUserId(uid);

                if (!isNew) {
                    const note = await getNote(serverUrl, uid, noteId);
                    if (note) {
                        setTitle(note.title);
                        const md = blocksToMarkdown(note.blocks || []);
                        setContent(md);
                        setOriginalContent(md);
                    }
                }
            } catch (e) {
                console.error('[SmartNoteDetail] init error:', e);
            } finally {
                setLoading(false);
            }
        };
        init();
    }, [serverUrl, noteId, isNew]);

    // ---- Voice recording (direct transcription API) ----
    const handleVoiceRecorded = useCallback(async (files: FileInfo[]) => {
        if (!files.length) return;
        setVoiceProcessing(true);

        try {
            const file = files[0];

            // Call direct transcription API (no channel needed)
            const result = await transcribeAudio(serverUrl, {
                uri: file.localPath!,
                name: file.name,
                type: file.mime_type || 'audio/mp4',
            });

            if (result.success && result.text) {
                // Insert transcription text into editor
                insertAtCursor(result.text + '\n');
            } else {
                Alert.alert(
                    intl.formatMessage({id: 'smart_notebook.voice_error', defaultMessage: '语音转文字失败'}),
                    result.error || intl.formatMessage({id: 'smart_notebook.voice_empty', defaultMessage: '语音识别结果为空'}),
                    [{text: intl.formatMessage({id: 'common.ok', defaultMessage: '确定'})}],
                );
            }
        } catch (e) {
            Alert.alert(
                intl.formatMessage({id: 'smart_notebook.voice_error', defaultMessage: '语音转文字失败'}),
                String(e),
                [{text: intl.formatMessage({id: 'common.ok', defaultMessage: '确定'})}],
            );
        } finally {
            setVoiceProcessing(false);
        }
    }, [serverUrl, intl, insertAtCursor]);

    const handleVoiceError = useCallback((code: VoiceRecorderErrorCode) => {
        const messages: Record<VoiceRecorderErrorCode, string> = {
            permission_denied: intl.formatMessage({id: 'smart_notebook.voice_permission_denied', defaultMessage: '麦克风权限被拒绝'}),
            record_failed: intl.formatMessage({id: 'smart_notebook.voice_record_failed', defaultMessage: '录音失败'}),
            process_failed: intl.formatMessage({id: 'smart_notebook.voice_process_failed', defaultMessage: '处理录音失败'}),
            too_short: intl.formatMessage({id: 'smart_notebook.voice_too_short', defaultMessage: '录音时间太短'}),
            upload_failed: intl.formatMessage({id: 'smart_notebook.voice_upload_failed', defaultMessage: '上传语音失败'}),
        };
        Alert.alert(intl.formatMessage({id: 'smart_notebook.voice_error', defaultMessage: '语音转文字失败'}), messages[code]);
    }, [intl]);

    const {
        state: voiceState,
        startRecording,
        stopRecordingAndSend,
        cancelRecording,
    } = useVoiceRecorder(handleVoiceRecorded, handleVoiceError);

    // ---- Content change handler ----
    const handleContentChange = useCallback((text: string) => {
        setContent(text);
        setHasChanges(true);
    }, []);

    // ---- Insert markdown at cursor ----
    const insertAtCursor = useCallback((text: string) => {
        const cursorPos = textInputRef.current?.selection?.start || content.length;
        const before = content.substring(0, cursorPos);
        const after = content.substring(cursorPos);
        const newContent = before + text + after;
        setContent(newContent);
        setHasChanges(true);
    }, [content]);

    // ---- Toolbar actions ----
    const insertHeading = useCallback(() => {
        insertAtCursor('# ');
    }, [insertAtCursor]);

    const insertBulletList = useCallback(() => {
        insertAtCursor('- ');
    }, [insertAtCursor]);

    const insertNumberedList = useCallback(() => {
        insertAtCursor('1. ');
    }, [insertAtCursor]);

    const insertQuote = useCallback(() => {
        insertAtCursor('> ');
    }, [insertAtCursor]);

    const insertCode = useCallback(() => {
        insertAtCursor('```\n\n```');
    }, [insertAtCursor]);

    const insertTable = useCallback(() => {
        insertAtCursor('| 列1 | 列2 |\n|-----|-----|\n| 内容 | 内容 |');
    }, [insertAtCursor]);

    // ---- Upload image ----
    const uploadImage = useCallback(async () => {
        if (!userId) return;

        try {
            const {launchImageLibrary} = await import('react-native-image-picker');
            launchImageLibrary({mediaType: 'photo', quality: 0.8}, async (response) => {
                if (response.didCancel || response.errorCode || !response.assets?.[0]) return;

                const asset = response.assets[0];
                const uploadResult = await uploadMedia(serverUrl, userId, {
                    uri: asset.uri!,
                    name: asset.fileName || 'image.jpg',
                    type: asset.type || 'image/jpeg',
                });

                if (uploadResult?.url) {
                    insertAtCursor(`![${asset.fileName || '图片'}](${uploadResult.url})`);
                }
            });
        } catch (e) {
            Alert.alert(
                intl.formatMessage({id: 'smart_notebook.upload_failed', defaultMessage: '上传失败'}),
            );
        }
    }, [serverUrl, userId, insertAtCursor, intl]);

    // ---- Upload video ----
    const uploadVideo = useCallback(async () => {
        if (!userId) return;

        try {
            const {launchImageLibrary} = await import('react-native-image-picker');
            launchImageLibrary({mediaType: 'video', quality: 0.8}, async (response) => {
                if (response.didCancel || response.errorCode || !response.assets?.[0]) return;

                const asset = response.assets[0];
                const uploadResult = await uploadMedia(serverUrl, userId, {
                    uri: asset.uri!,
                    name: asset.fileName || 'video.mp4',
                    type: asset.type || 'video/mp4',
                });

                if (uploadResult?.url) {
                    insertAtCursor(`[视频: ${asset.fileName || 'video'}](${uploadResult.url})`);
                }
            });
        } catch (e) {
            Alert.alert(
                intl.formatMessage({id: 'smart_notebook.upload_failed', defaultMessage: '上传失败'}),
            );
        }
    }, [serverUrl, userId, insertAtCursor, intl]);

    // ---- Save ----
    // Extract title from content:
    // Priority: H1 (# heading) > first non-empty line (stripped of markdown)
    const extractTitleFromContent = useCallback((text: string): string => {
        if (!text || !text.trim()) {
            return intl.formatMessage({id: 'smart_notebook.untitled', defaultMessage: '无标题'});
        }

        const lines = text.split('\n');

        // First pass: look for H1 (# heading)
        for (const line of lines) {
            const h1Match = line.trim().match(/^#\s+(.+)$/);
            if (h1Match && h1Match[1].trim()) {
                const h1Title = h1Match[1].trim();
                return h1Title.length > 50 ? h1Title.substring(0, 50) + '...' : h1Title;
            }
        }

        // Second pass: use first non-empty line (stripped of markdown)
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            // Strip common markdown syntax
            let cleanLine = trimmed
                .replace(/^#{2,6}\s+/, '')             // Remove H2-H6 markers (## ### etc)
                .replace(/^\*\*|\*\*$/g, '')            // Remove bold markers
                .replace(/^\*|\*$/g, '')                // Remove italic markers
                .replace(/^[-*+]\s+/, '')               // Remove list markers (- * +)
                .replace(/^\d+\.\s+/, '')               // Remove numbered list markers (1. 2.)
                .replace(/^>\s+/, '')                   // Remove quote markers
                .replace(/`{1,3}[^`]*`{1,3}/g, '')      // Remove inline code
                .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Extract link text
                .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1') // Extract image alt text
                .trim();

            if (cleanLine) {
                return cleanLine.length > 50 ? cleanLine.substring(0, 50) + '...' : cleanLine;
            }
        }

        return intl.formatMessage({id: 'smart_notebook.untitled', defaultMessage: '无标题'});
    }, [intl]);

    const handleSave = useCallback(async () => {
        if (!userId || saving) return;

        setSaving(true);
        try {
            // Use entered title, or extract from content, or default to "无标题"
            const noteTitle = title.trim() || extractTitleFromContent(content);
            const blocks = markdownToBlocks(content);

            if (isNew) {
                const createdNote = await createNote(serverUrl, userId, noteTitle, 'private');
                if (createdNote?.id) {
                    await updateNote(serverUrl, userId, createdNote.id, {
                        title: noteTitle,
                        blocks,
                    });
                }
            } else {
                await updateNote(serverUrl, userId, noteId, {
                    title: noteTitle,
                    blocks,
                });
            }

            setHasChanges(false);
            setSaveSuccess(true);
            setOriginalContent(content); // Update original content after save
            setTimeout(() => setSaveSuccess(false), 2000);

            // After saving, go back to viewing mode (for editing existing notes)
            if (mode === 'editing') {
                setMode('viewing');
            }
        } catch (e) {
            Alert.alert(
                intl.formatMessage({id: 'smart_notebook.save_failed', defaultMessage: '保存失败'}),
            );
        } finally {
            setSaving(false);
        }
    }, [userId, saving, title, content, isNew, serverUrl, noteId, intl, extractTitleFromContent, mode]);

    // ---- Enter edit mode ----
    const handleEdit = useCallback(() => {
        setMode('editing');
        setOriginalContent(content); // Store current content for cancel comparison
        // Focus the text input after a short delay
        setTimeout(() => textInputRef.current?.focus(), 100);
    }, [content]);

    // ---- Cancel editing ----
    const handleCancel = useCallback(() => {
        if (content !== originalContent) {
            Alert.alert(
                intl.formatMessage({id: 'smart_notebook.unsaved_changes', defaultMessage: '未保存的更改'}),
                intl.formatMessage({id: 'smart_notebook.discard_changes', defaultMessage: '是否放弃更改？'}),
                [
                    {
                        text: intl.formatMessage({id: 'common.cancel', defaultMessage: '取消'}),
                        style: 'cancel',
                    },
                    {
                        text: intl.formatMessage({id: 'smart_notebook.discard', defaultMessage: '放弃'}),
                        style: 'destructive',
                        onPress: () => {
                            setContent(originalContent);
                            setHasChanges(false);
                            setMode('viewing');
                        },
                    },
                ],
            );
        } else {
            setMode('viewing');
        }
    }, [content, originalContent, intl]);

    // ---- Copy content (plain text, no formatting) ----
    const handleCopy = useCallback(() => {
        if (!content.trim()) {
            Alert.alert(
                intl.formatMessage({id: 'smart_notebook.copy_empty', defaultMessage: '没有可复制的内容'}),
            );
            return;
        }
        Clipboard.setString(content);
        Alert.alert(
            intl.formatMessage({id: 'smart_notebook.copy_success', defaultMessage: '已复制到剪贴板'}),
        );
    }, [content, intl]);

    // ---- Go back with confirmation ----
    const handleGoBack = useCallback(() => {
        if (hasChanges) {
            Alert.alert(
                intl.formatMessage({id: 'smart_notebook.unsaved_changes', defaultMessage: '未保存的更改'}),
                intl.formatMessage({id: 'smart_notebook.unsaved_changes_message', defaultMessage: '是否保存更改？'}),
                [
                    {
                        text: intl.formatMessage({id: 'common.cancel', defaultMessage: '取消'}),
                        style: 'cancel',
                        onPress: () => navigation.goBack(),
                    },
                    {
                        text: intl.formatMessage({id: 'smart_notebook.dont_save', defaultMessage: '不保存'}),
                        style: 'destructive',
                        onPress: () => navigation.goBack(),
                    },
                    {
                        text: intl.formatMessage({id: 'smart_notebook.save', defaultMessage: '保存'}),
                        onPress: async () => {
                            await handleSave();
                        },
                    },
                ],
            );
        } else {
            navigation.goBack();
        }
    }, [hasChanges, handleSave, navigation, intl]);

    // ---- Render ----
    if (loading) {
        return (
            <SafeAreaView style={style.container}>
                <View style={style.header}>
                    <View style={style.headerBtn}/>
                    <Text style={style.headerTitle}>加载中...</Text>
                    <View style={style.headerBtn}/>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={style.container}>
            <KeyboardAvoidingView
                style={style.container}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                {/* Header */}
                <View style={style.header}>
                    <TouchableOpacity onPress={mode === 'editing' ? handleCancel : handleGoBack} style={style.headerBtn}>
                        <CompassIcon
                            name={mode === 'editing' ? 'close' : 'arrow-left'}
                            size={20}
                            color={theme.sidebarText}
                        />
                    </TouchableOpacity>
                    <View style={style.headerTitleContainer}>
                        <Text style={style.headerLabel} numberOfLines={1}>
                            {mode === 'new'
                                ? intl.formatMessage({id: 'smart_notebook.new_note', defaultMessage: '新建笔记'})
                                : mode === 'editing'
                                    ? intl.formatMessage({id: 'smart_notebook.edit_note', defaultMessage: '编辑笔记'})
                                    : title || intl.formatMessage({id: 'smart_notebook.untitled', defaultMessage: '无标题'})}
                        </Text>
                    </View>
                    {mode === 'viewing' ? (
                        <View style={style.headerActions}>
                            <TouchableOpacity onPress={handleCopy} style={style.headerActionBtn}>
                                <CompassIcon name='content-copy' size={20} color={theme.sidebarText}/>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleEdit} style={style.saveBtn}>
                                <Text style={style.saveBtnText}>
                                    {intl.formatMessage({id: 'smart_notebook.edit', defaultMessage: '编辑'})}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    ) : saveSuccess ? (
                        <View style={style.saveSuccessContainer}>
                            <Text style={style.saveSuccessText}>
                                {intl.formatMessage({id: 'smart_notebook.saved', defaultMessage: '已保存'})}
                            </Text>
                        </View>
                    ) : (
                        <TouchableOpacity onPress={handleSave} style={style.saveBtn} disabled={saving}>
                            <Text style={[style.saveBtnText, saving && style.saveBtnTextDisabled]}>
                                {intl.formatMessage({id: 'smart_notebook.save', defaultMessage: '保存'})}
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Content Area */}
                <ScrollView style={style.editorContainer} keyboardShouldPersistTaps='handled'>
                    {mode === 'viewing' ? (
                        // Read-only view with Markdown rendering
                        <TouchableOpacity
                            style={style.readOnlyContainer}
                            onPress={handleEdit}
                            activeOpacity={0.8}
                        >
                            {content ? (
                                <Markdown
                                    value={content}
                                    baseTextStyle={style.readOnlyContent}
                                    location={Screens.SMART_NOTE_DETAIL}
                                    theme={theme}
                                    disableAtMentions={true}
                                    disableChannelLink={true}
                                    disableGallery={true}
                                />
                            ) : (
                                <Text style={style.readOnlyContent}>
                                    {intl.formatMessage({id: 'smart_notebook.empty_content', defaultMessage: '暂无内容，点击编辑'})}
                                </Text>
                            )}
                        </TouchableOpacity>
                    ) : (
                        // Editable view
                        <TextInput
                            ref={textInputRef}
                            style={style.editor}
                            value={content}
                            onChangeText={handleContentChange}
                            placeholder={intl.formatMessage({id: 'smart_notebook.content_placeholder', defaultMessage: '输入 Markdown 内容...'})}
                            placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.3)}
                            multiline
                            textAlignVertical='top'
                            autoCapitalize='none'
                            autoCorrect={false}
                            autoFocus={mode === 'new'}
                        />
                    )}
                </ScrollView>

                {/* Recording indicator */}
                {voiceState === 'recording' && (
                    <View style={style.recordingBanner}>
                        <CompassIcon name='microphone' size={16} color={theme.dndIndicator}/>
                        <Text style={style.recordingText}>
                            {intl.formatMessage({id: 'smart_notebook.recording', defaultMessage: '录音中...点击麦克风结束'})}
                        </Text>
                    </View>
                )}
                {voiceProcessing && (
                    <View style={style.recordingBanner}>
                        <ActivityIndicator size='small' color={theme.buttonBg}/>
                        <Text style={style.recordingText}>
                            {intl.formatMessage({id: 'smart_notebook.processing_voice', defaultMessage: '语音转文字中...'})}
                        </Text>
                    </View>
                )}

                {/* Toolbar - only show in edit mode */}
                {mode !== 'viewing' && (
                <View style={style.toolbar}>
                    <TouchableOpacity onPress={insertHeading} style={style.toolbarBtn}>
                        <Text style={style.toolbarText}>H1</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={insertBulletList} style={style.toolbarBtn}>
                        <Text style={style.toolbarText}>•</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={insertNumberedList} style={style.toolbarBtn}>
                        <Text style={style.toolbarText}>1.</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={insertQuote} style={style.toolbarBtn}>
                        <Text style={style.toolbarText}>"</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={insertCode} style={style.toolbarBtn}>
                        <Text style={style.toolbarText}>&lt;/&gt;</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={insertTable} style={style.toolbarBtn}>
                        <Text style={style.toolbarText}>⊞</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={uploadImage} style={style.toolbarBtn}>
                        <CompassIcon name='image-outline' size={20} color={theme.centerChannelColor}/>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={uploadVideo} style={style.toolbarBtn}>
                        <CompassIcon name='video-outline' size={20} color={theme.centerChannelColor}/>
                    </TouchableOpacity>
                    {voiceProcessing ? (
                        <View style={style.toolbarBtn}>
                            <ActivityIndicator size='small' color={theme.buttonBg}/>
                        </View>
                    ) : voiceState === 'recording' ? (
                        <TouchableOpacity onPress={stopRecordingAndSend} style={[style.toolbarBtn, style.toolbarBtnActive]}>
                            <CompassIcon name='microphone' size={20} color={theme.dndIndicator}/>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity onPress={startRecording} style={style.toolbarBtn}>
                            <CompassIcon name='microphone-outline' size={20} color={theme.centerChannelColor}/>
                        </TouchableOpacity>
                    )}
                </View>
                )}
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

// ---- Styles ----

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: theme.sidebarBg,
    },
    headerBtn: {
        padding: 8,
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    headerActionBtn: {
        padding: 8,
        marginRight: 4,
    },
    saveBtn: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: theme.buttonBg,
        borderRadius: 4,
    },
    saveBtnText: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.buttonColor,
    },
    saveBtnTextDisabled: {
        opacity: 0.5,
    },
    saveSuccessContainer: {
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    saveSuccessText: {
        ...typography('Body', 100),
        color: theme.onlineIndicator,
    },
    headerTitle: {
        ...typography('Heading', 200, 'SemiBold'),
        color: theme.sidebarText,
        flex: 1,
    },
    headerTitleContainer: {
        flex: 1,
        alignItems: 'center',
    },
    headerLabel: {
        ...typography('Heading', 300, 'SemiBold'),
        color: theme.sidebarText,
    },
    editorContainer: {
        flex: 1,
    },
    editor: {
        flex: 1,
        paddingHorizontal: 16,
        paddingVertical: 12,
        ...typography('Body', 100),
        color: theme.centerChannelColor,
        minHeight: 200,
    },
    readOnlyContainer: {
        flex: 1,
        paddingHorizontal: 16,
        paddingVertical: 12,
        minHeight: 200,
    },
    readOnlyContent: {
        ...typography('Body', 100),
        color: theme.centerChannelColor,
        lineHeight: 24,
    },
    toolbar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
        paddingHorizontal: 8,
        paddingVertical: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.1),
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.02),
    },
    toolbarBtn: {
        padding: 8,
        borderRadius: 4,
    },
    toolbarBtnActive: {
        backgroundColor: changeOpacity(theme.dndIndicator, 0.15),
    },
    recordingBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        backgroundColor: changeOpacity(theme.dndIndicator, 0.08),
        paddingHorizontal: 16,
    },
    recordingText: {
        ...typography('Body', 75),
        color: theme.dndIndicator,
        marginLeft: 8,
    },
    toolbarText: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.centerChannelColor,
    },
}));

export default SmartNoteDetailScreen;
