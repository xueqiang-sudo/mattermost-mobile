// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useRef} from 'react';
import {useIntl} from 'react-intl';
import {DeviceEventEmitter} from 'react-native';

import {addFilesToDraft, removeDraft, removeDraftFile, updateDraftFile} from '@actions/local/draft';
import {uploadFile} from '@actions/remote/file';
import {createPost} from '@actions/remote/post';
import {Events, Screens} from '@constants';
import {MESSAGE_TYPE, SNACK_BAR_TYPE} from '@constants/snack_bar';
import {useServerUrl} from '@context/server';
import useFileUploadError from '@hooks/file_upload_error';
import DraftEditPostUploadManager from '@managers/draft_upload_manager';
import {getErrorMessage} from '@utils/errors';
import {
    clearDraftVideoProcessingAborted,
    isDraftVideoLocalProcessingFile,
    isDraftVideoProcessingAborted,
    markDraftVideoProcessingAborted,
    type DraftVideoProcessingBridge,
} from '@utils/file/draft_video_local_processing';
import {fileMaxWarning, fileSizeWarning, getExtensionFromMime, uploadDisabledWarning} from '@utils/file';
import {logError} from '@utils/log';
import {showSnackBar} from '@utils/snack_bar';

import SendHandler from '../send_handler';

import type {ErrorHandlers} from '@typings/components/upload_error_handlers';

type Props = {
    testID?: string;
    channelId: string;
    cursorPosition: number;
    rootId?: string;
    quotedPostId?: string;
    canShowPostPriority?: boolean;
    files?: FileInfo[];
    maxFileCount: number;
    maxFileSize: number;
    canUploadFiles: boolean;
    currentUserId: string;
    updateCursorPosition: React.Dispatch<React.SetStateAction<number>>;
    updatePostInputTop: (top: number) => void;
    updateValue: React.Dispatch<React.SetStateAction<string>>;
    value: string;
    setIsFocused: (isFocused: boolean) => void;
    useChatInputStyle?: boolean;
}

const emptyFileList: FileInfo[] = [];

export default function DraftHandler(props: Props) {
    const {
        testID,
        channelId,
        cursorPosition,
        rootId = '',
        quotedPostId = '',
        canShowPostPriority,
        files,
        maxFileCount,
        maxFileSize,
        canUploadFiles,
        currentUserId,
        updateCursorPosition,
        updatePostInputTop,
        updateValue,
        value,
        setIsFocused,
        useChatInputStyle,
    } = props;

    const serverUrl = useServerUrl();
    const intl = useIntl();

    const uploadErrorHandlers = useRef<ErrorHandlers>({});
    const {uploadError, newUploadError} = useFileUploadError();

    const clearDraft = useCallback(() => {
        removeDraft(serverUrl, channelId, rootId);
        updateValue('');
    }, [serverUrl, channelId, rootId]);

    const addFiles = useCallback((newFiles: FileInfo[]) => {
        if (!newFiles.length) {
            return;
        }

        if (!canUploadFiles) {
            newUploadError(uploadDisabledWarning(intl));
            return;
        }

        const currentFileCount = files?.length || 0;
        const availableCount = maxFileCount - currentFileCount;
        if (newFiles.length > availableCount) {
            newUploadError(fileMaxWarning(intl, maxFileCount));
            return;
        }

        const largeFile = newFiles.find((file) => file.size > maxFileSize);
        if (largeFile) {
            newUploadError(fileSizeWarning(intl, maxFileSize));
            return;
        }

        addFilesToDraft(serverUrl, channelId, rootId, newFiles);

        for (const file of newFiles) {
            if (isDraftVideoLocalProcessingFile(file)) {
                continue;
            }
            DraftEditPostUploadManager.prepareUpload(serverUrl, file, channelId, rootId);
            uploadErrorHandlers.current[file.clientId!] = DraftEditPostUploadManager.registerErrorHandler(file.clientId!, newUploadError);
        }

        newUploadError(null);
    }, [intl, newUploadError, maxFileSize, serverUrl, files?.length, channelId, rootId]);

    const addVideoPlaceholder = useCallback((file: FileInfo) => {
        if (!canUploadFiles) {
            newUploadError(uploadDisabledWarning(intl));
            return;
        }

        const currentFileCount = files?.length || 0;
        const availableCount = maxFileCount - currentFileCount;
        if (availableCount < 1) {
            newUploadError(fileMaxWarning(intl, maxFileCount));
            return;
        }

        if (file.clientId) {
            clearDraftVideoProcessingAborted(file.clientId);
        }

        void addFilesToDraft(serverUrl, channelId, rootId, [file]);
        newUploadError(null);
    }, [canUploadFiles, channelId, files?.length, intl, maxFileCount, newUploadError, rootId, serverUrl]);

    const updateVideoPlaceholder = useCallback(async (clientId: string, file: FileInfo) => {
        await updateDraftFile(serverUrl, channelId, rootId, file);
    }, [serverUrl, channelId, rootId]);

    const removeVideoPlaceholder = useCallback((clientId: string) => {
        markDraftVideoProcessingAborted(clientId);
        void removeDraftFile(serverUrl, channelId, rootId, clientId);
    }, [serverUrl, channelId, rootId]);

    const completeVideoProcessing = useCallback((clientId: string, extracted: ExtractedFileInfo[]) => {
        if (isDraftVideoProcessingAborted(clientId)) {
            clearDraftVideoProcessingAborted(clientId);
            return;
        }

        const x = extracted[0];
        if (!x?.name || !x.mime_type) {
            void removeDraftFile(serverUrl, channelId, rootId, clientId);
            clearDraftVideoProcessingAborted(clientId);
            return;
        }

        const ext = getExtensionFromMime(x.mime_type) || x.name.split('.').pop() || 'mp4';
        const merged: FileInfo = {
            ...x,
            clientId,
            user_id: currentUserId,
            extension: ext,
            has_preview_image: x.has_preview_image ?? false,
            height: typeof x.height === 'number' ? x.height : 0,
            width: typeof x.width === 'number' ? x.width : 0,
            size: x.size ?? 0,
            name: x.name,
            mime_type: x.mime_type,
            localPath: x.localPath,
            uri: x.uri,
        };

        if (merged.size > maxFileSize) {
            void removeDraftFile(serverUrl, channelId, rootId, clientId);
            newUploadError(fileSizeWarning(intl, maxFileSize));
            clearDraftVideoProcessingAborted(clientId);
            return;
        }

        void updateDraftFile(serverUrl, channelId, rootId, merged).then(({error}) => {
            if (error || isDraftVideoProcessingAborted(clientId)) {
                clearDraftVideoProcessingAborted(clientId);
                return;
            }
            DraftEditPostUploadManager.prepareUpload(serverUrl, merged, channelId, rootId);
            uploadErrorHandlers.current[merged.clientId!] = DraftEditPostUploadManager.registerErrorHandler(merged.clientId!, newUploadError);
            clearDraftVideoProcessingAborted(clientId);
        });
        newUploadError(null);
    }, [channelId, currentUserId, intl, maxFileSize, newUploadError, rootId, serverUrl]);

    const draftVideoProcessingBridge: DraftVideoProcessingBridge = useMemo(() => ({
        currentUserId,
        addVideoPlaceholder,
        updateVideoPlaceholder,
        completeVideoProcessing,
        removeVideoPlaceholder,
    }), [addVideoPlaceholder, completeVideoProcessing, currentUserId, removeVideoPlaceholder, updateVideoPlaceholder]);

    /** Upload one image and post it immediately (WeChat-style local sticker); does not touch draft text or draft files. */
    const sendStandaloneStickerImage = useCallback(async (file: FileInfo) => {
        if (!canUploadFiles) {
            newUploadError(uploadDisabledWarning(intl));
            return;
        }
        if (file.size > maxFileSize) {
            newUploadError(fileSizeWarning(intl, maxFileSize));
            return;
        }
        newUploadError(null);
        try {
            const uploaded = await new Promise<FileInfo>((resolve, reject) => {
                const {error} = uploadFile(
                    serverUrl,
                    file,
                    channelId,
                    () => {/* progress */},
                    (response) => {
                        if (response.code !== 201 || !response.data?.file_infos?.length) {
                            reject(new Error((response.data?.message as string) || 'Failed to upload image'));
                            return;
                        }
                        const fi = response.data.file_infos[0] as FileInfo;
                        fi.clientId = file.clientId;
                        fi.localPath = file.localPath;
                        resolve(fi);
                    },
                    (err) => reject(new Error(err?.message || 'Upload failed')),
                );
                if (error) {
                    reject(error);
                }
            });
            const post = {
                user_id: currentUserId,
                channel_id: channelId,
                root_id: rootId,
                message: '',
            } as Post;
            await createPost(serverUrl, post, [uploaded]);
            DeviceEventEmitter.emit(Events.POST_LIST_SCROLL_TO_BOTTOM, Screens.CHANNEL);
        } catch (err) {
            logError('[sendStandaloneStickerImage]', err);
            showSnackBar({
                barType: SNACK_BAR_TYPE.CREATE_POST_ERROR,
                customMessage: getErrorMessage(err),
                type: MESSAGE_TYPE.ERROR,
            });
        }
    }, [canUploadFiles, channelId, currentUserId, intl, maxFileSize, newUploadError, rootId, serverUrl]);

    // This effect mainly handles keeping clean the uploadErrorHandlers, and
    // reinstantiate them on component mount and file retry.
    useEffect(() => {
        let loadingFiles: FileInfo[] = [];
        if (files) {
            loadingFiles = files.filter((v) => v.clientId && DraftEditPostUploadManager.isUploading(v.clientId));
        }

        for (const key of Object.keys(uploadErrorHandlers.current)) {
            if (!loadingFiles.find((v) => v.clientId === key)) {
                uploadErrorHandlers.current[key]?.();
                delete (uploadErrorHandlers.current[key]);
            }
        }

        for (const file of loadingFiles) {
            if (!uploadErrorHandlers.current[file.clientId!]) {
                uploadErrorHandlers.current[file.clientId!] = DraftEditPostUploadManager.registerErrorHandler(file.clientId!, newUploadError);
            }
        }
    }, [files]);

    return (
        <SendHandler
            testID={testID}
            channelId={channelId}
            rootId={rootId}
            quotedPostId={quotedPostId}
            canShowPostPriority={canShowPostPriority}
            useChatInputStyle={useChatInputStyle}

            // From draft handler
            cursorPosition={cursorPosition}
            value={value}
            files={files || emptyFileList}
            clearDraft={clearDraft}
            addFiles={addFiles}
            draftVideoProcessingBridge={draftVideoProcessingBridge}
            uploadFileError={uploadError}
            updateCursorPosition={updateCursorPosition}
            updatePostInputTop={updatePostInputTop}
            updateValue={updateValue}
            setIsFocused={setIsFocused}
            sendStandaloneStickerImage={sendStandaloneStickerImage}
        />
    );
}
