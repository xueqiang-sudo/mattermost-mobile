// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {
    SecurePdfViewer,
    type OnLoadErrorEvent,
} from '@mattermost/secure-pdf-viewer';
import {deleteAsync, getInfoAsync, readAsStringAsync} from 'expo-file-system';
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
import {popTopScreen} from '@screens/navigation';
import {debugLog} from '@store/debug_log';
import TextViewer from '@screens/text_viewer/text_viewer';
import {fileExists, getLocalFilePathFromFile, hasPdfPreview, isAudio, isImage, isPdf, isTextFile, isVideo} from '@utils/file';
import {getFullErrorMessage, isErrorWithMessage} from '@utils/errors';
import {logDebug, logError} from '@utils/log';
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
    pdfView: {
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

    debugLog('FILE_VIEWER', `UnifiedFileViewer mounted: ${fileInfo.name}, id:${fileId}`);

    const [fileState, setFileState] = useState<FileState>('loading');
    const [filePath, setFilePath] = useState<string>('');
    const [progress, setProgress] = useState(0);
    const [currentFileInfo, setCurrentFileInfo] = useState<FileInfo>(fileInfo);
    const [pdfError, setPdfError] = useState<string | undefined>(undefined);

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
        return popTopScreen(componentId);
    }, [componentId]);

    useAndroidHardwareBackHandler(componentId, handleClose);

    const onPdfLoadError = useCallback((event: OnLoadErrorEvent) => {
        logError('Error loading PDF', event.nativeEvent.message);
        debugLog('FILE_VIEWER', `PDF load error: ${event.nativeEvent.message}`);
        setPdfError(event.nativeEvent.message);
        setFileState('unsupported');
    }, []);

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
        debugLog('FILE_VIEWER', `downloadAndShowFile called: ${file.name}, id:${file.id}`);
        try {
            // Handle PDF preview (for Office files)
            const fileToDownload = hasPdfPreview(file) && file.pdf_preview_id
                ? {...file, id: file.pdf_preview_id, name: file.name.replace(/\.[^.]+$/, '.pdf'), extension: 'pdf', mime_type: 'application/pdf'}
                : file;

            debugLog('FILE_VIEWER', `fileToDownload: ${fileToDownload.name}, id:${fileToDownload.id}, hasPdfPreview:${hasPdfPreview(file)}`);

            let path = decodeURIComponent(fileToDownload.localPath || '');
            let exists = false;
            if (path) {
                exists = await fileExists(path);
                debugLog('FILE_VIEWER', `local path: ${path}, exists: ${exists}`);
            }

            if (!exists) {
                path = getLocalFilePathFromFile(serverUrl, fileToDownload);
                debugLog('FILE_VIEWER', `computed path: ${path}`);
            }

            if (!exists) {
                debugLog('FILE_VIEWER', `downloading file...`);
                debugLog('FILE_VIEWER', `  fileId: ${fileToDownload.id}`);
                debugLog('FILE_VIEWER', `  serverUrl: ${serverUrl}`);
                debugLog('FILE_VIEWER', `  destination: ${path}`);

                setProgress(0);
                downloadTask.current = downloadFile(serverUrl, fileToDownload.id!, path!);
                downloadTask.current?.progress?.(setProgress);

                try {
                    const response = await downloadTask.current;
                    debugLog('FILE_VIEWER', `download response: ${JSON.stringify(response?.data || response)}`);
                } catch (downloadError) {
                    debugLog('FILE_VIEWER', `download error: ${getFullErrorMessage(downloadError)}`);
                    throw downloadError;
                }

                setProgress(1);
                debugLog('FILE_VIEWER', `file downloaded`);
            } else {
                debugLog('FILE_VIEWER', `file already exists, skipping download`);
            }

            setFilePath(path!);
            debugLog('FILE_VIEWER', `filePath set to: ${path}, fileToDownload.name=${fileToDownload.name}, fileToDownload.extension=${fileToDownload.extension}`);

            // Validate downloaded file
            try {
                const pathWithoutPrefix = path!.replace('file://', '');
                const fileInfo = await getInfoAsync(pathWithoutPrefix);
                debugLog('FILE_VIEWER', `file validation: exists=${fileInfo.exists}, size=${fileInfo.size} bytes, isDirectory=${fileInfo.isDirectory}`);

                if (!fileInfo.exists) {
                    debugLog('FILE_VIEWER', `ERROR: file does not exist after download!`);
                    throw new Error('File does not exist after download');
                } else if (fileInfo.size === 0) {
                    debugLog('FILE_VIEWER', `ERROR: file is empty (0 bytes)!`);
                    // Delete empty file
                    await deleteAsync(pathWithoutPrefix, {idempotent: true});
                    throw new Error('Downloaded file is empty (0 bytes). Server may have returned an error.');
                } else if (fileInfo.size < 100) {
                    debugLog('FILE_VIEWER', `WARNING: file is very small (${fileInfo.size} bytes), might be corrupted or error page`);
                }

                // Read first 100 bytes to check if it's actually a PDF
                if (fileInfo.exists && fileInfo.size > 0) {
                    const firstBytes = await readAsStringAsync(pathWithoutPrefix, {
                        encoding: 'base64',
                        length: 100,
                    });
                    // PDF files start with "%PDF" (25 50 44 46 in hex)
                    const isPdfHeader = firstBytes.startsWith('JVBER');
                    debugLog('FILE_VIEWER', `file content check: firstBytes=${firstBytes.substring(0, 20)}..., isPdfHeader=${isPdfHeader}`);

                    if (!isPdfHeader) {
                        debugLog('FILE_VIEWER', `ERROR: file does not have PDF header! Might be HTML error page or wrong file type`);
                        // Read more content to see what it actually is
                        const moreContent = await readAsStringAsync(pathWithoutPrefix, {
                            encoding: 'utf8',
                            length: 500,
                        });
                        debugLog('FILE_VIEWER', `file content preview: ${moreContent.substring(0, 200)}`);
                    }
                }
            } catch (validationError) {
                debugLog('FILE_VIEWER', `file validation error: ${getFullErrorMessage(validationError)}`);
            }

            // PDF and text files are rendered inline, no need to open external viewers
            if (isPdf(fileToDownload)) {
                debugLog('FILE_VIEWER', `PDF ready for inline rendering, isPdf=true`);
            } else if (isTextFile(fileToDownload)) {
                debugLog('FILE_VIEWER', `text file ready for inline rendering`);
            } else {
                debugLog('FILE_VIEWER', `unsupported file type for inline viewing, isPdf=${isPdf(fileToDownload)}, isTextFile=${isTextFile(fileToDownload)}`);
                // For images/videos/audio, we'll embed them later
                // For now, just store the path
            }
        } catch (error) {
            debugLog('FILE_VIEWER', `error: ${getFullErrorMessage(error)}`);
            logDebug('Error downloading file:', getFullErrorMessage(error));
            if (!isErrorWithMessage(error) || error.message !== 'cancelled') {
                Alert.alert(
                    intl.formatMessage({id: 'file_viewer.error', defaultMessage: 'Error'}),
                    intl.formatMessage({id: 'file_viewer.download_failed', defaultMessage: 'Failed to download file'}),
                );
                // Don't set to unsupported - keep showing the error in UnsupportedView
                // but allow retry via download button
            }
        }
    }, [serverUrl, theme, intl, handleClose]);

    const determineFileState = useCallback(() => {
        debugLog('FILE_VIEWER', `determineFileState called for: ${fileInfo.name}`);
        debugLog('FILE_VIEWER', `isOfficeFile: ${isOfficeFile(fileInfo)}, pdf_preview_id: ${fileInfo.pdf_preview_id}`);
        debugLog('FILE_VIEWER', `isViewableFile: ${isViewableFile(fileInfo)}, isPdf: ${isPdf(fileInfo)}`);

        // Check if Office file is being converted
        if (isOfficeFile(fileInfo) && !fileInfo.pdf_preview_id) {
            debugLog('FILE_VIEWER', `state: converting (Office file without PDF preview)`);
            setFileState('converting');
            startPolling();
            return;
        }

        // Check if file can be viewed
        if (isViewableFile(fileInfo)) {
            debugLog('FILE_VIEWER', `state: viewable`);
            setFileState('viewable');
            downloadAndShowFile(fileInfo);
            return;
        }

        // Unsupported file
        debugLog('FILE_VIEWER', `state: unsupported`);
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
            renderContent: () => (
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
        debugLog('FILE_VIEWER', `renderContent: fileState=${fileState}, progress=${progress}, filePath=${filePath}`);

        // Check if file should be rendered as PDF (either PDF file or Office file with PDF preview)
        const shouldRenderAsPdf = isPdf(currentFileInfo) || (hasPdfPreview(currentFileInfo) && currentFileInfo.pdf_preview_id);

        debugLog('FILE_VIEWER', `shouldRenderAsPdf=${shouldRenderAsPdf}, isPdf=${isPdf(currentFileInfo)}, hasPdfPreview=${hasPdfPreview(currentFileInfo)}, pdf_preview_id=${currentFileInfo.pdf_preview_id}`);
        debugLog('FILE_VIEWER', `currentFileInfo: name=${currentFileInfo.name}, extension=${currentFileInfo.extension}, mime_type=${currentFileInfo.mime_type}`);

        // Render PDF inline if ready (includes Office files converted to PDF)
        if (fileState === 'viewable' && filePath && shouldRenderAsPdf) {
            debugLog('FILE_VIEWER', `rendering inline PDF viewer, filePath=${filePath}`);
            if (pdfError) {
                debugLog('FILE_VIEWER', `PDF load error: ${pdfError}`);
                return (
                    <View style={styles.content}>
                        <UnsupportedView
                            fileInfo={currentFileInfo}
                            onDownload={handleDownload}
                            onOpenWith={handleOpenWith}
                        />
                    </View>
                );
            }
            // SecurePdfViewer expects path without file:// prefix
            // This avoids URL parsing issues with special characters (Chinese, spaces, etc.)
            const pdfSource = filePath.replace('file://', '');
            debugLog('FILE_VIEWER', `rendering SecurePdfViewer:`);
            debugLog('FILE_VIEWER', `  original filePath: ${filePath}`);
            debugLog('FILE_VIEWER', `  pdfSource (without file://): ${pdfSource}`);
            debugLog('FILE_VIEWER', `  filePath length: ${filePath.length}, pdfSource length: ${pdfSource.length}`);
            debugLog('FILE_VIEWER', `  contains Chinese chars: ${/[一-鿿]/.test(pdfSource)}`);
            debugLog('FILE_VIEWER', `  contains spaces: ${pdfSource.includes(' ')}`);
            return (
                <SecurePdfViewer
                    allowLinks={false}
                    onLoadError={onPdfLoadError}
                    source={pdfSource}
                    style={styles.pdfView}
                />
            );
        }

        // Render text files inline if ready
        if (fileState === 'viewable' && filePath && isTextFile(currentFileInfo)) {
            debugLog('FILE_VIEWER', `rendering inline text viewer`);
            return (
                <TextViewer
                    componentId={componentId}
                    closeButtonId='close-text-viewer'
                    filePath={filePath}
                    fileName={currentFileInfo.name}
                    mimeType={currentFileInfo.mime_type || 'text/plain'}
                    onDismiss={handleClose}
                />
            );
        }

        switch (fileState) {
            case 'loading':
                debugLog('FILE_VIEWER', `rendering LoadingView (loading state)`);
                return <LoadingView progress={progress}/>;
            case 'converting':
                debugLog('FILE_VIEWER', `rendering ConvertingView`);
                return <ConvertingView fileInfo={currentFileInfo}/>;
            case 'viewable':
                // Still downloading or unsupported for inline viewing
                debugLog('FILE_VIEWER', `rendering LoadingView (viewable state, waiting for download)`);
                return <LoadingView progress={progress}/>;
            case 'unsupported':
                debugLog('FILE_VIEWER', `rendering UnsupportedView`);
                return (
                    <UnsupportedView
                        fileInfo={currentFileInfo}
                        onDownload={handleDownload}
                        onOpenWith={handleOpenWith}
                    />
                );
            default:
                debugLog('FILE_VIEWER', `rendering null (unknown state)`);
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
