// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    Alert,
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
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import DatabaseManager from '@database/manager';
import {getCurrentUserId} from '@queries/servers/system';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import {
    getNote,
    createNote,
    updateNote,
    uploadMedia,
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

    const textInputRef = useRef<TextInput>(null);
    const [userId, setUserId] = useState('');
    const [title, setTitle] = useState(noteTitle || '');
    const [content, setContent] = useState('');
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(!isNew);
    const [hasChanges, setHasChanges] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);

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
                        setContent(blocksToMarkdown(note.blocks || []));
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

    // ---- Voice input (placeholder - requires @react-native-voice/voice) ----
    const startVoiceInput = useCallback(() => {
        Alert.alert(
            intl.formatMessage({id: 'smart_notebook.voice_input', defaultMessage: '语音输入'}),
            intl.formatMessage({id: 'smart_notebook.voice_input_unavailable', defaultMessage: '语音输入功能需要安装 @react-native-voice/voice 库'}),
            [{text: intl.formatMessage({id: 'common.ok', defaultMessage: '确定'})}],
        );
    }, [intl]);

    // ---- Save ----
    // Extract title from content (first non-empty line, stripped of markdown syntax)
    const extractTitleFromContent = useCallback((text: string): string => {
        if (!text || !text.trim()) {
            return intl.formatMessage({id: 'smart_notebook.untitled', defaultMessage: '无标题'});
        }

        const lines = text.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            // Strip common markdown syntax
            let cleanLine = trimmed
                .replace(/^#{1,6}\s+/, '')           // Remove heading markers (# ## ###)
                .replace(/^\*\*|\*\*$/g, '')          // Remove bold markers
                .replace(/^\*|\*$/g, '')              // Remove italic markers
                .replace(/^[-*+]\s+/, '')             // Remove list markers (- * +)
                .replace(/^\d+\.\s+/, '')             // Remove numbered list markers (1. 2.)
                .replace(/^>\s+/, '')                 // Remove quote markers
                .replace(/`{1,3}[^`]*`{1,3}/g, '')    // Remove inline code
                .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Extract link text
                .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1') // Extract image alt text
                .trim();

            if (cleanLine) {
                // Limit title length
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
            setTimeout(() => setSaveSuccess(false), 2000);
        } catch (e) {
            Alert.alert(
                intl.formatMessage({id: 'smart_notebook.save_failed', defaultMessage: '保存失败'}),
            );
        } finally {
            setSaving(false);
        }
    }, [userId, saving, title, content, isNew, serverUrl, noteId, intl, extractTitleFromContent]);

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
                    <TouchableOpacity onPress={handleGoBack} style={style.headerBtn}>
                        <CompassIcon name='arrow-left' size={24} color={theme.centerChannelColor}/>
                    </TouchableOpacity>
                    <TextInput
                        style={style.headerTitle}
                        value={title}
                        onChangeText={(text) => {
                            setTitle(text);
                            setHasChanges(true);
                        }}
                        placeholder={intl.formatMessage({id: 'smart_notebook.title_placeholder', defaultMessage: '笔记标题'})}
                        placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.5)}
                    />
                    {saveSuccess ? (
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

                {/* Editor */}
                <ScrollView style={style.editorContainer} keyboardShouldPersistTaps='handled'>
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
                    />
                </ScrollView>

                {/* Toolbar */}
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
                        <CompassIcon name='table' size={20} color={theme.centerChannelColor}/>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={uploadImage} style={style.toolbarBtn}>
                        <CompassIcon name='image-outline' size={20} color={theme.centerChannelColor}/>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={uploadVideo} style={style.toolbarBtn}>
                        <CompassIcon name='video-outline' size={20} color={theme.centerChannelColor}/>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={startVoiceInput} style={style.toolbarBtn}>
                        <CompassIcon name='microphone-outline' size={20} color={theme.centerChannelColor}/>
                    </TouchableOpacity>
                </View>
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
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    headerBtn: {
        padding: 8,
        minWidth: 40,
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
        color: theme.centerChannelColor,
        flex: 1,
        textAlign: 'center',
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
    toolbarText: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.centerChannelColor,
    },
}));

export default SmartNoteDetailScreen;
