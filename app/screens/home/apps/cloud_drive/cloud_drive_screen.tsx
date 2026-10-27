// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useNavigation} from '@react-navigation/native';
import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
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
import DatabaseManager from '@database/manager';
import {getCurrentTeamId} from '@queries/servers/system';
import {isImage, isVideo, isAudio, hasPdfPreview} from '@utils/file';
import type {FileInfo} from '@mattermost/types/files';
import {showMediaViewer} from '@utils/gallery';
import {openUnifiedFileViewer} from '@utils/navigation';
import {showModal} from '@screens/navigation';
import {useDownloadFileAndPreview} from '@hooks/files';
import {debugLog} from '@store/debug_log';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';
import {Screens} from '@constants';

import {
    listDriveFiles,
    createDriveFolder,
    renameDriveFile,
    deleteDriveFile,
    getDriveDownloadUrl,
    getDrivePreviewUrl,
    uploadDriveFile,
    type DriveFile,
} from '../workbench_api';

// ---- Helpers ----

type BreadcrumbItem = {
    id: string;
    name: string;
};

type Scope = 'public' | 'private';

function formatFileSize(bytes: number): string {
    if (!bytes || bytes <= 0) return '-';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let idx = 0;
    let size = bytes;
    while (size >= 1024 && idx < units.length - 1) {
        size /= 1024;
        idx++;
    }
    return `${size.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function formatDate(timestamp: number): string {
    if (!timestamp) return '-';
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return '-';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

const FILE_ICON_BLUE = '#338AFF';
const FILE_ICON_RED = '#ED522A';
const FILE_ICON_GREEN = '#1CA660';
const FILE_ICON_GRAY = '#999999';

function getFileIconInfo(file: DriveFile): {name: string; color: string} {
    if (file.type === 'folder') return {name: 'folder-outline', color: ''};

    const ext = (file.extension || '').toLowerCase();
    if (!ext) return {name: 'file-generic-outline-large', color: FILE_ICON_BLUE};

    const imageExts = ['png', 'jpg', 'jpeg', 'bmp', 'svg', 'webp', 'ico', 'tiff', 'gif'];
    const videoExts = ['mp4', 'avi', 'mov', 'mkv', 'webm', 'flv', 'wmv'];
    const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma'];
    const wordExts = ['doc', 'docx', 'odt', 'pages', 'rtf'];
    const textExts = ['txt', 'md', 'mdx', 'tex', 'epub', 'log'];
    const pdfExts = ['pdf'];
    const sheetExts = ['xls', 'xlsx', 'csv', 'ods', 'numbers'];
    const presentationExts = ['ppt', 'pptx', 'key', 'odp'];
    const codeExts = [
        'js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'hpp',
        'cs', 'go', 'rs', 'rb', 'php', 'swift', 'kt', 'scala', 'lua',
        'pl', 'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd',
        'html', 'htm', 'css', 'scss', 'sass', 'less',
        'json', 'xml', 'yaml', 'yml', 'toml', 'ini', 'conf',
        'sql', 'graphql', 'proto',
    ];
    const archiveExts = [
        'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'tgz', 'dmg', 'iso',
    ];
    const patchExts = ['patch', 'diff'];

    if (imageExts.includes(ext)) return {name: 'file-image-outline-large', color: FILE_ICON_BLUE};
    if (videoExts.includes(ext)) return {name: 'file-video-outline-large', color: FILE_ICON_BLUE};
    if (audioExts.includes(ext)) return {name: 'file-audio-outline-large', color: FILE_ICON_BLUE};
    if (pdfExts.includes(ext)) return {name: 'file-pdf-outline-large', color: FILE_ICON_RED};
    if (wordExts.includes(ext)) return {name: 'file-word-outline-large', color: FILE_ICON_BLUE};
    if (textExts.includes(ext)) return {name: 'file-text-outline-large', color: FILE_ICON_GRAY};
    if (sheetExts.includes(ext)) return {name: 'file-excel-outline-large', color: FILE_ICON_GREEN};
    if (presentationExts.includes(ext)) return {name: 'file-powerpoint-outline-large', color: FILE_ICON_RED};
    if (codeExts.includes(ext)) return {name: 'file-code-outline-large', color: FILE_ICON_BLUE};
    if (archiveExts.includes(ext)) return {name: 'file-zip-outline-large', color: FILE_ICON_BLUE};
    if (patchExts.includes(ext)) return {name: 'file-patch-outline-large', color: FILE_ICON_BLUE};
    return {name: 'file-generic-outline-large', color: FILE_ICON_BLUE};
}

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
    headerTitle: {
        ...typography('Heading', 200, 'SemiBold'),
        color: theme.sidebarText,
        flex: 1,
    },

    // Breadcrumb bar
    breadcrumbBar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    breadcrumbItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 4,
        paddingHorizontal: 6,
        borderRadius: 4,
    },
    breadcrumbText: {
        ...typography('Body', 75, 'SemiBold'),
        color: theme.linkColor,
    },
    breadcrumbTextCurrent: {
        ...typography('Body', 75, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    breadcrumbSep: {
        ...typography('Body', 75, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.4),
        marginHorizontal: 2,
    },

    // Scope toggle + toolbar
    toolbar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    scopeToggle: {
        flexDirection: 'row',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        overflow: 'hidden',
    },
    scopeBtn: {
        paddingHorizontal: 14,
        paddingVertical: 6,
        backgroundColor: 'transparent',
    },
    scopeBtnActive: {
        backgroundColor: theme.buttonBg,
    },
    scopeBtnText: {
        ...typography('Body', 75, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    scopeBtnTextActive: {
        color: theme.buttonColor,
    },
    toolbarSpacer: {
        flex: 1,
    },
    newFolderBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
        backgroundColor: theme.buttonBg,
    },
    newFolderBtnText: {
        ...typography('Body', 75, 'SemiBold'),
        color: theme.buttonColor,
        marginLeft: 6,
    },
    uploadBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
        backgroundColor: theme.buttonBg,
        marginRight: 8,
    },
    uploadBtnText: {
        ...typography('Body', 75, 'SemiBold'),
        color: theme.buttonColor,
        marginLeft: 6,
    },

    // File list
    listContent: {
        flexGrow: 1,
    },
    fileRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    fileRowActive: {
        backgroundColor: changeOpacity(theme.buttonBg, 0.06),
    },
    fileIcon: {
        width: 40,
        height: 40,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    fileIconFolder: {
        backgroundColor: changeOpacity(theme.sidebarText, 0.12),
    },
    fileIconFile: {
        backgroundColor: changeOpacity(theme.linkColor, 0.1),
    },
    fileInfo: {
        flex: 1,
    },
    fileName: {
        ...typography('Body', 200, 'Regular'),
        color: theme.centerChannelColor,
        numberOfLines: 1,
    },
    fileMeta: {
        ...typography('Body', 50, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginTop: 2,
    },
    fileChevron: {
        padding: 4,
    },
    extensionBadge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
        marginLeft: 8,
    },
    extensionText: {
        ...typography('Body', 25, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.6),
        textTransform: 'uppercase',
    },

    // Empty state
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
    },
    emptyIcon: {
        marginBottom: 16,
    },
    emptyTitle: {
        ...typography('Heading', 200, 'SemiBold'),
        color: theme.centerChannelColor,
        marginBottom: 8,
    },
    emptySubtitle: {
        ...typography('Body', 100, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        textAlign: 'center',
        paddingHorizontal: 40,
    },

    // Loading
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },

    // Modal
    modalOverlay: {
        flex: 1,
        backgroundColor: changeOpacity('#000', 0.5),
        justifyContent: 'center',
        paddingHorizontal: 32,
    },
    modalContent: {
        backgroundColor: theme.centerChannelBg,
        borderRadius: 12,
        padding: 24,
    },
    modalTitle: {
        ...typography('Heading', 300, 'SemiBold'),
        color: theme.centerChannelColor,
        marginBottom: 16,
    },
    modalInput: {
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        ...typography('Body', 200, 'Regular'),
        color: theme.centerChannelColor,
        marginBottom: 20,
    },
    modalActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
    },
    modalBtn: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 8,
        marginLeft: 8,
    },
    modalBtnCancel: {
        backgroundColor: 'transparent',
    },
    modalBtnConfirm: {
        backgroundColor: theme.buttonBg,
    },
    modalBtnCancelText: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    modalBtnConfirmText: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.buttonColor,
    },
}));

// ---- Component ----

const CloudDriveScreen = () => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const navigation = useNavigation();
    const style = getStyleSheet(theme);

    // Core state
    const [teamId, setTeamId] = useState('');
    const [parentId, setParentId] = useState('');
    const [scope, setScope] = useState<Scope>('public');
    const [files, setFiles] = useState<DriveFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Breadcrumb navigation stack
    const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);

    // Create folder modal
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [creating, setCreating] = useState(false);

    // Rename modal
    const [showRenameModal, setShowRenameModal] = useState(false);
    const [renameTarget, setRenameTarget] = useState<DriveFile | null>(null);
    const [renameName, setRenameName] = useState('');
    const [renaming, setRenaming] = useState(false);

    // File preview hook (same as chat window)
    const {downloadAndPreviewFile} = useDownloadFileAndPreview(true);

    // ── Init: load team ID ──
    useEffect(() => {
        const init = async () => {
            try {
                const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
                const tid = await getCurrentTeamId(database);
                setTeamId(tid);
            } catch {
                // ignore
            }
        };
        init();
    }, [serverUrl]);

    // ── Load files ──
    const loadFiles = useCallback(async () => {
        if (!teamId) return;
        try {
            const result = await listDriveFiles(serverUrl, teamId, {
                parent_id: parentId || undefined,
                scope,
                per_page: 200,
            });
            // Sort: folders first, then alphabetically
            const sorted = (result.files || []).sort((a: DriveFile, b: DriveFile) => {
                if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
                return a.name.localeCompare(b.name);
            });
            setFiles(sorted);
        } catch {
            setFiles([]);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [serverUrl, teamId, parentId, scope]);

    useEffect(() => {
        if (!teamId) return;
        setLoading(true);
        loadFiles();
    }, [teamId, loadFiles]);

    // ── Pull to refresh ──
    const onRefresh = useCallback(() => {
        setRefreshing(true);
        loadFiles();
    }, [loadFiles]);

    // ── Navigate into folder ──
    const openFolder = useCallback((folder: DriveFile) => {
        setParentId(folder.id);
        setBreadcrumbs((prev) => [...prev, {id: folder.id, name: folder.name}]);
    }, []);

    // ── Navigate to breadcrumb ──
    const navigateToBreadcrumb = useCallback((index: number) => {
        if (index < 0) {
            // Root
            setParentId('');
            setBreadcrumbs([]);
        } else {
            const crumb = breadcrumbs[index];
            setParentId(crumb.id);
            setBreadcrumbs((prev) => prev.slice(0, index + 1));
        }
    }, [breadcrumbs]);

    // ── Navigate to root ──
    const navigateToRoot = useCallback(() => {
        setParentId('');
        setBreadcrumbs([]);
    }, []);

    // ── Open file using the same in-app preview as the chat window ──
    const openFile = useCallback(async (file: DriveFile) => {
        debugLog('[Drive] openFile called:', JSON.stringify({
            fileId: file.id,
            fileName: file.name,
            extension: file.extension,
            mm_file_id: file.mm_file_id,
        }));

        try {
            const previewUrl = getDrivePreviewUrl(serverUrl, teamId, file.id);
            const downloadUrl = getDriveDownloadUrl(serverUrl, teamId, file.id);
            debugLog('[Drive] URLs generated:', JSON.stringify({previewUrl, downloadUrl}));

            if (!previewUrl) {
                throw new Error('No preview URL');
            }

            // Use mm_file_id for Office files to enable server-side PDF conversion
            const ext = (file.extension || '').toLowerCase();
            const officeExtensions = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp'];
            const isOffice = officeExtensions.includes(ext);
            debugLog('[Drive] File type check:', JSON.stringify({ext, isOffice}));

            // Office documents need a real Mattermost file ID for the in-app
            // PDF conversion pipeline. If the server hasn't populated mm_file_id
            // yet, the conversion endpoint will fail with "Converting document..."
            // — surface a clear error instead of silently failing.
            if (isOffice && !file.mm_file_id) {
                debugLog('[Drive] Office file without mm_file_id, showing error');
                Alert.alert(
                    intl.formatMessage({id: 'workbench.drive.error_title', defaultMessage: 'Error'}),
                    intl.formatMessage({
                        id: 'workbench.drive.preview_unavailable',
                        defaultMessage: 'This Office file cannot be previewed yet. Please try again later or download it.',
                    }),
                );
                return;
            }

            // Fetch full file info including pdf_preview_id if already converted
            let fullFileInfo: FileInfo | null = null;
            if (file.mm_file_id) {
                debugLog('[Drive] Fetching full file info for mm_file_id:', file.mm_file_id);
                try {
                    const NetworkManager = (await import('@managers/network_manager')).default;
                    const client = NetworkManager.getClient(serverUrl);

                    // Add timestamp to bypass cache
                    const timestamp = Date.now();
                    try {
                        // Try with cache-busting parameter first
                        fullFileInfo = await client.getFileInfo(`${file.mm_file_id}?_t=${timestamp}`);
                    } catch (e) {
                        // Fallback to normal request if query params not supported
                        fullFileInfo = await client.getFileInfo(file.mm_file_id);
                    }

                    debugLog('[Drive] Got full file info', JSON.stringify({
                        mm_file_id: file.mm_file_id,
                        pdf_preview_id: fullFileInfo.pdf_preview_id,
                        has_preview_image: fullFileInfo.has_preview_image,
                        pdf_conversion_status: (fullFileInfo as any)?.pdf_conversion_status,
                    }));
                } catch (err) {
                    debugLog('[Drive] getFileInfo failed, falling back to manual construction', String(err));
                    // Continue with manual construction as fallback
                }
            }

            const fileInfo: FileInfo = fullFileInfo || {
                id: file.mm_file_id || file.id,
                user_id: file.owner_id || '',
                create_at: file.create_at || 0,
                name: file.name,
                extension: ext,
                size: file.size || 0,
                mime_type: file.mime_type || '',
                uri: previewUrl,
                localPath: '',
                link: downloadUrl,
                has_preview_image: false,
                archived: false,
            } as FileInfo;

            debugLog('[Drive] FileInfo constructed:', JSON.stringify({
                id: fileInfo.id,
                name: fileInfo.name,
                extension: fileInfo.extension,
                pdf_preview_id: fileInfo.pdf_preview_id,
                has_preview_image: fileInfo.has_preview_image,
                hasPdfPreview: hasPdfPreview(fileInfo),
                usingFullFileInfo: Boolean(fullFileInfo),
                original_file_id: file.id,
                original_mm_file_id: file.mm_file_id,
            }));

            if (isImage(fileInfo) || isVideo(fileInfo) || isAudio(fileInfo)) {
                debugLog('[Drive] Opening media file');
                showMediaViewer(fileInfo, serverUrl);
            } else {
                debugLog('[Drive] Opening document file with downloadAndPreviewFile');
                // Use the same hook as chat window for consistent behavior
                // This handles PDF preview, downloading, and conversion automatically
                downloadAndPreviewFile(fileInfo);
            }
        } catch (err) {
            debugLog('[Drive] Open file error:', String(err));
            Alert.alert(
                intl.formatMessage({id: 'workbench.drive.error_title', defaultMessage: 'Error'}),
                intl.formatMessage({id: 'workbench.drive.error_open_file', defaultMessage: 'Unable to open this file.'}),
            );
        }
    }, [serverUrl, teamId, intl, theme, downloadAndPreviewFile]);

    // ── Tap handler ──
    const onFileTap = useCallback((file: DriveFile) => {
        debugLog('[Drive] onFileTap called:', JSON.stringify({
            fileId: file.id,
            fileName: file.name,
            fileType: file.type,
            extension: file.extension,
        }));

        if (file.type === 'folder') {
            debugLog('[Drive] Opening folder');
            openFolder(file);
        } else {
            debugLog('[Drive] Opening file');
            openFile(file);
        }
    }, [openFolder, openFile]);

    // ── Long press handler ──
    const onFileLongPress = useCallback((file: DriveFile) => {
        const options = [
            intl.formatMessage({id: 'workbench.drive.rename', defaultMessage: 'Rename'}),
            intl.formatMessage({id: 'workbench.drive.delete', defaultMessage: 'Delete'}),
            intl.formatMessage({id: 'workbench.drive.cancel', defaultMessage: 'Cancel'}),
        ];
        const cancelIndex = options.length - 1;
        const destructiveIndex = 1;

        Alert.alert(
            file.name,
            '',
            options.map((text, idx) => ({
                text,
                style: idx === cancelIndex ? 'cancel' : idx === destructiveIndex ? 'destructive' : 'default',
                onPress: () => {
                    if (idx === 0) {
                        // Rename
                        setRenameTarget(file);
                        setRenameName(file.name);
                        setShowRenameModal(true);
                    } else if (idx === 1) {
                        // Delete confirm
                        Alert.alert(
                            intl.formatMessage(
                                {id: 'workbench.drive.confirm_delete_title', defaultMessage: 'Delete "{name}"?'},
                                {name: file.name},
                            ),
                            intl.formatMessage(
                                {id: 'workbench.drive.confirm_delete_message', defaultMessage: 'This action cannot be undone.'},
                            ),
                            [
                                {
                                    text: intl.formatMessage({id: 'workbench.drive.cancel', defaultMessage: 'Cancel'}),
                                    style: 'cancel',
                                },
                                {
                                    text: intl.formatMessage({id: 'workbench.drive.delete', defaultMessage: 'Delete'}),
                                    style: 'destructive',
                                    onPress: async () => {
                                        try {
                                            await deleteDriveFile(serverUrl, teamId, file.id);
                                            loadFiles();
                                        } catch {
                                            Alert.alert(
                                                intl.formatMessage({id: 'workbench.drive.error_title', defaultMessage: 'Error'}),
                                                intl.formatMessage({id: 'workbench.drive.error_delete', defaultMessage: 'Failed to delete.'}),
                                            );
                                        }
                                    },
                                },
                            ],
                        );
                    }
                },
            })),
            {cancelable: true},
        );
    }, [serverUrl, teamId, intl, loadFiles]);

    // ── Scope toggle ──
    const onScopeChange = useCallback((newScope: Scope) => {
        setScope(newScope);
        // Reset to root when changing scope
        setParentId('');
        setBreadcrumbs([]);
    }, []);

    // ── Create folder ──
    const onCreateFolder = useCallback(async () => {
        const name = newFolderName.trim();
        if (!name) return;
        setCreating(true);
        try {
            await createDriveFolder(serverUrl, teamId, parentId, name, scope);
            setShowCreateModal(false);
            setNewFolderName('');
            loadFiles();
        } catch {
            Alert.alert(
                intl.formatMessage({id: 'workbench.drive.error_title', defaultMessage: 'Error'}),
                intl.formatMessage({id: 'workbench.drive.error_create_folder', defaultMessage: 'Failed to create folder.'}),
            );
        } finally {
            setCreating(false);
        }
    }, [serverUrl, teamId, parentId, scope, newFolderName, intl, loadFiles]);

    // ── Upload files ──
    const onUploadFiles = useCallback(async (files: FileInfo[]) => {
        debugLog('[Drive] === onUploadFiles START ===');

        if (!files || files.length === 0) {
            debugLog('[Drive] No files to upload');
            return;
        }

        // 【关键修复】缓存所有必需的值，避免async操作期间state变化
        const cachedServerUrl = serverUrl;
        const cachedTeamId = teamId;
        const cachedParentId = parentId;
        const cachedScope = scope;
        const cachedLoadFiles = loadFiles;

        debugLog('[Drive] Cached refs:', JSON.stringify({
            hasServerUrl: Boolean(cachedServerUrl),
            hasTeamId: Boolean(cachedTeamId),
            parentId: cachedParentId,
            scope: cachedScope,
        }));

        if (!cachedServerUrl || !cachedTeamId) {
            debugLog('[Drive] ERROR: Missing serverUrl or teamId');
            Alert.alert(
                intl.formatMessage({id: 'workbench.drive.error_title', defaultMessage: 'Error'}),
                intl.formatMessage({id: 'workbench.drive.error_upload', defaultMessage: 'Failed to upload file.'}),
            );
            return;
        }

        try {
            debugLog('[Drive] Starting upload of ${files.length} file(s)');

            // Upload each file sequentially
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                debugLog('[Drive] === File ${i + 1}/${files.length} ===');
                debugLog('[Drive] Uploading file:', JSON.stringify({
                    name: file.name,
                    uri: file.uri,
                    mime_type: file.mime_type,
                    size: file.size,
                    id: file.id,
                }));

                // Use localPath (for channel files already downloaded) or uri (for newly selected files)
                let fileUri = file.localPath || file.uri || '';
                let fileName = file.name || 'unknown';
                let fileMimeType = file.mime_type || 'application/octet-stream';

                debugLog('[Drive] File path resolution:', JSON.stringify({
                    localPath: file.localPath,
                    uri: file.uri,
                    resolvedUri: fileUri,
                    hasLocalPath: Boolean(file.localPath),
                }));

                // If file doesn't have a local path or URI, download it first
                if (!fileUri && file.id) {
                    debugLog('[Drive] File has no local URI, downloading first:', file.id);
                    try {
                        const NetworkManager = (await import('@managers/network_manager')).default;
                        const client = NetworkManager.getClient(cachedServerUrl);

                        // Get file download URL
                        const fileUrl = `${cachedServerUrl}/api/v4/files/${file.id}`;
                        const authHeader = (client as any).requestHeaders?.['Authorization'] || '';

                        // Download file to temp location
                        const {downloadAsync} = await import('expo-file-system');
                        const cacheDir = await import('expo-file-system').then(fs => fs.cacheDirectory);
                        const tempPath = `${cacheDir}drive_upload_${Date.now()}_${fileName}`;

                        const downloadResult = await downloadAsync(fileUrl, tempPath, {
                            headers: {
                                'Authorization': authHeader,
                            },
                        });

                        if (downloadResult.uri) {
                            fileUri = downloadResult.uri;
                            debugLog('[Drive] File downloaded to:', fileUri);
                        } else {
                            throw new Error('Download failed: no URI returned');
                        }
                    } catch (downloadErr) {
                        const errorMsg = downloadErr instanceof Error ? downloadErr.message : String(downloadErr);
                        debugLog('[Drive] ERROR downloading file:', errorMsg);
                        throw new Error(`Failed to download file: ${file.name}`);
                    }
                }

                if (!fileUri) {
                    debugLog('[Drive] Skipping file with no URI:', fileName);
                    continue;
                }

                // Decode URI if it contains URL-encoded characters
                // React Native FormData needs proper file:// URIs
                if (fileUri.includes('%')) {
                    try {
                        const decodedUri = decodeURIComponent(fileUri);
                        debugLog('[Drive] Decoded URI:', decodedUri);
                        fileUri = decodedUri;
                    } catch (decodeErr) {
                        const decodeErrorMsg = decodeErr instanceof Error ? decodeErr.message : String(decodeErr);
                        debugLog('[Drive] Failed to decode URI, using original:', decodeErrorMsg);
                    }
                }

                try {
                    await uploadDriveFile(
                        cachedServerUrl,
                        cachedTeamId,
                        cachedParentId,
                        cachedScope,
                        fileUri,
                        fileName,
                        fileMimeType,
                    );
                    debugLog('[Drive] File uploaded successfully:', fileName);
                } catch (uploadErr) {
                    const uploadErrorMsg = uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
                    debugLog('[Drive] ERROR uploading file:', uploadErrorMsg);
                    throw uploadErr;
                }
            }

            debugLog('[Drive] All files uploaded successfully, refreshing list');

            // Refresh file list after upload - use cached reference
            try {
                cachedLoadFiles();
            } catch (refreshErr) {
                const refreshErrorMsg = refreshErr instanceof Error ? refreshErr.message : String(refreshErr);
                debugLog('[Drive] WARNING: Failed to refresh file list:', refreshErrorMsg);
                // Don't fail the upload just because refresh failed
            }

            debugLog('[Drive] === onUploadFiles COMPLETED ===');
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            const errorStack = err instanceof Error ? err.stack : '';
            debugLog('[Drive] === onUploadFiles FAILED ===');
            debugLog('[Drive] Error message:', errorMsg);
            debugLog('[Drive] Error stack:', errorStack);

            Alert.alert(
                intl.formatMessage({id: 'workbench.drive.error_title', defaultMessage: 'Error'}),
                intl.formatMessage({id: 'workbench.drive.error_upload', defaultMessage: 'Failed to upload file.'}),
            );
        }
    }, [serverUrl, teamId, parentId, scope, intl, loadFiles]);

    // ── Open file picker ──
    const onOpenFilePicker = useCallback(() => {
        showModal(
            Screens.FILE_PICKER,
            intl.formatMessage({id: 'workbench.drive.upload_title', defaultMessage: 'Upload Files'}),
            {
                onSend: onUploadFiles,
                channelId: '', // Not needed for cloud drive uploads
            },
        );
    }, [onUploadFiles, intl]);

    // ── Rename ──
    const onRename = useCallback(async () => {
        const name = renameName.trim();
        if (!name || !renameTarget) return;
        setRenaming(true);
        try {
            await renameDriveFile(serverUrl, teamId, renameTarget.id, name);
            setShowRenameModal(false);
            setRenameTarget(null);
            setRenameName('');
            loadFiles();
        } catch {
            Alert.alert(
                intl.formatMessage({id: 'workbench.drive.error_title', defaultMessage: 'Error'}),
                intl.formatMessage({id: 'workbench.drive.error_rename', defaultMessage: 'Failed to rename.'}),
            );
        } finally {
            setRenaming(false);
        }
    }, [serverUrl, teamId, renameTarget, renameName, intl, loadFiles]);

    // ── Render file row ──
    const renderFileRow = useCallback(({item}: {item: DriveFile}) => {
        const isFolder = item.type === 'folder';
        const iconInfo = getFileIconInfo(item);
        const iconColor = isFolder ? theme.sidebarText : iconInfo.color;

        return (
            <TouchableOpacity
                style={style.fileRow}
                onPress={() => onFileTap(item)}
                onLongPress={() => onFileLongPress(item)}
                activeOpacity={0.6}
            >
                <View style={[style.fileIcon, isFolder ? style.fileIconFolder : style.fileIconFile]}>
                    <CompassIcon name={iconInfo.name} size={22} color={iconColor}/>
                </View>
                <View style={style.fileInfo}>
                    <View style={{flexDirection: 'row', alignItems: 'center'}}>
                        <Text style={style.fileName} numberOfLines={1}>
                            {item.name}
                        </Text>
                        {!isFolder && item.extension ? (
                            <View style={style.extensionBadge}>
                                <Text style={style.extensionText}>{item.extension}</Text>
                            </View>
                        ) : null}
                    </View>
                    <Text style={style.fileMeta}>
                        {isFolder
                            ? formatDate(item.create_at)
                            : `${formatFileSize(item.size)} · ${formatDate(item.create_at)}`
                        }
                    </Text>
                </View>
                {isFolder && (
                    <View style={style.fileChevron}>
                        <CompassIcon name='chevron-right' size={20} color={changeOpacity(theme.centerChannelColor, 0.32)}/>
                    </View>
                )}
            </TouchableOpacity>
        );
    }, [style, theme, onFileTap, onFileLongPress]);

    const keyExtractor = useCallback((item: DriveFile) => item.id, []);

    // ── Render empty state ──
    const renderEmpty = useCallback(() => {
        if (loading) return null;
        return (
            <View style={style.emptyState}>
                <CompassIcon
                    name='folder-open-outline'
                    size={56}
                    color={changeOpacity(theme.centerChannelColor, 0.24)}
                    style={style.emptyIcon}
                />
                <Text style={style.emptyTitle}>
                    {intl.formatMessage({id: 'workbench.drive.empty_title', defaultMessage: 'No files'})}
                </Text>
                <Text style={style.emptySubtitle}>
                    {intl.formatMessage({
                        id: 'workbench.drive.empty_subtitle',
                        defaultMessage: 'Create a new folder or switch scope to get started.',
                    })}
                </Text>
            </View>
        );
    }, [loading, style, theme, intl]);

    // ── Render breadcrumb bar ──
    const renderBreadcrumbs = () => {
        const crumbs: BreadcrumbItem[] = [
            {id: '', name: intl.formatMessage({id: 'workbench.drive.root', defaultMessage: 'Cloud Drive'})},
            ...breadcrumbs,
        ];

        return (
            <View style={style.breadcrumbBar}>
                <FlatList
                    horizontal={true}
                    showsHorizontalScrollIndicator={false}
                    data={crumbs}
                    keyExtractor={(_, idx) => String(idx)}
                    renderItem={({item, index}: {item: BreadcrumbItem; index: number}) => {
                        const isLast = index === crumbs.length - 1;
                        return (
                            <View style={{flexDirection: 'row', alignItems: 'center'}}>
                                {index > 0 && (
                                    <Text style={style.breadcrumbSep}>/</Text>
                                )}
                                <TouchableOpacity
                                    style={style.breadcrumbItem}
                                    onPress={() => navigateToBreadcrumb(index - 1)}
                                    disabled={isLast}
                                >
                                    <Text style={isLast ? style.breadcrumbTextCurrent : style.breadcrumbText}>
                                        {item.name}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        );
                    }}
                />
            </View>
        );
    };

    // ── Loading state ──
    if (!teamId) {
        return (
            <SafeAreaView edges={['top', 'bottom']} style={style.container}>
                <View style={style.loadingContainer}>
                    <ActivityIndicator size='large' color={theme.buttonBg}/>
                </View>
            </SafeAreaView>
        );
    }

    // ── Main render ──
    return (
        <SafeAreaView edges={['top', 'bottom']} style={style.container}>
            {/* Header */}
            <View style={style.header}>
                <TouchableOpacity style={style.headerBtn} onPress={() => navigation.goBack()}>
                    <CompassIcon name='arrow-left' size={20} color={theme.sidebarText}/>
                </TouchableOpacity>
                <Text style={style.headerTitle}>
                    {intl.formatMessage({id: 'workbench.drive.title', defaultMessage: 'Cloud Drive'})}
                </Text>
                <TouchableOpacity style={style.headerBtn} onPress={loadFiles}>
                    <CompassIcon name='refresh' size={20} color={theme.sidebarText}/>
                </TouchableOpacity>
            </View>

            {/* Breadcrumb */}
            {renderBreadcrumbs()}

            {/* Toolbar: scope toggle + new folder */}
            <View style={style.toolbar}>
                <View style={style.scopeToggle}>
                    <TouchableOpacity
                        style={[style.scopeBtn, scope === 'public' && style.scopeBtnActive]}
                        onPress={() => onScopeChange('public')}
                    >
                        <Text style={[style.scopeBtnText, scope === 'public' && style.scopeBtnTextActive]}>
                            {intl.formatMessage({id: 'workbench.drive.scope_public', defaultMessage: 'Public'})}
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[style.scopeBtn, scope === 'private' && style.scopeBtnActive]}
                        onPress={() => onScopeChange('private')}
                    >
                        <Text style={[style.scopeBtnText, scope === 'private' && style.scopeBtnTextActive]}>
                            {intl.formatMessage({id: 'workbench.drive.scope_private', defaultMessage: 'Private'})}
                        </Text>
                    </TouchableOpacity>
                </View>
                <View style={style.toolbarSpacer}/>
                <TouchableOpacity
                    style={style.uploadBtn}
                    onPress={onOpenFilePicker}
                >
                    <CompassIcon name='upload-outline' size={18} color={theme.buttonColor}/>
                    <Text style={style.uploadBtnText}>
                        {intl.formatMessage({id: 'workbench.drive.upload', defaultMessage: 'Upload'})}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={style.newFolderBtn}
                    onPress={() => {
                        setNewFolderName('');
                        setShowCreateModal(true);
                    }}
                >
                    <CompassIcon name='folder-plus-outline' size={18} color={theme.buttonColor}/>
                    <Text style={style.newFolderBtnText}>
                        {intl.formatMessage({id: 'workbench.drive.new_folder', defaultMessage: 'New Folder'})}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* File list */}
            {loading && files.length === 0 ? (
                <View style={style.loadingContainer}>
                    <ActivityIndicator size='large' color={theme.buttonBg}/>
                </View>
            ) : (
                <FlatList
                    style={style.listContent}
                    contentContainerStyle={files.length === 0 ? {flex: 1} : undefined}
                    data={files}
                    renderItem={renderFileRow}
                    keyExtractor={keyExtractor}
                    ListEmptyComponent={renderEmpty}
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                />
            )}

            {/* Create Folder Modal */}
            <Modal
                visible={showCreateModal}
                transparent={true}
                animationType='fade'
                onRequestClose={() => setShowCreateModal(false)}
            >
                <View style={style.modalOverlay}>
                    <View style={style.modalContent}>
                        <Text style={style.modalTitle}>
                            {intl.formatMessage({id: 'workbench.drive.create_folder_title', defaultMessage: 'New Folder'})}
                        </Text>
                        <TextInput
                            style={style.modalInput}
                            value={newFolderName}
                            onChangeText={setNewFolderName}
                            placeholder={intl.formatMessage({
                                id: 'workbench.drive.folder_name_placeholder',
                                defaultMessage: 'Folder name',
                            })}
                            placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.4)}
                            autoFocus={true}
                            returnKeyType='done'
                            onSubmitEditing={onCreateFolder}
                        />
                        <View style={style.modalActions}>
                            <TouchableOpacity
                                style={[style.modalBtn, style.modalBtnCancel]}
                                onPress={() => setShowCreateModal(false)}
                                disabled={creating}
                            >
                                <Text style={style.modalBtnCancelText}>
                                    {intl.formatMessage({id: 'workbench.drive.cancel', defaultMessage: 'Cancel'})}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[style.modalBtn, style.modalBtnConfirm]}
                                onPress={onCreateFolder}
                                disabled={creating || !newFolderName.trim()}
                            >
                                {creating ? (
                                    <ActivityIndicator size='small' color={theme.buttonColor}/>
                                ) : (
                                    <Text style={style.modalBtnConfirmText}>
                                        {intl.formatMessage({id: 'workbench.drive.create', defaultMessage: 'Create'})}
                                    </Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Rename Modal */}
            <Modal
                visible={showRenameModal}
                transparent={true}
                animationType='fade'
                onRequestClose={() => setShowRenameModal(false)}
            >
                <View style={style.modalOverlay}>
                    <View style={style.modalContent}>
                        <Text style={style.modalTitle}>
                            {intl.formatMessage({id: 'workbench.drive.rename_title', defaultMessage: 'Rename'})}
                        </Text>
                        <TextInput
                            style={style.modalInput}
                            value={renameName}
                            onChangeText={setRenameName}
                            placeholder={intl.formatMessage({
                                id: 'workbench.drive.rename_placeholder',
                                defaultMessage: 'Enter new name',
                            })}
                            placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.4)}
                            autoFocus={true}
                            returnKeyType='done'
                            onSubmitEditing={onRename}
                        />
                        <View style={style.modalActions}>
                            <TouchableOpacity
                                style={[style.modalBtn, style.modalBtnCancel]}
                                onPress={() => {
                                    setShowRenameModal(false);
                                    setRenameTarget(null);
                                }}
                                disabled={renaming}
                            >
                                <Text style={style.modalBtnCancelText}>
                                    {intl.formatMessage({id: 'workbench.drive.cancel', defaultMessage: 'Cancel'})}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[style.modalBtn, style.modalBtnConfirm]}
                                onPress={onRename}
                                disabled={renaming || !renameName.trim()}
                            >
                                {renaming ? (
                                    <ActivityIndicator size='small' color={theme.buttonColor}/>
                                ) : (
                                    <Text style={style.modalBtnConfirmText}>
                                        {intl.formatMessage({id: 'workbench.drive.save', defaultMessage: 'Save'})}
                                    </Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
};

export default CloudDriveScreen;
