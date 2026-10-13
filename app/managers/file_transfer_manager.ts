// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {downloadFile} from '@actions/remote/file';
import {getLocalFilePathFromFile} from '@utils/file';

import type {ProgressPromise} from '@mattermost/react-native-network-client';
import type {ClientResponse} from '@mattermost/react-native-network-client/lib/typescript/src/types';

export type DownloadState = {
    fileId: string;
    status: 'downloading' | 'completed' | 'failed';
    progress: number;
    error?: string;
};

type Subscriber = (state: DownloadState) => void;

class FileTransferManager {
    private static instance: FileTransferManager;
    private downloads: Map<string, DownloadState> = new Map();
    private subscribers: Map<string, Set<Subscriber>> = new Map();
    private activeDownloads: Map<string, ProgressPromise<ClientResponse>> = new Map();
    private maxConcurrent = 3;
    private queue: Array<{serverUrl: string; file: FileInfo}> = [];

    private constructor() {}

    static getInstance(): FileTransferManager {
        if (!FileTransferManager.instance) {
            FileTransferManager.instance = new FileTransferManager();
        }
        return FileTransferManager.instance;
    }

    async startDownload(serverUrl: string, file: FileInfo): Promise<void> {
        if (!file.id) {
            return;
        }

        // 已经在下载或已完成
        const existing = this.downloads.get(file.id);
        if (existing && (existing.status === 'downloading' || existing.status === 'completed')) {
            return;
        }

        // 检查本地文件是否已存在
        const localPath = getLocalFilePathFromFile(serverUrl, file);
        if (localPath) {
            const {fileExists} = await import('@utils/file');
            if (await fileExists(localPath)) {
                this.downloads.set(file.id, {
                    fileId: file.id,
                    status: 'completed',
                    progress: 1,
                });
                this.notifySubscribers(file.id);
                return;
            }
        }

        // 并发限制
        if (this.activeDownloads.size >= this.maxConcurrent) {
            this.queue.push({serverUrl, file});
            return;
        }

        // 开始下载
        const state: DownloadState = {
            fileId: file.id,
            status: 'downloading',
            progress: 0,
        };
        this.downloads.set(file.id, state);
        this.notifySubscribers(file.id);

        try {
            const downloadPromise = downloadFile(serverUrl, file.id, localPath);
            this.activeDownloads.set(file.id, downloadPromise);

            downloadPromise.progress((progress: number) => {
                const currentState = this.downloads.get(file.id);
                if (currentState && currentState.status === 'downloading') {
                    currentState.progress = progress;
                    this.notifySubscribers(file.id);
                }
            });

            await downloadPromise;

            this.downloads.set(file.id, {
                fileId: file.id,
                status: 'completed',
                progress: 1,
            });
            this.notifySubscribers(file.id);
        } catch (error) {
            this.downloads.set(file.id, {
                fileId: file.id,
                status: 'failed',
                progress: 0,
                error: error instanceof Error ? error.message : 'Download failed',
            });
            this.notifySubscribers(file.id);
        } finally {
            this.activeDownloads.delete(file.id);
            this.processQueue();
        }
    }

    private processQueue(): void {
        if (this.queue.length > 0 && this.activeDownloads.size < this.maxConcurrent) {
            const next = this.queue.shift();
            if (next) {
                this.startDownload(next.serverUrl, next.file);
            }
        }
    }

    getDownloadStatus(fileId: string): DownloadState | undefined {
        return this.downloads.get(fileId);
    }

    subscribe(fileId: string, callback: Subscriber): () => void {
        if (!this.subscribers.has(fileId)) {
            this.subscribers.set(fileId, new Set());
        }
        this.subscribers.get(fileId)!.add(callback);

        // 立即发送当前状态
        const currentState = this.downloads.get(fileId);
        if (currentState) {
            callback(currentState);
        }

        return () => {
            const subs = this.subscribers.get(fileId);
            if (subs) {
                subs.delete(callback);
                if (subs.size === 0) {
                    this.subscribers.delete(fileId);
                }
            }
        };
    }

    private notifySubscribers(fileId: string): void {
        const state = this.downloads.get(fileId);
        const subs = this.subscribers.get(fileId);
        if (state && subs) {
            subs.forEach((callback) => callback(state));
        }
    }
}

export default FileTransferManager.getInstance();
