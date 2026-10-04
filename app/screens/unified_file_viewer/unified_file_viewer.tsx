// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {deleteAsync} from 'expo-file-system';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {Alert, View, StyleSheet} from 'react-native';
import FileViewer from 'react-native-file-viewer';

import {downloadFile} from '@actions/remote/file';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import DatabaseManager from '@database/manager';
import NetworkManager from '@managers/network_manager';
import {dismissModal} from '@screens/navigation';
import {fileExists, getLocalFilePathFromFile, hasPdfPreview, isAudio, isImage, isPdf, isTextFile, isVideo} from '@utils/file';
import {getFullErrorMessage, isErrorWithMessage} from '@utils/errors';
import {logDebug} from '@utils/log';
import {previewPdf, previewTextFile} from '@utils/navigation';
import {bottomSheet} from '@screens/navigation';

import ConvertingView from './converting_view';
import FileMenu from './file_menu';
import LoadingView from './loading_view';
import TopBar from './top_bar';
import UnsupportedView from './unsupported_view';

import type {AvailableScreens} from '@typings/screens/navigation';
import type {ProgressPromise, ClientResponse} from '@mattermost/react-native-network-client';

type FileState = 'loading' | 'converting' | 'viewable' | 'unsupported';

type Props = {
    componentId: AvailableScreens;
    fileId: string;
    fileInfo: FileInfo;
};

const OFFICE_EXTENSIONS = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];
const MAX_POLLING_ATTEMPTS = 30;

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    content: {
        flex: 1,
    },
});

const isOfficeFile = (file: FileInfo): boolean => {
    const ext = file.extension?.toLowerCase() || file.name.split('.').pop()?.toLowerCase() || '';
    return OFFICE_EXTENSIONS.includes(ext);
};

const isViewableFile = (file: FileInfo): boolean => {
    return isPdf(file) || isTextFile(file) || isImage(file) || isVideo(file) || isAudio(file) || hasPdfPreview(file);
};

const UnifiedFileViewer = ({componentId, fileId, fileInfo}: Props) => {
    const theme = useTheme();
    const intl = useIntl();
    const serverUrl = useServerUrl();

    const [fileState, setFileState] = useState<FileState>('loading');
    const [filePath, setFilePath] = useState<string>('');
    const [progress, setProgress] = useState(0);
    const [currentFileInfo, setCurrentFileInfo] = useState<FileInfo>(fileInfo);

    const downloadTask = useRef<ProgressPromise<ClientResponse>>();
    const pollingRef = useRef<NodeJS.Timeout | null>(null);
    const pollingCountRef = useRef(0);

    const handleClose = useCallback(() => {
        if (downloadTask.current?.cancel) {
            downloadTask.current.cancel();
        }
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
        }
        return dismissModal({componentId});
    }, [componentId]);

    useAndroidHardwareBackHandler(componentId, handleClose);

    const startPolling = useCallback(async () => {
        pollingCountRef.current = 0;

        pollingRef.current = setInterval(async () => {
            pollingCountRef.current += 1;

            try {
                const client = NetworkManager.getClient(serverUrl);
                const updatedFileInfo = await client.getFileInfo(fileId);

                if (updatedFileInfo.pdf_preview_id) {
                    // Conversion complete
                    if (pollingRef.current) {
                        clearInterval(pollingRef.current);
                        pollingRef.current = null;
                    }

                    // Save to database
                    try {
                        const {operator} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
                        await operator.handleFiles({
                            files: [{...updatedFileInfo, id: fileId}],
                            prepareRecordsOnly: false,
                        });
                    } catch (dbError) {
                        logDebug('Failed to save pdf_preview_id to database:', dbError);
                    }

                    // Update state and show PDF
                    const newFileInfo = {...currentFileInfo, pdf_preview_id: updatedFileInfo.pdf_preview_id};
                    setCurrentFileInfo(newFileInfo);
                    setFileState('viewable');
                    downloadAndShowFile(newFileInfo);
                    return;
                }

                // Timeout
                if (pollingCountRef.current >= MAX_POLLING_ATTEMPTS) {
                    if (pollingRef.current) {
                        clearInterval(pollingRef.current);
                        pollingRef.current = null;
                    }
                    setFileState('unsupported');
                }
            } catch (error) {
                logDebug('Polling error:', getFullErrorMessage(error));
                if (pollingRef.current) {
                    clearInterval(pollingRef.current);
                    pollingRef.current = null;
                }
                setFileState('unsupported');
            }
        }, 2000);
    }, [serverUrl, fileId, currentFileInfo]);

    const downloadAndShowFile = useCallback(async (file: FileInfo) => {
        try {
            // Handle PDF preview (for Office files)
            const fileToDownload = hasPdfPreview(file) && file.pdf_preview_id
                ? {...file, id: file.pdf_preview_id, name: file.name.replace(/\.[^.]+$/, '.pdf'), extension: 'pdf', mime_type: 'application/pdf'}
                : file;

            let path = decodeURIComponent(fileToDownload.localPath || '');
            let exists = false;
            if (path) {
                exists = await fileExists(path);
            }

            if (!exists) {
                path = getLocalFilePathFromFile(serverUrl, fileToDownload);
            }

            if (!exists) {
                setProgress(0);
                downloadTask.current = downloadFile(serverUrl, fileToDownload.id!, path!);
                downloadTask.current?.progress?.(setProgress);
                await downloadTask.current;
                setProgress(1);
            }

            setFilePath(path!);

            // Open with appropriate viewer
            if (isPdf(fileToDownload)) {
                previewPdf(fileToDownload, path!, theme, handleClose);
            } else if (isTextFile(fileToDownload)) {
                previewTextFile(fileToDownload, path!, theme, handleClose);
            } else {
                // For images/videos/audio, we'll embed them later
                // For now, just store the path
            }
        } catch (error) {
            logDebug('Error downloading file:', getFullErrorMessage(error));
            if (!isErrorWithMessage(error) || error.message !== 'cancelled') {
                Alert.alert(
                    intl.formatMessage({id: 'file_viewer.error', defaultMessage: 'Error'}),
                    intl.formatMessage({id: 'file_viewer.download_failed', defaultMessage: 'Failed to download file'}),
                );
                setFileState('unsupported');
            }
        }
    }, [serverUrl, theme, intl, handleClose]);

    const determineFileState = useCallback(() => {
        // Check if Office file is being converted
        if (isOfficeFile(fileInfo) && !fileInfo.pdf_preview_id) {
            setFileState('converting');
            startPolling();
            return;
        }

        // Check if file can be viewed
        if (isViewableFile(fileInfo)) {
            setFileState('viewable');
            downloadAndShowFile(fileInfo);
            return;
        }

        // Unsupported file
        setFileState('unsupported');
    }, [fileInfo, startPolling, downloadAndShowFile]);

    useEffect(() => {
        determineFileState();

        return () => {
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
            }
        };
    }, [determineFileState]);

    const handleMenuPress = useCallback(() => {
        bottomSheet({
            title: '',
            renderContent: (
                <FileMenu
                    fileInfo={currentFileInfo}
                    onAction={(action) => {
                        logDebug('Menu action:', action);
                        // TODO: Implement menu actions
                    }}
                    onClose={() => {}}
                />
            ),
            snapPoints: ['CONTENT_HEIGHT', 0],
            theme,
            closeButtonId: 'close-file-menu',
        });
    }, [currentFileInfo, theme]);

    const handleDownload = useCallback(async () => {
        try {
            const path = getLocalFilePathFromFile(serverUrl, currentFileInfo);
            setProgress(0);
            downloadTask.current = downloadFile(serverUrl, currentFileInfo.id!, path!);
            downloadTask.current?.progress?.(setProgress);
            await downloadTask.current;
            setProgress(1);
            setFilePath(path!);
        } catch (error) {
            logDebug('Download error:', getFullErrorMessage(error));
        }
    }, [serverUrl, currentFileInfo]);

    const handleOpenWith = useCallback(() => {
        if (!filePath) {
            handleDownload().then(() => {
                if (filePath) {
                    FileViewer.open(filePath.replace('file://', ''), {
                        displayName: currentFileInfo.name,
                        showOpenWithDialog: true,
                        showAppsSuggestions: true,
                    }).catch((error) => {
                        logDebug('Open with error:', error);
                    });
                }
            });
        } else {
            FileViewer.open(filePath.replace('file://', ''), {
                displayName: currentFileInfo.name,
                showOpenWithDialog: true,
                showAppsSuggestions: true,
            }).catch((error) => {
                logDebug('Open with error:', error);
            });
        }
    }, [filePath, currentFileInfo, handleDownload]);

    const renderContent = () => {
        switch (fileState) {
            case 'loading':
                return <LoadingView progress={progress}/>;
            case 'converting':
                return <ConvertingView fileInfo={currentFileInfo}/>;
            case 'viewable':
                // For now, just show loading while we open the appropriate viewer
                return <LoadingView progress={progress}/>;
            case 'unsupported':
                return (
                    <UnsupportedView
                        fileInfo={currentFileInfo}
                        onDownload={handleDownload}
                        onOpenWith={handleOpenWith}
                    />
                );
            default:
                return null;
        }
    };

    return (
        <View style={styles.container}>
            <TopBar
                title={currentFileInfo.name}
                onBack={handleClose}
                onMenuPress={handleMenuPress}
            />
            <View style={styles.content}>
                {renderContent()}
            </View>
        </View>
    );
};

export default UnifiedFileViewer;
