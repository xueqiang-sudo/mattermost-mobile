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
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import {popTopScreen, goToScreen} from '@screens/navigation';
import Markdown from '@components/markdown';
import {Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import DatabaseManager from '@database/manager';
import {useDownloadFileAndPreview} from '@hooks/files';
import {getCurrentTeamId} from '@queries/servers/system';
import {isImage, isVideo, isAudio} from '@utils/file';
import {showMediaViewer} from '@utils/gallery';
import {debugLog} from '@store/debug_log';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {AvailableScreens} from '@typings/screens/navigation';

import {
    getKBDoc,
    updateKBDoc,
    deleteKBDoc,
    getKBDownloadUrl,
    getKBFileInfo,
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

const KBDetailScreen = ({componentId, docId, docTitle, onDocUpdated}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const style = getStyleSheet(theme);

    const [loading, setLoading] = useState(true);
    const [doc, setDoc] = useState<KBDoc | null>(null);
    const [error, setError] = useState<string | null>(null);

    // 编辑状态
    const [editTitle, setEditTitle] = useState('');
    const [editContent, setEditContent] = useState('');
    const [editUrl, setEditUrl] = useState('');
    const [saving, setSaving] = useState(false);

    // Use the same hook as chat window for consistent file preview behavior
    const {downloadAndPreviewFile} = useDownloadFileAndPreview(true);

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

            const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
            const teamId = await getCurrentTeamId(database);
            if (!teamId) {
                throw new Error('team_id missing');
            }


            const result = await getKBDoc(serverUrl, teamId, docId);

            if (result?.error) {
                throw new Error(result.error);
            }

            setDoc(result || null);
            // 初始化编辑字段
            if (result) {
                setEditTitle(result.title || '');
                setEditContent(result.content || '');
                setEditUrl(result.sourceUrl || '');
            }
        } catch (err) {
            setError(String(err));
        } finally {
            setLoading(false);
        }
    }, [docId, serverUrl]);

    useEffect(() => {
        loadDetail();
    }, [loadDetail]);

    // 保存文档（仅对文本和URL类型）
    const handleSave = useCallback(async () => {
        if (!doc || saving) return;

        const isText = doc.category === 'text';
        const isUrl = doc.category === 'url';

        if (!isText && !isUrl) return;

        // 验证
        if (!editTitle.trim()) {
            Alert.alert(
                intl.formatMessage({id: 'workbench.kb.error', defaultMessage: 'Error'}),
                intl.formatMessage({id: 'workbench.kb.title_required', defaultMessage: 'Title is required.'}),
            );
            return;
        }

        if (isText && !editContent.trim()) {
            Alert.alert(
                intl.formatMessage({id: 'workbench.kb.error', defaultMessage: 'Error'}),
                intl.formatMessage({id: 'workbench.kb.content_required', defaultMessage: 'Content is required.'}),
            );
            return;
        }

        if (isUrl && !editUrl.trim()) {
            Alert.alert(
                intl.formatMessage({id: 'workbench.kb.error', defaultMessage: 'Error'}),
                intl.formatMessage({id: 'workbench.kb.url_required', defaultMessage: 'URL is required.'}),
            );
            return;
        }

        try {
            setSaving(true);

            const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
            const teamId = await getCurrentTeamId(database);
            if (!teamId) {
                throw new Error('team_id missing');
            }

            const updates: any = {title: editTitle.trim()};
            if (isText) {
                updates.content = editContent.trim();
            } else if (isUrl) {
                updates.sourceUrl = editUrl.trim();
            }

            const result = await updateKBDoc(serverUrl, teamId, doc.docId, updates);

            if (result?.error) {
                throw new Error(result.error);
            }

            // 更新本地状态
            setDoc((prev) => prev ? {...prev, ...updates} : null);
            onDocUpdated?.();

            Alert.alert(
                intl.formatMessage({id: 'workbench.kb.success', defaultMessage: 'Success'}),
                intl.formatMessage({id: 'workbench.kb.save_success', defaultMessage: 'Document saved successfully.'}),
            );
        } catch (err) {
            Alert.alert(
                intl.formatMessage({id: 'workbench.kb.error', defaultMessage: 'Error'}),
                String(err),
            );
        } finally {
            setSaving(false);
        }
    }, [doc, editTitle, editContent, editUrl, saving, serverUrl, intl, onDocUpdated]);

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

            const previewUrl = getKBDownloadUrl(serverUrl, doc.docId, teamId);
            const downloadUrl = getKBDownloadUrl(serverUrl, doc.docId, teamId);
            if (!previewUrl) {
                throw new Error('No download URL');
            }

            const fileName = doc.fileName || doc.title || '';
            const extDot = fileName.lastIndexOf('.');
            const extension = extDot > 0 ? fileName.slice(extDot + 1).toLowerCase() : '';

            // Office documents need a real Mattermost file ID for the in-app
            // PDF conversion pipeline (POST /api/v4/files/{id}/convert).
            // The KB docId is an OpenSquilla ID — bridge via /api/kb/file-info
            // which returns a first-class mm_file_id. Without this the unified
            // viewer gets stuck on "Converting document...".
            const officeExtensions = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp'];
            const isOffice = officeExtensions.includes(extension);
            let mmFileId = '';
            let fullFileInfo: FileInfo | null = null;
            if (isOffice) {
                try {
                    const info = await getKBFileInfo(serverUrl, doc.docId, teamId);
                    mmFileId = info.mm_file_id || '';

                    // If Office file hasn't been indexed yet, show clear error (matching webapp behavior)
                    if (!mmFileId) {
                        Alert.alert(
                            intl.formatMessage({id: 'workbench.kb.error', defaultMessage: 'Error'}),
                            intl.formatMessage({
                                id: 'workbench.kb.preview_unavailable',
                                defaultMessage: 'This Office file cannot be previewed yet. Please try again later or download it.',
                            }),
                        );
                        return;
                    }

                    // Get full file info including pdf_preview_id if already converted
                    const NetworkManager = (await import('@managers/network_manager')).default;
                    const client = NetworkManager.getClient(serverUrl);
                    fullFileInfo = await client.getFileInfo(mmFileId);
                } catch (err) {
                    // Show user-friendly error instead of silently continuing
                    Alert.alert(
                        intl.formatMessage({id: 'workbench.kb.error', defaultMessage: 'Error'}),
                        intl.formatMessage({
                            id: 'workbench.kb.preview_unavailable',
                            defaultMessage: 'This Office file cannot be previewed yet. Please try again later or download it.',
                        }),
                    );
                    return;
                }
            }

            const fileInfo: FileInfo = fullFileInfo || {
                id: mmFileId || doc.docId,
                user_id: '',
                create_at: 0,
                name: fileName,
                extension,
                size: doc.fileSize || 0,
                mime_type: '',
                uri: previewUrl,
                // localPath 必须留空：本地还没有这个文件。原来错误地填成 previewUrl
                // （一个 http download URL），导致 downloadAndPreviewFile 把 URL 当本地
                // 路径去 fileExists/打开，预览失败。留空让下载逻辑自己算真实本地路径。
                localPath: '',
                link: downloadUrl,
                has_preview_image: false,
                archived: false,
            } as FileInfo;

            debugLog('[KBDetail] openFile', JSON.stringify({
                docId: doc.docId,
                fileName,
                extension,
                isOffice,
                mmFileId,
                usingFullFileInfo: Boolean(fullFileInfo),
                id: fileInfo.id,
                pdf_preview_id: fileInfo.pdf_preview_id,
                previewUrl,
                downloadUrl,
            }));

            if (isImage(fileInfo) || isVideo(fileInfo) || isAudio(fileInfo)) {
                debugLog('[KBDetail] opening media via showMediaViewer');
                showMediaViewer(fileInfo, serverUrl);
            } else {
                // Use downloadAndPreviewFile for consistent behavior with chat window
                // This handles PDF preview, downloading, and conversion automatically
                debugLog('[KBDetail] opening document via downloadAndPreviewFile');
                downloadAndPreviewFile(fileInfo);
            }
        } catch (err) {
            debugLog('[KBDetail] openFile ERROR', String(err));
            Alert.alert(
                intl.formatMessage({id: 'workbench.kb.error', defaultMessage: 'Error'}),
                intl.formatMessage({id: 'workbench.kb.preview_error', defaultMessage: 'Unable to open this file.'}),
            );
        }
    }, [doc, serverUrl, intl, theme, downloadAndPreviewFile]);

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
                            const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
                            const teamId = await getCurrentTeamId(database);
                            if (!teamId) {
                                throw new Error('team_id missing');
                            }
                            await deleteKBDoc(serverUrl, teamId, doc.docId);
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

    // 编辑文档（仅对文本和URL类型）
    const handleEdit = useCallback(() => {
        if (!doc) return;
        const title = intl.formatMessage({
            id: 'workbench.kb.edit_title',
            defaultMessage: 'Edit Document',
        });
        goToScreen(Screens.KB_EDIT, title, {
            doc,
            onDocUpdated: () => {
                // 编辑完成后刷新详情
                loadDetail();
                onDocUpdated?.();
            },
        });
    }, [doc, intl, loadDetail, onDocUpdated]);

    const isEditable = doc && (doc.category === 'text' || doc.category === 'url');

    return (
        <SafeAreaView edges={['top', 'bottom']} style={style.container}>
            {/* Custom Header */}
            <View style={style.header}>
                <TouchableOpacity style={style.headerBtn} onPress={() => popTopScreen()}>
                    <CompassIcon name='arrow-left' size={20} color={theme.sidebarText}/>
                </TouchableOpacity>
                <Text style={style.headerTitle} numberOfLines={1}>
                    {intl.formatMessage({id: 'workbench.kb.detail_title', defaultMessage: 'Document Detail'})}
                </Text>
                {isEditable ? (
                    <TouchableOpacity style={style.headerBtn} onPress={handleSave} disabled={saving}>
                        <Text style={[style.saveButtonText, saving && style.saveButtonTextDisabled]}>
                            {intl.formatMessage({id: 'workbench.kb.save', defaultMessage: 'Save'})}
                        </Text>
                    </TouchableOpacity>
                ) : (
                    <View style={style.headerBtn}/>
                )}
            </View>

            <ScrollView
                style={style.scrollView}
                contentContainerStyle={style.scrollContent}
                bounces={false}
                scrollEventThrottle={16}
                keyboardShouldPersistTaps='handled'
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
                        {/* 分类和日期 */}
                        <View style={style.metaContainer}>
                            <Text style={style.category}>
                                {doc.category || intl.formatMessage({id: 'workbench.kb.category_unknown', defaultMessage: 'Unknown'})}
                            </Text>
                            <Text style={style.date}>{formatDate(doc.createdAt)}</Text>
                        </View>

                        {/* 可编辑字段（文本和URL类型） */}
                        {isEditable ? (
                            <>
                                {/* 标题输入 */}
                                <View style={style.inputContainer}>
                                    <Text style={style.label}>
                                        {intl.formatMessage({id: 'workbench.kb.title', defaultMessage: 'Title'})}
                                    </Text>
                                    <TextInput
                                        style={style.textInput}
                                        value={editTitle}
                                        onChangeText={setEditTitle}
                                        placeholder={intl.formatMessage({id: 'workbench.kb.title_placeholder', defaultMessage: 'Enter title'})}
                                        placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.44)}
                                        autoCapitalize='sentences'
                                    />
                                </View>

                                {/* 内容输入（文本类型） */}
                                {doc.category === 'text' && (
                                    <View style={style.inputContainer}>
                                        <Text style={style.label}>
                                            {intl.formatMessage({id: 'workbench.kb.content', defaultMessage: 'Content'})}
                                        </Text>
                                        <TextInput
                                            style={[style.textInput, style.textArea]}
                                            value={editContent}
                                            onChangeText={setEditContent}
                                            placeholder={intl.formatMessage({id: 'workbench.kb.content_placeholder', defaultMessage: 'Enter content'})}
                                            placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.44)}
                                            multiline={true}
                                            textAlignVertical='top'
                                            autoCapitalize='sentences'
                                        />
                                    </View>
                                )}

                                {/* URL输入（URL类型） */}
                                {doc.category === 'url' && (
                                    <View style={style.inputContainer}>
                                        <Text style={style.label}>URL</Text>
                                        <TextInput
                                            style={style.textInput}
                                            value={editUrl}
                                            onChangeText={setEditUrl}
                                            placeholder='https://...'
                                            placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.44)}
                                            autoCapitalize='none'
                                            autoCorrect={false}
                                            keyboardType='url'
                                        />
                                    </View>
                                )}
                            </>
                        ) : (
                            <>
                                {/* 来源 URL（仅显示，不可编辑） */}
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
                            </>
                        )}

                        {/* 删除按钮（仅对非编辑类型显示） */}
                        {!isEditable && (
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
                        )}
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
    docTitle: {
        ...typography('Heading', 300, 'Bold'),
        color: theme.centerChannelColor,
        marginBottom: 12,
    },
    metaContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        gap: 8,
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
    inputContainer: {
        marginBottom: 16,
    },
    label: {
        ...typography('Body', 75, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.72),
        marginBottom: 6,
    },
    textInput: {
        ...typography('Body', 200, 'Regular'),
        color: theme.centerChannelColor,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        borderRadius: 4,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    textArea: {
        minHeight: 200,
        paddingTop: 10,
    },
    saveButtonText: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.buttonColor,
        paddingHorizontal: 16,
        paddingVertical: 6,
        backgroundColor: theme.buttonBg,
        borderRadius: 4,
    },
    saveButtonTextDisabled: {
        opacity: 0.5,
    },
}));

export default KBDetailScreen;
