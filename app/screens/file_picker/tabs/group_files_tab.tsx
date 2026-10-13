// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {FlatList, StyleSheet, Text, View} from 'react-native';
import {useObservable} from 'rxjs-hooks';
import {switchMap} from 'rxjs/operators';

import {queryMediaFilesForChannel} from '@queries/servers/file';
import {getCurrentChannelId} from '@queries/servers/system';
import DatabaseManager from '@database/manager';
import {useServerUrl} from '@context/server';
import {changeOpacity} from '@utils/theme';

import {useFilePicker} from '../context/file_picker_context';
import FileItem from '../components/file_item';

import type FileModel from '@typings/database/models/servers/file';

const NUM_COLUMNS = 3;

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
});

export default function GroupFilesTab() {
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const {dispatch, isFileSelected, canSelectMore} = useFilePicker();
    const [files, setFiles] = useState<FileModel[]>([]);

    useEffect(() => {
        const loadFiles = async () => {
            try {
                const database = DatabaseManager.serverDatabases[serverUrl]?.database;
                if (!database) {
                    return;
                }

                const channelId = await getCurrentChannelId(database);
                if (!channelId) {
                    return;
                }

                const query = queryMediaFilesForChannel(database, channelId);
                const allFiles = await query.fetch();
                setFiles(allFiles);
            } catch (error) {
                console.error('Failed to load channel files:', error);
            }
        };

        loadFiles();
    }, [serverUrl]);

    const handleFilePress = useCallback((file: FileModel) => {
        const fileId = file.id;

        if (isFileSelected(fileId)) {
            dispatch({type: 'REMOVE_FILE', fileId});
        } else if (canSelectMore()) {
            dispatch({
                type: 'ADD_FILE',
                file: {
                    ...file.toFileInfo(),
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

    const renderEmpty = useCallback(() => (
        <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
                {intl.formatMessage({
                    id: 'file_picker.group_files.empty',
                    defaultMessage: 'No files in this channel yet',
                })}
            </Text>
        </View>
    ), [intl]);

    if (files.length === 0) {
        return renderEmpty();
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
            />
        </View>
    );
}
