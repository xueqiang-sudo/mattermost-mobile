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
        // 把初始化完成前积攒的启动期日志补写一次。
        flushToFile();
    } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('debug_log: failed to init log dir', e);
    }
}

// 串行写入队列：所有写操作排成一条 Promise 链，杜绝并发（旧实现「先读整个文件
// 再写」的并发会互相覆盖，导致崩溃前的日志大量丢失）。每条日志入队后立即触发写，
// 内存里的 entries 即全量日志源，直接写它、不再 readAsStringAsync。
let writeChain: Promise<void> = Promise.resolve();

function flushToFile() {
    if (!fileLogReady || !LOG_FILE) {
        return;
    }
    // 用当前内存快照拼出全量内容（entries 已按 MAX_ENTRIES 截断）。
    const snapshot = entries.map((e) => `[${e.time}] [${e.tag}] ${e.message}`).join('\n') + '\n';
    writeChain = writeChain.
        then(() => writeAsStringAsync(LOG_FILE, snapshot)).
        catch(() => {
            // 单次写失败不阻断后续写入
        });
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

    // 立即把当前全量日志排队写入文件（串行、不并发覆盖）。
    flushToFile();
}

export function getDebugEntries(): DebugEntry[] {
    return [...entries];
}

export function clearDebugLog() {
    entries.length = 0;
    if (LOG_FILE) {
        // 排进同一条链，避免与排队中的写入竞态。
        writeChain = writeChain.
            then(() => deleteAsync(LOG_FILE, {idempotent: true})).
            catch(() => {
                // 删除失败忽略
            });
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
