// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    ActivityIndicator,
    Alert,
    Linking,
    ScrollView,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import Markdown from '@components/markdown';
import {Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import DatabaseManager from '@database/manager';
import {getCurrentTeamId} from '@queries/servers/system';
import {popTopScreen} from '@screens/navigation';
import {debugLog} from '@store/debug_log';
import {isImage, isVideo, isAudio} from '@utils/file';
import {showMediaViewer} from '@utils/gallery';
import {openUnifiedFileViewer} from '@utils/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {AvailableScreens} from '@typings/screens/navigation';

import {
    getKBDoc,
    deleteKBDoc,
    getKBDownloadUrl,
    KB_SUPPORTED_LABEL,
    type KBDoc,
} from '../workbench_api';

type Props = {
    componentId: AvailableScreens;
    docId: string;
    docTitle?: string;
    onDocUpdated?: () => void;
};

function formatDate(val: string): string {
    if (!val) return '';
    const d = new Date(val);
    if (isNaN(d.getTime())) return val;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

const KBDetailScreen = ({docId, docTitle, onDocUpdated}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const style = getStyleSheet(theme);

    const [loading, setLoading] = useState(true);
    const [doc, setDoc] = useState<KBDoc | null>(null);
    const [error, setError] = useState<string | null>(null);

    // 加载文档详情
    const loadDetail = useCallback(async () => {
        if (!docId || !serverUrl) {
            setError('Invalid document ID or server URL');
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            setError(null);
            debugLog('[KBDetail] Loading doc', {docId, serverUrl});

            const result = await getKBDoc(serverUrl, docId);

            if (result?.error) {
                throw new Error(result.error);
            }

            setDoc(result || null);
            debugLog('[KBDetail] Doc loaded', {hasData: Boolean(result)});
        } catch (err) {
            debugLog('[KBDetail] Load failed', {error: String(err)});
            setError(String(err));
        } finally {
            setLoading(false);
        }
    }, [docId, serverUrl]);

    useEffect(() => {
        loadDetail();
    }, [loadDetail]);

    // Open file using the same in-app preview as the chat window
    // (showMediaViewer for image/video/audio; openUnifiedFileViewer for documents)
    const handleDownload = useCallback(async () => {
        if (!doc) return;

        try {
            const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
            const teamId = await getCurrentTeamId(database);
            if (!teamId) {
                throw new Error('team_id missing');
            }

            const url = getKBDownloadUrl(serverUrl, doc.docId, teamId);
            if (!url) {
                throw new Error('No download URL');
            }

            const fileName = doc.fileName || doc.title || '';
            const extDot = fileName.lastIndexOf('.');
            const extension = extDot > 0 ? fileName.slice(extDot + 1).toLowerCase() : '';

            const fileInfo: FileInfo = {
                id: doc.docId,
                user_id: '',
                create_at: 0,
                name: fileName,
                extension,
                size: doc.fileSize || 0,
                mime_type: '',
                uri: url,
                localPath: url,
            } as FileInfo;

            if (isImage(fileInfo) || isVideo(fileInfo) || isAudio(fileInfo)) {
                showMediaViewer(fileInfo, serverUrl);
            } else {
                openUnifiedFileViewer(fileInfo, theme);
            }
        } catch (err) {
            Alert.alert(
                intl.formatMessage({id: 'workbench.kb.error', defaultMessage: 'Error'}),
                String(err),
            );
        }
    }, [doc, serverUrl, intl, theme]);

    // 删除文档
    const handleDelete = useCallback(() => {
        if (!doc) return;

        Alert.alert(
            intl.formatMessage({id: 'workbench.kb.delete_title', defaultMessage: 'Delete Document'}),
            intl.formatMessage({id: 'workbench.kb.delete_confirm', defaultMessage: 'Are you sure you want to delete this document?'}),
            [
                {
                    text: intl.formatMessage({id: 'common.cancel', defaultMessage: 'Cancel'}),
                    style: 'cancel',
                },
                {
                    text: intl.formatMessage({id: 'workbench.kb.delete', defaultMessage: 'Delete'}),
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await deleteKBDoc(serverUrl, doc.docId);
                            onDocUpdated?.();
                            popTopScreen();
                        } catch (err) {
                            Alert.alert(
                                intl.formatMessage({id: 'workbench.kb.error', defaultMessage: 'Error'}),
                                String(err),
                            );
                        }
                    },
                },
            ],
        );
    }, [doc, serverUrl, intl, onDocUpdated]);

    return (
        <SafeAreaView edges={['top', 'bottom']} style={style.container}>
            <ScrollView
                style={style.scrollView}
                contentContainerStyle={style.scrollContent}
                bounces={false}
                scrollEventThrottle={16}
            >
                {loading ? (
                    <ActivityIndicator size='large' color={theme.buttonBg} style={style.loading}/>
                ) : error ? (
                    <View style={style.errorContainer}>
                        <CompassIcon name='alert-circle-outline' size={48} color={theme.errorTextColor}/>
                        <Text style={style.errorText}>
                            {intl.formatMessage({
                                id: 'workbench.kb.load_failed',
                                defaultMessage: 'Failed to load document.',
                            })}
                        </Text>
                        <TouchableOpacity
                            onPress={loadDetail}
                            style={style.retryButton}
                        >
                            <Text style={style.retryButtonText}>
                                {intl.formatMessage({
                                    id: 'workbench.kb.retry',
                                    defaultMessage: 'Retry',
                                })}
                            </Text>
                        </TouchableOpacity>
                    </View>
                ) : doc ? (
                    <>
                        {/* 分类 */}
                        <Text style={style.category}>
                            {doc.category || intl.formatMessage({id: 'workbench.kb.category_unknown', defaultMessage: 'Unknown'})}
                        </Text>

                        {/* 日期 */}
                        <Text style={style.date}>{formatDate(doc.createdAt)}</Text>

                        {/* 标签 */}
                        {doc.tags && doc.tags.length > 0 && (
                            <View style={style.tagsContainer}>
                                {doc.tags.map((tag, i) => (
                                    <View key={`${tag}-${i}`} style={style.tagChip}>
                                        <Text style={style.tagText}>{tag}</Text>
                                    </View>
                                ))}
                            </View>
                        )}

                        {/* 来源 URL */}
                        {doc.sourceUrl ? (
                            <TouchableOpacity
                                onPress={() => Linking.openURL(doc.sourceUrl!)}
                                style={style.sourceUrlContainer}
                            >
                                <CompassIcon name='link-variant' size={16} color={theme.linkColor}/>
                                <Text style={style.sourceUrl} numberOfLines={2}>
                                    {doc.sourceUrl}
                                </Text>
                            </TouchableOpacity>
                        ) : null}

                        {/* 内容 */}
                        <View style={style.contentContainer}>
                            {doc.content ? (
                                <Markdown
                                    value={doc.content}
                                    baseTextStyle={style.content}
                                    location={Screens.APPS_CONVERSATIONS}
                                    theme={theme}
                                    disableAtMentions={true}
                                />
                            ) : doc.category === 'file' ? (
                                <TouchableOpacity
                                    onPress={handleDownload}
                                    style={style.downloadButton}
                                >
                                    <CompassIcon name='file-download-outline' size={24} color={theme.buttonBg}/>
                                    <Text style={style.downloadText}>
                                        {intl.formatMessage({
                                            id: 'workbench.kb.download_file',
                                            defaultMessage: 'Download File',
                                        })}
                                    </Text>
                                </TouchableOpacity>
                            ) : (
                                <Text style={style.emptyContent}>
                                    {intl.formatMessage({
                                        id: 'workbench.kb.no_content',
                                        defaultMessage: '(No content)',
                                    })}
                                </Text>
                            )}
                        </View>

                        {/* 操作按钮 */}
                        <View style={style.actionsContainer}>
                            <TouchableOpacity
                                onPress={handleDelete}
                                style={style.deleteButton}
                            >
                                <CompassIcon name='delete-outline' size={20} color={theme.errorTextColor}/>
                                <Text style={style.deleteButtonText}>
                                    {intl.formatMessage({
                                        id: 'workbench.kb.delete',
                                        defaultMessage: 'Delete',
                                    })}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </>
                ) : (
                    <Text style={style.emptyContent}>
                        {intl.formatMessage({
                            id: 'workbench.kb.not_found',
                            defaultMessage: 'Document not found.',
                        })}
                    </Text>
                )}
            </ScrollView>
        </SafeAreaView>
    );
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    backButton: {
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
        paddingBottom: 40,
    },
    loading: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 40,
    },
    errorContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 40,
    },
    errorText: {
        ...typography('Body', 200, 'Regular'),
        color: theme.errorTextColor,
        textAlign: 'center',
        marginTop: 16,
        marginBottom: 24,
    },
    retryButton: {
        paddingHorizontal: 24,
        paddingVertical: 12,
        backgroundColor: theme.buttonBg,
        borderRadius: 4,
    },
    retryButtonText: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.buttonColor,
    },
    category: {
        ...typography('Body', 75, 'SemiBold'),
        color: theme.linkColor,
        textTransform: 'uppercase',
        marginBottom: 8,
    },
    date: {
        ...typography('Body', 75, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginBottom: 12,
    },
    tagsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginBottom: 12,
    },
    tagChip: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        marginRight: 6,
        marginBottom: 6,
    },
    tagText: {
        ...typography('Body', 50, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.72),
    },
    sourceUrlContainer: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    sourceUrl: {
        ...typography('Body', 75, 'Regular'),
        color: theme.linkColor,
        marginLeft: 6,
        flex: 1,
        textDecorationLine: 'underline',
    },
    contentContainer: {
        marginTop: 12,
    },
    content: {
        ...typography('Body', 200, 'Regular'),
        color: theme.centerChannelColor,
        lineHeight: 24,
    },
    emptyContent: {
        ...typography('Body', 200, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        textAlign: 'center',
        paddingVertical: 40,
    },
    downloadButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        backgroundColor: changeOpacity(theme.buttonBg, 0.08),
        borderRadius: 8,
        marginTop: 20,
    },
    downloadText: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.buttonBg,
        marginLeft: 8,
    },
    actionsContainer: {
        marginTop: 32,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    deleteButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
    },
    deleteButtonText: {
        ...typography('Body', 100, 'Regular'),
        color: theme.errorTextColor,
        marginLeft: 6,
    },
}));

export default KBDetailScreen;
