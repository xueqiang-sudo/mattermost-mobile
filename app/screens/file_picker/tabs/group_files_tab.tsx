// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {ActivityIndicator, FlatList, StyleSheet, Text, View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';

import DatabaseManager from '@database/manager';
import {useServerUrl} from '@context/server';
import {debugLog} from '@store/debug_log';
import {MM_TABLES} from '@constants/database';
import {Q} from '@nozbe/watermelondb';

import {useFilePicker} from '../context/file_picker_context';
import FileItem from '../components/file_item';

import type FileModel from '@typings/database/models/servers/file';

type GroupFilesTabProps = {
    channelId: string;
};

const NUM_COLUMNS = 3;
const PAGE_SIZE = 30;

const styles = StyleSheet.create({
    container: {
        flex: 1,
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
    list: {
        padding: 8,
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
});

export default function GroupFilesTab({channelId}: GroupFilesTabProps) {
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const {dispatch, isFileSelected, canSelectMore} = useFilePicker();
    const [files, setFiles] = useState<FileModel[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const offsetRef = useRef(0);
    const hasMoreRef = useRef(true);

    const loadPage = useCallback(async (offset: number): Promise<FileModel[]> => {
        const database = DatabaseManager.serverDatabases[serverUrl]?.database;
        if (!database) {
            return [];
        }

        const {FILE, POST} = MM_TABLES.SERVER;
        const page = await database.get<FileModel>(FILE).query(
            Q.experimentalJoinTables([POST]),
            Q.on(POST, Q.where('delete_at', Q.eq(0))),
            Q.sortBy('created_at', Q.desc),
            Q.skip(offset),
            Q.take(PAGE_SIZE),
        ).fetch();

        return page;
    }, [serverUrl]);

    // 首次加载
    useFocusEffect(useCallback(() => {
        const loadInitial = async () => {
            debugLog('filePicker', 'GroupFilesTab: loading first page');
            setLoading(true);
            try {
                const firstPage = await loadPage(0);
                debugLog('filePicker', `GroupFilesTab: loaded ${firstPage.length} files`);
                setFiles(firstPage);
                offsetRef.current = firstPage.length;
                hasMoreRef.current = firstPage.length >= PAGE_SIZE;
            } catch (error) {
                debugLog('filePicker', `GroupFilesTab: error: ${error instanceof Error ? error.message : String(error)}`);
            } finally {
                setLoading(false);
            }
        };

        loadInitial();
    }, [loadPage]));

    // 加载更多
    const handleEndReached = useCallback(async () => {
        if (loadingMore || !hasMoreRef.current) {
            return;
        }

        setLoadingMore(true);
        try {
            const nextPage = await loadPage(offsetRef.current);
            debugLog('filePicker', `GroupFilesTab: loaded ${nextPage.length} more files (offset=${offsetRef.current})`);
            if (nextPage.length > 0) {
                setFiles((prev) => [...prev, ...nextPage]);
                offsetRef.current += nextPage.length;
                hasMoreRef.current = nextPage.length >= PAGE_SIZE;
            } else {
                hasMoreRef.current = false;
            }
        } catch (error) {
            debugLog('filePicker', `GroupFilesTab: loadMore error: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setLoadingMore(false);
        }
    }, [loadingMore, loadPage]);

    const handleFilePress = useCallback(async (file: FileModel) => {
        const fileId = file.id;

        if (isFileSelected(fileId)) {
            dispatch({type: 'REMOVE_FILE', fileId});
        } else if (canSelectMore()) {
            let authorId = '';
            try {
                const post = await file.post;
                authorId = post?.userId || '';
            } catch {
                // post relation may not be available
            }
            dispatch({
                type: 'ADD_FILE',
                file: {
                    ...file.toFileInfo(authorId),
                    source: 'channel',
                },
            });
        }
    }, [dispatch, isFileSelected, canSelectMore]);

    const renderFile = useCallback(({item}: {item: FileModel}) => {
        const isSelected = isFileSelected(item.id);
        const canSelect = canSelectMore() || isSelected;

        return (
            <FileItem
                file={item}
                isSelected={isSelected}
                canSelect={canSelect}
                onPress={handleFilePress}
            />
        );
    }, [handleFilePress, isFileSelected, canSelectMore]);

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

    if (files.length === 0) {
        return (
            <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>
                    {intl.formatMessage({
                        id: 'file_picker.group_files.empty',
                        defaultMessage: 'No files yet',
                    })}
                </Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <FlatList
                data={files}
                renderItem={renderFile}
                keyExtractor={(item) => item.id}
                numColumns={NUM_COLUMNS}
                contentContainerStyle={styles.list}
                showsVerticalScrollIndicator={false}
                onEndReached={handleEndReached}
                onEndReachedThreshold={0.5}
                ListFooterComponent={renderFooter}
            />
        </View>
    );
}
