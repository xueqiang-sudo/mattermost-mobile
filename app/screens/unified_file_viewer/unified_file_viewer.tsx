// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {
    SecurePdfViewer,
    type OnLoadErrorEvent,
    type OnPasswordRequiredEvent,
    type OnPasswordFailedEvent,
    type OnPasswordLimitReachedEvent,
} from '@mattermost/secure-pdf-viewer';
import {cacheDirectory, copyAsync, deleteAsync, getInfoAsync, makeDirectoryAsync} from 'expo-file-system';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {Alert, View, StyleSheet, TextInput, Modal, TouchableOpacity, Text} from 'react-native';
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
    passwordModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    passwordModalBox: {
        width: '100%',
        maxWidth: 340,
        backgroundColor: '#fff',
        borderRadius: 12,
        paddingHorizontal: 20,
        paddingVertical: 18,
    },
    passwordModalTitle: {
        fontSize: 17,
        fontWeight: '600',
        color: '#111',
        marginBottom: 6,
    },
    passwordModalMessage: {
        fontSize: 14,
        color: '#555',
        marginBottom: 14,
        lineHeight: 19,
    },
    passwordModalInput: {
        borderWidth: 1,
        borderColor: '#D9D9D9',
        borderRadius: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        fontSize: 15,
        color: '#111',
        marginBottom: 14,
    },
    passwordModalError: {
        fontSize: 13,
        color: '#E64340',
        marginBottom: 10,
    },
    passwordModalButtons: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
    },
    passwordModalButton: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        marginLeft: 8,
        borderRadius: 6,
    },
    passwordModalButtonPrimary: {
        backgroundColor: '#07C160',
    },
    passwordModalButtonText: {
        fontSize: 15,
        color: '#666',
        fontWeight: '500',
    },
    passwordModalButtonTextPrimary: {
        color: '#fff',
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
    const [pdfCachePath, setPdfCachePath] = useState<string>('');
    // PDF 解密密码：AES 加密的 PDF 需要密码（许多企业 PDF 用空密码做 DRM，限制打印/复制但允许直接打开）。
    // 初值用 ''：原生 PDFKit 在拿到空串时会执行 unlock(withPassword: "")，能直接解锁 DRM 类 PDF
    // （对齐微信、Chrome、Adobe Reader 的「无感打开」体验）。
    // 若 PDF 真有用户密码，原生会再发 onPasswordRequired → 弹 Modal 让用户输入。
    const [pdfPassword, setPdfPassword] = useState<string>('');
    // 密码输入弹窗：visible=true 时弹出 Modal，用户输入确认后 setPdfPassword 触发原生解密。
    const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
    const [passwordDraft, setPasswordDraft] = useState('');
    // 上一次输入的密码被原生判定为错误时置 true，Modal 内显示错误提示；每次重新打开时重置。
    const [showWrongPasswordHint, setShowWrongPasswordHint] = useState(false);
    const passwordPromptCountRef = useRef(0);
    const MAX_PASSWORD_PROMPTS = 3;

    // Copy PDF to cache directory when filePath changes (for SecurePdfViewer)
    useEffect(() => {
        const copyPdfToCache = async () => {
            const shouldRenderAsPdf = isPdf(currentFileInfo) || (hasPdfPreview(currentFileInfo) && currentFileInfo.pdf_preview_id);
            if (fileState === 'viewable' && filePath && shouldRenderAsPdf && !pdfError) {
                // Check if file is already in cache directory
                if (filePath.includes('/Library/Caches/')) {
                    debugLog('[Viewer] PDF already in cache, using directly', {filePath});
                    setPdfCachePath(filePath);
                    return;
                }

                // Copy to cache directory (handle trailing slash properly)
                const fileName = filePath.slice(filePath.lastIndexOf('/') + 1);
                const cacheDir = cacheDirectory.endsWith('/') ? cacheDirectory : `${cacheDirectory}/`;
                const cachePath = `${cacheDir}${fileName}`;
                debugLog('[Viewer] PDF cache path calculation', {
                    cacheDirectory,
                    cacheDir,
                    fileName,
                    cachePath,
                    cacheDirEndsWithSlash: cacheDirectory.endsWith('/'),
                });
                try {
                    await copyAsync({from: filePath, to: cachePath});
                    debugLog('[Viewer] PDF copied to cache', {from: filePath, to: cachePath});
                    setPdfCachePath(cachePath);
                } catch (copyErr) {
                    debugLog('[Viewer] PDF copy to cache failed', {error: String(copyErr)});
                    setPdfCachePath('');
                }
            }
        };
        copyPdfToCache();
    }, [filePath, fileState, currentFileInfo, pdfError]);

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

    // 弹出密码输入 Modal。用户输入确认后 setPdfPassword，触发 SecurePdfViewer 重渲染、
    // 原生用新密码再次尝试 unlock。showWrongHint=true 表示上一次输入的密码被原生判定为错误，
    // 需要在弹窗内显示「密码错误」提示；首次弹出（onPasswordRequired）时为 false。
    const promptForPassword = useCallback((_remainingAttempts: number, showWrongHint = false) => {
        passwordPromptCountRef.current += 1;
        if (passwordPromptCountRef.current > MAX_PASSWORD_PROMPTS) {
            setPdfError('Too many password attempts');
            setFileState('unsupported');
            return;
        }
        setPasswordDraft('');
        setShowWrongPasswordHint(showWrongHint);
        setShowPasswordPrompt(true);
    }, []);

    const handlePasswordConfirm = useCallback(() => {
        setShowPasswordPrompt(false);
        setShowWrongPasswordHint(false);
        // 强制触发 React 重渲染：即使输入和上次相同的密码也要让原生重试
        setPdfPassword((prev) => (prev === passwordDraft ? passwordDraft + '\u0000' : passwordDraft));
    }, [passwordDraft]);

    const handlePasswordCancel = useCallback(() => {
        setShowPasswordPrompt(false);
        setShowWrongPasswordHint(false);
        setPdfError('Password required');
        setFileState('unsupported');
    }, []);

    // 原生提示「PDF 需要密码」：空密码已试（初值 ''），到这里说明 PDF 真有用户密码，弹 Modal 让用户输入。
    // 首次弹出，无「密码错误」提示。
    const onPasswordRequired = useCallback((event: OnPasswordRequiredEvent) => {
        debugLog('[Viewer] onPasswordRequired', event.nativeEvent);
        promptForPassword(event.nativeEvent.remainingAttempts, false);
    }, [promptForPassword]);

    // 上次输入的密码不正确：再次弹输入框让用户重试，并显示「密码错误」提示。
    const onPasswordFailed = useCallback((event: OnPasswordFailedEvent) => {
        debugLog('[Viewer] onPasswordFailed', event.nativeEvent);
        promptForPassword(event.nativeEvent.remainingAttempts, true);
    }, [promptForPassword]);

    // 原生侧连续错误次数超限（10 次）：降级为「无法预览」。
    const onPasswordFailureLimitReached = useCallback((_event: OnPasswordLimitReachedEvent) => {
        debugLog('[Viewer] onPasswordFailureLimitReached');
        setPdfError('Password attempt limit reached');
        setFileState('unsupported');
    }, []);

    const startPolling = useCallback(async () => {
        pollingCountRef.current = 0;


        // Trigger conversion and check server response
        try {
            const client = NetworkManager.getClient(serverUrl);
            const result = await client.triggerPdfConversion(fileId);


            // If preview is already complete, use it immediately
            if (result.status === 'complete' && result.pdf_preview_id) {
                const updatedFileInfo = await client.getFileInfo(fileId);
                if (updatedFileInfo.pdf_preview_id) {
                    // Save to database
                    try {
                        const {operator} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
                        await operator.handleFiles({
                            files: [{...updatedFileInfo, id: fileId}],
                            prepareRecordsOnly: false,
                        });
                    } catch (dbError) {
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
            } else if (result.status === 'failed') {
                // Conversion failed
                setFileState('unsupported');
                return;
            }
        } catch (error) {
            // Continue to polling even if trigger fails
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


                // Conversion complete
                if (updatedFileInfo.pdf_preview_id) {

                    // Save to database
                    try {
                        const {operator} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
                        await operator.handleFiles({
                            files: [{...updatedFileInfo, id: fileId}],
                            prepareRecordsOnly: false,
                        });
                    } catch (dbError) {
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
                    setFileState('unsupported');
                    return;
                }

                // Timeout
                if (pollingCountRef.current >= MAX_POLLING_ATTEMPTS) {
                    setFileState('unsupported');
                    return;
                }

                // Continue polling (use setTimeout instead of setInterval)
                pollingRef.current = setTimeout(doPoll, 2000);
            } catch (error) {

                // Continue polling even on error, don't stop
                if (pollingCountRef.current < MAX_POLLING_ATTEMPTS) {
                    pollingRef.current = setTimeout(doPoll, 2000);
                } else {
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
            // ✅ 保留原始文件名用于显示（预览窗口标题显示 test.docx 而非 test.pdf）
            const fileToDownload = hasPdfPreview(file) && file.pdf_preview_id
                ? {...file, id: file.pdf_preview_id, extension: 'pdf', mime_type: 'application/pdf'}
                : file;


            let path = decodeURIComponent(fileToDownload.localPath || '');
            let exists = false;
            if (path) {
                exists = await fileExists(path);
            }

            if (!exists) {
                path = getLocalFilePathFromFile(serverUrl, fileToDownload);
                // 关键修复：计算出 fallback 路径后必须重新检查文件是否已存在。
                // KB/云盘走 useDownloadFileAndPreview hook，已把 PDF 下载到这个同样的
                // getLocalFilePathFromFile 路径。原代码只对（为空的）localPath 查过 exists，
                // 没有对这里的新路径复查，导致 exists 恒为 false、每次都重新下载。
                // 对齐 webapp：存在就直接预览，不存在才下载。
                exists = await fileExists(path);
            }

            if (!exists) {

                // 确保目标目录存在：文件本地路径已从 cacheDirectory 改为 documentDirectory，
                // 而 documentDirectory/{server}/Files 目录此前无人创建，直接写入会失败。
                try {
                    const dir = path!.replace('file://', '').replace(/\/[^/]*$/, '');
                    await makeDirectoryAsync(dir, {intermediates: true});
                } catch (dirError) {
                    // 目录已存在时 makeDirectoryAsync 会抛错，忽略即可。
                }

                setProgress(0);

                // 用原生 downloadFile 作为主下载方式：它会自动创建目录、带进度、
                // 流式写盘，不像 fetch+FileReader+writeAsStringAsync 那样把整个文件
                // 读进内存，大文件也稳定。对齐 webapp「存在直接预览、不存在下载后预览」。
                debugLog('[Viewer] downloadAndShowFile downloading to', {path, id: fileToDownload.id});
                downloadTask.current = downloadFile(serverUrl, fileToDownload.id!, path!);
                downloadTask.current?.progress?.(setProgress);
                await downloadTask.current;
                setProgress(1);
                const afterExists = await fileExists(path!);
                debugLog('[Viewer] downloadAndShowFile download complete', {path, afterExists});
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
            debugLog('[Viewer] downloadAndShowFile ERROR', {error: getFullErrorMessage(error)});
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

        // iOS: Apple documents use native QuickLook, no PDF conversion needed
        if (isAppleDocument(fileInfo)) {
            setFileState('viewable');
            downloadAndShowFile(fileInfo);
            return;
        }

        // Check if Office file - fetch latest info from server to check if PDF preview exists
        if (isOfficeFile(fileInfo)) {
            try {
                const client = NetworkManager.getClient(serverUrl);
                const updatedFileInfo = await client.getFileInfo(fileId);


                // If server has PDF preview, use it
                if (updatedFileInfo.pdf_preview_id) {
                    // Save to database
                    try {
                        const {operator} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
                        await operator.handleFiles({
                            files: [{...updatedFileInfo, id: fileId}],
                            prepareRecordsOnly: false,
                        });
                    } catch (dbError) {
                    }

                    const newFileInfo = {...fileInfo, pdf_preview_id: updatedFileInfo.pdf_preview_id};
                    setCurrentFileInfo(newFileInfo);
                    setFileState('viewable');
                    downloadAndShowFile(newFileInfo);
                    return;
                }
            } catch (error) {
                const errorMessage = String(error);

                // 如果是权限错误，直接显示错误，不尝试转换
                if (errorMessage.includes('权限') || errorMessage.includes('permission')) {
                    setFileState('unsupported');
                    return;
                }
            }

            // No PDF preview yet, start conversion
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
                    });
                }
            });
        } else {
            FileViewer.open(filePath.replace('file://', ''), {
                displayName: currentFileInfo.name,
                showOpenWithDialog: true,
                showAppsSuggestions: true,
            }).catch((error) => {
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

        debugLog('[Viewer] renderContent', {
            fileState,
            filePath,
            shouldRenderAsPdf,
            name: currentFileInfo.name,
            extension: currentFileInfo.extension,
            pdf_preview_id: currentFileInfo.pdf_preview_id,
            pdfError,
        });


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

            // Wait for cache copy to complete
            if (!pdfCachePath) {
                return <LoadingView/>;
            }

            // SecurePdfViewer 期望无 file:// 前缀的路径（原生 iOS 使用 URL(fileURLWithPath:)）
            // 目录名和文件名都使用安全字符（MD5 哈希和 fileId），无特殊字符
            // SecurePdfViewer 只允许从 Caches 目录读取，已通过 useEffect 复制到 Caches
            const pdfSource = pdfCachePath.replace(/^file:\/\//, '');

            debugLog('[Viewer] PDF source', {original: filePath, cachePath: pdfCachePath, encoded: pdfSource});

            return (
                <SecurePdfViewer
                    allowLinks={false}
                    onLoadError={onPdfLoadError}
                    onPasswordRequired={onPasswordRequired}
                    onPasswordFailed={onPasswordFailed}
                    onPasswordFailureLimitReached={onPasswordFailureLimitReached}
                    password={pdfPassword}
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
            <Modal
                visible={showPasswordPrompt}
                transparent={true}
                animationType='fade'
                onRequestClose={handlePasswordCancel}
            >
                <View style={styles.passwordModalOverlay}>
                    <View style={styles.passwordModalBox}>
                        <Text style={styles.passwordModalTitle}>
                            {intl.formatMessage({id: 'file_viewer.pdf_password_title', defaultMessage: 'Password Required'})}
                        </Text>
                        <Text style={styles.passwordModalMessage}>
                            {intl.formatMessage({
                                id: 'file_viewer.pdf_password_message',
                                defaultMessage: 'This PDF is password-protected. Please enter the password to open it.',
                            })}
                        </Text>
                        <TextInput
                            autoFocus={true}
                            secureTextEntry={true}
                            autoCorrect={false}
                            autoCapitalize='none'
                            value={passwordDraft}
                            onChangeText={setPasswordDraft}
                            onSubmitEditing={handlePasswordConfirm}
                            placeholder={intl.formatMessage({
                                id: 'file_viewer.pdf_password_placeholder',
                                defaultMessage: 'Enter password',
                            })}
                            placeholderTextColor='#999'
                            style={styles.passwordModalInput}
                        />
                        {showWrongPasswordHint && (
                            <Text style={styles.passwordModalError}>
                                {intl.formatMessage({
                                    id: 'file_viewer.pdf_password_wrong',
                                    defaultMessage: 'Incorrect password. Please try again.',
                                })}
                            </Text>
                        )}
                        <View style={styles.passwordModalButtons}>
                            <TouchableOpacity
                                onPress={handlePasswordCancel}
                                style={styles.passwordModalButton}
                            >
                                <Text style={styles.passwordModalButtonText}>
                                    {intl.formatMessage({id: 'common.cancel', defaultMessage: 'Cancel'})}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={handlePasswordConfirm}
                                style={[styles.passwordModalButton, styles.passwordModalButtonPrimary]}
                            >
                                <Text style={[styles.passwordModalButtonText, styles.passwordModalButtonTextPrimary]}>
                                    {intl.formatMessage({id: 'common.ok', defaultMessage: 'OK'})}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

export default UnifiedFileViewer;
