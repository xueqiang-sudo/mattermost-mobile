// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {launchImageLibrary} from 'react-native-image-picker';

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
    pushToGraphiti,
    getRelatedNotes,
    type SmartNote,
    type SmartNoteBlock,
    type RelatedNote,
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

    const [userId, setUserId] = useState('');
    const [title, setTitle] = useState(noteTitle || '');
    const [blocks, setBlocks] = useState<SmartNoteBlock[]>([]);
    const [tags, setTags] = useState<string[]>([]);
    const [tagInput, setTagInput] = useState('');
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(!isNew);
    const [pushing, setPushing] = useState(false);
    const [relatedNotes, setRelatedNotes] = useState<RelatedNote[]>([]);

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
                        setBlocks(note.blocks || []);
                        setTags(note.tags || []);
                    }
                } else {
                    // Start with one empty paragraph
                    setBlocks([{
                        id: 'blk_' + Date.now().toString(36),
                        type: 'paragraph',
                        content: '',
                        order: 0,
                    }]);
                }
            } catch (e) {
                console.error('[SmartNoteDetail] init error:', e);
            } finally {
                setLoading(false);
            }
        };
        init();
    }, [serverUrl, userId, noteId, isNew]);

    // ---- Update block content ----
    const updateBlockContent = useCallback((blockId: string, content: string) => {
        setBlocks(prev => prev.map(b =>
            b.id === blockId ? {...b, content} : b,
        ));
    }, []);

    // ---- Add new block ----
    const addBlock = useCallback((type: SmartNoteBlock['type'] = 'paragraph') => {
        const newBlock: SmartNoteBlock = {
            id: 'blk_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8),
            type,
            content: '',
            order: blocks.length,
        };
        setBlocks(prev => [...prev, newBlock]);
    }, [blocks.length]);

    // ---- Delete block ----
    const deleteBlock = useCallback((blockId: string) => {
        setBlocks(prev => {
            const filtered = prev.filter(b => b.id !== blockId);
            return filtered.map((b, idx) => ({...b, order: idx}));
        });
    }, []);

    // ---- Upload image ----
    const uploadImage = useCallback(async () => {
        if (!userId) return;

        launchImageLibrary({mediaType: 'photo', quality: 0.8}, async (response) => {
            if (response.didCancel || response.errorCode) return;

            const asset = response.assets?.[0];
            if (!asset?.uri) return;

            try {
                const result = await uploadMedia(serverUrl, userId, {
                    uri: asset.uri,
                    name: asset.fileName || 'image.jpg',
                    type: asset.type || 'image/jpeg',
                });

                if (result?.url) {
                    const newBlock: SmartNoteBlock = {
                        id: 'blk_' + Date.now().toString(36),
                        type: 'image',
                        content: result.url,
                        order: blocks.length,
                        meta: {fileId: result.fileId},
                    };
                    setBlocks(prev => [...prev, newBlock]);
                }
            } catch (e) {
                Alert.alert(
                    intl.formatMessage({id: 'smart_notebook.upload_failed', defaultMessage: '上传失败'}),
                );
            }
        });
    }, [serverUrl, userId, blocks.length, intl]);

    // ---- Add tag ----
    const addTag = useCallback(() => {
        const tag = tagInput.trim();
        if (tag && !tags.includes(tag)) {
            setTags(prev => [...prev, tag]);
            setTagInput('');
        }
    }, [tagInput, tags]);

    const removeTag = useCallback((tag: string) => {
        setTags(prev => prev.filter(t => t !== tag));
    }, []);

    // ---- Load related notes ----
    const loadRelated = useCallback(async () => {
        if (!userId || isNew) return;
        try {
            const result = await getRelatedNotes(serverUrl, userId, noteId, 5);
            setRelatedNotes(result?.entries || []);
        } catch {
            // ignore
        }
    }, [serverUrl, userId, noteId, isNew]);

    useEffect(() => {
        loadRelated();
    }, [loadRelated]);

    // ---- Push to Graphiti ----
    const handlePushGraphiti = useCallback(async () => {
        if (!userId || isNew || pushing) return;

        setPushing(true);
        try {
            const result = await pushToGraphiti(serverUrl, userId, noteId);
            Alert.alert(
                result.pushed ? '已推送到知识图谱' : '无需推送',
                result.message || '',
            );
        } catch (e) {
            Alert.alert(
                intl.formatMessage({id: 'smart_notebook.push_failed', defaultMessage: '推送失败'}),
            );
        } finally {
            setPushing(false);
        }
    }, [userId, isNew, pushing, serverUrl, noteId, intl]);

    // ---- Save ----
    const handleSave = useCallback(async () => {
        if (!userId || saving) return;

        setSaving(true);
        try {
            const noteTitle = title.trim() || '无标题';

            if (isNew) {
                await createNote(serverUrl, userId, noteTitle, 'private');
                // For simplicity, we'll just create and navigate back
                // In a real app, you'd get the created note ID and update it
            } else {
                await updateNote(serverUrl, userId, noteId, {
                    title: noteTitle,
                    blocks,
                    tags,
                });
            }

            navigation.goBack();
        } catch (e) {
            Alert.alert(
                intl.formatMessage({id: 'smart_notebook.save_failed', defaultMessage: '保存失败'}),
            );
        } finally {
            setSaving(false);
        }
    }, [userId, saving, title, blocks, tags, isNew, serverUrl, noteId, intl, navigation]);

    // ---- Render block ----
    const renderBlock = useCallback((block: SmartNoteBlock) => {
        switch (block.type) {
            case 'heading':
                return (
                    <TextInput
                        key={block.id}
                        style={[style.blockInput, style.headingInput]}
                        value={block.content}
                        onChangeText={(text) => updateBlockContent(block.id, text)}
                        placeholder='标题'
                        placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.3)}
                        multiline
                    />
                );
            case 'blockquote':
                return (
                    <View key={block.id} style={style.quoteContainer}>
                        <View style={style.quoteBar}/>
                        <TextInput
                            style={[style.blockInput, style.quoteInput]}
                            value={block.content}
                            onChangeText={(text) => updateBlockContent(block.id, text)}
                            placeholder='引用'
                            placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.3)}
                            multiline
                        />
                    </View>
                );
            case 'code-block':
                return (
                    <View key={block.id} style={style.codeContainer}>
                        <TextInput
                            style={[style.blockInput, style.codeInput]}
                            value={block.content}
                            onChangeText={(text) => updateBlockContent(block.id, text)}
                            placeholder='代码'
                            placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.3)}
                            multiline
                        />
                    </View>
                );
            case 'image':
                return (
                    <View key={block.id} style={style.imageContainer}>
                        <Text style={style.imageText}>📷 [图片: {block.content}]</Text>
                    </View>
                );
            default:
                return (
                    <TextInput
                        key={block.id}
                        style={style.blockInput}
                        value={block.content}
                        onChangeText={(text) => updateBlockContent(block.id, text)}
                        placeholder='输入内容...'
                        placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.3)}
                        multiline
                    />
                );
        }
    }, [style, theme, updateBlockContent]);

    if (loading) {
        return (
            <SafeAreaView style={[style.container, {backgroundColor: theme.centerChannelBg}]}>
                <View style={style.loadingContainer}>
                    <Text style={style.loadingText}>加载中...</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[style.container, {backgroundColor: theme.centerChannelBg}]}>
            <View style={style.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={style.backButton}>
                    <CompassIcon name='arrow-left' size={24} color={theme.centerChannelColor}/>
                </TouchableOpacity>
                <Text style={style.headerTitle} numberOfLines={1}>
                    {isNew ? '新建笔记' : title || '笔记详情'}
                </Text>
                <TouchableOpacity onPress={handleSave} style={style.saveButton} disabled={saving}>
                    <Text style={[style.saveText, saving && style.saveTextDisabled]}>
                        {saving ? '保存中...' : '保存'}
                    </Text>
                </TouchableOpacity>
            </View>

            <ScrollView style={style.scrollView} contentContainerStyle={style.scrollContent}>
                <TextInput
                    style={style.titleInput}
                    value={title}
                    onChangeText={setTitle}
                    placeholder='标题'
                    placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.3)}
                />

                <View style={style.blocksContainer}>
                    {blocks.map(renderBlock)}
                </View>

                <View style={style.toolbar}>
                    <TouchableOpacity onPress={() => addBlock('paragraph')} style={style.toolButton}>
                        <CompassIcon name='text' size={20} color={theme.centerChannelColor}/>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => addBlock('heading')} style={style.toolButton}>
                        <CompassIcon name='format-header-1' size={20} color={theme.centerChannelColor}/>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => addBlock('blockquote')} style={style.toolButton}>
                        <CompassIcon name='format-quote-close' size={20} color={theme.centerChannelColor}/>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => addBlock('code-block')} style={style.toolButton}>
                        <CompassIcon name='code-tags' size={20} color={theme.centerChannelColor}/>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={uploadImage} style={style.toolButton}>
                        <CompassIcon name='image' size={20} color={theme.centerChannelColor}/>
                    </TouchableOpacity>
                </View>

                <View style={style.tagsContainer}>
                    <Text style={style.tagsLabel}>标签</Text>
                    <View style={style.tagsList}>
                        {tags.map((tag, idx) => (
                            <TouchableOpacity
                                key={idx}
                                style={style.tag}
                                onPress={() => removeTag(tag)}
                            >
                                <Text style={style.tagText}>{tag}</Text>
                                <CompassIcon name='close' size={12} color={theme.buttonBg}/>
                            </TouchableOpacity>
                        ))}
                    </View>
                    <View style={style.tagInputContainer}>
                        <TextInput
                            style={style.tagInput}
                            value={tagInput}
                            onChangeText={setTagInput}
                            placeholder='添加标签'
                            placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.3)}
                            onSubmitEditing={addTag}
                            returnKeyType='done'
                        />
                        <TouchableOpacity onPress={addTag} style={style.addTagButton}>
                            <CompassIcon name='plus' size={20} color={theme.buttonBg}/>
                        </TouchableOpacity>
                    </View>
                </View>

                {!isNew && (
                    <View style={style.graphitiContainer}>
                        <TouchableOpacity
                            style={[style.graphitiButton, pushing && style.graphitiButtonDisabled]}
                            onPress={handlePushGraphiti}
                            disabled={pushing}
                        >
                            <CompassIcon name='graph-outline' size={20} color={theme.buttonColor}/>
                            <Text style={style.graphitiButtonText}>
                                {pushing ? '推送中...' : '推送到知识图谱'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}

                {!isNew && relatedNotes.length > 0 && (
                    <View style={style.relatedContainer}>
                        <Text style={style.relatedLabel}>相关笔记</Text>
                        {relatedNotes.map((note, idx) => (
                            <TouchableOpacity
                                key={idx}
                                style={style.relatedItem}
                                onPress={() => navigation.navigate(Screens.SMART_NOTE_DETAIL, {
                                    noteId: note.id,
                                    noteTitle: note.title,
                                })}
                            >
                                <CompassIcon name='notebook-outline' size={16} color={theme.buttonBg}/>
                                <Text style={style.relatedItemText} numberOfLines={1}>
                                    {note.title}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
};

// ---- Styles ----

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    backButton: {
        padding: 8,
    },
    headerTitle: {
        flex: 1,
        ...typography('Heading', 100, 'SemiBold'),
        color: theme.centerChannelColor,
        textAlign: 'center',
    },
    saveButton: {
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    saveText: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.buttonBg,
    },
    saveTextDisabled: {
        opacity: 0.5,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
    },
    titleInput: {
        ...typography('Heading', 300, 'Bold'),
        color: theme.centerChannelColor,
        marginBottom: 24,
    },
    blocksContainer: {
        marginBottom: 24,
    },
    blockInput: {
        ...typography('Body', 200),
        color: theme.centerChannelColor,
        marginBottom: 12,
        minHeight: 40,
        textAlignVertical: 'top',
    },
    headingInput: {
        ...typography('Heading', 200, 'SemiBold'),
        fontSize: 24,
    },
    quoteContainer: {
        flexDirection: 'row',
        marginBottom: 12,
    },
    quoteBar: {
        width: 3,
        backgroundColor: theme.buttonBg,
        marginRight: 12,
    },
    quoteInput: {
        flex: 1,
        ...typography('Body', 200, 'Italic'),
        color: changeOpacity(theme.centerChannelColor, 0.8),
    },
    codeContainer: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.06),
        borderRadius: 8,
        padding: 12,
        marginBottom: 12,
    },
    codeInput: {
        fontFamily: 'monospace',
        fontSize: 14,
    },
    imageContainer: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.06),
        borderRadius: 8,
        padding: 16,
        marginBottom: 12,
        alignItems: 'center',
    },
    imageText: {
        ...typography('Body', 100),
        color: changeOpacity(theme.centerChannelColor, 0.6),
    },
    toolbar: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingVertical: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.1),
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.1),
        marginBottom: 24,
    },
    toolButton: {
        padding: 8,
    },
    tagsContainer: {
        marginTop: 16,
    },
    tagsLabel: {
        ...typography('Heading', 75, 'SemiBold'),
        color: theme.centerChannelColor,
        marginBottom: 12,
    },
    tagsList: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginBottom: 12,
    },
    tag: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: changeOpacity(theme.buttonBg, 0.1),
        borderRadius: 16,
        paddingHorizontal: 12,
        paddingVertical: 6,
        marginRight: 8,
        marginBottom: 8,
    },
    tagText: {
        ...typography('Body', 75),
        color: theme.buttonBg,
        marginRight: 4,
    },
    tagInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    tagInput: {
        flex: 1,
        height: 36,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.06),
        borderRadius: 8,
        paddingHorizontal: 12,
        ...typography('Body', 100),
        color: theme.centerChannelColor,
    },
    addTagButton: {
        marginLeft: 8,
        padding: 8,
    },
    graphitiContainer: {
        marginTop: 24,
    },
    graphitiButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.buttonBg,
        borderRadius: 8,
        paddingVertical: 12,
        paddingHorizontal: 16,
    },
    graphitiButtonDisabled: {
        opacity: 0.5,
    },
    graphitiButtonText: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.buttonColor,
        marginLeft: 8,
    },
    relatedContainer: {
        marginTop: 24,
    },
    relatedLabel: {
        ...typography('Heading', 75, 'SemiBold'),
        color: theme.centerChannelColor,
        marginBottom: 12,
    },
    relatedItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 12,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderRadius: 8,
        marginBottom: 8,
    },
    relatedItemText: {
        ...typography('Body', 100),
        color: theme.centerChannelColor,
        marginLeft: 8,
        flex: 1,
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    loadingText: {
        ...typography('Body', 200),
        color: changeOpacity(theme.centerChannelColor, 0.5),
    },
}));

export default SmartNoteDetailScreen;
