// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';
import {useIntl} from 'react-intl';
import {Alert, StyleSheet, Text, View} from 'react-native';
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
    hintIcon: {
        marginBottom: 16,
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
            const result = await DocumentPicker.pick({
                type: [DocumentPicker.types.allFiles],
                allowMultiSelection: true,
            });

            result.forEach((file) => {
                if (canSelectMore()) {
                    const selectedFile: SelectedFile = {
                        id: file.uri,
                        clientId: file.uri,
                        name: file.name || 'unknown',
                        uri: file.uri,
                        mime_type: file.type || 'application/octet-stream',
                        size: file.size || 0,
                        source: 'device',
                        extension: getFileExtension(file.name || '') || '',
                    };

                    dispatch({type: 'ADD_FILE', file: selectedFile});
                }
            });
        } catch (error) {
            if (!DocumentPicker.isCancel(error)) {
                debugLog('filePicker', `FilesTab pick error: ${error instanceof Error ? error.message : String(error)}`);
                Alert.alert(
                    intl.formatMessage({id: 'mobile.link.error.title', defaultMessage: 'Error'}),
                    intl.formatMessage({
                        id: 'file_picker.pick_error',
                        defaultMessage: 'Failed to pick files. Please try again.',
                    }),
                );
            }
        }
    }, [dispatch, canSelectMore, intl]);

    return (
        <View style={styles.container}>
            <CompassIcon
                name='file-document-outline'
                size={56}
                color={changeOpacity('#000', 0.25)}
                style={styles.hintIcon}
            />
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
