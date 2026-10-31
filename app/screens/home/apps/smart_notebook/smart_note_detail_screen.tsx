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
    const [tags, setTags] = useState<string[]>([]);
    const [tagInput, setTagInput] = useState('');
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(!isNew);
    const [previewMode, setPreviewMode] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);

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
                        setTags(note.tags || []);
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
            '语音输入',
            '语音输入功能需要安装 @react-native-voice/voice 库',
            [{text: '确定'}],
        );
    }, []);

    // ---- Add tag ----
    const addTag = useCallback(() => {
        const tag = tagInput.trim();
        if (tag && !tags.includes(tag)) {
            setTags(prev => [...prev, tag]);
            setTagInput('');
            setHasChanges(true);
        }
    }, [tagInput, tags]);

    const removeTag = useCallback((tag: string) => {
        setTags(prev => prev.filter(t => t !== tag));
        setHasChanges(true);
    }, []);

    // ---- Save ----
    const handleSave = useCallback(async () => {
        if (!userId || saving) return;

        setSaving(true);
        try {
            const noteTitle = title.trim() || '无标题';
            const blocks = markdownToBlocks(content);

            if (isNew) {
                const createdNote = await createNote(serverUrl, userId, noteTitle, 'private');
                if (createdNote?.id) {
                    await updateNote(serverUrl, userId, createdNote.id, {
                        title: noteTitle,
                        blocks,
                        tags,
                    });
                }
            } else {
                await updateNote(serverUrl, userId, noteId, {
                    title: noteTitle,
                    blocks,
                    tags,
                });
            }

            setHasChanges(false);
            Alert.alert('保存成功');
            navigation.goBack();
        } catch (e) {
            Alert.alert(
                intl.formatMessage({id: 'smart_notebook.save_failed', defaultMessage: '保存失败'}),
            );
        } finally {
            setSaving(false);
        }
    }, [userId, saving, title, content, tags, isNew, serverUrl, noteId, intl, navigation]);

    // ---- Go back with confirmation ----
    const handleGoBack = useCallback(() => {
        if (hasChanges) {
            Alert.alert(
                '未保存的更改',
                '是否保存更改？',
                [
                    {
                        text: '取消',
                        style: 'cancel',
                        onPress: () => navigation.goBack(),
                    },
                    {
                        text: '不保存',
                        style: 'destructive',
                        onPress: () => navigation.goBack(),
                    },
                    {
                        text: '保存',
                        onPress: async () => {
                            await handleSave();
                        },
                    },
                ],
            );
        } else {
            navigation.goBack();
        }
    }, [hasChanges, handleSave, navigation]);

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
                        placeholder='笔记标题'
                        placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.5)}
                    />
                    <TouchableOpacity onPress={handleSave} style={style.headerBtn} disabled={saving}>
                        <CompassIcon
                            name='check'
                            size={24}
                            color={saving ? changeOpacity(theme.buttonBg, 0.5) : theme.buttonBg}
                        />
                    </TouchableOpacity>
                </View>

                {/* Tags */}
                <View style={style.tagsContainer}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        {tags.map((tag, idx) => (
                            <View key={idx} style={style.tag}>
                                <Text style={style.tagText}>#{tag}</Text>
                                <TouchableOpacity onPress={() => removeTag(tag)} style={style.tagRemove}>
                                    <CompassIcon name='close' size={12} color={theme.buttonBg}/>
                                </TouchableOpacity>
                            </View>
                        ))}
                    </ScrollView>
                    <TextInput
                        style={style.tagInput}
                        value={tagInput}
                        onChangeText={setTagInput}
                        onSubmitEditing={addTag}
                        placeholder='添加标签...'
                        placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.5)}
                    />
                </View>

                {/* Preview toggle */}
                <View style={style.previewToggle}>
                    <TouchableOpacity
                        style={[style.previewBtn, !previewMode && style.previewBtnActive]}
                        onPress={() => setPreviewMode(false)}
                    >
                        <Text style={[style.previewText, !previewMode && style.previewTextActive]}>
                            编辑
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[style.previewBtn, previewMode && style.previewBtnActive]}
                        onPress={() => setPreviewMode(true)}
                    >
                        <Text style={[style.previewText, previewMode && style.previewTextActive]}>
                            预览
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Editor / Preview */}
                <ScrollView style={style.editorContainer} keyboardShouldPersistTaps='handled'>
                    {previewMode ? (
                        <View style={style.previewContainer}>
                            {/* Simple markdown preview - in production use react-native-markdown-display */}
                            <Text style={style.previewText}>{content || '无内容'}</Text>
                        </View>
                    ) : (
                        <TextInput
                            ref={textInputRef}
                            style={style.editor}
                            value={content}
                            onChangeText={handleContentChange}
                            placeholder='输入 Markdown 内容...&#10;&#10;支持语法：&#10;# 标题&#10;- 列表&#10;> 引用&#10;```代码```'
                            placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.3)}
                            multiline
                            textAlignVertical='top'
                            autoCapitalize='none'
                            autoCorrect={false}
                        />
                    )}
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
    headerTitle: {
        ...typography('Heading', 200, 'SemiBold'),
        color: theme.centerChannelColor,
        flex: 1,
        textAlign: 'center',
    },
    tagsContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    tag: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: changeOpacity(theme.buttonBg, 0.1),
        borderRadius: 12,
        paddingHorizontal: 8,
        paddingVertical: 4,
        marginRight: 8,
    },
    tagText: {
        ...typography('Body', 75),
        color: theme.buttonBg,
    },
    tagRemove: {
        marginLeft: 4,
    },
    tagInput: {
        flex: 1,
        ...typography('Body', 100),
        color: theme.centerChannelColor,
        padding: 0,
    },
    previewToggle: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    previewBtn: {
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 16,
        marginRight: 8,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.06),
    },
    previewBtnActive: {
        backgroundColor: theme.buttonBg,
    },
    previewText: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.7),
    },
    previewTextActive: {
        color: theme.buttonColor,
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
    previewContainer: {
        flex: 1,
        paddingHorizontal: 16,
        paddingVertical: 12,
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
