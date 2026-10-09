// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useRef} from 'react';
import {useIntl} from 'react-intl';
import {DeviceEventEmitter, Image} from 'react-native';

import {addFilesToDraft, removeDraft, removeDraftFile, updateDraftFile} from '@actions/local/draft';
import {uploadFile} from '@actions/remote/file';
import {createPost, updatePostFileIds, markPostUploadFailed} from '@actions/remote/post';
import DatabaseManager from '@database/manager';
import {Events, Screens} from '@constants';
import {MESSAGE_TYPE, SNACK_BAR_TYPE} from '@constants/snack_bar';
import {useServerUrl} from '@context/server';
import useFileUploadError from '@hooks/file_upload_error';
import DraftEditPostUploadManager from '@managers/draft_upload_manager';
import {debugLog} from '@store/debug_log';
import {getErrorMessage} from '@utils/errors';
import {
    clearDraftVideoProcessingAborted,
    isDraftVideoLocalProcessingFile,
    isDraftVideoProcessingAborted,
    markDraftVideoProcessingAborted,
    type DraftVideoProcessingBridge,
} from '@utils/file/draft_video_local_processing';
import {fileMaxWarning, fileSizeWarning, getExtensionFromMime, uploadDisabledWarning} from '@utils/file';
import {generateId} from '@utils/general';
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

    // Helper function to get image dimensions
    const getImageDimensions = (uri: string): Promise<{width: number; height: number}> => {
        return new Promise((resolve) => {
            Image.getSize(
                uri,
                (width, height) => resolve({width, height}),
                () => resolve({width: 800, height: 600}), // Default on error
            );
        });
    };

    const addFiles = useCallback((newFiles: FileInfo[]) => {
        debugLog('ADD_FILES', `called with ${newFiles.length} files`);
        if (!newFiles.length) {
            debugLog('ADD_FILES', 'no files, returning');
            return;
        }

        if (!canUploadFiles) {
            debugLog('ADD_FILES', 'canUploadFiles is false');
            newUploadError(uploadDisabledWarning(intl));
            return;
        }

        const currentFileCount = files?.length || 0;
        const availableCount = maxFileCount - currentFileCount;
        if (newFiles.length > availableCount) {
            debugLog('ADD_FILES', `too many files: ${newFiles.length} > ${availableCount}`);
            newUploadError(fileMaxWarning(intl, maxFileCount));
            return;
        }

        const largeFile = newFiles.find((file) => file.size > maxFileSize);
        if (largeFile) {
            debugLog('ADD_FILES', `file too large: ${largeFile.name} ${largeFile.size}`);
            newUploadError(fileSizeWarning(intl, maxFileSize));
            return;
        }

        debugLog('ADD_FILES', `starting auto-send for ${newFiles.length} files`);

        // Optimistic UI: create posts immediately, upload files in background
        void (async () => {
            try {
                // Filter out video processing files
                const filesToUpload = newFiles.filter(file => !isDraftVideoLocalProcessingFile(file));

                if (filesToUpload.length === 0) {
                    debugLog('ADD_FILES', 'no files to upload');
                    return;
                }

                // Generate batch ID for grouping these posts (only for multiple files)
                const batchId = filesToUpload.length > 1 ? `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` : undefined;
                debugLog('ADD_FILES', `creating ${filesToUpload.length} posts immediately${batchId ? ` with batchId: ${batchId}` : ''}`);

                // Create posts immediately with local file references (optimistic UI)
                const pendingPosts: Array<{postId: string; file: FileInfo}> = [];

                for (const file of filesToUpload) {
                    // Generate pending ID for the file (not uploaded yet)
                    const pendingFileId = `pending_${generateId()}`;

                    // Generate pending post ID so we can track it for updates
                    const timestamp = Date.now();
                    const pendingPostId = `${currentUserId}:${timestamp}`;

                    // Extract extension from filename
                    const fileName = file.name || '';
                    const extension = fileName.includes('.') ? fileName.split('.').pop() || '' : '';

                    debugLog('ADD_FILES', `preparing file: ${fileName}, extension: ${extension}, size: ${file.size}, mime: ${file.mime_type}, width: ${file.width}, height: ${file.height}`);

                    // Determine if this is an image and set has_preview_image accordingly
                    // This prevents layout shifts when the post is updated after upload
                    const isImageFile = file.mime_type?.startsWith('image/') || extension.match(/^(jpg|jpeg|png|gif|webp|heic|heif)$/i);
                    const hasPreviewImage = Boolean(isImageFile);

                    // Get actual dimensions from file picker or read from image file
                    let fileWidth = file.width;
                    let fileHeight = file.height;

                    if (isImageFile && (!fileWidth || !fileHeight)) {
                        // Try to get dimensions from the image file
                        const imageUri = file.localPath || file.uri || '';
                        if (imageUri) {
                            const dimensions = await getImageDimensions(imageUri);
                            fileWidth = dimensions.width;
                            fileHeight = dimensions.height;
                            debugLog('ADD_FILES', `got dimensions from image: ${fileWidth}x${fileHeight}`);
                        }
                    }

                    // Use defaults if still not available
                    fileWidth = fileWidth || (isImageFile ? 800 : 100);
                    fileHeight = fileHeight || (isImageFile ? 600 : 100);

                    // Ensure FileInfo has all required fields for database storage
                    // Important: Set required fields explicitly, don't rely on spread
                    const localFile: FileInfo = {
                        ...file, // Spread original file first to preserve any fields
                        id: pendingFileId,
                        post_id: '', // Will be set by createPost
                        user_id: currentUserId,
                        name: fileName,
                        extension,
                        size: file.size || 0,
                        mime_type: file.mime_type || 'application/octet-stream',
                        has_preview_image: hasPreviewImage, // Set correctly from the start to avoid layout shifts
                        height: fileHeight,
                        width: fileWidth,
                        localPath: file.localPath || file.uri || '',
                        uri: file.uri || '',
                        create_at: Date.now(),
                        update_at: Date.now(),
                    };

                    debugLog('ADD_FILES', `localFile created: id=${localFile.id}, name=${localFile.name}, localPath=${localFile.localPath}, dimensions: ${localFile.width}x${localFile.height}, hasPreview: ${localFile.has_preview_image}`);

                    const post = {
                        pending_post_id: pendingPostId, // Provide the pending ID so we know what it is
                        user_id: currentUserId,
                        channel_id: channelId,
                        root_id: rootId,
                        message: '',
                        props: batchId ? {
                            batch_id: batchId,
                            batch_size: filesToUpload.length,
                            upload_status: 'uploading', // Mark as uploading
                        } : {
                            upload_status: 'uploading', // Mark as uploading
                        },
                    } as Post;

                    debugLog('ADD_FILES', `creating post immediately for file: ${file.name} with pendingPostId: ${pendingPostId}`);
                    const result = await createPost(serverUrl, post, [localFile]);
                    if (result.error) {
                        debugLog('ADD_FILES', `createPost failed for ${file.name}: ${result.error}`);
                        throw result.error;
                    }

                    if (result.data?.postId) {
                        const realPostId = result.data.postId;
                        debugLog('ADD_FILES', `post created successfully, realPostId: ${realPostId} (was pending: ${pendingPostId})`);
                        pendingPosts.push({
                            postId: realPostId,
                            file: localFile,
                        });
                    } else {
                        debugLog('ADD_FILES', `createPost returned no postId for ${file.name}, using pendingPostId: ${pendingPostId}`);
                        pendingPosts.push({
                            postId: pendingPostId,
                            file: localFile,
                        });
                    }
                }

                debugLog('ADD_FILES', `created ${pendingPosts.length} pending posts, starting background uploads`);

                // Emit scroll to bottom immediately so user sees their posts
                DeviceEventEmitter.emit(Events.POST_LIST_SCROLL_TO_BOTTOM, Screens.CHANNEL);

                // Store batch info for undo functionality (only for multiple files)
                if (pendingPosts.length > 0 && batchId) {
                    DeviceEventEmitter.emit(Events.POST_BATCH_CREATED, {
                        batchId,
                        postIds: pendingPosts.map(p => p.postId),
                        channelId,
                    });
                }

                // Upload files in background and update posts
                for (const {postId, file} of pendingPosts) {
                    debugLog('ADD_FILES', `uploading file in background: ${file.name}`);

                    try {
                        const uploadedFile = await new Promise<FileInfo>((resolve, reject) => {
                            const {error} = uploadFile(
                                serverUrl,
                                file,
                                channelId,
                                () => {/* progress */},
                                (response) => {
                                    debugLog('ADD_FILES', `upload response for ${file.name}: ${response.code}`);
                                    if (response.code !== 201 || !response.data?.file_infos?.length) {
                                        const errorMsg = (response.data?.message as string) || intl.formatMessage({id: 'mobile.post.upload_failed', defaultMessage: 'Failed to upload file'});
                                        reject(new Error(errorMsg));
                                        return;
                                    }
                                    const fi = response.data.file_infos[0] as FileInfo;
                                    fi.clientId = file.clientId;
                                    fi.localPath = file.localPath;
                                    // Preserve dimensions and mime_type from local file if server doesn't provide them
                                    if (!fi.width && file.width) {
                                        fi.width = file.width;
                                    }
                                    if (!fi.height && file.height) {
                                        fi.height = file.height;
                                    }
                                    if (!fi.mime_type && file.mime_type) {
                                        fi.mime_type = file.mime_type;
                                    }
                                    if (!fi.extension && file.extension) {
                                        fi.extension = file.extension;
                                    }
                                    if (!fi.name && file.name) {
                                        fi.name = file.name;
                                    }
                                    resolve(fi);
                                },
                                (err) => {
                                    const errorMsg = err?.message || intl.formatMessage({id: 'mobile.post.upload_failed', defaultMessage: 'Failed to upload file'});
                                    reject(new Error(errorMsg));
                                },
                            );
                            if (error) {
                                reject(error);
                            }
                        });

                        // Update post with real file ID
                        debugLog('ADD_FILES', `upload complete for ${file.name}, updating post ${postId}, uploadedFile: id=${uploadedFile.id}, name=${uploadedFile.name}, localPath=${uploadedFile.localPath}`);
                        await updatePostFileIds(serverUrl, postId, [uploadedFile]);
                        debugLog('ADD_FILES', `post ${postId} updated successfully with file ${uploadedFile.id}`);

                    } catch (uploadErr) {
                        debugLog('ADD_FILES', `upload failed for ${file.name}: ${uploadErr}`);
                        logError('[addFiles background upload]', uploadErr);
                        // Mark post as failed (don't throw, continue with other files)
                        await markPostUploadFailed(serverUrl, postId, file.name);
                    }
                }

                debugLog('ADD_FILES', `all background uploads completed`);

            } catch (err) {
                debugLog('ADD_FILES', `error: ${err}`);
                logError('[addFiles optimistic]', err);
                showSnackBar({
                    barType: SNACK_BAR_TYPE.CREATE_POST_ERROR,
                    customMessage: getErrorMessage(err),
                    type: MESSAGE_TYPE.ERROR,
                });
            }
        })();

        newUploadError(null);
    }, [intl, newUploadError, maxFileSize, serverUrl, files?.length, channelId, rootId, currentUserId]);

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
                            const errorMsg = (response.data?.message as string) || intl.formatMessage({id: 'mobile.post.upload_failed', defaultMessage: 'Failed to upload file'});
                            reject(new Error(errorMsg));
                            return;
                        }
                        const fi = response.data.file_infos[0] as FileInfo;
                        fi.clientId = file.clientId;
                        fi.localPath = file.localPath;
                        // Preserve dimensions and mime_type from local file if server doesn't provide them
                        if (!fi.width && file.width) {
                            fi.width = file.width;
                        }
                        if (!fi.height && file.height) {
                            fi.height = file.height;
                        }
                        if (!fi.mime_type && file.mime_type) {
                            fi.mime_type = file.mime_type;
                        }
                        if (!fi.extension && file.extension) {
                            fi.extension = file.extension;
                        }
                        if (!fi.name && file.name) {
                            fi.name = file.name;
                        }
                        resolve(fi);
                    },
                    (err) => {
                        const errorMsg = err?.message || intl.formatMessage({id: 'mobile.post.upload_failed', defaultMessage: 'Failed to upload file'});
                        reject(new Error(errorMsg));
                    },
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
