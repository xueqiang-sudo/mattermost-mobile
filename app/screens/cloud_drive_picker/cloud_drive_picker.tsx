// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import DatabaseManager from '@database/manager';
import {getCurrentTeamId} from '@queries/servers/system';
import {dismissModal} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';
import {logDebug} from '@utils/log';

import {
    listDriveFiles,
    getDriveFilePath,
    type DriveFile,
    copyDriveFileToChannel,
} from '../home/apps/workbench_api';

import type {AvailableScreens} from '@typings/screens/navigation';

type Scope = 'public' | 'private';

type BreadcrumbItem = {id: string; name: string};

type Props = {
    componentId: AvailableScreens;
    channelId: string;
    teamId?: string;
    onSend?: (files: FileInfo[]) => void | Promise<void>;
};

function formatFileSize(bytes: number): string {
    if (!bytes || bytes <= 0) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let idx = 0;
    let size = bytes;
    while (size >= 1024 && idx < units.length - 1) {
        size /= 1024;
        idx++;
    }
    return `${size.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function getFileIcon(file: DriveFile): string {
    if (file.type === 'folder') return 'folder-outline';

    const ext = (file.extension || '').toLowerCase();
    if (!ext) return 'file-document-outline';

    const imageExts = ['png', 'jpg', 'jpeg', 'bmp', 'svg', 'webp', 'ico', 'tiff'];
    const videoExts = ['mp4', 'avi', 'mov', 'mkv', 'webm', 'flv', 'wmv'];
    const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma'];
    const docExts = [
        'doc', 'docx', 'txt', 'rtf', 'odt', 'md', 'mdx',
        'pages', 'tex', 'epub', 'log',
    ];
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
    const executableExts = ['exe', 'msi', 'apk', 'app', 'ipa', 'deb', 'rpm'];

    if (ext === 'gif') return 'file-gif';
    if (imageExts.includes(ext)) return 'file-image-outline-large';
    if (videoExts.includes(ext)) return 'file-video-outline-large';
    if (audioExts.includes(ext)) return 'file-audio-outline-large';
    if (pdfExts.includes(ext)) return 'file-pdf-outline-large';
    if (docExts.includes(ext)) return 'file-document-outline';
    if (sheetExts.includes(ext)) return 'file-document-outline';
    if (presentationExts.includes(ext)) return 'file-document-outline';
    if (codeExts.includes(ext)) return 'file-document-outline';
    if (archiveExts.includes(ext)) return 'file-zip-outline-large';
    if (executableExts.includes(ext)) return 'file-download-outline';
    return 'file-document-outline';
}

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    scopeBar: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 8,
        gap: 8,
    },
    scopeButton: {
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.2),
    },
    scopeButtonActive: {
        backgroundColor: theme.buttonBg,
        borderColor: theme.buttonBg,
    },
    scopeText: {
        fontSize: 13,
        color: theme.centerChannelColor,
    },
    scopeTextActive: {
        color: theme.buttonColor,
    },
    breadcrumb: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        flexWrap: 'wrap',
    },
    breadcrumbItem: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    breadcrumbText: {
        fontSize: 13,
        color: theme.buttonBg,
    },
    breadcrumbCurrent: {
        fontSize: 13,
        color: theme.centerChannelColor,
    },
    breadcrumbSeparator: {
        marginHorizontal: 4,
        color: changeOpacity(theme.centerChannelColor, 0.4),
    },
    fileItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    fileInfo: {
        flex: 1,
        marginLeft: 12,
    },
    fileName: {
        ...typography('Body', 100),
        color: theme.centerChannelColor,
    },
    fileSize: {
        ...typography('Body', 50),
        color: changeOpacity(theme.centerChannelColor, 0.5),
        marginTop: 2,
    },
    checkBox: {
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 2,
        borderColor: changeOpacity(theme.centerChannelColor, 0.3),
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkBoxSelected: {
        backgroundColor: '#07C160',
        borderColor: '#07C160',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 60,
    },
    emptyText: {
        ...typography('Body', 100),
        color: changeOpacity(theme.centerChannelColor, 0.5),
        marginTop: 12,
    },
    actionBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.1),
        backgroundColor: theme.centerChannelBg,
    },
    selectedCount: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.6),
    },
    sendButton: {
        backgroundColor: '#07C160',
        borderRadius: 8,
        paddingVertical: 10,
        paddingHorizontal: 24,
    },
    sendButtonDisabled: {
        opacity: 0.5,
    },
    sendButtonText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '600',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
}));

export default function CloudDrivePicker({componentId, channelId, teamId: propTeamId, onSend}: Props) {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const insets = useSafeAreaInsets();
    const style = getStyleSheet(theme);

    const [files, setFiles] = useState<DriveFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [scope, setScope] = useState<Scope>('public');
    const [parentId, setParentId] = useState('');
    const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [resolvedTeamId, setResolvedTeamId] = useState(propTeamId || '');

    useEffect(() => {
        const resolveTeamId = async () => {
            if (!resolvedTeamId) {
                const database = DatabaseManager.serverDatabases[serverUrl]?.database;
                if (database) {
                    const tid = await getCurrentTeamId(database);
                    setResolvedTeamId(tid);
                }
            }
        };
        resolveTeamId();
    }, [serverUrl, resolvedTeamId]);

    const loadFiles = useCallback(async () => {
        if (!resolvedTeamId) return;
        setLoading(true);
        try {
            const result = await listDriveFiles(serverUrl, resolvedTeamId, {
                parent_id: parentId || undefined,
                scope,
                page: 0,
                per_page: 200,
            });
            // Sort: folders first, then files
            const sorted = (result.files || []).sort((a, b) => {
                if (a.type === 'folder' && b.type !== 'folder') return -1;
                if (a.type !== 'folder' && b.type === 'folder') return 1;
                return a.name.localeCompare(b.name);
            });
            setFiles(sorted);
        } catch (error) {
            logDebug('CloudDrivePicker loadFiles error', error);
            setFiles([]);
        } finally {
            setLoading(false);
        }
    }, [serverUrl, resolvedTeamId, parentId, scope]);

    useEffect(() => {
        loadFiles();
    }, [loadFiles]);

    const updateBreadcrumbs = useCallback(async (file: DriveFile) => {
        try {
            const ancestors = await getDriveFilePath(serverUrl, resolvedTeamId, file.id);
            const rootName = intl.formatMessage({id: 'cloud_drive_picker.root', defaultMessage: 'Root'});
            const crumbs: BreadcrumbItem[] = [{id: '', name: rootName}];
            for (const a of ancestors) {
                crumbs.push({id: a.id, name: a.name});
            }
            crumbs.push({id: file.id, name: file.name});
            setBreadcrumbs(crumbs);
        } catch {
            setBreadcrumbs((prev) => [...prev, {id: file.id, name: file.name}]);
        }
    }, [serverUrl, resolvedTeamId, intl]);

    const handleFolderPress = useCallback((file: DriveFile) => {
        setParentId(file.id);
        updateBreadcrumbs(file);
        setSelectedIds(new Set());
    }, [updateBreadcrumbs]);

    const handleBreadcrumbPress = useCallback((crumb: BreadcrumbItem) => {
        setParentId(crumb.id);
        setBreadcrumbs((prev) => {
            const idx = prev.findIndex((b) => b.id === crumb.id);
            return idx >= 0 ? prev.slice(0, idx + 1) : prev;
        });
        setSelectedIds(new Set());
    }, []);

    const handleFileSelect = useCallback((file: DriveFile) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(file.id)) {
                next.delete(file.id);
            } else {
                next.add(file.id);
            }
            return next;
        });
    }, []);

    const handleScopeChange = useCallback((newScope: Scope) => {
        setScope(newScope);
        setParentId('');
        setBreadcrumbs([]);
        setSelectedIds(new Set());
    }, []);

    const handleSend = useCallback(async () => {
        if (selectedIds.size === 0 || sending) return;
        setSending(true);

        try {
            const selectedFiles = files.filter((f) => selectedIds.has(f.id));
            const fileInfos: FileInfo[] = [];

            for (const file of selectedFiles) {
                const result = await copyDriveFileToChannel(serverUrl, resolvedTeamId, file.id, channelId);
                if (result) {
                    const r = result as any;
                    fileInfos.push({
                        ...r,
                        // Defensive: ensure post_id is truthy so Phase 1's
                        // isExistingServerFile check passes even if the
                        // copyDriveFileToChannel response omits it.
                        post_id: r.post_id || '_pre_copied',
                        // Marker for draft_handler's addFiles pipeline: files are already
                        // copied to the channel, do NOT re-copy in Phase 0.
                        _skipPhase0: true,
                    } as FileInfo);
                }
            }

            // Dismiss the picker first so the user sees the chat immediately.
            // The addFiles pipeline (optimistic rendering) will render previews
            // as soon as it writes pending posts to the local DB, then handle
            // the server createPost call in the background.
            await dismissModal({componentId});

            if (fileInfos.length > 0 && onSend) {
                await onSend(fileInfos);
            }
        } catch (error) {
            logDebug('CloudDrivePicker send error', error);
            Alert.alert(
                intl.formatMessage({id: 'cloud_drive_picker.error_title', defaultMessage: 'Error'}),
                intl.formatMessage({id: 'cloud_drive_picker.error', defaultMessage: 'Failed to send files'}),
            );
            setSending(false);
        }
    }, [selectedIds, sending, files, serverUrl, resolvedTeamId, channelId, componentId, intl, onSend]);

    const renderItem = useCallback(({item}: {item: DriveFile}) => {
        const isFolder = item.type === 'folder';
        const isSelected = selectedIds.has(item.id);
        const iconName = getFileIcon(item);

        return (
            <TouchableOpacity
                style={style.fileItem}
                onPress={() => isFolder ? handleFolderPress(item) : handleFileSelect(item)}
                activeOpacity={0.7}
            >
                <CompassIcon
                    name={iconName}
                    size={32}
                    color={isFolder ? '#FFC107' : changeOpacity(theme.centerChannelColor, 0.5)}
                />
                <View style={style.fileInfo}>
                    <Text style={style.fileName} numberOfLines={1}>{item.name}</Text>
                    {!isFolder && item.size > 0 && (
                        <Text style={style.fileSize}>{formatFileSize(item.size)}</Text>
                    )}
                </View>
                {!isFolder && (
                    <View style={[style.checkBox, isSelected && style.checkBoxSelected]}>
                        {isSelected && (
                            <CompassIcon name='check' size={14} color='#fff'/>
                        )}
                    </View>
                )}
                {isFolder && (
                    <CompassIcon
                        name='chevron-right'
                        size={20}
                        color={changeOpacity(theme.centerChannelColor, 0.3)}
                    />
                )}
            </TouchableOpacity>
        );
    }, [selectedIds, style, handleFolderPress, handleFileSelect, theme]);

    const renderEmpty = useCallback(() => {
        if (loading) return null;
        return (
            <View style={style.emptyContainer}>
                <CompassIcon
                    name='folder-outline'
                    size={48}
                    color={changeOpacity(theme.centerChannelColor, 0.3)}
                />
                <Text style={style.emptyText}>
                    {intl.formatMessage({id: 'cloud_drive_picker.empty', defaultMessage: 'No files'})}
                </Text>
            </View>
        );
    }, [loading, style, theme, intl]);

    const rootName = intl.formatMessage({id: 'cloud_drive_picker.root', defaultMessage: 'Root'});
    const displayBreadcrumbs = breadcrumbs.length > 0 ? breadcrumbs : [{id: '', name: rootName}];

    return (
        <View style={style.container}>
            {/* Scope toggle */}
            <View style={style.scopeBar}>
                {(['public', 'private'] as Scope[]).map((s) => (
                    <TouchableOpacity
                        key={s}
                        style={[style.scopeButton, scope === s && style.scopeButtonActive]}
                        onPress={() => handleScopeChange(s)}
                    >
                        <Text style={[style.scopeText, scope === s && style.scopeTextActive]}>
                            {intl.formatMessage({
                                id: s === 'public' ? 'cloud_drive_picker.scope_public' : 'cloud_drive_picker.scope_private',
                                defaultMessage: s === 'public' ? 'Public' : 'Private',
                            })}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Breadcrumb navigation */}
            <View style={style.breadcrumb}>
                {displayBreadcrumbs.map((crumb, index) => {
                    const isLast = index === displayBreadcrumbs.length - 1;
                    return (
                        <View key={crumb.id || 'root'} style={style.breadcrumbItem}>
                            {index > 0 && (
                                <Text style={style.breadcrumbSeparator}>/</Text>
                            )}
                            {isLast ? (
                                <Text style={style.breadcrumbCurrent} numberOfLines={1}>
                                    {crumb.name}
                                </Text>
                            ) : (
                                <TouchableOpacity onPress={() => handleBreadcrumbPress(crumb)}>
                                    <Text style={style.breadcrumbText} numberOfLines={1}>
                                        {crumb.name}
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    );
                })}
            </View>

            {/* File list */}
            {loading ? (
                <View style={style.loadingContainer}>
                    <ActivityIndicator size='large' color={theme.buttonBg}/>
                </View>
            ) : (
                <FlatList
                    data={files}
                    renderItem={renderItem}
                    keyExtractor={(item) => item.id}
                    ListEmptyComponent={renderEmpty}
                    showsVerticalScrollIndicator={false}
                />
            )}

            {/* Action bar */}
            <View style={[style.actionBar, {paddingBottom: 12 + insets.bottom}]}>
                <Text style={style.selectedCount}>
                    {intl.formatMessage(
                        {id: 'cloud_drive_picker.selected_count', defaultMessage: '{count} selected'},
                        {count: selectedIds.size},
                    )}
                </Text>
                <TouchableOpacity
                    style={[style.sendButton, (selectedIds.size === 0 || sending) && style.sendButtonDisabled]}
                    onPress={handleSend}
                    disabled={selectedIds.size === 0 || sending}
                >
                    {sending ? (
                        <ActivityIndicator size='small' color='#fff'/>
                    ) : (
                        <Text style={style.sendButtonText}>
                            {intl.formatMessage({id: 'cloud_drive_picker.send', defaultMessage: 'Send'})}
                        </Text>
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );
}
