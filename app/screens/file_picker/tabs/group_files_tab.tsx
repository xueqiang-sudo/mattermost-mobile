// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {ActivityIndicator, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';

import DatabaseManager from '@database/manager';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {debugLog} from '@store/debug_log';
import {MM_TABLES} from '@constants/database';
import {Q} from '@nozbe/watermelondb';
import CompassIcon from '@components/compass_icon';
import TouchableWithFeedback from '@components/touchable_with_feedback';
import {changeOpacity} from '@utils/theme';
import {openUnifiedFileViewer} from '@utils/navigation';

import {useFilePicker} from '../context/file_picker_context';

import type FileModel from '@typings/database/models/servers/file';
import type PostModel from '@typings/database/models/servers/post';
import type UserModel from '@typings/database/models/servers/user';

type GroupFilesTabProps = {
    channelId: string;
};

const PAGE_SIZE = 30;
const ONE_DAY = 24 * 60 * 60 * 1000;

type FileEntry = {
    file: FileModel;
    post: PostModel;
    senderName: string;
    timeStr: string;
    groupLabel: string;
};

type Section = {
    type: 'header' | 'file';
    groupLabel?: string;
    data?: FileEntry;
    key: string;
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: '#F5F5F5',
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#E5E5E5',
    },
    searchInputWrapper: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: '#E5E5E5',
    },
    searchIcon: {
        marginRight: 6,
    },
    searchInput: {
        flex: 1,
        fontSize: 15,
        color: '#333',
        paddingVertical: 0,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 40,
    },
    emptyText: {
        fontSize: 16,
        color: '#999',
        marginTop: 16,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 40,
    },
    footerLoading: {
        paddingVertical: 16,
        alignItems: 'center',
    },
    sectionHeader: {
        backgroundColor: '#F5F5F5',
        paddingHorizontal: 16,
        paddingVertical: 6,
    },
    sectionHeaderText: {
        fontSize: 13,
        color: '#999',
        fontWeight: '500',
    },
    fileRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#F0F0F0',
    },
    checkbox: {
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 2,
        borderColor: '#D9D9D9',
        marginRight: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxChecked: {
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: '#07C160',
        marginRight: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    fileIcon: {
        width: 40,
        height: 40,
        borderRadius: 4,
        backgroundColor: '#F5F5F5',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
    },
    fileInfo: {
        flex: 1,
    },
    fileName: {
        fontSize: 15,
        color: '#333',
        fontWeight: '500',
    },
    fileSize: {
        fontSize: 12,
        color: '#999',
        marginTop: 2,
    },
    moreButton: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#F0F0F0',
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 8,
    },
});

function getFileIcon(ext: string): string {
    const e = (ext || '').toLowerCase();
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'heic', 'heif'];
    const videoExts = ['mp4', 'mov', 'avi', 'mkv', 'wmv', 'flv', 'm4v', 'webm', 'mpg', 'mpeg', 'ogm'];
    const audioExts = ['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a', 'wma'];
    const pdfExts = ['pdf'];
    const wordExts = ['doc', 'docx', 'odt'];
    const textExts = ['txt', 'rtf'];
    const sheetExts = ['xls', 'xlsx', 'csv', 'ods'];
    const slideExts = ['ppt', 'pptx', 'odp'];
    const zipExts = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'];
    const codeExts = ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'h', 'css', 'html', 'json', 'xml', 'yaml', 'yml', 'sql', 'sh', 'bash'];

    if (imageExts.includes(e)) return 'file-image-outline';
    if (videoExts.includes(e)) return 'file-video-outline';
    if (audioExts.includes(e)) return 'file-audio-outline';
    if (pdfExts.includes(e)) return 'file-pdf-outline';
    if (wordExts.includes(e)) return 'file-word-outline';
    if (textExts.includes(e)) return 'file-text-outline';
    if (sheetExts.includes(e)) return 'file-excel-outline';
    if (slideExts.includes(e)) return 'file-powerpoint-outline';
    if (zipExts.includes(e)) return 'file-zip-outline';
    if (codeExts.includes(e)) return 'file-code-outline';
    return 'file-generic-outline';
}

function formatFileSize(bytes: number): string {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(ts: number): string {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function getGroupLabel(ts: number, now: number, intl: any): string {
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const yesterdayStart = todayStart.getTime() - ONE_DAY;
    const weekStart = todayStart.getTime() - 6 * ONE_DAY;

    if (ts >= todayStart.getTime()) {
        return intl.formatMessage({id: 'file_picker.time.today', defaultMessage: 'Today'});
    }
    if (ts >= yesterdayStart) {
        return intl.formatMessage({id: 'file_picker.time.yesterday', defaultMessage: 'Yesterday'});
    }
    if (ts >= weekStart) {
        return intl.formatMessage({id: 'file_picker.time.this_week', defaultMessage: 'This Week'});
    }
    return intl.formatMessage({id: 'file_picker.time.earlier', defaultMessage: 'Earlier'});
}

export default function GroupFilesTab({channelId}: GroupFilesTabProps) {
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const theme = useTheme();
    const {dispatch, isFileSelected, canSelectMore} = useFilePicker();
    const [entries, setEntries] = useState<FileEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [searchText, setSearchText] = useState('');
    const offsetRef = useRef(0);
    const hasMoreRef = useRef(true);

    const loadPage = useCallback(async (offset: number): Promise<FileEntry[]> => {
        const database = DatabaseManager.serverDatabases[serverUrl]?.database;
        if (!database) {
            return [];
        }

        const {FILE, POST, USER} = MM_TABLES.SERVER;

        const posts = await database.get<PostModel>(POST).query(
            Q.where('delete_at', Q.eq(0)),
            Q.sortBy('create_at', Q.desc),
            Q.skip(offset),
            Q.take(PAGE_SIZE),
        ).fetch();

        if (posts.length === 0) {
            return [];
        }

        const postIds = posts.map(p => p.id);
        const postMap = new Map(posts.map(p => [p.id, p]));

        const files = await database.get<FileModel>(FILE).query(
            Q.where('post_id', Q.oneOf(postIds)),
        ).fetch();

        if (files.length === 0) {
            return [];
        }

        const userIds = [...new Set(posts.map(p => p.userId))];
        let userMap = new Map<string, string>();
        if (userIds.length > 0) {
            try {
                const users = await database.get<UserModel>(USER).query(
                    Q.where('id', Q.oneOf(userIds)),
                ).fetch();
                userMap = new Map(users.map(u => [u.id, u.username || u.nickname || u.firstName || '']));
            } catch {
                // user fetch is optional
            }
        }

        const now = Date.now();

        const result: FileEntry[] = files
            .map(f => {
                const post = postMap.get(f.postId)!;
                return {
                    file: f,
                    post,
                    senderName: userMap.get(post.userId) || '',
                    timeStr: formatTime(post.createAt),
                    groupLabel: getGroupLabel(post.createAt, now, intl),
                };
            });

        result.sort((a, b) => b.post.createAt - a.post.createAt);

        return result;
    }, [serverUrl, intl]);

    useEffect(() => {
        const loadInitial = async () => {
            debugLog('filePicker', 'GroupFilesTab: loading first page');
            setLoading(true);
            try {
                const firstPage = await loadPage(0);
                debugLog('filePicker', `GroupFilesTab: loaded ${firstPage.length} file entries`);
                setEntries(firstPage);
                offsetRef.current = PAGE_SIZE;
                hasMoreRef.current = firstPage.length > 0;
            } catch (error) {
                debugLog('filePicker', `GroupFilesTab: error: ${error instanceof Error ? error.message : String(error)}`);
            } finally {
                setLoading(false);
            }
        };

        loadInitial();
    }, [loadPage]);

    const handleEndReached = useCallback(async () => {
        if (loadingMore || !hasMoreRef.current) {
            return;
        }

        setLoadingMore(true);
        try {
            const nextPage = await loadPage(offsetRef.current);
            debugLog('filePicker', `GroupFilesTab: loaded ${nextPage.length} more entries (offset=${offsetRef.current})`);
            if (nextPage.length > 0) {
                setEntries(prev => [...prev, ...nextPage]);
                offsetRef.current += PAGE_SIZE;
            }
            if (nextPage.length === 0) {
                hasMoreRef.current = false;
            }
        } catch (error) {
            debugLog('filePicker', `GroupFilesTab: loadMore error: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setLoadingMore(false);
        }
    }, [loadingMore, loadPage]);

    const handleFilePress = useCallback((entry: FileEntry) => {
        const fileId = entry.file.id;
        debugLog('filePicker', `=== GroupFilesTab: handleFilePress fileId=${fileId} ===`);

        if (isFileSelected(fileId)) {
            debugLog('filePicker', `Removing file: ${fileId}`);
            dispatch({type: 'REMOVE_FILE', fileId});
        } else if (canSelectMore()) {
            try {
                debugLog('filePicker', `Adding file: ${fileId}`);
                const fileInfo = entry.file.toFileInfo(entry.post.userId);
                debugLog('filePicker', `FileInfo created:`, JSON.stringify({
                    id: fileInfo.id,
                    name: fileInfo.name,
                    extension: fileInfo.extension,
                }));

                dispatch({
                    type: 'ADD_FILE',
                    file: {
                        ...fileInfo,
                        source: 'channel',
                    },
                });
                debugLog('filePicker', `File added to selection successfully`);
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                debugLog('filePicker', `ERROR adding file: ${errorMsg}`);
                debugLog('filePicker', `Stack: ${error instanceof Error ? error.stack : 'N/A'}`);
            }
        } else {
            debugLog('filePicker', `Cannot select more files (already at max)`);
        }
    }, [dispatch, isFileSelected, canSelectMore]);

    const handleMorePress = useCallback((entry: FileEntry) => {
        const fileInfo = entry.file.toFileInfo(entry.post.userId);
        openUnifiedFileViewer(fileInfo, theme);
    }, [theme]);

    // Filter by search text
    const filteredEntries = useMemo(() => {
        if (!searchText.trim()) {
            return entries;
        }
        const query = searchText.toLowerCase();
        return entries.filter(e => e.file.name.toLowerCase().includes(query));
    }, [entries, searchText]);

    const buildSections = useCallback((): Section[] => {
        const sections: Section[] = [];
        let lastGroup = '';

        for (const entry of filteredEntries) {
            if (entry.groupLabel !== lastGroup) {
                lastGroup = entry.groupLabel;
                sections.push({type: 'header', groupLabel: entry.groupLabel, key: `header-${entry.groupLabel}`});
            }
            sections.push({type: 'file', data: entry, key: `file-${entry.file.id}`});
        }

        return sections;
    }, [filteredEntries]);

    const renderSectionItem = useCallback(({item}: {item: Section}) => {
        if (item.type === 'header') {
            return (
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionHeaderText}>{item.groupLabel}</Text>
                </View>
            );
        }

        const entry = item.data!;
        const fileId = entry.file.id;
        const isSelected = isFileSelected(fileId);
        const canSelect = canSelectMore() || isSelected;

        return (
            <TouchableWithFeedback
                onPress={() => handleFilePress(entry)}
                style={styles.fileRow}
                type='opacity'
            >
                <>
                    {isSelected ? (
                        <View style={styles.checkboxChecked}>
                            <CompassIcon name='check' size={14} color='#fff'/>
                        </View>
                    ) : (
                        <View style={[styles.checkbox, !canSelect && {opacity: 0.4}]}/>
                    )}
                    <View style={styles.fileIcon}>
                        <CompassIcon
                            name={getFileIcon(entry.file.extension)}
                            size={22}
                            color={changeOpacity('#000', 0.45)}
                        />
                    </View>
                    <View style={styles.fileInfo}>
                        <Text style={styles.fileName}>
                            {entry.file.name}
                        </Text>
                        <Text style={styles.fileSize}>
                            {formatFileSize(entry.file.size)}
                        </Text>
                    </View>
                    <TouchableOpacity
                        onPress={() => handleMorePress(entry)}
                        style={styles.moreButton}
                    >
                        <CompassIcon
                            name='dots-horizontal'
                            size={18}
                            color='#666'
                        />
                    </TouchableOpacity>
                </>
            </TouchableWithFeedback>
        );
    }, [handleFilePress, handleMorePress, isFileSelected, canSelectMore]);

    const sections = buildSections();

    const renderFooter = useCallback(() => {
        if (!loadingMore) {
            return null;
        }
        return (
            <View style={styles.footerLoading}>
                <ActivityIndicator size='small'/>
            </View>
        );
    }, [loadingMore]);

    const renderSearchBar = useCallback(() => (
        <View style={styles.searchContainer}>
            <View style={styles.searchInputWrapper}>
                <CompassIcon
                    name='magnify'
                    size={18}
                    color='#999'
                    style={styles.searchIcon}
                />
                <TextInput
                    style={styles.searchInput}
                    placeholder={intl.formatMessage({
                        id: 'file_picker.search.placeholder',
                        defaultMessage: 'Search files',
                    })}
                    placeholderTextColor='#999'
                    value={searchText}
                    onChangeText={setSearchText}
                    returnKeyType='search'
                />
            </View>
        </View>
    ), [searchText, intl]);

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size='large'/>
                <Text style={styles.emptyText}>
                    {intl.formatMessage({
                        id: 'file_picker.group_files.loading',
                        defaultMessage: 'Loading files...',
                    })}
                </Text>
            </View>
        );
    }

    if (entries.length === 0) {
        return (
            <View style={styles.container}>
                {renderSearchBar()}
                <View style={styles.emptyContainer}>
                    <CompassIcon
                        name='file-document-outline'
                        size={56}
                        color={changeOpacity('#000', 0.25)}
                    />
                    <Text style={styles.emptyText}>
                        {intl.formatMessage({
                            id: 'file_picker.group_files.empty',
                            defaultMessage: 'No files yet',
                        })}
                    </Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {renderSearchBar()}
            <FlatList
                data={sections}
                renderItem={renderSectionItem}
                keyExtractor={(item) => item.key}
                onEndReached={handleEndReached}
                onEndReachedThreshold={0.5}
                ListFooterComponent={renderFooter}
                showsVerticalScrollIndicator={false}
                stickyHeaderIndices={sections
                    .map((s, i) => s.type === 'header' ? i : -1)
                    .filter(i => i >= 0)}
            />
        </View>
    );
}
