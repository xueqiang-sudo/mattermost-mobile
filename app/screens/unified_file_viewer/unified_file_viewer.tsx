// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {
    SecurePdfViewer,
    type OnLoadErrorEvent,
} from '@mattermost/secure-pdf-viewer';
import {deleteAsync, getInfoAsync, readAsStringAsync, writeAsStringAsync} from 'expo-file-system';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {Alert, View, StyleSheet} from 'react-native';
import FileViewer from 'react-native-file-viewer';
import Share from 'react-native-share';

import {downloadFile} from '@actions/remote/file';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import DatabaseManager from '@database/manager';
import NetworkManager from '@managers/network_manager';
import {popTopScreen} from '@screens/navigation';
import TextViewer from '@screens/text_viewer/text_viewer';
import {fileExists, getLocalFilePathFromFile, hasPdfPreview, isAppleDocument, isAudio, isImage, isPdf, isTextFile, isVideo, pathWithPrefix} from '@utils/file';
import {getFullErrorMessage, isErrorWithMessage} from '@utils/errors';
import {logError} from '@utils/log';
import {debugLog} from '@store/debug_log';

import ConvertingView from './converting_view';
import ImagePreview from './image_preview';
import VideoPreview from './video_preview';
import AudioPreview from './audio_preview';
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

const OFFICE_EXTENSIONS = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'pages', 'numbers', 'keynote'];
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
    return isPdf(file) || isTextFile(file) || isImage(file) || isVideo(file) || isAudio(file) || hasPdfPreview(file) || isAppleDocument(file);
};

const UnifiedFileViewer = ({componentId, fileId, fileInfo}: Props) => {
    const theme = useTheme();
    const intl = useIntl();
    const serverUrl = useServerUrl();


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
        setPdfError(event.nativeEvent.message);
        setFileState('unsupported');
    }, []);

    const startPolling = useCallback(async () => {
        pollingCountRef.current = 0;

        debugLog('[UnifiedFileViewer] Starting PDF conversion polling for fileId:', fileId);

        // Trigger conversion and check server response
        try {
            const client = NetworkManager.getClient(serverUrl);
            const result = await client.triggerPdfConversion(fileId);

            debugLog('[UnifiedFileViewer] Trigger conversion result:', JSON.stringify(result));

            // If preview is already complete, use it immediately
            if (result.status === 'complete' && result.pdf_preview_id) {
                debugLog('[UnifiedFileViewer] ✓ PDF already ready:', result.pdf_preview_id);
                const updatedFileInfo = await client.getFileInfo(fileId);
                if (updatedFileInfo.pdf_preview_id) {
                    // Save to database
                    try {
                        const {operator} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
                        await operator.handleFiles({
                            files: [{...updatedFileInfo, id: fileId}],
                            prepareRecordsOnly: false,
                        });
                        debugLog('[UnifiedFileViewer] Saved pdf_preview_id to database');
                    } catch (dbError) {
                        debugLog('Failed to save pdf_preview_id to database:', String(dbError));
                    }

                    // Update state and show PDF
                    const newFileInfo = {...currentFileInfo, pdf_preview_id: updatedFileInfo.pdf_preview_id};
                    setCurrentFileInfo(newFileInfo);
                    setFileState('viewable');
                    downloadAndShowFile(newFileInfo);
                    return;
                }
            }

            // If status is 'converting' or 'queued', start polling
            if (result.status === 'converting' || result.status === 'queued') {
                debugLog('[UnifiedFileViewer] Conversion in progress, starting poll');
            } else if (result.status === 'failed') {
                // Conversion failed
                debugLog('[UnifiedFileViewer] ✗ Conversion failed:', result.error);
                setFileState('unsupported');
                return;
            }
        } catch (error) {
            // Continue to polling even if trigger fails
            debugLog('[UnifiedFileViewer] Trigger conversion error:', String(error));
        }

        // Use recursive setTimeout instead of setInterval for better async handling
        const doPoll = async () => {
            pollingCountRef.current += 1;

            try {
                const client = NetworkManager.getClient(serverUrl);

                // Add timestamp to bypass cache
                const timestamp = Date.now();
                let updatedFileInfo: FileInfo;

                try {
                    // Try with cache-busting parameter
                    updatedFileInfo = await client.getFileInfo(`${fileId}?_t=${timestamp}`);
                } catch (e) {
                    // Fallback to normal request if query params not supported
                    updatedFileInfo = await client.getFileInfo(fileId);
                }

                const conversionStatus = (updatedFileInfo as any)?.pdf_conversion_status;
                const conversionError = (updatedFileInfo as any)?.pdf_conversion_error;

                debugLog(`[UnifiedFileViewer] Poll #${pollingCountRef.current}:`, JSON.stringify({
                    pdf_preview_id: updatedFileInfo?.pdf_preview_id || 'EMPTY',
                    pdf_conversion_status: conversionStatus || 'unknown',
                    pdf_conversion_error: conversionError || 'none',
                }));

                // Conversion complete
                if (updatedFileInfo.pdf_preview_id) {
                    debugLog('[UnifiedFileViewer] ✓ PDF ready:', updatedFileInfo.pdf_preview_id);

                    // Save to database
                    try {
                        const {operator} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
                        await operator.handleFiles({
                            files: [{...updatedFileInfo, id: fileId}],
                            prepareRecordsOnly: false,
                        });
                        debugLog('[UnifiedFileViewer] Saved pdf_preview_id to database');
                    } catch (dbError) {
                        debugLog('Failed to save pdf_preview_id to database:', String(dbError));
                    }

                    // Update state and show PDF
                    const newFileInfo = {...currentFileInfo, pdf_preview_id: updatedFileInfo.pdf_preview_id};
                    setCurrentFileInfo(newFileInfo);
                    setFileState('viewable');
                    downloadAndShowFile(newFileInfo);
                    return;
                }

                // Check if conversion failed
                if (conversionStatus === 'failed') {
                    debugLog('[UnifiedFileViewer] ✗ Conversion failed:', conversionError);
                    setFileState('unsupported');
                    return;
                }

                // Timeout
                if (pollingCountRef.current >= MAX_POLLING_ATTEMPTS) {
                    debugLog('[UnifiedFileViewer] Poll timeout after', MAX_POLLING_ATTEMPTS, 'attempts');
                    setFileState('unsupported');
                    return;
                }

                // Continue polling (use setTimeout instead of setInterval)
                pollingRef.current = setTimeout(doPoll, 2000);
            } catch (error) {
                debugLog(`[UnifiedFileViewer] Poll #${pollingCountRef.current} error:`, String(error));

                // Continue polling even on error, don't stop
                if (pollingCountRef.current < MAX_POLLING_ATTEMPTS) {
                    pollingRef.current = setTimeout(doPoll, 2000);
                } else {
                    debugLog('[UnifiedFileViewer] Poll timeout after error');
                    setFileState('unsupported');
                }
            }
        };

        // Start first poll
        pollingRef.current = setTimeout(doPoll, 2000);
    }, [serverUrl, fileId, currentFileInfo, downloadAndShowFile]);

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

                // Try to get authentication token
                try {
                    const client = NetworkManager.getClient(serverUrl);
                    const fileUrl = `${serverUrl}/api/v4/files/${fileToDownload.id}`;

                    // Get authentication header from client
                    const authHeader = (client as any).requestHeaders?.['Authorization'] || '';

                    // Use fetch with proper authentication
                    const response = await fetch(fileUrl, {
                        method: 'GET',
                        headers: {
                            'Authorization': authHeader,
                        },
                    });


                    if (!response.ok) {
                        const errorText = await response.text();
                        throw new Error(`HTTP ${response.status}: ${errorText}`);
                    }

                    // Get the blob and save to file
                    const blob = await response.blob();

                    if (blob.size === 0) {
                        throw new Error('Downloaded file is empty');
                    }

                    // Save blob to file using expo-file-system
                    const reader = new FileReader();
                    reader.onloadend = async () => {
                        const base64Data = reader.result as string;
                        const pathWithoutPrefix = path!.replace('file://', '');
                        await writeAsStringAsync(pathWithoutPrefix, base64Data.split(',')[1], {
                            encoding: 'base64',
                        });
                        setProgress(1);
                    };
                    reader.readAsDataURL(blob);

                    // Wait for file to be saved
                    await new Promise<void>((resolve) => {
                        const checkFile = async () => {
                            const fileInfo = await getInfoAsync(path!.replace('file://', ''));
                            if (fileInfo.exists && fileInfo.size > 0) {
                                resolve();
                            } else {
                                setTimeout(checkFile, 100);
                            }
                        };
                        checkFile();
                    });

                } catch (downloadError) {

                    // Fallback to original download method
                    downloadTask.current = downloadFile(serverUrl, fileToDownload.id!, path!);
                    downloadTask.current?.progress?.(setProgress);
                    await downloadTask.current;
                    setProgress(1);
                }

            } else {
            }

            setFilePath(path!);

            // Validate downloaded file
            try {
                const pathWithoutPrefix = path!.replace('file://', '');
                const fileInfo = await getInfoAsync(pathWithoutPrefix);

                if (!fileInfo.exists) {
                    throw new Error('File does not exist after download');
                } else if (fileInfo.size === 0) {
                    // Delete empty file
                    await deleteAsync(pathWithoutPrefix, {idempotent: true});
                    throw new Error('Downloaded file is empty (0 bytes). Server may have returned an error.');
                } else if (fileInfo.size < 100) {
                }

                // Read first 100 bytes to check if it's actually a PDF
                if (fileInfo.exists && fileInfo.size > 0) {
                    const firstBytes = await readAsStringAsync(pathWithoutPrefix, {
                        encoding: 'base64',
                        length: 100,
                    });
                    // PDF files start with "%PDF" (25 50 44 46 in hex)
                    const isPdfHeader = firstBytes.startsWith('JVBER');

                    if (!isPdfHeader) {
                        // Read more content to see what it actually is
                        const moreContent = await readAsStringAsync(pathWithoutPrefix, {
                            encoding: 'utf8',
                            length: 500,
                        });
                    }
                }
            } catch (validationError) {
            }

            // PDF and text files are rendered inline, no need to open external viewers
            if (isPdf(fileToDownload)) {
            } else if (isTextFile(fileToDownload)) {
            } else if (isAppleDocument(fileToDownload)) {
                // iOS: Open with native QuickLook via FileViewer
                try {
                    await FileViewer.open(pathWithoutPrefix, {
                        displayName: fileToDownload.name,
                        showAppsSuggestions: true,
                        showOpenWithDialog: true,
                    });
                } catch (err) {
                    logError('Error opening Apple document', err);
                }
            } else {
                // For images/videos/audio, we'll embed them later
                // For now, just store the path
            }
        } catch (error) {
            debugLog('Error downloading file:', getFullErrorMessage(error));
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

    const determineFileState = useCallback(async () => {
        debugLog('[UnifiedFileViewer] determineFileState called', JSON.stringify({
            fileId,
            fileName: fileInfo.name,
            extension: fileInfo.extension,
            pdf_preview_id: fileInfo.pdf_preview_id,
            has_preview_image: fileInfo.has_preview_image,
            isOffice: isOfficeFile(fileInfo),
            isViewable: isViewableFile(fileInfo),
        }));

        // iOS: Apple documents use native QuickLook, no PDF conversion needed
        if (isAppleDocument(fileInfo)) {
            debugLog('[UnifiedFileViewer] Apple document, using QuickLook');
            setFileState('viewable');
            downloadAndShowFile(fileInfo);
            return;
        }

        // Check if Office file - fetch latest info from server to check if PDF preview exists
        if (isOfficeFile(fileInfo)) {
            debugLog('[UnifiedFileViewer] Office file detected, checking PDF preview');
            try {
                const client = NetworkManager.getClient(serverUrl);
                const updatedFileInfo = await client.getFileInfo(fileId);

                debugLog('[UnifiedFileViewer] Server file info:', JSON.stringify({
                    pdf_preview_id: updatedFileInfo.pdf_preview_id,
                    has_preview_image: updatedFileInfo.has_preview_image,
                }));

                // If server has PDF preview, use it
                if (updatedFileInfo.pdf_preview_id) {
                    debugLog('[UnifiedFileViewer] PDF preview available, showing file');
                    // Save to database
                    try {
                        const {operator} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
                        await operator.handleFiles({
                            files: [{...updatedFileInfo, id: fileId}],
                            prepareRecordsOnly: false,
                        });
                    } catch (dbError) {
                        debugLog('Failed to save pdf_preview_id to database:', String(dbError));
                    }

                    const newFileInfo = {...fileInfo, pdf_preview_id: updatedFileInfo.pdf_preview_id};
                    setCurrentFileInfo(newFileInfo);
                    setFileState('viewable');
                    downloadAndShowFile(newFileInfo);
                    return;
                }
            } catch (error) {
                const errorMessage = String(error);
                debugLog('[UnifiedFileViewer] Failed to get file info from server:', errorMessage);

                // 如果是权限错误，直接显示错误，不尝试转换
                if (errorMessage.includes('权限') || errorMessage.includes('permission')) {
                    debugLog('[UnifiedFileViewer] Permission denied, cannot preview this file');
                    setFileState('unsupported');
                    return;
                }
            }

            // No PDF preview yet, start conversion
            debugLog('[UnifiedFileViewer] No PDF preview, starting conversion');
            setFileState('converting');
            startPolling();
            return;
        }

        // Check if file can be viewed
        if (isViewableFile(fileInfo)) {
            debugLog('[UnifiedFileViewer] File is viewable, showing directly');
            setFileState('viewable');
            downloadAndShowFile(fileInfo);
            return;
        }

        // Unsupported file
        debugLog('[UnifiedFileViewer] File is unsupported');
        setFileState('unsupported');
    }, [fileInfo, fileId, serverUrl, startPolling, downloadAndShowFile]);

    useEffect(() => {
        determineFileState();

        return () => {
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
            }
        };
    }, [determineFileState]);

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
            debugLog('Download error:', getFullErrorMessage(error));
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
                        debugLog('Open with error:', String(error));
                    });
                }
            });
        } else {
            FileViewer.open(filePath.replace('file://', ''), {
                displayName: currentFileInfo.name,
                showOpenWithDialog: true,
                showAppsSuggestions: true,
            }).catch((error) => {
                debugLog('Open with error:', String(error));
            });
        }
    }, [filePath, currentFileInfo, handleDownload]);

    const handleMenuPress = useCallback(() => {
        // Share file (same as image fullscreen share behavior)
        if (!filePath) {
            handleDownload().then(() => {
                if (filePath) {
                    Share.open({
                        url: pathWithPrefix('file://', filePath),
                        type: currentFileInfo.mime_type || 'application/octet-stream',
                        showAppsToView: true,
                    }).catch(() => {
                        // do nothing
                    });
                }
            });
        } else {
            Share.open({
                url: pathWithPrefix('file://', filePath),
                type: currentFileInfo.mime_type || 'application/octet-stream',
                showAppsToView: true,
            }).catch(() => {
                // do nothing
            });
        }
    }, [filePath, currentFileInfo, handleDownload]);

    const renderContent = () => {

        // Check if file should be rendered as PDF (either PDF file or Office file with PDF preview)
        const shouldRenderAsPdf = isPdf(currentFileInfo) || (hasPdfPreview(currentFileInfo) && currentFileInfo.pdf_preview_id);


        // Render PDF inline if ready (includes Office files converted to PDF)
        if (fileState === 'viewable' && filePath && shouldRenderAsPdf) {
            if (pdfError) {
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

        // Render image preview if ready
        if (fileState === 'viewable' && filePath && isImage(currentFileInfo)) {
            return (
                <ImagePreview
                    uri={`file://${filePath.replace('file://', '')}`}
                    onClose={handleClose}
                />
            );
        }

        // Render video preview if ready
        if (fileState === 'viewable' && filePath && isVideo(currentFileInfo)) {
            return (
                <VideoPreview
                    uri={`file://${filePath.replace('file://', '')}`}
                    onClose={handleClose}
                />
            );
        }

        // Render audio preview if ready
        if (fileState === 'viewable' && filePath && isAudio(currentFileInfo)) {
            return (
                <AudioPreview
                    uri={`file://${filePath.replace('file://', '')}`}
                    filename={currentFileInfo.name}
                    onClose={handleClose}
                />
            );
        }

        // Apple documents: opened via FileViewer (QuickLook), show minimal UI
        if (fileState === 'viewable' && isAppleDocument(currentFileInfo)) {
            return <UnsupportedView fileInfo={currentFileInfo} onDownload={handleDownload} onOpenWith={handleOpenWith}/>;
        }

        switch (fileState) {
            case 'loading':
                return <LoadingView progress={progress}/>;
            case 'converting':
                return <ConvertingView fileInfo={currentFileInfo}/>;
            case 'viewable':
                // Still downloading or unsupported for inline viewing
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

    // Check if we should hide TopBar (for image/video/audio previews)
    const isMediaPreview = fileState === 'viewable' && filePath &&
        (isImage(currentFileInfo) || isVideo(currentFileInfo) || isAudio(currentFileInfo));

    return (
        <View style={styles.container}>
            {!isMediaPreview && (
                <TopBar
                    title={currentFileInfo.name}
                    onBack={handleClose}
                    onMenuPress={handleMenuPress}
                />
            )}
            <View style={styles.content}>
                {renderContent()}
            </View>
        </View>
    );
};

export default UnifiedFileViewer;
