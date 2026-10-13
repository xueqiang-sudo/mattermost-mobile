// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Modal, Pressable, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useIntl} from 'react-intl';

import CompassIcon from '@components/compass_icon';
import {useTheme} from '@context/theme';
import {useServerUrl} from '@context/server';
import NetworkManager from '@managers/network_manager';
import DatabaseManager from '@database/manager';
import {getFormattedFileSize} from '@utils/file';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

type FileActionDialogProps = {
    visible: boolean;
    file: FileInfo | null;
    onClose: () => void;
    onOpenWithOtherApp?: (file: FileInfo) => void;
    onPreview?: (file: FileInfo) => void;
};

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
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.16),
    },
    headerTitle: {
        flex: 1,
        fontSize: 17,
        fontWeight: '600',
        color: theme.centerChannelColor,
        textAlign: 'center',
    },
    headerButton: {
        padding: 8,
    },
    content: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
    },
    fileIconContainer: {
        width: 80,
        height: 80,
        borderRadius: 16,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
    },
    fileName: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.centerChannelColor,
        textAlign: 'center',
        marginBottom: 8,
    },
    fileSize: {
        ...typography('Body', 100, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginBottom: 32,
    },
    spinnerContainer: {
        alignItems: 'center',
        marginBottom: 16,
    },
    statusText: {
        ...typography('Body', 100, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.72),
        textAlign: 'center',
        marginBottom: 24,
    },
    progressBar: {
        width: '80%',
        height: 4,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.12),
        borderRadius: 2,
        overflow: 'hidden',
        marginBottom: 12,
    },
    progressFill: {
        height: '100%',
        backgroundColor: theme.buttonBg,
        borderRadius: 2,
    },
    buttonContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: 16,
    },
    button: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        paddingHorizontal: 32,
        borderRadius: 8,
        backgroundColor: theme.buttonBg,
        minWidth: 160,
    },
    buttonText: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.buttonColor,
    },
    retryButton: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.24),
        marginLeft: 12,
    },
    retryButtonText: {
        color: theme.centerChannelColor,
    },
    timeoutText: {
        ...typography('Body', 75, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.4),
        marginTop: 8,
    },
}));

const OFFICE_FILE_TYPES = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];

const FileActionDialog = ({
    visible,
    file,
    onClose,
    onOpenWithOtherApp,
    onPreview,
}: FileActionDialogProps) => {
    const intl = useIntl();
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const serverUrl = useServerUrl();
    const [isPolling, setIsPolling] = useState(false);
    const [isTimeout, setIsTimeout] = useState(false);
    const [progress, setProgress] = useState(0);
    const pollingRef = useRef<NodeJS.Timeout | null>(null);
    const pollingCountRef = useRef(0);
    const MAX_POLLING_ATTEMPTS = 30;

    const getFileExtension = (fileName: string): string => {
        const parts = fileName.split('.');
        return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
    };

    const isOfficeFile = (fileName: string): boolean => {
        const ext = getFileExtension(fileName);
        return OFFICE_FILE_TYPES.includes(ext);
    };

    const stopPolling = useCallback(() => {
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
        }
        pollingCountRef.current = 0;
        setIsPolling(false);
    }, []);

    const startPolling = useCallback(async (fileInfo: FileInfo) => {
        if (!fileInfo.id) return;

        setIsPolling(true);
        setIsTimeout(false);
        setProgress(0);
        pollingCountRef.current = 0;

        // Trigger conversion and check server response
        try {
            const client = NetworkManager.getClient(serverUrl);
            const result = await client.triggerPdfConversion(fileInfo.id);

            // If preview is already complete, open immediately
            if (result.status === 'complete' && result.pdf_preview_id) {
                setProgress(100);

                // Fetch latest file info to get pdf_preview_id
                const updatedFileInfo = await client.getFileInfo(fileInfo.id);
                if (updatedFileInfo.pdf_preview_id) {
                    // Save to database
                    try {
                        const {operator} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
                        await operator.handleFiles({
                            files: [{...updatedFileInfo, id: fileInfo.id}],
                            prepareRecordsOnly: false,
                        });
                    } catch (dbError) {
                        // Continue even if DB save fails
                    }

                    // Open preview
                    setTimeout(() => {
                        onPreview?.({...fileInfo, pdf_preview_id: updatedFileInfo.pdf_preview_id});
                        onClose();
                    }, 500);
                    return;
                }
            }

            // If status is 'converting' or 'queued', start polling
            if (result.status === 'converting' || result.status === 'queued') {
                // Continue to polling
            } else if (result.status === 'failed') {
                // Conversion failed
                setIsPolling(false);
                setIsTimeout(true);
                return;
            }
        } catch (error) {
            // Continue to polling even if trigger fails
        }

        // Start polling for conversion completion
        pollingRef.current = setInterval(async () => {
            pollingCountRef.current += 1;

            // Update progress (0 to 90%, never reaches 100 until done)
            const pct = Math.min(90, Math.round((pollingCountRef.current / MAX_POLLING_ATTEMPTS) * 90));
            setProgress(pct);

            try {
                const client = NetworkManager.getClient(serverUrl);
                const updatedFileInfo = await client.getFileInfo(fileInfo.id!);

                // Conversion complete
                if (updatedFileInfo.pdf_preview_id) {
                    stopPolling();
                    setProgress(100);

                    // Save pdf_preview_id to local database
                    try {
                        const {operator} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
                        const fileWithPdfId = {
                            ...updatedFileInfo,
                            id: fileInfo.id,
                        };
                        await operator.handleFiles({
                            files: [fileWithPdfId],
                            prepareRecordsOnly: false,
                        });
                    } catch (dbError) {
                        // Continue to preview even if DB save fails
                    }

                    // Auto-open preview after short delay for UX
                    setTimeout(() => {
                        onPreview?.({...fileInfo, pdf_preview_id: updatedFileInfo.pdf_preview_id});
                        onClose();
                    }, 500);
                    return;
                }

                // Timeout
                if (pollingCountRef.current >= MAX_POLLING_ATTEMPTS) {
                    stopPolling();
                    setIsTimeout(true);
                }
            } catch (error) {
                stopPolling();
                setIsTimeout(true);
            }
        }, 2000);
    }, [serverUrl, onPreview, onClose, stopPolling]);

    // Auto-start polling when dialog opens for Office files
    useEffect(() => {
        if (visible && file && isOfficeFile(file.name) && !file.pdf_preview_id) {
            startPolling(file);
        }
        return () => {
            stopPolling();
        };
    }, [visible, file]);

    const handleRetry = useCallback(() => {
        if (file) {
            startPolling(file);
        }
    }, [file, startPolling]);

    const handleOpenWithOtherApp = useCallback(() => {
        if (!file || !onOpenWithOtherApp) return;
        onOpenWithOtherApp(file);
        onClose();
    }, [file, onOpenWithOtherApp, onClose]);

    if (!file) {
        return null;
    }

    const fileName = file.name || 'Unknown';
    const fileSize = getFormattedFileSize(file.size);
    const isOffice = isOfficeFile(fileName);

    let statusMessage: string;
    if (isTimeout) {
        statusMessage = intl.formatMessage({
            id: 'file.conversion_timeout',
            defaultMessage: 'Conversion is taking longer than expected. You can retry or open with another app.',
        });
    } else if (isPolling) {
        statusMessage = intl.formatMessage({
            id: 'file.converting',
            defaultMessage: 'Converting document to PDF...',
        });
    } else {
        statusMessage = intl.formatMessage({
            id: 'file.unrecognized_message',
            defaultMessage: 'This file type cannot be opened directly. You can download it to view with other apps.',
        });
    }

    return (
        <Modal
            visible={visible}
            animationType='slide'
            presentationStyle='fullScreen'
            onRequestClose={onClose}
        >
            <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
                <View style={styles.header}>
                    <Pressable style={styles.headerButton} onPress={onClose}>
                        <CompassIcon
                            name='close'
                            size={24}
                            color={theme.centerChannelColor}
                        />
                    </Pressable>
                    <Text style={styles.headerTitle}>
                        {intl.formatMessage({id: 'file.document_preview', defaultMessage: 'Document Preview'})}
                    </Text>
                    <View style={{width: 40}}/>
                </View>

                <View style={styles.content}>
                    <View style={styles.fileIconContainer}>
                        <CompassIcon
                            name='file-document-outline'
                            size={40}
                            color={theme.centerChannelColor}
                        />
                    </View>

                    <Text style={styles.fileName} numberOfLines={2}>
                        {fileName}
                    </Text>
                    <Text style={styles.fileSize}>
                        {fileSize}
                    </Text>

                    {(isPolling || (isOffice && !isTimeout)) && (
                        <>
                            <View style={styles.spinnerContainer}>
                                {isPolling && (
                                    <ActivityIndicator size='large' color={theme.buttonBg}/>
                                )}
                            </View>
                            {isPolling && (
                                <View style={styles.progressBar}>
                                    <View style={[styles.progressFill, {width: `${progress}%`}]}/>
                                </View>
                            )}
                        </>
                    )}

                    <Text style={styles.statusText}>
                        {statusMessage}
                    </Text>

                    {isTimeout && (
                        <View style={styles.buttonContainer}>
                            <Pressable style={styles.button} onPress={handleRetry}>
                                <Text style={styles.buttonText}>
                                    {intl.formatMessage({id: 'file.retry', defaultMessage: 'Retry'})}
                                </Text>
                            </Pressable>
                            <Pressable style={[styles.button, styles.retryButton]} onPress={handleOpenWithOtherApp}>
                                <Text style={[styles.buttonText, styles.retryButtonText]}>
                                    {intl.formatMessage({id: 'file.open_with_other', defaultMessage: 'Other App'})}
                                </Text>
                            </Pressable>
                        </View>
                    )}

                    {!isOffice && !isPolling && (
                        <View style={styles.buttonContainer}>
                            <Pressable style={styles.button} onPress={handleOpenWithOtherApp}>
                                <Text style={styles.buttonText}>
                                    {intl.formatMessage({id: 'file.open_with_other', defaultMessage: 'Open with Other App'})}
                                </Text>
                            </Pressable>
                        </View>
                    )}

                    {isPolling && (
                        <Text style={styles.timeoutText}>
                            {intl.formatMessage({
                                id: 'file.converting_countdown',
                                defaultMessage: 'Checking... ({count}/{max})',
                            }, {count: pollingCountRef.current, max: MAX_POLLING_ATTEMPTS})}
                        </Text>
                    )}
                </View>
            </SafeAreaView>
        </Modal>
    );
};

export default FileActionDialog;
