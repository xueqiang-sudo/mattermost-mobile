// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Smart Note Detail Screen
// 对齐 webapp：简单的 Markdown 编辑器，使用标准 Posts API

import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    ActivityIndicator,
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

import CompassIcon from '@components/compass_icon';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {popTopScreen} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import {
    getPost,
    createPost,
    editPost,
    type Post,
} from './smart_notebook_api';

type Props = {
    postId: string;
    channelId: string;
    postTitle: string;
};

// ---- Component ----

const SmartNoteDetailScreen = ({postId, channelId, postTitle}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const style = getStyleSheet(theme);
    const isNew = postId === 'new';

    // State
    const [content, setContent] = useState('');
    const [loading, setLoading] = useState(!isNew);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [post, setPost] = useState<Post | null>(null);

    // ---- Load post ----
    useEffect(() => {
        if (isNew) return;

        const loadPost = async () => {
            setLoading(true);
            try {
                const p = await getPost(serverUrl, postId);
                if (p) {
                    setPost(p);
                    setContent(p.message);
                }
            } catch (err) {
                console.error('Failed to load post:', err);
            } finally {
                setLoading(false);
            }
        };
        loadPost();
    }, [serverUrl, postId, isNew]);

    // ---- Save ----
    const handleSave = useCallback(async () => {
        if (!content.trim()) {
            Alert.alert(
                intl.formatMessage({id: 'smart_notebook.empty_title', defaultMessage: '内容不能为空'}),
            );
            return;
        }

        setSaving(true);
        try {
            if (isNew) {
                // 创建新帖子
                const newPost = await createPost(serverUrl, channelId, content.trim());
                if (newPost) {
                    popTopScreen();
                } else {
                    Alert.alert(
                        intl.formatMessage({id: 'smart_notebook.save_failed', defaultMessage: '保存失败'}),
                    );
                }
            } else {
                // 编辑帖子
                const updated = await editPost(serverUrl, postId, content.trim());
                if (updated) {
                    popTopScreen();
                } else {
                    Alert.alert(
                        intl.formatMessage({id: 'smart_notebook.save_failed', defaultMessage: '保存失败'}),
                    );
                }
            }
        } catch (err) {
            console.error('Failed to save:', err);
            Alert.alert(
                intl.formatMessage({id: 'smart_notebook.save_failed', defaultMessage: '保存失败'}),
            );
        } finally {
            setSaving(false);
        }
    }, [serverUrl, channelId, postId, content, isNew, intl]);

    // ---- Content change ----
    const onContentChange = useCallback((text: string) => {
        setContent(text);
        setDirty(true);
    }, []);

    // ---- Go back ----
    const goBack = useCallback(() => {
        if (dirty) {
            Alert.alert(
                intl.formatMessage({id: 'smart_notebook.unsaved_title', defaultMessage: '未保存的更改'}),
                intl.formatMessage({id: 'smart_notebook.unsaved_message', defaultMessage: '是否放弃未保存的更改？'}),
                [
                    {
                        text: intl.formatMessage({id: 'common.cancel', defaultMessage: '取消'}),
                        style: 'cancel',
                    },
                    {
                        text: intl.formatMessage({id: 'smart_notebook.discard', defaultMessage: '放弃'}),
                        style: 'destructive',
                        onPress: () => popTopScreen(),
                    },
                ],
            );
        } else {
            popTopScreen();
        }
    }, [dirty, intl]);

    // ---- Render ----
    if (loading) {
        return (
            <SafeAreaView style={[style.container, {backgroundColor: theme.centerChannelBg}]}>
                <View style={style.header}>
                    <TouchableOpacity onPress={goBack} style={style.headerBtn}>
                        <CompassIcon name='arrow-left' size={20} color={theme.sidebarText}/>
                    </TouchableOpacity>
                    <Text style={style.headerTitle}>
                        {isNew
                            ? intl.formatMessage({id: 'smart_notebook.new', defaultMessage: '新建笔记'})
                            : postTitle || intl.formatMessage({id: 'smart_notebook.detail', defaultMessage: '笔记详情'})}
                    </Text>
                    <View style={style.headerBtn}/>
                </View>
                <View style={style.loadingContainer}>
                    <ActivityIndicator size='large' color={theme.buttonBg}/>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[style.container, {backgroundColor: theme.centerChannelBg}]}>
            {/* Header */}
            <View style={style.header}>
                <TouchableOpacity onPress={goBack} style={style.headerBtn}>
                    <CompassIcon name='arrow-left' size={20} color={theme.sidebarText}/>
                </TouchableOpacity>
                <Text style={style.headerTitle} numberOfLines={1}>
                    {isNew
                        ? intl.formatMessage({id: 'smart_notebook.new', defaultMessage: '新建笔记'})
                        : postTitle || intl.formatMessage({id: 'smart_notebook.detail', defaultMessage: '笔记详情'})}
                </Text>
                <TouchableOpacity
                    onPress={handleSave}
                    style={style.headerBtn}
                    disabled={saving || !content.trim()}
                >
                    {saving ? (
                        <ActivityIndicator size='small' color={theme.buttonColor}/>
                    ) : (
                        <Text style={[style.saveBtn, (!content.trim()) && style.saveBtnDisabled]}>
                            {intl.formatMessage({id: 'smart_notebook.save', defaultMessage: '保存'})}
                        </Text>
                    )}
                </TouchableOpacity>
            </View>

            {/* Post time */}
            {!isNew && post && (
                <View style={style.timeContainer}>
                    <Text style={style.timeText}>
                        {new Date(post.create_at).toLocaleString()}
                    </Text>
                </View>
            )}

            {/* Editor */}
            <KeyboardAvoidingView
                style={style.editorContainer}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
            >
                <ScrollView
                    style={style.scrollView}
                    contentContainerStyle={style.scrollContent}
                    keyboardShouldPersistTaps='handled'
                >
                    <TextInput
                        style={style.textInput}
                        value={content}
                        onChangeText={onContentChange}
                        placeholder={intl.formatMessage({
                            id: 'smart_notebook.editor_placeholder',
                            defaultMessage: '开始写笔记...（支持 Markdown 格式）',
                        })}
                        placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.4)}
                        multiline={true}
                        textAlignVertical='top'
                        autoCapitalize='sentences'
                        autoCorrect={true}
                    />
                </ScrollView>
            </KeyboardAvoidingView>

            {/* Markdown hint */}
            <View style={style.hintContainer}>
                <Text style={style.hintText}>
                    {intl.formatMessage({
                        id: 'smart_notebook.markdown_hint',
                        defaultMessage: '支持 Markdown：**粗体** *斜体* # 标题 - 列表 ```代码```',
                    })}
                </Text>
            </View>
        </SafeAreaView>
    );
};

// ---- Styles ----

const getStyleSheet = makeStyleSheetFromTheme((theme: any) => ({
    container: {
        flex: 1,
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
        minWidth: 40,
    },
    headerTitle: {
        ...typography('Heading', 200, 'SemiBold'),
        color: theme.sidebarText,
        flex: 1,
        textAlign: 'center',
    },
    saveBtn: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.buttonColor,
        textAlign: 'right',
    },
    saveBtnDisabled: {
        opacity: 0.4,
    },
    timeContainer: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    timeText: {
        ...typography('Body', 50),
        color: changeOpacity(theme.centerChannelColor, 0.6),
    },
    editorContainer: {
        flex: 1,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        padding: 16,
    },
    textInput: {
        flex: 1,
        minHeight: 300,
        ...typography('Body', 200),
        color: theme.centerChannelColor,
        lineHeight: 24,
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    hintContainer: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.1),
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.02),
    },
    hintText: {
        ...typography('Body', 50),
        color: changeOpacity(theme.centerChannelColor, 0.5),
        textAlign: 'center',
    },
}));

export default SmartNoteDetailScreen;
