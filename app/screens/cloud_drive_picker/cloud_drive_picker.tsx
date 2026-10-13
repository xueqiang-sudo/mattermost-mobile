// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {createPost} from '@actions/remote/post';
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
    const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp'];
    const videoExts = ['mp4', 'avi', 'mov', 'mkv', 'webm'];
    const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'aac'];
    const docExts = ['doc', 'docx', 'pdf', 'txt', 'rtf', 'odt'];
    const sheetExts = ['xls', 'xlsx', 'csv', 'ods'];
    if (imageExts.includes(ext)) return 'file-image-outline';
    if (videoExts.includes(ext)) return 'file-video-outline';
    if (audioExts.includes(ext)) return 'file-music-outline';
    if (docExts.includes(ext)) return 'file-document-outline';
    if (sheetExts.includes(ext)) return 'file-excel-outline';
    return 'file-outline';
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

export default function CloudDrivePicker({componentId, channelId, teamId: propTeamId}: Props) {
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
            const fileInfos: any[] = [];

            for (const file of selectedFiles) {
                const result = await copyDriveFileToChannel(serverUrl, resolvedTeamId, file.id, channelId);
                if (result) {
                    fileInfos.push(result);
                }
            }

            if (fileInfos.length > 0) {
                const fileIds = fileInfos.map((f: any) => f.id);
                await createPost(
                    serverUrl,
                    {channel_id: channelId, message: '', file_ids: fileIds} as any,
                    fileInfos,
                    true,
                );
            }

            await dismissModal({componentId});
        } catch (error) {
            logDebug('CloudDrivePicker send error', error);
            Alert.alert(
                intl.formatMessage({id: 'cloud_drive_picker.error_title', defaultMessage: 'Error'}),
                intl.formatMessage({id: 'cloud_drive_picker.error', defaultMessage: 'Failed to send files'}),
            );
            setSending(false);
        }
    }, [selectedIds, sending, files, serverUrl, resolvedTeamId, channelId, componentId, intl]);

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
