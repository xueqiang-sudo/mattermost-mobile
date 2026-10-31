// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import Model from '@nozbe/watermelondb/Model';
import {applicationName} from 'expo-application';
import {
    cacheDirectory, deleteAsync, documentDirectory, getInfoAsync,
    type FileInfo as ExpoFileInfo,
} from 'expo-file-system';
import mimeDB from 'mime-db';
import {Alert, Linking, Platform} from 'react-native';
import Permissions, {PERMISSIONS} from 'react-native-permissions';

import {Files} from '@constants';
import {generateId} from '@utils/general';
import keyMirror from '@utils/key_mirror';
import {logError} from '@utils/log';
import {deleteEntitiesFile, getIOSAppGroupDetails} from '@utils/mattermost_managed';
import {md5Hash, urlSafeBase64Encode} from '@utils/security';

import type {PastedFile} from '@mattermost/react-native-paste-input';
import type FileModel from '@typings/database/models/servers/file';
import type {IntlShape} from 'react-intl';
import type {DocumentPickerResponse} from 'react-native-document-picker';
import type {Asset} from 'react-native-image-picker';

const EXTRACT_TYPE_REGEXP = /^\s*([^;\s]*)(?:;|\s|$)/;
const CONTENT_DISPOSITION_REGEXP = /inline;filename=".*\.([a-z]+)";/i;
const DEFAULT_SERVER_MAX_FILE_SIZE = 50 * 1024 * 1024;// 50 Mb

export const FileFilters = keyMirror({
    ALL: null,
    DOCUMENTS: null,
    SPREADSHEETS: null,
    PRESENTATIONS: null,
    CODE: null,
    IMAGES: null,
    AUDIO: null,
    VIDEOS: null,
});
export type FileFilter = keyof typeof FileFilters

export const GENERAL_SUPPORTED_DOCS_FORMAT = [
    'application/json',
    'application/msword',
    'application/pdf',
    'application/rtf',
    'application/vnd.ms-excel',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/x-x509-ca-cert',
    'application/xml',
    'text/csv',
    'text/markdown',
    'text/plain',
    'text/x-markdown',
];

const SUPPORTED_DOCS_FORMAT = Platform.select({
    android: GENERAL_SUPPORTED_DOCS_FORMAT,
    ios: [
        ...GENERAL_SUPPORTED_DOCS_FORMAT,
        'application/vnd.apple.pages',
        'application/vnd.apple.numbers',
        'application/vnd.apple.keynote',
    ],
});

const SUPPORTED_IMAGE_FORMAT = ['png', 'jpg', 'jpeg', 'bmp', 'tiff', 'svg', 'xcf', 'gif'];

const SUPPORTED_VIDEO_FORMAT = Platform.select({
    ios: ['video/mp4', 'video/x-m4v', 'video/quicktime', 'video/mov', 'video/mpeg', 'video/x-flv', 'video/avi', 'video/x-msvideo'],
    android: ['video/3gpp', 'video/x-matroska', 'video/mp4', 'video/webm', 'video/quicktime', 'video/mov', 'video/mpeg', 'video/x-flv', 'video/avi', 'video/x-msvideo'],
});

const SUPPORTED_AUDIO_FORMAT = Platform.select({
    ios: ['audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-aiff'],
    android: ['audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/3gpp'],
});

const types: Record<string, string> = {};
const extensions: Record<string, readonly string[]> = {};

export function filterFileExtensions(filter?: FileFilter): string {
    let searchTerms: string[] = [];
    switch (filter) {
        case FileFilters.ALL:
            return '';
        case FileFilters.DOCUMENTS:
            searchTerms = Files.DOCUMENT_TYPES;
            break;
        case FileFilters.SPREADSHEETS:
            searchTerms = Files.SPREADSHEET_TYPES;
            break;
        case FileFilters.PRESENTATIONS:
            searchTerms = Files.PRESENTATION_TYPES;
            break;
        case FileFilters.CODE:
            searchTerms = Files.CODE_TYPES;
            break;
        case FileFilters.IMAGES:
            searchTerms = Files.IMAGE_TYPES;
            break;
        case FileFilters.AUDIO:
            searchTerms = Files.AUDIO_TYPES;
            break;
        case FileFilters.VIDEOS:
            searchTerms = Files.VIDEO_TYPES;
            break;
        default:
            return '';
    }
    return 'ext:' + searchTerms.join(' ext:');
}

/**
 * Populate the extensions and types maps.
 * @private
 */

function populateMaps() {
    // source preference (least -> most)
    const preference = ['nginx', 'apache', undefined, 'iana'];

    Object.keys(mimeDB).forEach((type) => {
        const mime = mimeDB[type];
        const exts = mime.extensions;

        if (!exts || !exts.length) {
            return;
        }

        extensions[type] = exts;

        for (let i = 0; i < exts.length; i++) {
            const extension = exts[i];

            if (types[extension]) {
                const from = preference.indexOf(mimeDB[types[extension]].source);
                const to = preference.indexOf(mime.source);

                if (types[extension] !== 'application/octet-stream' &&
                    (from > to || (from === to && types[extension].substr(0, 12) === 'application/'))) {
                    continue;
                }
            }

            types[extension] = type;
        }
    });
}

export async function deleteV1Data() {
    const dir = Platform.OS === 'ios' ? getIOSAppGroupDetails().appGroupSharedDirectory : documentDirectory;

    try {
        const directory = `${dir}/mmkv`;
        const mmkvDirInfo = await getInfoAsync(directory);
        if (mmkvDirInfo.exists) {
            await deleteAsync(directory);
        }
    } catch {
        // do nothing
    }

    try {
        const entitiesInfo = await getInfoAsync(`${dir}/entities`);
        if (entitiesInfo.exists) {
            deleteEntitiesFile();
        }
    } catch (e) {
        // do nothing
    }
}

export async function deleteFileCache(serverUrl: string) {
    const serverDir = md5Hash(serverUrl);
    return deleteFileCacheByDir(serverDir);
}

export async function deleteFileCacheByDir(dir: string) {
    if (Platform.OS === 'ios') {
        const appGroupCacheDir = `${getIOSAppGroupDetails().appGroupSharedDirectory}/Library/Caches/${dir}`;
        await deleteFilesInDir(appGroupCacheDir);
    }

    // 聊天文件已落到 documentDirectory（持久化），删除需指向该目录。
    const docDir = `${documentDirectory}/${dir}`;
    await deleteFilesInDir(docDir);

    // 兼容旧版本落在 cacheDirectory 的残留文件，一并清理。
    const cacheDir = `${cacheDirectory}/${dir}`;
    await deleteFilesInDir(cacheDir);

    return true;
}

async function deleteFilesInDir(directory: string) {
    if (directory) {
        const cacheDirInfo = await getInfoAsync(directory);
        if (cacheDirInfo.exists) {
            await deleteAsync(directory, {idempotent: true});
        }
    }
}

export function lookupMimeType(filename: string) {
    if (!Object.keys(extensions).length) {
        populateMaps();
    }

    const ext = filename.split('.').pop()?.toLowerCase();
    return types[ext!] || 'application/octet-stream';
}

/**
 * Extract file extension from filename
 * @param filename - The filename to extract extension from
 * @returns The extension without the dot, or empty string if no extension
 * @example
 * getFileExtension('document.pdf') // returns 'pdf'
 * getFileExtension('image.PNG') // returns 'PNG'
 * getFileExtension('noextension') // returns ''
 */
export function getFileExtension(filename: string): string {
    if (!filename || typeof filename !== 'string') {
        return '';
    }

    const lastDotIndex = filename.lastIndexOf('.');
    if (lastDotIndex <= 0 || lastDotIndex === filename.length - 1) {
        return '';
    }

    return filename.substring(lastDotIndex + 1);
}

export function getExtensionFromMime(type: string) {
    if (!Object.keys(extensions).length) {
        populateMaps();
    }

    if (!type || typeof type !== 'string') {
        return undefined;
    }

    const match = EXTRACT_TYPE_REGEXP.exec(type);

    // get extensions
    const exts = match && extensions[match[1].toLowerCase()];

    if (!exts || !exts.length) {
        return undefined;
    }

    return exts[0];
}

export function getExtensionFromContentDisposition(contentDisposition: string) {
    const match = CONTENT_DISPOSITION_REGEXP.exec(contentDisposition);
    let extension = match && match[1];
    if (extension) {
        if (!Object.keys(types).length) {
            populateMaps();
        }

        extension = extension.toLowerCase();
        if (types[extension]) {
            return extension;
        }

        return null;
    }

    return null;
}

export const getAllowedServerMaxFileSize = (config: ClientConfig) => {
    return config && config.MaxFileSize ? parseInt(config.MaxFileSize, 10) : DEFAULT_SERVER_MAX_FILE_SIZE;
};

export const isGif = (file?: FileInfo | FileModel) => {
    if (!file) {
        return false;
    }

    let mime = 'mime_type' in file ? file.mime_type : file.mimeType;
    if (mime && mime.includes(';')) {
        mime = mime.split(';')[0];
    } else if (!mime && file?.name) {
        mime = lookupMimeType(file.name);
    }

    return mime === 'image/gif';
};

export function extractExtension(filename: string) {
    const ext = filename.split('.').pop() || '';
    return ext.startsWith('.') ? ext.slice(1).toLowerCase() : ext.toLowerCase();
}

export const isImage = (file?: FileInfo | FileModel) => {
    if (!file) {
        return false;
    }

    if (isGif(file)) {
        return true;
    }

    const fileExt = extractExtension(file.extension || file.name);

    if (!SUPPORTED_IMAGE_FORMAT.includes(fileExt)) {
        return false;
    }

    let mimeType = 'mime_type' in file ? file.mime_type : file.mimeType;
    if (!mimeType) {
        mimeType = lookupMimeType(file.extension) || lookupMimeType(file.name);
    }

    return Boolean(mimeType?.startsWith('image/'));
};

export const isDocument = (file?: FileInfo | FileModel) => {
    if (!file) {
        return false;
    }

    let mime = 'mime_type' in file ? file.mime_type : file.mimeType;
    if (mime && mime.includes(';')) {
        mime = mime.split(';')[0];
    } else if (!mime && file?.name) {
        mime = lookupMimeType(file.name);
    }

    const result = SUPPORTED_DOCS_FORMAT!.includes(mime);
    if (__DEV__) {
        // Only log in debug mode to avoid performance impact
        const {debugLog} = require('@store/debug_log');
    }
    return result;
};

export const isPdf = (file?: FileInfo | FileModel) => {
    if (!file) {
        return false;
    }

    let mime = 'mime_type' in file ? file.mime_type : file.mimeType;
    if (mime && mime.includes(';')) {
        mime = mime.split(';')[0];
    } else if (!mime && file?.name) {
        mime = lookupMimeType(file.name);
    }

    return mime === 'application/pdf';
};

export const hasPdfPreview = (file?: FileInfo | FileModel): boolean => {
    if (!file) {
        return false;
    }
    return Boolean('pdf_preview_id' in file && file.pdf_preview_id);
};

export const isTextFile = (file?: FileInfo | FileModel): boolean => {
    if (!file) {
        return false;
    }

    const textMimeTypes = [
        'text/plain',
        'text/markdown',
        'text/x-markdown',
        'text/csv',
        'text/xml',
        'text/html',
        'text/css',
        'text/javascript',
        'application/json',
        'application/xml',
        'application/javascript',
        'application/x-sh',
        'application/x-yaml',
    ];

    let mime = 'mime_type' in file ? file.mime_type : file.mimeType;
    if (mime && mime.includes(';')) {
        mime = mime.split(';')[0];
    }

    if (textMimeTypes.includes(mime)) {
        return true;
    }

    // Also treat all code and text extension files as viewable text files
    const ext = extractExtension(
        ('extension' in file ? file.extension : undefined) || file.name,
    );
    return Files.CODE_TYPES.includes(ext) || Files.TEXT_TYPES.includes(ext);
};

export const isMarkdownFile = (fileName: string): boolean => {
    const ext = extractExtension(fileName);
    return ext === 'md' || ext === 'markdown';
};

export const isJsonFile = (fileName: string, mimeType: string): boolean => {
    const ext = extractExtension(fileName);
    return ext === 'json' || mimeType === 'application/json';
};

export const APPLE_EXTENSIONS = ['pages', 'numbers', 'keynote'];

export const isAppleDocument = (file?: FileInfo | FileModel): boolean => {
    if (!file || Platform.OS !== 'ios') {
        return false;
    }
    const ext = ('extension' in file ? file.extension : undefined)?.toLowerCase() || file.name.split('.').pop()?.toLowerCase() || '';
    return APPLE_EXTENSIONS.includes(ext);
};

export const isVideo = (file?: FileInfo | FileModel) => {
    if (!file) {
        return false;
    }

    let mime = 'mime_type' in file ? file.mime_type : file.mimeType;
    if (mime && mime.includes(';')) {
        mime = mime.split(';')[0];
    } else if (!mime && file?.name) {
        mime = lookupMimeType(file.name);
    }

    // Check by mime type first
    if (SUPPORTED_VIDEO_FORMAT!.includes(mime)) {
        return true;
    }

    // Fallback: check by file extension for common video formats
    if (file?.name) {
        const ext = file.name.split('.').pop()?.toLowerCase();
        const videoExtensions = ['mp4', 'mov', 'avi', 'mkv', 'webm', '3gp', 'm4v', 'mpeg', 'mpg', 'flv', 'wmv'];
        if (ext && videoExtensions.includes(ext)) {
            return true;
        }
    }

    return false;
};

export const isAudio = (file?: FileInfo | FileModel) => {
    if (!file) {
        return false;
    }

    let mime = 'mime_type' in file ? file.mime_type : file.mimeType;
    if (mime && mime.includes(';')) {
        mime = mime.split(';')[0];
    } else if (!mime && file?.name) {
        mime = lookupMimeType(file.name);
    }

    return SUPPORTED_AUDIO_FORMAT!.includes(mime);
};

export function getFormattedFileSize(bytes: number): string {
    const fileSizes: Array<[string, number]> = [
        ['TB', 1024 * 1024 * 1024 * 1024],
        ['GB', 1024 * 1024 * 1024],
        ['MB', 1024 * 1024],
        ['KB', 1024],
    ];
    const size = fileSizes.find((unitAndMinBytes) => {
        const minBytes = unitAndMinBytes[1];
        return bytes > minBytes;
    });

    if (size) {
        return `${Math.floor(bytes / (size[1]))} ${size[0]}`;
    }

    return `${bytes} B`;
}

export function getFileType(file: FileInfo | ExtractedFileInfo): string {
    if (!file || !file.extension) {
        return 'other';
    }

    const fileExt = file.extension.toLowerCase();
    const fileTypes = [
        'image',
        'code',
        'pdf',
        'video',
        'audio',
        'spreadsheet',
        'text',
        'word',
        'presentation',
        'patch',
        'zip',
    ];

    return fileTypes.find((fileType) => {
        const constForFileTypeExtList = `${fileType}_types`.toUpperCase();
        const fileTypeExts = Files[constForFileTypeExtList];
        return fileTypeExts.indexOf(fileExt) > -1;
    }) || 'other';
}

export function getLocalFilePathFromFile(serverUrl: string, file: FileInfo | FileModel) {
    const fileIdPath = file.id?.replace(/[^0-9a-z]/g, '');
    if (serverUrl) {
        const server = md5Hash(serverUrl);
        const hasValidFilename = file?.name && !file.name.includes('/');
        const hasValidExtension = file?.extension && !file.extension.includes('/');
        if (hasValidFilename) {
            let extension: string | undefined = file.extension;

            if (!hasValidExtension) {
                const mimeType = (file instanceof Model) ? file.mimeType : file.mime_type;
                extension = getExtensionFromMime(mimeType);
            }

            // 目录名使用 MD5 哈希（32位十六进制，无特殊字符）
            // 文件名使用 fileId 确保路径安全，兼容所有查看器（包括 PDF）
            // 持久化存储：落到 documentDirectory（iOS=沙盒 Documents，Android=app files），
            // 系统空间紧张时不会自动清理，实现微信式「下过一次长期保留」。
            // 不用 cacheDirectory（iOS Library/Caches、Android cache，均会被系统回收）。
            const fileName = extension ? `${fileIdPath}.${extension}` : fileIdPath;
            return `${documentDirectory}${server}/Files/${fileName}`;
        } else if (file?.id && hasValidExtension) {
            return `${documentDirectory}${server}/Files/${fileIdPath}.${file.extension}`;
        } else if (file?.id) {
            return `${documentDirectory}${server}/Files/${fileIdPath}`;
        }
    }

    throw new Error('File path could not be set');
}

export async function extractFileInfo(files: Array<Asset | DocumentPickerResponse | PastedFile>) {
    const out: ExtractedFileInfo[] = [];

    await Promise.all(files.map(async (file) => {
        if (!file || !file.uri) {
            logError('extractFileInfo no file or url');
            return;
        }

        const outFile = {
            progress: 0,
            localPath: file.uri,
            clientId: generateId(),
            loading: true,
        } as unknown as ExtractedFileInfo;

        if ('fileSize' in file) {
            outFile.size = file.fileSize || 0;
            outFile.name = file.fileName || '';
        } else {
            const localPath = file.uri || '';
            try {
                const fileInfo = await getInfoAsync(localPath, {size: true});
                if ('size' in fileInfo) {
                    outFile.size = fileInfo.size || 0;
                    outFile.name = localPath.substring(localPath.lastIndexOf('/') + 1);
                }
            } catch (e) {
                logError('extractFileInfo', e);
                return;
            }
        }

        if (file.type) {
            outFile.mime_type = file.type;
        } else {
            outFile.mime_type = lookupMimeType(outFile.name);
        }

        out.push(outFile);
    }));

    return out;
}

export function fileSizeWarning(intl: IntlShape, maxFileSize: number) {
    return intl.formatMessage({
        id: 'file_upload.fileAbove',
        defaultMessage: 'Files must be less than {max}',
    }, {
        max: getFormattedFileSize(maxFileSize),
    });
}

export function fileMaxWarning(intl: IntlShape, maxFileCount: number) {
    return intl.formatMessage({
        id: 'mobile.file_upload.max_warning',
        defaultMessage: 'Uploads limited to {count} files maximum.',
    }, {
        count: maxFileCount,
    });
}

export function uploadDisabledWarning(intl: IntlShape) {
    return intl.formatMessage({
        id: 'mobile.file_upload.disabled2',
        defaultMessage: 'File uploads from mobile are disabled.',
    });
}

export const fileExists = async (path: string) => {
    try {
        const file = await getInfoAsync(path);
        return file.exists;
    } catch {
        return false;
    }
};

export const hasWriteStoragePermission = async (intl: IntlShape) => {
    if (Platform.OS === 'android' && Platform.Version < 33) {
        const storagePermission = PERMISSIONS.ANDROID.WRITE_EXTERNAL_STORAGE;
        let permissionRequest;
        const hasPermissionToStorage = await Permissions.check(storagePermission);
        switch (hasPermissionToStorage) {
            case Permissions.RESULTS.DENIED:
                permissionRequest = await Permissions.request(storagePermission);
                return permissionRequest === Permissions.RESULTS.GRANTED;
            case Permissions.RESULTS.BLOCKED: {
                const title = intl.formatMessage(
                    {
                        id: 'mobile.storage_permission_denied_title',
                        defaultMessage:
                            '{applicationName} would like to access your files',
                    },
                    {applicationName},
                );
                const text = intl.formatMessage(
                    {
                        id: 'mobile.write_storage_permission_denied_description',
                        defaultMessage:
                            'Save files to your device. Open Settings to grant {applicationName} write access to files on this device.',
                    },
                    {applicationName},
                );

                Alert.alert(title, text, [
                    {
                        text: intl.formatMessage({
                            id: 'mobile.permission_denied_dismiss',
                            defaultMessage: "Don't Allow",
                        }),
                    },
                    {
                        text: intl.formatMessage({
                            id: 'mobile.permission_denied_retry',
                            defaultMessage: 'Settings',
                        }),
                        onPress: () => Linking.openSettings(),
                    },
                ]);
                return false;
            }
            default: return true;
        }
    }

    return true;
};

export const hasPhotoLibraryWritePermission = async (intl: IntlShape) => {
    if (Platform.OS === 'ios') {
        // Use PHOTO_LIBRARY_ADD_ONLY for saving photos (iOS 14+)
        // This is the correct permission for saving to photo library
        const permission = PERMISSIONS.IOS.PHOTO_LIBRARY_ADD_ONLY;
        let permissionRequest;
        const hasPermission = await Permissions.check(permission);

        switch (hasPermission) {
            case Permissions.RESULTS.DENIED:
            case Permissions.RESULTS.UNAVAILABLE:
                permissionRequest = await Permissions.request(permission);
                // Accept both GRANTED and LIMITED (limited photo library access)
                return permissionRequest === Permissions.RESULTS.GRANTED ||
                       permissionRequest === Permissions.RESULTS.LIMITED;
            case Permissions.RESULTS.BLOCKED: {
                const title = intl.formatMessage(
                    {
                        id: 'mobile.photos_permission_denied_title',
                        defaultMessage: '{applicationName} would like to access your photos',
                    },
                    {applicationName},
                );
                const text = intl.formatMessage(
                    {
                        id: 'mobile.photos_permission_denied_description',
                        defaultMessage: 'Save photos and videos to your device. Open Settings to grant {applicationName} write access to your photo library.',
                    },
                    {applicationName},
                );
                Alert.alert(title, text, [
                    {
                        text: intl.formatMessage({
                            id: 'mobile.permission_denied_dismiss',
                            defaultMessage: "Don't Allow",
                        }),
                    },
                    {
                        text: intl.formatMessage({
                            id: 'mobile.permission_denied_retry',
                            defaultMessage: 'Settings',
                        }),
                        onPress: () => Linking.openSettings(),
                    },
                ]);
                return false;
            }
            case Permissions.RESULTS.GRANTED:
            case Permissions.RESULTS.LIMITED:
                return true;
            default:
                return false;
        }
    }

    return hasWriteStoragePermission(intl);
};

export const getAllFilesInCachesDirectory = async (serverUrl: string) => {
    try {
        const files: ExpoFileInfo[] = [];

        // 聊天文件已落到 documentDirectory（持久化）；旧版本的 cacheDirectory 残留也一并统计。
        const promises = [
            getInfoAsync(`${documentDirectory}/${md5Hash(serverUrl)}`, {size: true}),
            getInfoAsync(`${cacheDirectory}/${md5Hash(serverUrl)}`, {size: true}),
        ];
        if (Platform.OS === 'ios') {
            const cacheDir = `${getIOSAppGroupDetails().appGroupSharedDirectory}/Library/Caches/${md5Hash(serverUrl)}`;
            promises.push(getInfoAsync(cacheDir, {size: true}));
        }

        const dirs = await Promise.allSettled(promises);
        dirs.forEach((p) => {
            if (p.status === 'fulfilled' && 'size' in p.value) {
                files.push(p.value);
            }
        });

        const flattenedFiles = files.flat();
        const totalSize = flattenedFiles.reduce((acc, file) => {
            if ('size' in file) {
                return acc + file.size;
            }
            return acc;
        }, 0);
        return {
            files: flattenedFiles,
            totalSize,
        };
    } catch (error) {
        return {error};
    }
};

export const pathWithPrefix = (prefix: string, path: string) => {
    const p = path.startsWith(prefix) ? '' : prefix;
    return `${p}${path}`;
};

export const deleteFile = async (path: string) => {
    await deleteAsync(pathWithPrefix('file://', path));
};

// 全局文件存在性检查并发限制器
// 避免大量文件同时检查导致内存暴涨和 I/O 阻塞
const FILE_CHECK_CONCURRENCY = 10; // 最多同时检查 10 个文件
const fileCheckQueue: Array<() => Promise<void>> = [];
let activeFileChecks = 0;

const processFileCheckQueue = async () => {
    if (activeFileChecks >= FILE_CHECK_CONCURRENCY || fileCheckQueue.length === 0) {
        return;
    }

    const task = fileCheckQueue.shift();
    if (task) {
        activeFileChecks++;
        try {
            await task();
        } finally {
            activeFileChecks--;
            processFileCheckQueue(); // 递归处理下一个
        }
    }
};

const enqueueFileCheck = (checkFn: () => Promise<void>): Promise<void> => {
    return new Promise((resolve) => {
        const wrappedTask = async () => {
            await checkFn();
            resolve();
        };
        fileCheckQueue.push(wrappedTask);
        processFileCheckQueue();
    });
};

export const filesLocalPathValidation = async (files: FileModel[], authorId: string, serverUrl?: string) => {
    // 【性能优化】并行检查所有文件的存在性，但受全局并发限制
    // 避免 50 个 post × 5 个文件 = 250 个并发检查导致卡死
    const filesInfo = await Promise.all(
        files.map(async (f) => {
            const info = f.toFileInfo(authorId);

            // 【修复】如果 localPath 为空但文件已上传（有 id），尝试重新生成路径
            // 这处理了以下情况：
            // 1. 文件上传完成但 localPath 未写入数据库
            // 2. 目录命名方案变更（base64 → MD5）导致旧路径失效
            if (!info.localPath && info.id && serverUrl) {
                // 文件已上传但没有 localPath，重新生成
                const newPath = getLocalFilePathFromFile(serverUrl, info);
                info.localPath = newPath;
            }

            if (info.localPath) {
                // 使用队列限制并发
                await enqueueFileCheck(async () => {
                    const exists = await fileExists(info.localPath!);
                    if (!exists) {
                        // 【修复】文件不存在时，尝试用新路径（MD5 目录）重新检查
                        // 如果找到，更新 localPath；否则清空
                        if (serverUrl && info.id) {
                            const newPath = getLocalFilePathFromFile(serverUrl, info);
                            if (newPath !== info.localPath) {
                                const newExists = await fileExists(newPath);
                                if (newExists) {
                                    info.localPath = newPath;
                                    return;
                                }
                            }
                        }
                        info.localPath = '';
                    }
                });
            }
            return info;
        }),
    );

    return filesInfo;
};
