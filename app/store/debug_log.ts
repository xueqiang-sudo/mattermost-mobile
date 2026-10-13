// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * Global debug log for diagnosing login/entry/team-loading issues.
 * Collects timestamped messages from key points in the app flow.
 * Displayed on the DebugScreen when errors occur.
 *
 * 日志同时写入内存和文件，即使 app 卡死重启，文件日志依然保留。
 */

import {cacheDirectory, writeAsStringAsync, readAsStringAsync, deleteAsync, makeDirectoryAsync, getInfoAsync} from 'expo-file-system';

export type DebugEntry = {
    time: string;
    tag: string;
    message: string;
}

const MAX_ENTRIES = 200;
const entries: DebugEntry[] = [];

// 文件日志路径
const LOG_DIR = cacheDirectory ? `${cacheDirectory}debug_logs` : '';
const LOG_FILE = LOG_DIR ? `${LOG_DIR}/app_debug.log` : '';
let fileLogReady = false;
let fileLogInitStarted = false;

// 初始化日志目录
async function initLogDir() {
    if (!LOG_DIR || fileLogInitStarted) return;
    fileLogInitStarted = true;
    try {
        const info = await getInfoAsync(LOG_DIR);
        if (!info.exists) {
            await makeDirectoryAsync(LOG_DIR, {intermediates: true});
        }
        fileLogReady = true;
    } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('debug_log: failed to init log dir', e);
    }
}

// 启动时初始化
initLogDir();

export function debugLog(tag: string, message: string) {
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
    entries.push({time, tag, message});
    if (entries.length > MAX_ENTRIES) {
        entries.shift();
    }

    // eslint-disable-next-line no-console
    console.log(`[${time}] [${tag}] ${message}`);

    // 写入文件（异步追加）
    if (fileLogReady && LOG_FILE) {
        const line = `[${time}] [${tag}] ${message}\n`;
        readAsStringAsync(LOG_FILE).then((existing) => {
            const maxFileSize = 100 * 1024; // 100KB 限制
            let content = (existing || '') + line;
            if (content.length > maxFileSize) {
                // 保留后半部分
                content = content.slice(content.length - maxFileSize);
            }
            writeAsStringAsync(LOG_FILE, content);
        }).catch(() => {
            writeAsStringAsync(LOG_FILE, line);
        });
    }
}

export function getDebugEntries(): DebugEntry[] {
    return [...entries];
}

export function clearDebugLog() {
    entries.length = 0;
    if (LOG_FILE) {
        deleteAsync(LOG_FILE).catch(() => {});
    }
}

/**
 * 从文件读取持久化的日志（app 重启后调用）
 */
export async function readPersistedLog(): Promise<string> {
    if (!LOG_FILE) return '';
    try {
        return await readAsStringAsync(LOG_FILE);
    } catch {
        return '';
    }
}
