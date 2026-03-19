// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * 通讯录代理 GET 的磁盘缓存：按 baseUrl + companyId + path 存 JSON，
 * 条目中带 version，仅当与当前服务端版本一致时 read 才命中。
 */

import {
    deleteAsync,
    documentDirectory,
    getInfoAsync,
    makeDirectoryAsync,
    readAsStringAsync,
    readDirectoryAsync,
    writeAsStringAsync,
} from 'expo-file-system';
import {sha256} from 'js-sha256';

import {safeParseJSON} from '@utils/helpers';
import {logDebug} from '@utils/log';
import {urlSafeBase64Encode} from '@utils/security';

const ROOT_DIR = 'contact_api_cache';

/** 磁盘缓存最大存储时长：7 天 */
const DISK_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type DiskEntry = {
    version: string;
    data: unknown;
};

function companyCacheDir(baseUrl: string, companyId: string): string {
    const host = urlSafeBase64Encode(baseUrl);
    const comp = urlSafeBase64Encode(companyId);
    return `${documentDirectory}${ROOT_DIR}/${host}/${comp}/`;
}

function entryFileName(path: string): string {
    return `${sha256(path)}.json`;
}

async function ensureDir(dir: string): Promise<void> {
    try {
        const info = await getInfoAsync(dir);
        if (!info.exists) {
            await makeDirectoryAsync(dir, {intermediates: true});
        }
    } catch (e) {
        logDebug('[contact_disk_cache.ensureDir]', e);
    }
}

export async function readContactDiskCache(
    baseUrl: string,
    companyId: string,
    path: string,
    version: string,
): Promise<unknown | null> {
    if (!baseUrl || !companyId || !path || !version) {
        return null;
    }
    const dir = companyCacheDir(baseUrl, companyId);
    const fileUri = `${dir}${entryFileName(path)}`;
    try {
        const info = await getInfoAsync(fileUri);
        if (!info.exists || !('modificationTime' in info) || typeof info.modificationTime !== 'number') {
            return null;
        }
        const ageMs = Date.now() - (info.modificationTime * 1000);
        if (ageMs > DISK_CACHE_MAX_AGE_MS) {
            await deleteAsync(fileUri, {idempotent: true});
            return null;
        }
        const raw = await readAsStringAsync(fileUri);
        const parsed = safeParseJSON(raw) as DiskEntry | undefined;
        if (!parsed || typeof parsed.version !== 'string' || !('data' in parsed)) {
            return null;
        }
        if (parsed.version !== version) {
            return null;
        }
        return parsed.data;
    } catch (e) {
        logDebug('[contact_disk_cache.read]', e);
        return null;
    }
}

export async function writeContactDiskCache(
    baseUrl: string,
    companyId: string,
    path: string,
    version: string,
    data: unknown,
): Promise<void> {
    if (!baseUrl || !companyId || !path || !version) {
        return;
    }
    const dir = companyCacheDir(baseUrl, companyId);
    await ensureDir(dir);
    const fileUri = `${dir}${entryFileName(path)}`;
    const payload: DiskEntry = {version, data};
    try {
        await writeAsStringAsync(fileUri, JSON.stringify(payload));
    } catch (e) {
        logDebug('[contact_disk_cache.write]', e);
    }
}

async function cleanupExpiredFilesInCompanyDir(companyPath: string, now: number): Promise<void> {
    const files = await readDirectoryAsync(companyPath);
    await Promise.all(files.map(async (file) => {
        const fileUri = `${companyPath}${file}`;
        try {
            const fileInfo = await getInfoAsync(fileUri);
            if (!fileInfo.exists || !('modificationTime' in fileInfo) || typeof fileInfo.modificationTime !== 'number') {
                return;
            }
            const ageMs = now - (fileInfo.modificationTime * 1000);
            if (ageMs > DISK_CACHE_MAX_AGE_MS) {
                await deleteAsync(fileUri, {idempotent: true});
            }
        } catch {
            // 单文件失败不中断整体
        }
    }));
}

/**
 * 主动扫描并删除所有超过 7 天的磁盘缓存，避免长期未登录账号的缓存永驻。
 * 应在 init 时调用（后台执行，不阻塞启动）。
 */
export async function cleanupExpiredContactDiskCache(): Promise<void> {
    const rootDir = `${documentDirectory}${ROOT_DIR}/`;
    try {
        const rootInfo = await getInfoAsync(rootDir);
        if (!rootInfo.exists || !rootInfo.isDirectory) {
            return;
        }
        const hostDirs = await readDirectoryAsync(rootDir);
        const now = Date.now();
        await Promise.all(hostDirs.map(async (host) => {
            const hostPath = `${rootDir}${host}/`;
            try {
                const hostInfo = await getInfoAsync(hostPath);
                if (!hostInfo.exists || !hostInfo.isDirectory) {
                    return;
                }
                const companyDirs = await readDirectoryAsync(hostPath);
                await Promise.all(companyDirs.map(async (company) => {
                    const companyPath = `${hostPath}${company}/`;
                    try {
                        const companyInfo = await getInfoAsync(companyPath);
                        if (!companyInfo.exists || !companyInfo.isDirectory) {
                            return;
                        }
                        await cleanupExpiredFilesInCompanyDir(companyPath, now);
                    } catch {
                        // 单企业目录失败不中断
                    }
                }));
            } catch {
                // 单 host 目录失败不中断
            }
        }));
    } catch (e) {
        logDebug('[contact_disk_cache.cleanupExpired]', e);
    }
}

export async function clearContactDiskCacheCompany(baseUrl: string, companyId: string): Promise<void> {
    if (!baseUrl || !companyId) {
        return;
    }
    const dir = companyCacheDir(baseUrl, companyId);
    try {
        const info = await getInfoAsync(dir);
        if (!info.exists || !info.isDirectory) {
            return;
        }
        const names = await readDirectoryAsync(dir);
        await Promise.all(
            names.map((name) => deleteAsync(`${dir}${name}`, {idempotent: true}).catch(() => undefined)),
        );
    } catch (e) {
        logDebug('[contact_disk_cache.clearCompany]', e);
    }
}
