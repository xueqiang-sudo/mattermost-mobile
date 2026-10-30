// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {copyAsync, makeDirectoryAsync} from 'expo-file-system';
import {AppState, type AppStateStatus} from 'react-native';

import {updateLocalFilePath} from '@actions/local/file';
import {updateDraftFile} from '@actions/local/draft';
import {uploadFile} from '@actions/remote/file';
import {PROGRESS_TIME_TO_STORE} from '@constants/files';
import {getFullErrorMessage} from '@utils/errors';
import {getLocalFilePathFromFile} from '@utils/file';
import {logDebug} from '@utils/log';

import type {ClientResponse, ClientResponseError} from '@mattermost/react-native-network-client';

type FileHandler = {
    [clientId: string]: {
        cancel?: () => void;
        fileInfo: FileInfo;
        serverUrl: string;
        channelId: string;
        rootId: string;
        lastTimeStored: number;
        onError: Array<(msg: string) => void>;
        onProgress: Array<(p: number, b: number) => void>;
        isEditPost?: boolean;
        updateFileCallback?: (fileInfo: FileInfo) => void;
    };
}

class DraftEditPostUploadManagerSingleton {
    private handlers: FileHandler = {};
    private previousAppState: AppStateStatus;

    constructor() {
        this.previousAppState = AppState.currentState;
        AppState.addEventListener('change', this.onAppStateChange);
    }

    public prepareUpload = (
        serverUrl: string,
        file: FileInfo,
        channelId: string,
        rootId: string,
        skipBytes = 0,
        isEditPost = false,
        updateFileCallback?: (fileInfo: FileInfo) => void,
    ) => {
        this.handlers[file.clientId!] = {
            fileInfo: file,
            serverUrl,
            channelId,
            rootId,
            lastTimeStored: 0,
            onError: [],
            onProgress: [],
            isEditPost,
            updateFileCallback,
        };

        const onProgress = (progress: number, bytesRead?: number | null | undefined) => {
            this.handleProgress(file.clientId!, progress, bytesRead || 0);
        };

        const onComplete = (response: ClientResponse) => {
            this.handleComplete(response, file.clientId!);
        };

        const onError = (response: ClientResponseError) => {
            const message = response.message || 'Unkown error';
            this.handleError(message, file.clientId!);
        };

        const {error, cancel} = uploadFile(serverUrl, file, channelId, onProgress, onComplete, onError, skipBytes);
        if (error) {
            this.handleError(getFullErrorMessage(error), file.clientId!);
            return;
        }
        this.handlers[file.clientId!].cancel = cancel;
    };

    public cancel = (clientId: string) => {
        if (this.handlers[clientId]?.cancel) {
            this.handlers[clientId].cancel?.();
            delete this.handlers[clientId];
        }
    };

    public isUploading = (clientId: string) => {
        return Boolean(this.handlers[clientId]);
    };

    public registerProgressHandler = (clientId: string, callback: (progress: number, bytes: number) => void) => {
        if (!this.handlers[clientId]) {
            return undefined;
        }

        this.handlers[clientId].onProgress.push(callback);
        return () => {
            if (!this.handlers[clientId]) {
                return;
            }

            this.handlers[clientId].onProgress = this.handlers[clientId].onProgress.filter((v) => v !== callback);
        };
    };

    public registerErrorHandler = (clientId: string, callback: (errMessage: string) => void) => {
        if (!this.handlers[clientId]) {
            return undefined;
        }

        this.handlers[clientId].onError.push(callback);
        return () => {
            if (!this.handlers[clientId]) {
                return;
            }

            this.handlers[clientId].onError = this.handlers[clientId].onError.filter((v) => v !== callback);
        };
    };

    private handleProgress = (clientId: string, progress: number, bytes: number) => {
        const h = this.handlers[clientId];
        if (!h) {
            return;
        }

        h.fileInfo.bytesRead = bytes;

        h.onProgress.forEach((c) => c(progress, bytes));
        if (AppState.currentState !== 'active' && h.lastTimeStored + PROGRESS_TIME_TO_STORE < Date.now()) {
            this.handleUpdateDraftFile(h, this.handlers[clientId].fileInfo, h.isEditPost || false);
            h.lastTimeStored = Date.now();
        }
    };

    private handleComplete = async (response: ClientResponse, clientId: string) => {
        const h = this.handlers[clientId];
        if (!h) {
            return;
        }
        if (response.code !== 201) {
            this.handleError((response.data?.message as string | undefined) || 'Failed to upload the file: unknown error', clientId);
            return;
        }
        if (!response.data) {
            this.handleError('Failed to upload the file: no data received', clientId);
            return;
        }
        const data = response.data.file_infos as FileInfo[] | undefined;
        if (!data?.length) {
            this.handleError('Failed to upload the file: no data received', clientId);
            return;
        }

        delete this.handlers[clientId];

        const fileInfo = data[0];
        fileInfo.clientId = h.fileInfo.clientId;
        fileInfo.localPath = h.fileInfo.localPath;

        // Copy uploaded file to permanent storage so it doesn't need to be re-downloaded
        // when previewing. The original file might be in a temporary location (e.g., file picker cache)
        // that could be cleaned up by the system.
        if (fileInfo.id && fileInfo.localPath) {
            try {
                const permanentPath = getLocalFilePathFromFile(h.serverUrl, fileInfo);
                if (permanentPath && permanentPath !== fileInfo.localPath) {
                    // Ensure parent directory exists
                    const dir = permanentPath.replace('file://', '').replace(/\/[^/]*$/, '');
                    await makeDirectoryAsync(dir, {intermediates: true}).catch(() => {
                        // Directory might already exist, ignore error
                    });

                    // Copy file to permanent location
                    await copyAsync({
                        from: fileInfo.localPath,
                        to: permanentPath,
                    });

                    // Update localPath to point to permanent location
                    fileInfo.localPath = permanentPath;

                    // Persist the permanent path to database
                    await updateLocalFilePath(h.serverUrl, fileInfo.id, permanentPath);
                    logDebug('[Upload] File copied to permanent storage:', permanentPath);
                }
            } catch (error) {
                // If copy fails, continue with original path - file will be downloaded on demand
                logDebug('[Upload] Failed to copy file to permanent storage:', getFullErrorMessage(error));
            }
        }

        await this.handleUpdateDraftFile(h, fileInfo, h.isEditPost || false);
    };

    private handleError = async (errorMessage: string, clientId: string) => {
        const h = this.handlers[clientId];
        if (!h) {
            return;
        }

        delete this.handlers[clientId];

        h.onError.forEach((c) => c(errorMessage));

        const fileInfo = {...h.fileInfo};
        fileInfo.failed = true;
        await this.handleUpdateDraftFile(h, fileInfo, h.isEditPost || false);
    };

    private handleUpdateDraftFile = async (handler: FileHandler[string], fileInfo: FileInfo, isEditPost: boolean) => {
        if (isEditPost && handler.updateFileCallback) {
            handler.updateFileCallback(fileInfo);
        } else {
            await updateDraftFile(handler.serverUrl, handler.channelId, handler.rootId, fileInfo);
        }
    };

    private onAppStateChange = async (appState: AppStateStatus) => {
        if (appState !== 'active' && this.previousAppState === 'active') {
            await this.storeProgress();
        }

        this.previousAppState = appState;
    };

    private storeProgress = async () => {
        for (const h of Object.values(this.handlers)) {
            // eslint-disable-next-line no-await-in-loop
            await this.handleUpdateDraftFile(h, h.fileInfo, h.isEditPost || false);
            h.lastTimeStored = Date.now();
        }
    };
}

const DraftEditPostUploadManager = new DraftEditPostUploadManagerSingleton();
export default DraftEditPostUploadManager;

export const exportedForTesting = {
    DraftEditPostUploadManagerSingleton,
};
