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
        console.log('[debug_log] Initializing log directory:', LOG_DIR);
        const info = await getInfoAsync(LOG_DIR);
        if (!info.exists) {
            await makeDirectoryAsync(LOG_DIR, {intermediates: true});
            console.log('[debug_log] Created log directory');
        }
        fileLogReady = true;
        console.log('[debug_log] Log directory ready');
        // 把初始化完成前积攒的启动期日志补写一次。
        flushToFile();
    } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('debug_log: failed to init log dir', e);
    }
}

// 检查日志系统是否就绪
export function isLogSystemReady(): boolean {
    return fileLogReady && Boolean(LOG_FILE);
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

// 把任意值安全转成字符串，供日志展示/写盘。对象 → JSON，循环引用兜底为 String()。
// 关键：entries[].message 必须永远是 string，否则 DebugScreen 的 <Text>{message}</Text>
// 渲染到对象会直接崩溃（"Objects are not valid as a React child"）。
function stringifyArg(value: unknown): string {
    if (typeof value === 'string') {
        return value;
    }
    if (value instanceof Error) {
        return value.message;
    }
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

export function debugLog(tag: string, ...args: unknown[]) {
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
    const messageStr = args.map(stringifyArg).join(' ');
    entries.push({time, tag, message: messageStr});
    if (entries.length > MAX_ENTRIES) {
        entries.shift();
    }

    // eslint-disable-next-line no-console
    console.log(`[${time}] [${tag}] ${messageStr}`);

    // 立即把当前全量日志排队写入文件（串行、不并发覆盖）。
    flushToFile();
}

// 同步等待日志写入完成（用于关键原生调用前，确保崩溃时日志已落盘）
export async function flushLogsToDisk(): Promise<void> {
    // 【关键修复】如果日志目录尚未初始化，先等待初始化完成
    if (!fileLogReady || !LOG_FILE) {
        // 等待初始化完成（最多等待 2 秒）
        const startTime = Date.now();
        while (!fileLogReady && Date.now() - startTime < 2000) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        // 如果仍然未就绪，记录警告并返回
        if (!fileLogReady || !LOG_FILE) {
            console.warn('[flushLogsToDisk] Log directory not ready after 2s, skipping flush');
            return;
        }
    }

    // 等待当前写入链完成
    await writeChain;

    // 强制立即写入一次
    const snapshot = entries.map((e) => `[${e.time}] [${e.tag}] ${e.message}`).join('\n') + '\n';
    try {
        await writeAsStringAsync(LOG_FILE, snapshot);
        // 【关键修复】确保写入真正完成
        await new Promise(resolve => setTimeout(resolve, 100));
    } catch (e) {
        console.warn('[flushLogsToDisk] Failed to write logs:', e);
    }
}

// 【关键修复】强制同步写入（用于极端情况，会阻塞 JS 线程）
// 警告：这会阻塞 UI，只在即将调用危险的原生模块前使用
export function forceSyncFlush(): void {
    if (!fileLogReady || !LOG_FILE) {
        return;
    }

    // 同步写入（注意：这会阻塞 JS 线程）
    const snapshot = entries.map((e) => `[${e.time}] [${e.tag}] ${e.message}`).join('\n') + '\n';

    // 使用同步 API（如果可用）
    // 注意：expo-file-system 没有同步写入 API，所以我们只能确保异步写入队列被触发
    flushToFile();

    // 给一点点时间让写入开始（虽然不能完全保证完成）
    // 这是最后的防线
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
