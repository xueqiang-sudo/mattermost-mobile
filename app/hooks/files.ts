// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {deleteAsync, makeDirectoryAsync} from 'expo-file-system';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {Platform, StatusBar, type StatusBarStyle} from 'react-native';
import FileViewer from 'react-native-file-viewer';
import tinyColor from 'tinycolor2';

import {getLocalFileInfo, updateLocalFilePath} from '@actions/local/file';
import {buildFilePreviewUrl, buildFileUrl, downloadFile} from '@actions/remote/file';
import FilePreviewLoadingModal, {type PreviewStep} from '@components/files/file_preview_loading_modal';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import NetworkManager from '@managers/network_manager';
import {alertDownloadFailed, alertFailedToOpenDocument, alertOnlyPDFSupported} from '@utils/document';
import {getFullErrorMessage, isErrorWithMessage} from '@utils/errors';
import {fileExists, getLocalFilePathFromFile, hasPdfPreview, isAudio, isGif, isImage, isPdf, isTextFile, isVideo} from '@utils/file';
import {getImageSize} from '@utils/gallery';
import {logDebug} from '@utils/log';
import {openUnifiedFileViewer, previewPdf, previewTextFile} from '@utils/navigation';
import {debugLog} from '@store/debug_log';

import type {ClientResponse, ProgressPromise} from '@mattermost/react-native-network-client';
import type ChannelBookmarkModel from '@typings/database/models/servers/channel_bookmark';

// Office 文件扩展名（对齐 webapp）
const OFFICE_EXTENSIONS = new Set(['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf', 'pages']);

const isOfficeFile = (ext?: string): boolean => {
    if (!ext) return false;
    return OFFICE_EXTENSIONS.has(ext.toLowerCase().replace(/^\./, ''));
};

// 构建完整下载 URL（确保包含 serverUrl）
const buildFullUrl = (serverUrl: string, fileId: string): string => {
    const client = NetworkManager.getClient(serverUrl);
    const route = client.getFileRoute(fileId);
    // 如果已经是完整 URL 则直接返回
    if (route.startsWith('http://') || route.startsWith('https://')) {
        return route;
    }
    // 拼接 serverUrl + 相对路径
    return serverUrl.replace(/\/$/, '') + (route.startsWith('/') ? route : '/' + route);
};

// 获取下载 URL（返回完整 URL 用于 expo-file-system 下载）
// expo-file-system.downloadAsync() 会自动跟随 307 重定向并直接写入磁盘
const getDownloadUrl = (serverUrl: string, fileId: string): string => {
    const client = NetworkManager.getClient(serverUrl);
    const relativePath = client.getFileRoute(fileId) + '?download=1';
    // 返回完整 URL
    return serverUrl.replace(/\/$/, '') + relativePath;
};

// 触发 Office → PDF 转换并轮询（对齐 webapp）
// onCancel: 返回 true 表示用户已取消
const triggerConversionAndPoll = async (
    serverUrl: string,
    fileId: string,
    onCancel?: () => boolean,
): Promise<string | null> => {
    const client = NetworkManager.getClient(serverUrl);

    // Step 1: 触发转换 POST /api/v4/files/{id}/convert
    try {
        const convertUrl = client.getFileRoute(fileId) + '/convert';
        debugLog('[Preview] Triggering conversion', {convertUrl, fileId});

        const result = await client.doFetch(convertUrl, {method: 'post'});
        debugLog('[Preview] Conversion trigger response', {result});

        if (result?.status === 'complete' && result?.pdf_preview_id) {
            debugLog('[Preview] Conversion complete immediately', {pdf_preview_id: result.pdf_preview_id});
            return result.pdf_preview_id;
        }
    } catch (e) {
        debugLog('[Preview] Conversion trigger failed, will poll', {error: String(e)});
    }

    // Step 2: 轮询 GET /api/v4/files/{id}/info（每2s，最多30次 = 60s）
    for (let i = 0; i < 30; i++) {
        // 检查是否取消
        if (onCancel?.()) {
            debugLog('[Preview] Conversion cancelled by user');
            return null;
        }

        await new Promise((resolve) => setTimeout(resolve, 2000));

        // 再次检查取消（等待 2s 后）
        if (onCancel?.()) {
            debugLog('[Preview] Conversion cancelled by user during wait');
            return null;
        }

        try {
            const infoUrl = client.getFileRoute(fileId) + `/info?_t=${Date.now()}`;
            debugLog('[Preview] Polling conversion status', {attempt: i + 1, maxAttempts: 30, infoUrl});

            const info = await client.doFetch(infoUrl, {method: 'get'});
            debugLog('[Preview] Poll response', {
                attempt: i + 1,
                pdf_preview_id: info?.pdf_preview_id,
                pdf_conversion_status: info?.pdf_conversion_status,
            });

            if (info?.pdf_preview_id) {
                debugLog('[Preview] Conversion complete after polling', {
                    attempts: i + 1,
                    pdf_preview_id: info.pdf_preview_id,
                });
                return info.pdf_preview_id;
            }

            if (info?.pdf_conversion_status === 'failed') {
                debugLog('[Preview] Conversion failed', {error: info?.pdf_conversion_error});
                return null;
            }
        } catch (e) {
            debugLog('[Preview] Poll error', {attempt: i + 1, error: String(e)});
        }
    }

    debugLog('[Preview] Conversion polling timeout after 30 attempts (60s)');
    return null;
};

// 动态计算预览步骤：根据文件状态决定需要哪些步骤
const getPreviewSteps = async (file: FileInfo, serverUrl: string): Promise<PreviewStep[]> => {
    const steps: PreviewStep[] = [];
    const ext = (file.extension || '').toLowerCase().replace(/^\./, '');
    const isOffice = isOfficeFile(ext);

    // 1. 是否需要转换：Office 文件且没有 pdf_preview_id
    if (isOffice && file.id && !file.pdf_preview_id) {
        steps.push('converting');
    }

    // 2. 是否需要下载
    // 确定要下载的文件 ID（pdf_preview_id 或原始 id）
    const downloadFileId = file.pdf_preview_id || file.id;
    if (downloadFileId) {
        // 构建对应的 FileInfo 以检查本地路径（路径生成依赖 id + extension，不依赖 name）
        const checkFile: FileInfo = file.pdf_preview_id ? {
            ...file,
            id: file.pdf_preview_id,
            extension: 'pdf',
            mime_type: 'application/pdf',
        } : file;

        const localPath = getLocalFilePathFromFile(serverUrl, checkFile);
        const exists = await fileExists(localPath);
        if (!exists) {
            steps.push('downloading');
        }
    } else if (!file.localPath) {
        // 没有 ID 也没有 localPath，需要下载
        steps.push('downloading');
    }

    // 3. 打开预览（总是最后一步）
    steps.push('opening');

    return steps;
};

// 确保下载目标的父目录存在。文件本地路径已从 cacheDirectory 改为
// documentDirectory/{server}/Files/，该子目录初次下载时并不存在，直接写入会失败，
// 导致预览退回「下载/用其他应用打开」页。原生 download 不保证创建父目录，这里兜底。
const ensureParentDir = async (path: string) => {
    try {
        const dir = path.replace('file://', '').replace(/\/[^/]*$/, '');
        await makeDirectoryAsync(dir, {intermediates: true});
    } catch {
        // 目录已存在时会抛错，忽略即可。
    }
};

const getFileInfo = async (serverUrl: string, bookmarks: ChannelBookmarkModel[], cb: (files: FileInfo[]) => void) => {
    const fileInfos: FileInfo[] = [];
    for await (const b of bookmarks) {
        if (b.fileId) {
            const res = await getLocalFileInfo(serverUrl, b.fileId);
            if (res.file) {
                const fileInfo = res.file.toFileInfo(b.ownerId);
                const imageFile = isImage(fileInfo);
                const videoFile = isVideo(fileInfo);

                let uri;
                if (imageFile || videoFile) {
                    if (fileInfo.localPath) {
                        uri = fileInfo.localPath;
                    } else {
                        uri = (isGif(fileInfo) || (imageFile && !fileInfo.has_preview_image) || videoFile) ? buildFileUrl(serverUrl, fileInfo.id!) : buildFilePreviewUrl(serverUrl, fileInfo.id!);
                    }
                } else {
                    uri = fileInfo.localPath || buildFileUrl(serverUrl, fileInfo.id!);
                }

                let {width, height} = fileInfo;
                if (imageFile && !width) {
                    const size = await getImageSize(serverUrl, uri, b.fileId);
                    width = size.width;
                    height = size.height;
                }

                fileInfos.push({...fileInfo, uri, width, height});
            }
        }
    }

    if (fileInfos.length) {
        cb(fileInfos);
    }
};

export const useImageAttachments = (filesInfo: FileInfo[]) => {
    const serverUrl = useServerUrl();
    return useMemo(() => {
        return filesInfo.reduce(({images, nonImages}: {images: FileInfo[]; nonImages: FileInfo[]}, file) => {
            const imageFile = isImage(file);
            const videoFile = isVideo(file);
            const audioFile = isAudio(file);

            if (imageFile || videoFile || audioFile) {
                let uri;
                if (file.localPath) {
                    uri = file.localPath;
                } else {
                    // If no local path and no id, we skip the image
                    if (!file.id) {
                        return {images, nonImages};
                    }
                    uri = (isGif(file) || videoFile || audioFile) ? buildFileUrl(serverUrl, file.id) : buildFilePreviewUrl(serverUrl, file.id);
                }
                images.push({...file, uri});
            } else {
                nonImages.push({...file});
            }
            return {images, nonImages};
        }, {images: [], nonImages: []});
    }, [filesInfo, serverUrl]);
};

export const useChannelBookmarkFiles = (bookmarks: ChannelBookmarkModel[]) => {
    const serverUrl = useServerUrl();
    const [files, setFiles] = useState<FileInfo[]>([]);

    useEffect(() => {
        getFileInfo(serverUrl, bookmarks, setFiles);
    }, [serverUrl, bookmarks]);

    return files;
};

export const useDownloadFileAndPreview = (enableSecureFilePreview: boolean) => {
    const serverUrl = useServerUrl();
    const intl = useIntl();
    const theme = useTheme();
    const downloadTask = useRef<ProgressPromise<ClientResponse>>();

    const [progress, setProgress] = useState<number>(0);

    const [preview, setPreview] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [didCancel, setDidCancel] = useState(false);

    // ── Loading Modal 状态 ──
    const cancelToken = useRef(false);
    const [previewLoading, setPreviewLoading] = useState({
        visible: false,
        fileName: '',
        currentStep: 'idle' as PreviewStep,
        steps: [] as PreviewStep[],
        canCancel: true,
    });

    const hideLoadingModal = useCallback(() => {
        setPreviewLoading(prev => ({...prev, visible: false, currentStep: 'idle'}));
    }, []);

    const cancelPreview = useCallback(() => {
        cancelToken.current = true;
    }, []);

    const setStatusBarColor = useCallback((style: StatusBarStyle = 'light-content') => {
        if (Platform.OS === 'ios') {
            if (style) {
                StatusBar.setBarStyle(style, true);
            } else {
                const headerColor = tinyColor(theme.sidebarHeaderBg);
                let barStyle: StatusBarStyle = 'light-content';
                if (headerColor.isLight() && Platform.OS === 'ios') {
                    barStyle = 'dark-content';
                }
                StatusBar.setBarStyle(barStyle, true);
            }
        }
    }, [theme.sidebarHeaderBg]);

    const onDonePreviewingFile = useCallback(() => {
        setProgress(0);
        setDownloading(false);
        setPreview(false);
        setStatusBarColor();
    }, [setStatusBarColor]);

    const openDocument = useCallback(async (file: FileInfo) => {
        // Use unified file viewer for all file types
        openUnifiedFileViewer(file, theme, onDonePreviewingFile);
    }, [theme, onDonePreviewingFile]);

    // 通用的 PDF 下载+打开逻辑（Office 转换后 和 已有 pdf_preview_id 共享）
    const downloadAndOpenPdf = async (file: FileInfo, pdfPreviewId: string): Promise<boolean> => {
        const downloadUrl = getDownloadUrl(serverUrl, pdfPreviewId);
        debugLog('[Preview] Downloading PDF preview', {
            originalFileId: file.id,
            pdfPreviewId,
            downloadUrl,
        });

        const pdfFileInfo: FileInfo = {
            ...file,
            id: pdfPreviewId,
            // ✅ 保留原始文件名用于显示（预览窗口标题显示 test.docx 而非 test.pdf）
            // name: file.name,  // 通过展开运算符已保留
            extension: 'pdf',
            mime_type: 'application/pdf',
        };

        const pdfPath = getLocalFilePathFromFile(serverUrl, pdfFileInfo);
        const pdfExists = await fileExists(pdfPath);

        try {
            if (!pdfExists) {
                // 更新步骤：下载中
                setPreviewLoading(prev => ({...prev, currentStep: 'downloading'}));

                await ensureParentDir(pdfPath);
                debugLog('[Preview] Starting PDF download', {url: downloadUrl, destination: pdfPath});

                const {downloadAsync} = await import('expo-file-system');
                const client = NetworkManager.getClient(serverUrl);
                const headers = client.getRequestHeaders('get');

                await downloadAsync(
                    downloadUrl,
                    pdfPath.replace('file://', ''),
                    {headers},
                );
                setProgress(1);

                // 检查取消
                if (cancelToken.current) {
                    deleteAsync(pdfPath, {idempotent: true});
                    return false;
                }

                debugLog('[Preview] PDF download complete');
                await new Promise((resolve) => setTimeout(resolve, 200));
            }

            // 更新步骤：打开预览
            setPreviewLoading(prev => ({...prev, currentStep: 'opening', canCancel: false}));
            await new Promise((resolve) => setTimeout(resolve, 300));

            openDocument(pdfFileInfo);
            return true;
        } catch (error) {
            if (pdfPath) {
                deleteAsync(pdfPath, {idempotent: true});
            }
            if (!isErrorWithMessage(error) || error.message !== 'cancelled') {
                const errorMsg = getFullErrorMessage(error);
                debugLog('[Preview] PDF download ERROR', {error: errorMsg});
                logDebug('error downloading PDF preview', errorMsg);
            }
            return false;
        }
    };

    const downloadAndPreviewFile = useCallback(async (file: FileInfo) => {
        setDidCancel(false);
        cancelToken.current = false;

        const ext = (file.extension || '').toLowerCase().replace(/^\./, '');
        const isOffice = isOfficeFile(ext);

        debugLog('[Preview] downloadAndPreviewFile called', {
            fileId: file.id,
            name: file.name,
            extension: ext,
            isOffice,
            hasPdfPreview: hasPdfPreview(file),
            pdf_preview_id: file.pdf_preview_id,
        });

        // ── 动态计算步骤 ──
        const steps = await getPreviewSteps(file, serverUrl);
        debugLog('[Preview] Computed steps', {steps});

        // 显示 Loading Modal
        setPreviewLoading({
            visible: true,
            fileName: file.name,
            currentStep: steps[0] || 'opening',
            steps,
            canCancel: true,
        });

        // ── Office 文件：确保有 pdf_preview_id ──
        if (isOffice && file.id) {
            let pdfPreviewId = file.pdf_preview_id;

            if (!pdfPreviewId) {
                debugLog('[Preview] Office file needs conversion', {fileId: file.id});

                // 步骤：转换中
                setPreviewLoading(prev => ({...prev, currentStep: 'converting'}));
                setDownloading(true);

                pdfPreviewId = await triggerConversionAndPoll(serverUrl, file.id, () => cancelToken.current);
                setDownloading(false);

                // 检查取消
                if (cancelToken.current) {
                    debugLog('[Preview] Cancelled during conversion');
                    hideLoadingModal();
                    return;
                }

                if (pdfPreviewId) {
                    file.pdf_preview_id = pdfPreviewId;
                    debugLog('[Preview] Conversion complete', {pdfPreviewId});
                } else {
                    debugLog('[Preview] Conversion failed or cancelled', {fileId: file.id});
                    hideLoadingModal();
                    alertDownloadFailed(intl);
                    return;
                }
            }

            // 下载 PDF 并打开
            const success = await downloadAndOpenPdf(file, pdfPreviewId);
            if (!success && !cancelToken.current) {
                alertDownloadFailed(intl);
            }
            hideLoadingModal();
            return;
        }

        // ── 已有 PDF 预览版本 ──
        if (hasPdfPreview(file) && file.pdf_preview_id) {
            const success = await downloadAndOpenPdf(file, file.pdf_preview_id);
            if (!success && !cancelToken.current) {
                alertDownloadFailed(intl);
            }
            hideLoadingModal();
            return;
        }

        // ── 普通文件（非 Office，无 PDF 预览）──
        let path;
        let exists = false;

        try {
            path = decodeURIComponent(file.localPath || '');
            if (path) {
                exists = await fileExists(path);
            }

            if (!exists) {
                debugLog('[Preview] localPath not found, checking generated path', {originalPath: path});
                path = getLocalFilePathFromFile(serverUrl, file);
                exists = await fileExists(path);
                debugLog('[Preview] generated path check', {generatedPath: path, exists});
            }

            if (exists) {
                debugLog('[Preview] file exists, opening directly', {path});

                // 步骤：打开预览
                setPreviewLoading(prev => ({...prev, currentStep: 'opening', canCancel: false}));
                await new Promise((resolve) => setTimeout(resolve, 300));

                openDocument(file);
                hideLoadingModal();
            } else {
                // 步骤：下载中
                setPreviewLoading(prev => ({...prev, currentStep: 'downloading'}));
                setDownloading(true);

                const downloadUrl = getDownloadUrl(serverUrl, file.id!);
                debugLog('[Preview] downloading file', {
                    fileId: file.id,
                    name: file.name,
                    downloadUrl,
                    localPath: path,
                });

                await ensureParentDir(path!);

                const {downloadAsync} = await import('expo-file-system');
                const client = NetworkManager.getClient(serverUrl);
                const headers = client.getRequestHeaders('get');

                await downloadAsync(
                    downloadUrl,
                    path!.replace('file://', ''),
                    {headers},
                );
                setProgress(1);

                // 检查取消
                if (cancelToken.current) {
                    deleteAsync(path!, {idempotent: true});
                    hideLoadingModal();
                    return;
                }

                const afterExists = await fileExists(path!);
                debugLog('[Preview] download complete', {path, afterExists});
                await new Promise((resolve) => setTimeout(resolve, 200));

                // 缓存本地路径
                if (file.id && path) {
                    await updateLocalFilePath(serverUrl, file.id, path);
                    file.localPath = path;
                }

                // 步骤：打开预览
                setPreviewLoading(prev => ({...prev, currentStep: 'opening', canCancel: false}));
                await new Promise((resolve) => setTimeout(resolve, 300));

                openDocument(file);
                hideLoadingModal();
            }
        } catch (error) {
            const errorMsg = getFullErrorMessage(error);
            debugLog('[Preview] download/preview ERROR', {path, error: errorMsg});
            if (path) {
                deleteAsync(path, {idempotent: true});
            }
            setDownloading(false);
            setProgress(0);
            hideLoadingModal();

            if (!isErrorWithMessage(error) || error.message !== 'cancelled') {
                logDebug('error on downloadAndPreviewFile', errorMsg);
                alertDownloadFailed(intl);
            }
        }
    }, [intl, openDocument, serverUrl, hideLoadingModal]);

    const toggleDownloadAndPreview = useCallback((file: FileInfo) => {
        if (downloading && progress < 1) {
            cancelDownload();
        } else if (downloading) {
            setProgress(0);
            cancelDownload();
            setDownloading(false);
        } else {
            downloadAndPreviewFile(file);
        }
    }, [downloading, progress, downloadAndPreviewFile]);

    const cancelDownload = () => {
        setDidCancel(true);
        cancelToken.current = true;
        if (downloadTask.current?.cancel) {
            downloadTask.current.cancel();
        }
    };

    // ── 渲染 Loading Modal 组件 ──
    const PreviewLoadingModal = React.createElement(FilePreviewLoadingModal, {
        visible: previewLoading.visible,
        fileName: previewLoading.fileName,
        currentStep: previewLoading.currentStep,
        steps: previewLoading.steps,
        canCancel: previewLoading.canCancel,
        onCancel: cancelPreview,
    });

    return {
        downloading,
        progress,
        toggleDownloadAndPreview,
        downloadAndPreviewFile,
        PreviewLoadingModal,
        previewLoadingVisible: previewLoading.visible,
        showPreviewLoading: setPreviewLoading,
        hidePreviewLoading: hideLoadingModal,
    };
};
