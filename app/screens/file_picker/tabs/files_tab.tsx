// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';
import {useIntl} from 'react-intl';
import {Alert, Platform, StyleSheet, Text, View} from 'react-native';
import DocumentPicker from 'react-native-document-picker';
import CompassIcon from '@components/compass_icon';
import TouchableWithFeedback from '@components/touchable_with_feedback';
import {changeOpacity} from '@utils/theme';
import {getFileExtension} from '@utils/file';
import {debugLog} from '@store/debug_log';

import {useFilePicker, type SelectedFile} from '../context/file_picker_context';

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    hintText: {
        fontSize: 15,
        color: '#999',
        textAlign: 'center',
        marginBottom: 24,
        paddingHorizontal: 40,
    },
    selectButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#07C160',
        borderRadius: 8,
        paddingVertical: 12,
        paddingHorizontal: 32,
    },
    selectButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
        marginLeft: 8,
    },
});

export default function FilesTab() {
    const intl = useIntl();
    const {dispatch, canSelectMore} = useFilePicker();

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
            debugLog('filePicker', `Starting file picker on ${Platform.OS}`);

            const options = {
                type: [DocumentPicker.types.allFiles],
                allowMultiSelection: true,
                // On iOS, copyTo helps with file access, especially for iCloud and Files app
                ...(Platform.OS === 'ios' ? {copyTo: 'cachesDirectory' as const} : {copyTo: 'cachesDirectory' as const}),
            };

            debugLog('filePicker', `DocumentPicker options: ${JSON.stringify(options)}`);

            const result = await DocumentPicker.pick(options);

            debugLog('filePicker', `DocumentPicker returned ${result.length} files`);

            result.forEach((file, index) => {
                debugLog('filePicker', `=== Processing file ${index + 1}/${result.length} ===`);
                debugLog('filePicker', `Name: ${file.name}`);
                debugLog('filePicker', `URI: ${file.uri}`);
                debugLog('filePicker', `FileCopyUri: ${file.fileCopyUri}`);
                debugLog('filePicker', `Type: ${file.type}`);
                debugLog('filePicker', `Size: ${file.size}`);

                if (canSelectMore()) {
                    // Use fileCopyUri if available (from copyTo option), otherwise use original uri
                    const fileUri = file.fileCopyUri || file.uri;

                    // Validate file URI
                    if (!fileUri) {
                        debugLog('filePicker', `ERROR: No valid URI for file ${index + 1}`);
                        return;
                    }

                    debugLog('filePicker', `Using URI: ${fileUri}`);

                    // Validate file name
                    const fileName = file.name || 'unknown';
                    if (!fileName) {
                        debugLog('filePicker', `WARNING: File name is empty for ${index + 1}`);
                    }

                    const selectedFile: SelectedFile = {
                        id: fileUri,
                        clientId: fileUri,
                        name: fileName,
                        uri: fileUri,
                        mime_type: file.type || 'application/octet-stream',
                        size: file.size || 0,
                        source: 'device',
                        extension: getFileExtension(fileName || '') || '',
                    };

                    debugLog('filePicker', `Creating SelectedFile:`, JSON.stringify({
                        id: selectedFile.id,
                        name: selectedFile.name,
                        uri: selectedFile.uri,
                        mime_type: selectedFile.mime_type,
                        size: selectedFile.size,
                        extension: selectedFile.extension,
                    }));

                    try {
                        dispatch({type: 'ADD_FILE', file: selectedFile});
                        debugLog('filePicker', `File added successfully`);
                    } catch (dispatchError) {
                        const errorMsg = dispatchError instanceof Error ? dispatchError.message : String(dispatchError);
                        debugLog('filePicker', `ERROR dispatching ADD_FILE: ${errorMsg}`);
                    }
                } else {
                    debugLog('filePicker', `Skipped: cannot select more files (index ${index})`);
                }
            });

            debugLog('filePicker', `All ${result.length} files processed successfully`);
        } catch (error) {
            if (DocumentPicker.isCancel(error)) {
                debugLog('filePicker', 'User cancelled file picker');
                return;
            }

            const errorMsg = error instanceof Error ? error.message : String(error);
            const errorCode = (error as any)?.code;
            const errorStack = error instanceof Error ? error.stack : '';

            debugLog('filePicker', `FilesTab pick error on ${Platform.OS}:`);
            debugLog('filePicker', `  Message: ${errorMsg}`);
            debugLog('filePicker', `  Code: ${errorCode}`);
            debugLog('filePicker', `  Stack: ${errorStack}`);
            debugLog('filePicker', `  Full error: ${JSON.stringify(error, null, 2)}`);

            // Provide more specific error messages based on error type
            let errorId = 'file_picker.pick_error';
            let defaultMessage = 'Failed to pick files. Please try again.';

            if (errorMsg.includes('permission') || errorMsg.includes('Permission')) {
                errorId = 'file_picker.permission_error';
                defaultMessage = Platform.OS === 'ios'
                    ? 'Unable to access files. Please check your Files app settings and try again.'
                    : 'Unable to access files. Please grant storage permission and try again.';
            } else if (errorMsg.includes('not found') || errorMsg.includes('ENOENT')) {
                errorId = 'file_picker.file_not_found';
                defaultMessage = 'Selected file could not be found. It may have been moved or deleted.';
            }

            Alert.alert(
                intl.formatMessage({id: 'mobile.link.error.title', defaultMessage: 'Error'}),
                intl.formatMessage({id: errorId, defaultMessage}),
            );
        }
    }, [dispatch, canSelectMore, intl]);

    return (
        <View style={styles.container}>
            <Text style={styles.hintText}>
                {intl.formatMessage({
                    id: 'file_picker.files.hint',
                    defaultMessage: 'You need to select files from your phone',
                })}
            </Text>
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
                            id: 'file_picker.files.pick',
                            defaultMessage: 'Select',
                        })}
                    </Text>
                </>
            </TouchableWithFeedback>
        </View>
    );
}
