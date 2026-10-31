// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {deleteAsync, makeDirectoryAsync} from 'expo-file-system';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {Platform, StatusBar, type StatusBarStyle} from 'react-native';
import FileViewer from 'react-native-file-viewer';
import tinyColor from 'tinycolor2';

import {getLocalFileInfo, updateLocalFilePath} from '@actions/local/file';
import {buildFilePreviewUrl, buildFileUrl, downloadFile} from '@actions/remote/file';
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

// 获取最终下载 URL（处理 307 重定向）
const getFinalDownloadUrl = async (serverUrl: string, fileId: string): Promise<string> => {
    try {
        const client = NetworkManager.getClient(serverUrl);
        const fullUrl = buildFullUrl(serverUrl, fileId);

        debugLog('[Preview] Checking for redirect', {fullUrl});

        // 用 doFetch 尝试 GET，查看是否有重定向
        const resp = await client.doFetch(fullUrl, {method: 'get'});
        const headers = resp?.headers || {};
        const statusCode = resp?.status || resp?.statusCode || 'unknown';

        const location = headers.Location || headers.location;

        debugLog('[Preview] Redirect check response', {
            fullUrl,
            statusCode,
            location: location || '(none)',
            contentType: headers['Content-Type'] || headers['content-type'] || '(none)',
            contentLength: headers['Content-Length'] || headers['content-length'] || '(none)',
        });

        // 如果有 307 重定向，返回重定向 URL
        if (location && (statusCode === 307 || statusCode === 302 || statusCode === 301)) {
            debugLog('[Preview] Found redirect', {from: fullUrl, to: location});
            return location;
        }

        // 没有重定向，返回原始 URL
        return fullUrl;
    } catch (e) {
        debugLog('[Preview] Redirect check failed, using original URL', {error: String(e)});
        return buildFullUrl(serverUrl, fileId);
    }
};

// 触发 Office → PDF 转换并轮询（对齐 webapp）
const triggerConversionAndPoll = async (serverUrl: string, fileId: string): Promise<string | null> => {
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
        await new Promise((resolve) => setTimeout(resolve, 2000));

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

    const downloadAndPreviewFile = useCallback(async (file: FileInfo) => {
        setDidCancel(false);

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

        // ── Office 文件：确保有 pdf_preview_id（没有则触发转换+轮询）──
        if (isOffice && file.id) {
            let pdfPreviewId = file.pdf_preview_id;

            if (!pdfPreviewId) {
                debugLog('[Preview] Office file without pdf_preview_id, triggering conversion', {
                    fileId: file.id,
                    name: file.name,
                });

                setDownloading(true);
                pdfPreviewId = await triggerConversionAndPoll(serverUrl, file.id);
                setDownloading(false);

                if (pdfPreviewId) {
                    // 更新 file 对象的 pdf_preview_id
                    file.pdf_preview_id = pdfPreviewId;
                    debugLog('[Preview] Got pdf_preview_id after conversion', {pdfPreviewId});
                } else {
                    debugLog('[Preview] Conversion failed or timeout', {fileId: file.id});
                    alertDownloadFailed(intl);
                    return;
                }
            }

            // 下载 PDF 预览版本
            const originalUrl = buildFullUrl(serverUrl, pdfPreviewId);

            // 获取最终下载 URL（处理 307 重定向）
            const finalDownloadUrl = await getFinalDownloadUrl(serverUrl, pdfPreviewId);
            debugLog('[Preview] Downloading PDF preview (Office)', {
                originalFileId: file.id,
                pdfPreviewId,
                originalUrl,
                finalDownloadUrl,
                serverUrl,
            });

            const pdfFileInfo: FileInfo = {
                ...file,
                id: pdfPreviewId,
                name: file.name.replace(/\.[^.]+$/, '.pdf'),
                extension: 'pdf',
                mime_type: 'application/pdf',
            };

            let pdfPath = getLocalFilePathFromFile(serverUrl, pdfFileInfo);
            const pdfExists = await fileExists(pdfPath);

            try {
                if (!pdfExists) {
                    setDownloading(true);
                    await ensureParentDir(pdfPath);

                    debugLog('[Preview] Starting download', {
                        url: finalDownloadUrl,
                        destination: pdfPath,
                    });

                    // 使用最终 URL 下载（可能是 CDN 重定向地址）
                    const client = NetworkManager.getClient(serverUrl);
                    downloadTask.current = client.apiClient.download(
                        finalDownloadUrl,
                        pdfPath.replace('file://', ''),
                        {timeoutInterval: 60000},
                    );
                    downloadTask.current?.progress?.(setProgress);
                    const downloadResponse = await downloadTask.current;
                    setProgress(1);

                    // 记录下载响应（诊断用）
                    debugLog('[Preview] Download response', {
                        status: downloadResponse?.status || downloadResponse?.statusCode || 'unknown',
                        headers: downloadResponse?.headers || {},
                        ok: downloadResponse?.ok,
                        url: finalDownloadUrl,
                    });

                    // Wait a bit for file system to flush
                    await new Promise((resolve) => setTimeout(resolve, 200));

                    // Validate downloaded file is actually a PDF
                    const afterExists = await fileExists(pdfPath);
                    if (afterExists) {
                        try {
                            const expoFs = await import('expo-file-system');
                            const {readAsStringAsync, getInfoAsync} = expoFs;

                            // Check file size
                            let fileSize = -1;
                            try {
                                const fileInfo = await getInfoAsync(pdfPath.replace(/^file:\/\//, ''), {size: true});
                                fileSize = fileInfo.size || -1;
                            } catch {}

                            const readPath = pdfPath.replace(/^file:\/\//, '');

                            // Try reading with retry
                            let content = '';
                            let retryCount = 0;
                            const maxRetries = 3;

                            while (retryCount < maxRetries) {
                                content = await readAsStringAsync(readPath, {encoding: 'base64'});
                                if (content.length > 0) break;
                                retryCount++;
                                debugLog('[Preview] PDF preview read retry', {attempt: retryCount});
                                await new Promise((resolve) => setTimeout(resolve, 100));
                            }

                            const header = content.substring(0, 20);
                            const isValidPdf = header.startsWith('JVBER');

                            // 解码前100字符用于诊断
                            let decodedContent = '';
                            try {
                                decodedContent = atob(content.substring(0, 200));
                            } catch {}

                            debugLog('[Preview] PDF preview validation result', {
                                path: pdfPath,
                                header,
                                isValidPdf,
                                contentLength: content.length,
                                fileSize,
                                retries: retryCount,
                                originalUrl: downloadUrl,
                                redirectUrl,
                                decodedFirst100: decodedContent.substring(0, 100),
                            });

                            if (!isValidPdf) {
                                debugLog('[Preview] ERROR: PDF preview is NOT valid - possible reasons:', {
                                    reason: fileSize === 0 ? 'File is empty (0 bytes)' :
                                        content.length === 0 ? 'Could not read file content' :
                                        decodedContent.includes('<html') || decodedContent.includes('<HTML') ? 'Got HTML error page instead of PDF' :
                                        decodedContent.includes('<?xml') ? 'Got XML response instead of PDF' :
                                        decodedContent.includes('AccessDenied') ? 'CDN access denied' :
                                        'Unknown content (not a PDF)',
                                    decodedContent: decodedContent.substring(0, 200),
                                    originalUrl: downloadUrl,
                                    redirectUrl,
                                });
                                await deleteAsync(pdfPath, {idempotent: true});
                                throw new Error('Downloaded PDF preview is not a valid PDF document');
                            }
                        } catch (validationErr) {
                            debugLog('[Preview] PDF preview validation exception', {error: String(validationErr)});
                            throw validationErr;
                        }
                    }
                }

                openDocument(pdfFileInfo);
            } catch (error) {
                if (pdfPath) {
                    deleteAsync(pdfPath, {idempotent: true});
                }
                setDownloading(false);
                setProgress(0);

                if (!isErrorWithMessage(error) || error.message !== 'cancelled') {
                    logDebug('error downloading PDF preview', getFullErrorMessage(error));
                    alertDownloadFailed(intl);
                }
            }
            return;
        }

        // ── 已有 PDF 预览版本（非 Office 但有 pdf_preview_id）──
        if (hasPdfPreview(file) && file.pdf_preview_id) {

            const originalUrl = buildFullUrl(serverUrl, file.pdf_preview_id);

            // 获取最终下载 URL（处理 307 重定向）
            const finalDownloadUrl = await getFinalDownloadUrl(serverUrl, file.pdf_preview_id);
            debugLog('[Preview] Downloading PDF preview', {
                originalFileId: file.id,
                pdfPreviewId: file.pdf_preview_id,
                originalUrl,
                finalDownloadUrl,
                serverUrl,
            });

            const pdfFileInfo: FileInfo = {
                ...file,
                id: file.pdf_preview_id,
                name: file.name.replace(/\.[^.]+$/, '.pdf'),
                extension: 'pdf',
                mime_type: 'application/pdf',
            };

            let pdfPath = getLocalFilePathFromFile(serverUrl, pdfFileInfo);
            const pdfExists = await fileExists(pdfPath);

            try {
                if (!pdfExists) {
                    setDownloading(true);
                    await ensureParentDir(pdfPath);

                    // 使用最终 URL 下载（可能是 CDN 重定向地址）
                    const client = NetworkManager.getClient(serverUrl);
                    downloadTask.current = client.apiClient.download(
                        finalDownloadUrl,
                        pdfPath.replace('file://', ''),
                        {timeoutInterval: 60000},
                    );
                    downloadTask.current?.progress?.(setProgress);
                    await downloadTask.current;
                    setProgress(1);

                    // Wait a bit for file system to flush
                    await new Promise(resolve => setTimeout(resolve, 200));

                    // Validate downloaded file is actually a PDF
                    const afterExists = await fileExists(pdfPath);
                    if (afterExists) {
                        try {
                            const {readAsStringAsync} = await import('expo-file-system');

                            // Strip file:// prefix
                            const readPath = pdfPath.replace(/^file:\/\//, '');

                            // Try reading with retry
                            let content = '';
                            let retryCount = 0;
                            const maxRetries = 3;

                            while (retryCount < maxRetries) {
                                content = await readAsStringAsync(readPath, {
                                    encoding: 'base64',
                                });

                                if (content.length > 0) {
                                    break;
                                }

                                retryCount++;
                                debugLog('[Preview] PDF preview read retry', {attempt: retryCount});
                                await new Promise(resolve => setTimeout(resolve, 100));
                            }

                            const header = content.substring(0, 20);
                            const isValidPdf = header.startsWith('JVBER');
                            debugLog('[Preview] PDF preview validation', {
                                path: pdfPath,
                                header,
                                isValidPdf,
                                contentLength: content.length,
                                retries: retryCount,
                            });

                            if (!isValidPdf) {
                                debugLog('[Preview] ERROR: Downloaded PDF preview is not valid', {
                                    path: pdfPath,
                                    header,
                                    contentLength: content.length,
                                });
                                // Delete invalid file so it can be re-downloaded
                                await deleteAsync(pdfPath, {idempotent: true});
                                throw new Error('Downloaded PDF preview is not a valid PDF document');
                            }
                        } catch (validationErr) {
                            debugLog('[Preview] PDF preview validation failed', {error: String(validationErr)});
                            throw validationErr;
                        }
                    }
                }

                openDocument(pdfFileInfo);
            } catch (error) {
                if (pdfPath) {
                    deleteAsync(pdfPath, {idempotent: true});
                }
                setDownloading(false);
                setProgress(0);

                if (!isErrorWithMessage(error) || error.message !== 'cancelled') {
                    logDebug('error downloading PDF preview', getFullErrorMessage(error));
                    alertDownloadFailed(intl);
                }
            }
            return;
        }

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
            debugLog('[Preview] downloadAndPreviewFile', {
                fileId: file.id,
                name: file.name,
                localPath: file.localPath,
                finalPath: path,
                exists,
                source: file.localPath ? 'localPath' : 'generated',
            });

            if (exists) {
                debugLog('[Preview] file exists, opening directly', {path});
                openDocument(file);
            } else {
                setDownloading(true);

                // Build download URL
                const originalUrl = buildFullUrl(serverUrl, file.id!);

                // 获取最终下载 URL（处理 307 重定向）
                const finalDownloadUrl = await getFinalDownloadUrl(serverUrl, file.id!);
                debugLog('[Preview] downloading file', {
                    fileId: file.id,
                    name: file.name,
                    originalUrl,
                    finalDownloadUrl,
                    localPath: path,
                    serverUrl,
                });

                await ensureParentDir(path!);

                // 使用最终 URL 下载（可能是 CDN 重定向地址）
                const client = NetworkManager.getClient(serverUrl);
                downloadTask.current = client.apiClient.download(
                    finalDownloadUrl,
                    path!.replace('file://', ''),
                    {timeoutInterval: 60000},
                );
                downloadTask.current?.progress?.(setProgress);

                const downloadResponse = await downloadTask.current;
                setProgress(1);

                // 记录下载响应（诊断用）
                debugLog('[Preview] Download response', {
                    status: downloadResponse?.status || downloadResponse?.statusCode || 'unknown',
                    headers: downloadResponse?.headers || {},
                    ok: downloadResponse?.ok,
                    url: finalDownloadUrl,
                });

                const afterExists = await fileExists(path!);
                debugLog('[Preview] download complete, file exists now?', {path, afterExists});

                // Wait a bit for file system to flush
                await new Promise(resolve => setTimeout(resolve, 200));

                // Validate file is actually what it claims to be
                if (afterExists && ext === 'pdf') {
                    try {
                        const expoFs = await import('expo-file-system');
                        const {readAsStringAsync, getInfoAsync} = expoFs;

                        // Get file info to check size
                        let fileSize = -1;
                        try {
                            const fileInfo = await getInfoAsync(path!.replace(/^file:\/\//, ''), {size: true});
                            fileSize = fileInfo.size || -1;
                        } catch {}

                        const readPath = path!.replace(/^file:\/\//, '');

                        // Try reading with retry
                        let fullContent = '';
                        let retryCount = 0;
                        const maxRetries = 3;

                        while (retryCount < maxRetries) {
                            fullContent = await readAsStringAsync(readPath, {encoding: 'base64'});
                            if (fullContent.length > 0) break;
                            retryCount++;
                            debugLog('[Preview] PDF read retry', {attempt: retryCount, maxRetries});
                            await new Promise(resolve => setTimeout(resolve, 100));
                        }

                        const header = fullContent.substring(0, 20);
                        const isValidPdf = header.startsWith('JVBER');

                        // 解码前200字符用于诊断
                        let decodedContent = '';
                        try {
                            decodedContent = atob(fullContent.substring(0, 200));
                        } catch {}

                        debugLog('[Preview] PDF validation result', {
                            path,
                            header,
                            isValidPdf,
                            contentLength: fullContent.length,
                            fileSize,
                            retries: retryCount,
                            originalUrl: downloadUrl,
                            redirectUrl,
                            decodedFirst100: decodedContent.substring(0, 100),
                        });

                        if (!isValidPdf) {
                            debugLog('[Preview] ERROR: Downloaded PDF is NOT valid - diagnosis:', {
                                reason: fileSize === 0 ? 'File is empty (0 bytes)' :
                                    fullContent.length === 0 ? 'Could not read file content' :
                                    decodedContent.includes('<html') || decodedContent.includes('<HTML') ? 'Got HTML error page instead of PDF' :
                                    decodedContent.includes('<?xml') ? 'Got XML response instead of PDF' :
                                    decodedContent.includes('AccessDenied') ? 'CDN access denied' :
                                    'Unknown content (not a PDF)',
                                decodedContent: decodedContent.substring(0, 200),
                                originalUrl: downloadUrl,
                                redirectUrl,
                            });
                            await deleteAsync(path!, {idempotent: true});
                            throw new Error('Downloaded PDF file is not valid');
                        }
                    } catch (validationErr) {
                        debugLog('[Preview] PDF validation exception', {error: String(validationErr)});
                        throw validationErr;
                    }
                }

                // Cache the local path in database (like WeChat - persist downloaded file paths)
                if (file.id && path) {
                    debugLog('[Preview] updating database localPath', {fileId: file.id, path});
                    const result = await updateLocalFilePath(serverUrl, file.id, path);
                    debugLog('[Preview] database update result', {error: result.error});

                    // Also update the file object in memory
                    file.localPath = path;
                    debugLog('[Preview] file object updated in memory', {fileId: file.id, localPath: file.localPath});
                }

                openDocument(file);
            }
        } catch (error) {
            debugLog('[Preview] download/preview ERROR', {path, error: getFullErrorMessage(error)});
            if (path) {
                deleteAsync(path, {idempotent: true});
            }
            setDownloading(false);
            setProgress(0);

            if (!isErrorWithMessage(error) || error.message !== 'cancelled') {
                logDebug('error on downloadAndPreviewFile', getFullErrorMessage(error));
                alertDownloadFailed(intl);
            }
        }
    }, [intl, openDocument, serverUrl]);

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
        if (downloadTask.current?.cancel) {
            downloadTask.current.cancel();
        }
    };

    return {
        downloading,
        progress,
        toggleDownloadAndPreview,
        downloadAndPreviewFile,
    };
};
