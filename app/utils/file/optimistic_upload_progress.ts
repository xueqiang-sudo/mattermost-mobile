// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * 轻量上传进度发布器（乐观发送专用）
 *
 * 用于 addFiles 乐观发送流程：点发送立即创建一条 pending post，文件后台逐个上传。
 * 渲染层（files.tsx / File）按文件的 clientId 订阅进度，显示各自的进度条。
 *
 * 不复用 DraftEditPostUploadManager，因为那个管理器在上传完成/失败时会写回草稿
 * (updateDraftFile)，与乐观体系（直接更新 pending post）冲突。这里只做纯粹的
 * 进度发布/订阅，不触碰数据库。
 */

type ProgressCallback = (progress: number) => void;

type Entry = {
    progress: number;
    failed: boolean;
    callbacks: Set<ProgressCallback>;
};

const entries = new Map<string, Entry>();

const getOrCreate = (clientId: string): Entry => {
    let entry = entries.get(clientId);
    if (!entry) {
        entry = {progress: 0, failed: false, callbacks: new Set()};
        entries.set(clientId, entry);
    }
    return entry;
};

/** 标记某文件开始上传（重置进度）。 */
export const startProgress = (clientId: string) => {
    const entry = getOrCreate(clientId);
    entry.progress = 0;
    entry.failed = false;
};

/** 上报上传进度（progress 为 0~1）。 */
export const emitProgress = (clientId: string, progress: number) => {
    const entry = getOrCreate(clientId);
    entry.progress = progress;
    entry.callbacks.forEach((cb) => cb(progress));
};

/** 标记上传完成并清理订阅表。 */
export const completeProgress = (clientId: string) => {
    const entry = entries.get(clientId);
    if (!entry) {
        return;
    }
    entry.progress = 1;
    entry.callbacks.forEach((cb) => cb(1));
    entries.delete(clientId);
};

/** 标记上传失败。保留 entry 以便渲染层读取失败态。 */
export const failProgress = (clientId: string) => {
    const entry = getOrCreate(clientId);
    entry.failed = true;
    entry.callbacks.forEach((cb) => cb(entry.progress));
};

/** 是否仍在上传中（存在未完成的 entry）。 */
export const isUploading = (clientId: string): boolean => {
    return entries.has(clientId);
};

/** 读取当前进度快照。 */
export const getProgress = (clientId: string): number => {
    return entries.get(clientId)?.progress ?? 0;
};

/**
 * 订阅某文件的进度更新。返回取消订阅函数。
 * 订阅时会立即用当前进度回调一次，避免错过已发生的进度。
 */
export const subscribeProgress = (clientId: string, callback: ProgressCallback): (() => void) => {
    const entry = getOrCreate(clientId);
    entry.callbacks.add(callback);
    callback(entry.progress);

    return () => {
        const current = entries.get(clientId);
        current?.callbacks.delete(callback);
    };
};
