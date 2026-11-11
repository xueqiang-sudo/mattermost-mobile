// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Quick Note Detail Screen
// 随手记编辑页：标题 + 内容，使用标准 Posts API + props.quick_note 标记

import React, {useCallback, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
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
    createQuickNote,
    editQuickNote,
} from './smart_notebook_api';

type Props = {
    postId: string;
    channelId: string;
    title?: string;
    content?: string;
};

const QuickNoteDetailScreen = ({postId, channelId, title: initialTitle, content: initialContent}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const style = getStyleSheet(theme);

    const isNew = postId === 'new';

    // State
    const [title, setTitle] = useState(initialTitle || '');
    const [content, setContent] = useState(initialContent || '');
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);

    // ---- Save ----
    const handleSave = useCallback(async () => {
        if (!title.trim()) {
            Alert.alert(
                intl.formatMessage({id: 'quick_note.empty_title', defaultMessage: '标题不能为空'}),
            );
            return;
        }

        setSaving(true);
        try {
            let success: boolean;
            if (isNew) {
                const post = await createQuickNote(serverUrl, channelId, title.trim(), content.trim());
                success = post !== null;
            } else {
                const post = await editQuickNote(serverUrl, postId, title.trim(), content.trim());
                success = post !== null;
            }

            if (success) {
                popTopScreen();
            } else {
                Alert.alert(
                    intl.formatMessage({id: 'quick_note.save_failed', defaultMessage: '保存失败'}),
                );
            }
        } catch (err) {
            // silently handle error
            Alert.alert(
                intl.formatMessage({id: 'quick_note.save_failed', defaultMessage: '保存失败'}),
            );
        } finally {
            setSaving(false);
        }
    }, [serverUrl, channelId, postId, title, content, isNew, intl]);

    // ---- Go back ----
    const goBack = useCallback(() => {
        if (dirty) {
            Alert.alert(
                intl.formatMessage({id: 'quick_note.unsaved_title', defaultMessage: '未保存的更改'}),
                intl.formatMessage({id: 'quick_note.unsaved_message', defaultMessage: '是否放弃未保存的更改？'}),
                [
                    {
                        text: intl.formatMessage({id: 'common.cancel', defaultMessage: '取消'}),
                        style: 'cancel',
                    },
                    {
                        text: intl.formatMessage({id: 'quick_note.discard', defaultMessage: '放弃'}),
                        style: 'destructive',
                        onPress: () => popTopScreen(),
                    },
                ],
            );
        } else {
            popTopScreen();
        }
    }, [dirty, intl]);

    return (
        <SafeAreaView style={[style.container, {backgroundColor: theme.centerChannelBg}]}>
            {/* Header */}
            <View style={style.header}>
                <TouchableOpacity onPress={goBack} style={style.headerBtn}>
                    <CompassIcon name='arrow-left' size={20} color={theme.sidebarText}/>
                </TouchableOpacity>
                <Text style={style.headerTitle} numberOfLines={1}>
                    {isNew
                        ? intl.formatMessage({id: 'quick_note.new', defaultMessage: '新建随手记'})
                        : intl.formatMessage({id: 'quick_note.edit', defaultMessage: '编辑随手记'})}
                </Text>
                <TouchableOpacity
                    onPress={handleSave}
                    style={style.headerBtn}
                    disabled={saving || !title.trim()}
                >
                    {saving ? (
                        <ActivityIndicator size='small' color={theme.buttonColor}/>
                    ) : (
                        <Text style={[style.saveBtn, (!title.trim()) && style.saveBtnDisabled]}>
                            {intl.formatMessage({id: 'quick_note.save', defaultMessage: '保存'})}
                        </Text>
                    )}
                </TouchableOpacity>
            </View>

            {/* Form */}
            <KeyboardAvoidingView
                style={style.formContainer}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
            >
                <View style={style.formContent}>
                    {/* Title field */}
                    <Text style={style.label}>
                        {intl.formatMessage({id: 'quick_note.title_label', defaultMessage: '标题'})}
                    </Text>
                    <TextInput
                        style={style.titleInput}
                        value={title}
                        onChangeText={(text: string) => {
                            setTitle(text);
                            setDirty(true);
                        }}
                        placeholder={intl.formatMessage({
                            id: 'quick_note.title_placeholder',
                            defaultMessage: '输入标题...',
                        })}
                        placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.4)}
                        autoFocus={isNew}
                        autoCapitalize='sentences'
                        autoCorrect={true}
                    />

                    {/* Content field */}
                    <Text style={style.label}>
                        {intl.formatMessage({id: 'quick_note.content_label', defaultMessage: '内容'})}
                    </Text>
                    <TextInput
                        style={style.contentInput}
                        value={content}
                        onChangeText={(text: string) => {
                            setContent(text);
                            setDirty(true);
                        }}
                        placeholder={intl.formatMessage({
                            id: 'quick_note.content_placeholder',
                            defaultMessage: '输入内容...',
                        })}
                        placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.4)}
                        multiline={true}
                        textAlignVertical='top'
                        autoCapitalize='sentences'
                        autoCorrect={true}
                    />
                </View>
            </KeyboardAvoidingView>
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
    formContainer: {
        flex: 1,
    },
    formContent: {
        flex: 1,
        padding: 16,
    },
    label: {
        ...typography('Body', 75, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.6),
        marginBottom: 6,
    },
    titleInput: {
        height: 44,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.06),
        borderRadius: 8,
        paddingHorizontal: 12,
        ...typography('Body', 200),
        color: theme.centerChannelColor,
        marginBottom: 20,
    },
    contentInput: {
        flex: 1,
        minHeight: 200,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.06),
        borderRadius: 8,
        padding: 12,
        ...typography('Body', 200),
        color: theme.centerChannelColor,
        lineHeight: 24,
    },
}));

export default QuickNoteDetailScreen;
