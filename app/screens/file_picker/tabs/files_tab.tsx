// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useState} from 'react';
import {useIntl} from 'react-intl';
import {Alert, FlatList, StyleSheet, Text, View} from 'react-native';
import DocumentPicker, {type DocumentPickerResponse} from 'react-native-document-picker';
import CompassIcon from '@components/compass_icon';
import TouchableWithFeedback from '@components/touchable_with_feedback';
import {changeOpacity} from '@utils/theme';
import {getFileExtension} from '@utils/file';

import {useFilePicker, type SelectedFile} from '../context/file_picker_context';

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
        textAlign: 'center',
    },
    selectButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#07C160',
        borderRadius: 8,
        paddingVertical: 16,
        paddingHorizontal: 24,
        marginHorizontal: 20,
        marginTop: 20,
    },
    selectButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
        marginLeft: 8,
    },
    list: {
        padding: 16,
    },
    fileItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        backgroundColor: changeOpacity('#000', 0.04),
        borderRadius: 8,
        marginBottom: 8,
    },
    fileInfo: {
        flex: 1,
        marginLeft: 12,
    },
    fileName: {
        fontSize: 14,
        color: '#333',
        fontWeight: '500',
    },
    fileSize: {
        fontSize: 12,
        color: '#999',
        marginTop: 4,
    },
    checkmark: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#07C160',
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 8,
    },
});

export default function FilesTab() {
    const intl = useIntl();
    const {dispatch, isFileSelected, canSelectMore, state} = useFilePicker();
    const [selectedFiles, setSelectedFiles] = useState<DocumentPickerResponse[]>([]);

    const handleSelectFiles = useCallback(async () => {
        if (!canSelectMore()) {
            Alert.alert(
                intl.formatMessage({id: 'mobile.link.error.title', defaultMessage: 'Error'}),
                intl.formatMessage({
                    id: 'file_picker.max_selection',
                    defaultMessage: 'You have reached the maximum number of files you can select.',
                }),
            );
            return;
        }

        try {
            const result = await DocumentPicker.pick({
                type: [DocumentPicker.types.allFiles],
                allowMultiSelection: true,
                copyTo: 'cachesDirectory',
            });

            const newFiles: DocumentPickerResponse[] = [];

            result.forEach((file) => {
                if (canSelectMore()) {
                    newFiles.push(file);

                    const selectedFile: SelectedFile = {
                        id: file.uri,
                        clientId: file.uri,
                        name: file.name || 'unknown',
                        uri: file.fileCopyUri || file.uri,
                        mime_type: file.type || 'application/octet-stream',
                        size: file.size || 0,
                        source: 'device',
                        extension: getFileExtension(file.name || '') || '',
                    };

                    dispatch({type: 'ADD_FILE', file: selectedFile});
                }
            });

            setSelectedFiles([...selectedFiles, ...newFiles]);
        } catch (error) {
            if (!DocumentPicker.isCancel(error)) {
                console.error('Failed to pick files:', error);
                Alert.alert(
                    intl.formatMessage({id: 'mobile.link.error.title', defaultMessage: 'Error'}),
                    intl.formatMessage({
                        id: 'file_picker.pick_error',
                        defaultMessage: 'Failed to pick files. Please try again.',
                    }),
                );
            }
        }
    }, [dispatch, canSelectMore, selectedFiles, intl]);

    const handleRemoveFile = useCallback((fileUri: string) => {
        dispatch({type: 'REMOVE_FILE', fileId: fileUri});
        setSelectedFiles(selectedFiles.filter(f => f.uri !== fileUri));
    }, [dispatch, selectedFiles]);

    const renderFileItem = useCallback(({item}: {item: DocumentPickerResponse}) => {
        const isSelected = isFileSelected(item.uri);

        return (
            <TouchableWithFeedback
                onPress={() => handleRemoveFile(item.uri)}
                style={styles.fileItem}
                type='opacity'
            >
                <>
                    <CompassIcon
                        name='file-document-outline'
                        size={32}
                        color={changeOpacity('#000', 0.4)}
                    />
                    <View style={styles.fileInfo}>
                        <Text style={styles.fileName} numberOfLines={2}>
                            {item.name || 'Unknown file'}
                        </Text>
                        <Text style={styles.fileSize}>
                            {item.size ? `${(item.size / 1024).toFixed(1)} KB` : ''}
                        </Text>
                    </View>
                    {isSelected && (
                        <View style={styles.checkmark}>
                            <CompassIcon
                                name='check'
                                size={16}
                                color='#fff'
                            />
                        </View>
                    )}
                </>
            </TouchableWithFeedback>
        );
    }, [handleRemoveFile, isFileSelected]);

    const renderEmpty = useCallback(() => (
        <View style={styles.emptyContainer}>
            <CompassIcon
                name='file-document-outline'
                size={64}
                color={changeOpacity('#000', 0.3)}
            />
            <Text style={styles.emptyText}>
                {intl.formatMessage({
                    id: 'file_picker.files.empty',
                    defaultMessage: 'No files selected yet',
                })}
            </Text>
        </View>
    ), [intl]);

    return (
        <View style={styles.container}>
            <TouchableWithFeedback
                onPress={handleSelectFiles}
                style={styles.selectButton}
                type='opacity'
            >
                <>
                    <CompassIcon
                        name='plus'
                        size={20}
                        color='#fff'
                    />
                    <Text style={styles.selectButtonText}>
                        {intl.formatMessage({
                            id: 'file_picker.files.select',
                            defaultMessage: 'Select Files',
                        })}
                    </Text>
                </>
            </TouchableWithFeedback>

            {selectedFiles.length > 0 && (
                <FlatList
                    data={selectedFiles}
                    renderItem={renderFileItem}
                    keyExtractor={(item) => item.uri}
                    contentContainerStyle={styles.list}
                    showsVerticalScrollIndicator={false}
                />
            )}

            {selectedFiles.length === 0 && renderEmpty()}
        </View>
    );
}
