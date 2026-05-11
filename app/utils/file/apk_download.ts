// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {cacheDirectory, createDownloadResumable, deleteAsync} from 'expo-file-system';

const CACHED_UPDATE_APK_FILENAME = 'update.apk';

export const getCachedUpdateApkUri = (): string => {
    return cacheDirectory + CACHED_UPDATE_APK_FILENAME;
};

/**
 * 删除应用内更新下载缓存的 APK（与 {@link downloadApk} 写入路径一致）。
 * 每次冷启动调用，避免残留包占用空间或被误装旧版本。
 */
export const clearCachedUpdateApk = async (): Promise<void> => {
    const uri = getCachedUpdateApkUri();
    await deleteAsync(uri, {idempotent: true});
};

export type ApkDownloadProgress = {
    totalBytesExpectedToWrite: number;
    totalBytesWritten: number;
};

export type ApkDownloadResult = {
    fileUri: string;
    cancel: () => void;
};

/**
 * 应用内下载 APK 文件，实时回调下载进度
 * @param url - APK 远程下载地址
 * @param onProgress - 下载进度回调
 * @param onComplete - 下载完成回调，返回本地文件路径
 * @param onError - 下载失败回调
 */
export const downloadApk = (
    url: string,
    onProgress: (progress: ApkDownloadProgress) => void,
    onComplete: (fileUri: string) => void,
    onError: (error: Error) => void,
): ApkDownloadResult => {
    const fileUri = getCachedUpdateApkUri();

    const downloadResumable = createDownloadResumable(
        url,
        fileUri,
        {},
        ({totalBytesExpectedToWrite, totalBytesWritten}) => {
            onProgress({totalBytesExpectedToWrite, totalBytesWritten});
        },
    );

    downloadResumable.downloadAsync()
        .then((result) => {
            if (result) {
                onComplete(result.uri);
            }
        })
        .catch(onError);

    return {
        fileUri,
        cancel: () => {
            downloadResumable.cancelAsync().catch(() => {/* 取消下载出错时静默处理 */});
        },
    };
};

/**
 * 计算下载百分比（0-100），处理分母为 0 的情况
 */
export const computeDownloadPercent = (progress: ApkDownloadProgress): number => {
    if (!progress.totalBytesExpectedToWrite || progress.totalBytesExpectedToWrite <= 0) {
        return 0;
    }
    return Math.round((progress.totalBytesWritten / progress.totalBytesExpectedToWrite) * 100);
};