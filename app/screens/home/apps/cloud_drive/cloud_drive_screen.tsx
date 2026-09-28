// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useNavigation} from '@react-navigation/native';
import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Linking,
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
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import {
    listDriveFiles,
    createDriveFolder,
    renameDriveFile,
    deleteDriveFile,
    getDriveDownloadUrl,
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

function getFileIcon(file: DriveFile): string {
    if (file.type === 'folder') return 'folder-outline';

    const ext = (file.extension || '').toLowerCase();
    const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp'];
    const videoExts = ['mp4', 'avi', 'mov', 'mkv', 'webm'];
    const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'aac'];
    const docExts = ['doc', 'docx', 'pdf', 'txt', 'rtf', 'odt'];
    const sheetExts = ['xls', 'xlsx', 'csv', 'ods'];
    const archiveExts = ['zip', 'rar', '7z', 'tar', 'gz'];

    if (imageExts.includes(ext)) return 'file-image-outline';
    if (videoExts.includes(ext)) return 'file-video-outline';
    if (audioExts.includes(ext)) return 'file-music-outline';
    if (docExts.includes(ext)) return 'file-document-outline';
    if (sheetExts.includes(ext)) return 'file-excel-outline';
    if (archiveExts.includes(ext)) return 'folder-zip-outline';
    return 'file-outline';
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

    // ── Open file (download) ──
    const openFile = useCallback((file: DriveFile) => {
        const url = getDriveDownloadUrl(serverUrl, teamId, file.id);
        Linking.openURL(url).catch(() => {
            Alert.alert(
                intl.formatMessage({id: 'workbench.drive.error_title', defaultMessage: 'Error'}),
                intl.formatMessage({id: 'workbench.drive.error_open_file', defaultMessage: 'Could not open this file.'}),
            );
        });
    }, [serverUrl, teamId, intl]);

    // ── Tap handler ──
    const onFileTap = useCallback((file: DriveFile) => {
        if (file.type === 'folder') {
            openFolder(file);
        } else {
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
                                                intl.formatMessage({id: 'workbench.drive.error_delete', defaultMessage: 'Failed to delete item.'}),
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
                intl.formatMessage({id: 'workbench.drive.error_rename', defaultMessage: 'Failed to rename item.'}),
            );
        } finally {
            setRenaming(false);
        }
    }, [serverUrl, teamId, renameTarget, renameName, intl, loadFiles]);

    // ── Render file row ──
    const renderFileRow = useCallback(({item}: {item: DriveFile}) => {
        const isFolder = item.type === 'folder';
        const iconName = getFileIcon(item);
        const iconColor = isFolder ? theme.sidebarText : theme.linkColor;

        return (
            <TouchableOpacity
                style={style.fileRow}
                onPress={() => onFileTap(item)}
                onLongPress={() => onFileLongPress(item)}
                activeOpacity={0.6}
            >
                <View style={[style.fileIcon, isFolder ? style.fileIconFolder : style.fileIconFile]}>
                    <CompassIcon name={iconName} size={22} color={iconColor}/>
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
                    {intl.formatMessage({id: 'workbench.drive.empty_title', defaultMessage: 'No files here'})}
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
            {id: '', name: intl.formatMessage({id: 'workbench.drive.root', defaultMessage: 'Drive'})},
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
