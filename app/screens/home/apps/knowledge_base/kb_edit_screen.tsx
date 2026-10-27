// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    ActivityIndicator,
    Alert,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {useNavigation} from '@react-navigation/native';
import CompassIcon from '@components/compass_icon';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import DatabaseManager from '@database/manager';
import {getCurrentTeamId} from '@queries/servers/system';
import {popTopScreen} from '@screens/navigation';
import {debugLog} from '@store/debug_log';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {AvailableScreens} from '@typings/screens/navigation';

import {updateKBDoc, type KBDoc} from '../workbench_api';

type Props = {
    componentId: AvailableScreens;
    doc: KBDoc;
    onDocUpdated?: () => void;
};

const KBEditScreen = ({doc, onDocUpdated}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const navigation = useNavigation();
    const style = getStyleSheet(theme);

    const [title, setTitle] = useState(doc?.title || '');
    const [content, setContent] = useState(doc?.content || '');
    const [loading, setLoading] = useState(false);

    // 检查是否可以保存
    const canSave = useCallback(() => {
        if (!title.trim() || !content.trim()) {
            return false;
        }
        // 检查是否有变化
        if (title.trim() === doc?.title && content.trim() === doc?.content) {
            return false;
        }
        return true;
    }, [title, content, doc]);

    // 保存
    const handleSave = useCallback(async () => {
        if (loading || !canSave() || !doc || !serverUrl) {
            return;
        }

        try {
            setLoading(true);

            const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
            const teamId = await getCurrentTeamId(database);
            if (!teamId) {
                throw new Error('team_id missing');
            }

            debugLog('[KBEdit] Saving document', JSON.stringify({
                docId: doc.docId,
                teamId,
                titleLength: title.trim().length,
                contentLength: content.trim().length,
            }));

            const result = await updateKBDoc(serverUrl, teamId, doc.docId, {
                title: title.trim(),
                content: content.trim(),
            });

            if (result?.error) {
                throw new Error(result.error);
            }

            debugLog('[KBEdit] Document saved successfully');

            // 调用回调刷新列表
            onDocUpdated?.();

            // 返回上一页
            popTopScreen();
        } catch (err) {
            debugLog('[KBEdit] Save failed', String(err));
            Alert.alert(
                intl.formatMessage({id: 'workbench.kb.error', defaultMessage: 'Error'}),
                `${intl.formatMessage({
                    id: 'workbench.kb.edit_failed',
                    defaultMessage: 'Failed to edit document',
                })}: ${String(err)}`,
            );
        } finally {
            setLoading(false);
        }
    }, [loading, canSave, doc, serverUrl, title, content, onDocUpdated, intl]);

    if (!doc) {
        return (
            <SafeAreaView style={style.container}>
                <View style={style.errorContainer}>
                    <Text style={style.errorText}>
                        {intl.formatMessage({
                            id: 'workbench.kb.not_found',
                            defaultMessage: 'Document not found.',
                        })}
                    </Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView edges={['top', 'bottom']} style={style.container}>
            {/* Custom Header */}
            <View style={style.header}>
                <TouchableOpacity style={style.headerBtn} onPress={() => navigation.goBack()}>
                    <CompassIcon name='arrow-left' size={20} color={theme.sidebarText}/>
                </TouchableOpacity>
                <Text style={style.headerTitle} numberOfLines={1}>
                    {intl.formatMessage({id: 'workbench.kb.edit_title', defaultMessage: 'Edit Document'})}
                </Text>
                <TouchableOpacity
                    style={style.headerButton}
                    onPress={handleSave}
                    disabled={!canSave() || loading}
                >
                    <Text style={[style.saveButtonText, !canSave() && style.saveButtonTextDisabled]}>
                        {intl.formatMessage({id: 'workbench.kb.save', defaultMessage: 'Save'})}
                    </Text>
                </TouchableOpacity>
            </View>

            <View style={style.form}>
                {/* 标题输入 */}
                <View style={style.inputContainer}>
                    <Text style={style.label}>
                        {intl.formatMessage({
                            id: 'workbench.kb.title',
                            defaultMessage: 'Title',
                        })}
                    </Text>
                    <TextInput
                        style={style.textInput}
                        value={title}
                        onChangeText={setTitle}
                        placeholder={intl.formatMessage({
                            id: 'workbench.kb.title_placeholder',
                            defaultMessage: 'Enter title',
                        })}
                        placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.44)}
                        autoCapitalize='sentences'
                    />
                </View>

                {/* 内容输入 */}
                <View style={style.inputContainer}>
                    <Text style={style.label}>
                        {intl.formatMessage({
                            id: 'workbench.kb.content',
                            defaultMessage: 'Content',
                        })}
                    </Text>
                    <TextInput
                        style={[style.textInput, style.textArea]}
                        value={content}
                        onChangeText={setContent}
                        placeholder={intl.formatMessage({
                            id: 'workbench.kb.content_placeholder',
                            defaultMessage: 'Enter content',
                        })}
                        placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.44)}
                        multiline={true}
                        textAlignVertical='top'
                        autoCapitalize='sentences'
                    />
                </View>

                {/* 文档信息 */}
                <View style={style.infoContainer}>
                    <Text style={style.infoLabel}>
                        {intl.formatMessage({
                            id: 'workbench.kb.category',
                            defaultMessage: 'Category',
                        })}
                    </Text>
                    <Text style={style.infoText}>
                        {doc.category || intl.formatMessage({id: 'workbench.kb.category_unknown', defaultMessage: 'Unknown'})}
                    </Text>
                </View>

                {doc.createdAt && (
                    <View style={style.infoContainer}>
                        <Text style={style.infoLabel}>
                            {intl.formatMessage({
                                id: 'workbench.kb.created_at',
                                defaultMessage: 'Created',
                            })}
                        </Text>
                        <Text style={style.infoText}>{doc.createdAt}</Text>
                    </View>
                )}
            </View>
        </SafeAreaView>
    );
};

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
    headerTitle: {
        ...typography('Heading', 200, 'SemiBold'),
        color: theme.sidebarText,
        flex: 1,
    },
    headerButton: {
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    saveButtonText: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.linkColor,
    },
    saveButtonTextDisabled: {
        color: changeOpacity(theme.linkColor, 0.4),
    },
    form: {
        flex: 1,
        padding: 16,
    },
    inputContainer: {
        marginBottom: 20,
    },
    label: {
        ...typography('Body', 75, 'SemiBold'),
        color: theme.centerChannelColor,
        marginBottom: 8,
    },
    textInput: {
        ...typography('Body', 200, 'Regular'),
        color: theme.centerChannelColor,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        borderRadius: 8,
        padding: 12,
        backgroundColor: theme.centerChannelBg,
    },
    textArea: {
        height: 200,
        textAlignVertical: 'top',
    },
    infoContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 12,
        borderTopWidth: 1,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    infoLabel: {
        ...typography('Body', 75, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.56),
    },
    infoText: {
        ...typography('Body', 75, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    errorContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    errorText: {
        ...typography('Body', 200, 'Regular'),
        color: theme.errorTextColor,
    },
}));

export default KBEditScreen;
