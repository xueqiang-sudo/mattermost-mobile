// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useRef} from 'react';
import {useIntl} from 'react-intl';
import {DeviceEventEmitter, Image} from 'react-native';

import {addFilesToDraft, removeDraft, removeDraftFile, updateDraftFile} from '@actions/local/draft';
import {uploadFile} from '@actions/remote/file';
import {createPost, createBatchPendingPosts, updatePostFileIds, markPostUploadFailed} from '@actions/remote/post';
import DatabaseManager from '@database/manager';
import NetworkManager from '@managers/network_manager';
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
import {generateId} from '@utils/general';
import {logError} from '@utils/log';
import {showSnackBar} from '@utils/snack_bar';
import {debugLog} from '@store/debug_log';

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
        debugLog('DRAFT', `[addFiles] called with ${newFiles.length} files`);
        debugLog('DRAFT', `[addFiles] file details:`, newFiles.map((f, i) => ({
            index: i,
            name: f.name,
            id: f.id,
            clientId: f.clientId,
            uri: f.uri,
            localPath: f.localPath,
            extension: f.extension,
            mime_type: f.mime_type,
            size: f.size,
            width: f.width,
            height: f.height,
        })));

        if (!newFiles.length) {
            debugLog('DRAFT', '[addFiles] no files provided, exiting');
            return;
        }

        if (!canUploadFiles) {
            debugLog('DRAFT', '[addFiles] upload disabled, showing error');
            newUploadError(uploadDisabledWarning(intl));
            return;
        }

        const currentFileCount = files?.length || 0;
        const availableCount = maxFileCount - currentFileCount;
        debugLog('DRAFT', `[addFiles] currentFileCount=${currentFileCount}, availableCount=${availableCount}, newFilesCount=${newFiles.length}`);
        if (newFiles.length > availableCount) {
            debugLog('DRAFT', `[addFiles] too many files, showing error`);
            newUploadError(fileMaxWarning(intl, maxFileCount));
            return;
        }

        const largeFile = newFiles.find((file) => file.size > maxFileSize);
        if (largeFile) {
            debugLog('DRAFT', `[addFiles] file too large: ${largeFile.name}, size=${largeFile.size}`);
            newUploadError(fileSizeWarning(intl, maxFileSize));
            return;
        }


        // Optimistic UI: create posts immediately, upload files in background
        void (async () => {
            try {
                debugLog('DRAFT', `addFiles: start, count=${newFiles.length}`);
                // Filter out video processing files
                debugLog('DRAFT', `addFiles: filtering files`);
                const filesToUpload = newFiles.filter(file => !isDraftVideoLocalProcessingFile(file));
                debugLog('DRAFT', `addFiles: after filter, count=${filesToUpload.length}`);

                if (filesToUpload.length === 0) {
                    debugLog('DRAFT', `addFiles: no files to upload after filtering`);
                    return;
                }

                // Generate batch ID for grouping these posts (only for multiple files)
                const batchId = filesToUpload.length > 1 ? `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` : undefined;
                debugLog('DRAFT', `addFiles: batchId=${batchId || 'none'}`);

                // Phase 0: Copy existing server files to get new file IDs (like webapp's forward)
                debugLog('DRAFT', `addFiles: Phase 0 - detecting existing server files`);
                const existingServerFiles = filesToUpload.filter(file =>
                    Boolean(file.post_id) && Boolean(file.id) && !file.id.startsWith('pending_')
                );
                const oldToNewIdMap: Record<string, string> = {};

                // Files marked with _skipPhase0 are already on the server and attached
                // to the target channel (e.g., cloud drive picker pre-copied them via
                // copyDriveFileToChannel). Re-copying would create duplicates, so just
                // keep their IDs as-is and let Phase 1 treat them as existing server files.
                const preCopiedFileIds = new Set(
                    filesToUpload
                        .filter(f => (f as FileInfo & {_skipPhase0?: boolean})._skipPhase0 && f.id)
                        .map(f => f.id!),
                );
                if (preCopiedFileIds.size > 0) {
                    preCopiedFileIds.forEach(id => {
                        oldToNewIdMap[id] = id;
                    });
                    debugLog('DRAFT', `addFiles: Phase 0 - skipping copy for ${preCopiedFileIds.size} pre-copied cloud drive files`);
                }

                const filesToCopy = existingServerFiles.filter(f => !preCopiedFileIds.has(f.id!));

                if (filesToCopy.length > 0) {
                    debugLog('DRAFT', `addFiles: Phase 0 - copying ${filesToCopy.length} existing server files`);
                    try {
                        const client = NetworkManager.getClient(serverUrl);
                        const originalFileIds = filesToCopy.map(f => f.id!);
                        debugLog('DRAFT', `addFiles: Phase 0 - calling copyFiles with IDs: ${originalFileIds.join(', ')}`);
                        const copyResult = await client.copyFiles(originalFileIds);
                        debugLog('DRAFT', `addFiles: Phase 0 - copyFiles returned: ${JSON.stringify(copyResult)}`);
                        const newIds = copyResult.file_ids;

                        // Map old IDs to new IDs
                        originalFileIds.forEach((oldId, index) => {
                            const newId = newIds[index];
                            if (newId) {
                                oldToNewIdMap[oldId] = newId;
                                debugLog('DRAFT', `addFiles: Phase 0 - mapped ${oldId} -> ${newId}`);
                            }
                        });
                    } catch (copyError) {
                        debugLog('DRAFT', `addFiles: Phase 0 ERROR - ${copyError instanceof Error ? copyError.message : String(copyError)}`);
                        // Don't throw - just log the error and continue with original file IDs
                        // This allows the upload to proceed even if copy fails
                        console.warn('[addFiles] Failed to copy files, will use original IDs:', copyError);
                    }
                } else if (preCopiedFileIds.size === 0) {
                    debugLog('DRAFT', `addFiles: Phase 0 - no existing server files to copy`);
                }

                // Phase 1: Prepare all files with dimensions in parallel
                debugLog('DRAFT', `addFiles: Phase 1 - preparing files`);
                debugLog('DRAFT', `addFiles: Phase 1 - starting Promise.all for ${filesToUpload.length} files`);

                // Generate ONE pending post ID for ALL files (not one per file)
                const pendingPostId = `${currentUserId}:${Date.now()}_${generateId()}`;
                debugLog('DRAFT', `addFiles: Phase 1 - single post ID for all files: ${pendingPostId}`);

                const filesWithPostData = await Promise.all(
                    filesToUpload.map(async (file, index) => {
                        debugLog('DRAFT', `addFiles: Phase 1 - processing file ${index + 1}/${filesToUpload.length}: ${file.name}`);

                        // Detect existing server files (from group files tab) - they have a real server ID and post_id
                        const isExistingServerFile = Boolean(file.post_id) && Boolean(file.id) && !file.id.startsWith('pending_');

                        if (isExistingServerFile) {
                            debugLog('DRAFT', `addFiles: Phase 1 - file ${index + 1}: existing server file, id=${file.id}`);
                        }

                        // Use the new copied file ID for existing server files, or generate pending ID for new files
                        const pendingFileId = isExistingServerFile ? (oldToNewIdMap[file.id!] || file.id!) : `pending_${generateId()}`;

                        const fileName = file.name || '';
                        const extension = fileName.includes('.') ? fileName.split('.').pop() || '' : '';

                        const isImageFile = file.mime_type?.startsWith('image/') || extension.match(/^(jpg|jpeg|png|gif|webp|heic|heif)$/i);
                        const hasPreviewImage = Boolean(isImageFile);

                        debugLog('DRAFT', `addFiles: Phase 1 - file ${index + 1}: isImage=${isImageFile}, extension=${extension}, isExisting=${isExistingServerFile}`);

                        let fileWidth = file.width;
                        let fileHeight = file.height;

                        if (isImageFile && (!fileWidth || !fileHeight)) {
                            const imageUri = file.localPath || file.uri || '';
                            debugLog('DRAFT', `addFiles: Phase 1 - file ${index + 1}: fetching dimensions for URI: ${imageUri}`);
                            if (imageUri) {
                                try {
                                    const dimensions = await getImageDimensions(imageUri);
                                    fileWidth = dimensions.width;
                                    fileHeight = dimensions.height;
                                    debugLog('DRAFT', `addFiles: Phase 1 - file ${index + 1}: got dimensions ${fileWidth}x${fileHeight}`);
                                } catch (dimError) {
                                    debugLog('DRAFT', `addFiles: Phase 1 - file ${index + 1}: ERROR getting dimensions: ${dimError instanceof Error ? dimError.message : String(dimError)}`);
                                    // Continue with defaults
                                }
                            }
                        }

                        fileWidth = fileWidth || (isImageFile ? 800 : 100);
                        fileHeight = fileHeight || (isImageFile ? 600 : 100);

                        debugLog('DRAFT', `addFiles: Phase 1 - file ${index + 1}: final dimensions ${fileWidth}x${fileHeight}`);

                        const localFile: FileInfo = {
                            ...file,
                            id: pendingFileId,
                            post_id: '',
                            user_id: currentUserId,
                            name: fileName,
                            extension,
                            size: file.size || 0,
                            mime_type: file.mime_type || 'application/octet-stream',
                            has_preview_image: hasPreviewImage,
                            height: fileHeight,
                            width: fileWidth,
                            localPath: file.localPath || file.uri || '',
                            uri: file.uri || '',
                            create_at: Date.now(),
                            update_at: Date.now(),
                        };

                        debugLog('DRAFT', `addFiles: Phase 1 - file ${index + 1}: localFile prepared`, {
                            id: localFile.id,
                            name: localFile.name,
                            localPath: localFile.localPath,
                            uri: localFile.uri,
                            extension: localFile.extension,
                            mime_type: localFile.mime_type,
                            width: localFile.width,
                            height: localFile.height,
                        });

                        return {localFile, isExistingServerFile};
                    }),
                );

                debugLog('DRAFT', `addFiles: Phase 1 COMPLETE, prepared ${filesWithPostData.length} files for single post`);

                // Phase 2: Create ONE pending post with ALL files in a single DB write
                debugLog('DRAFT', `addFiles: Phase 2 - create single pending post with all files`);

                // Collect all file IDs
                const allFileIds = filesWithPostData.map(({localFile}) => localFile.id!);
                const allLocalFiles = filesWithPostData.map(({localFile}) => localFile);
                const hasExistingServerFile = filesWithPostData.some(({isExistingServerFile}) => isExistingServerFile);

                // Create ONE post with all file_ids
                const singlePost = {
                    pending_post_id: pendingPostId,
                    user_id: currentUserId,
                    channel_id: channelId,
                    root_id: rootId,
                    message: '',
                    file_ids: allFileIds,
                    props: {
                        upload_status: hasExistingServerFile ? 'complete' : 'uploading',
                    },
                } as Post;

                debugLog('DRAFT', `addFiles: Phase 2 - single post prepared with ${allFileIds.length} files`, {
                    pending_post_id: singlePost.pending_post_id,
                    file_ids: singlePost.file_ids,
                });

                const batchResult = await createBatchPendingPosts(
                    serverUrl,
                    [{
                        post: singlePost,
                        files: allLocalFiles,
                    }],
                );

                if (batchResult.error) {
                    debugLog('DRAFT', `addFiles: Phase 2 ERROR - ${batchResult.error}`);
                    throw batchResult.error;
                }

                const batchData = batchResult.data!;
                debugLog('DRAFT', `addFiles: Phase 2 complete, created 1 post with ${allFileIds.length} files`);

                // Phase 3: Call server API once for the single post
                debugLog('DRAFT', `addFiles: Phase 3 - calling server API for single post`);
                const {pendingPostId: serverPendingPostId, post: serverPost, files: serverFiles} = batchData[0];

                let createdPostId = serverPendingPostId;
                try {
                    const result = await createPost(
                        serverUrl,
                        {...serverPost, pending_post_id: serverPendingPostId},
                        serverFiles,
                        true, // Skip pending post creation (already done in batch)
                    );

                    if (result.error) {
                        debugLog('DRAFT', `addFiles: Phase 3 ERROR - ${result.error}`);
                        throw result.error;
                    }

                    if (result.data?.postId) {
                        createdPostId = result.data.postId;
                        debugLog('DRAFT', `addFiles: Phase 3 - post created, id=${result.data.postId}`);
                    }
                } catch (err) {
                    logError('[addFiles createPost]', err);
                    debugLog('DRAFT', `addFiles: Phase 3 exception - ${err}`);
                }


                // Emit scroll to bottom immediately so user sees their posts
                DeviceEventEmitter.emit(Events.POST_LIST_SCROLL_TO_BOTTOM, Screens.CHANNEL);

                // Upload all files in background and update the single post
                debugLog('DRAFT', `addFiles: background upload - ${filesWithPostData.length} files for post ${createdPostId}`);

                const uploadedFiles: FileInfo[] = [];
                const filesToActuallyUpload = filesWithPostData.filter(({isExistingServerFile}) => !isExistingServerFile);

                // For existing server files, add them directly to uploadedFiles
                for (const {localFile, isExistingServerFile} of filesWithPostData) {
                    if (isExistingServerFile) {
                        debugLog('DRAFT', `addFiles: adding existing server file ${localFile.name} (id=${localFile.id}) to uploaded list`);
                        uploadedFiles.push(localFile);
                    }
                }

                // Upload new files sequentially (can be parallelized later if needed)
                for (let uploadIndex = 0; uploadIndex < filesToActuallyUpload.length; uploadIndex++) {
                    const {localFile: file} = filesToActuallyUpload[uploadIndex];

                    debugLog('DRAFT', `addFiles: uploading file ${uploadIndex + 1}/${filesToActuallyUpload.length}: ${file.name}`, {
                        postId: createdPostId,
                        fileId: file.id,
                        localPath: file.localPath,
                        uri: file.uri,
                        extension: file.extension,
                        mime_type: file.mime_type,
                    });

                    try {
                        debugLog('DRAFT', `addFiles: creating upload promise for file ${uploadIndex + 1}`);
                        const uploadedFile = await new Promise<FileInfo>((resolve, reject) => {
                            debugLog('DRAFT', `addFiles: calling uploadFile for ${file.name}`);
                            const {error} = uploadFile(
                                serverUrl,
                                file,
                                channelId,
                                () => {/* progress */},
                                (response) => {
                                    debugLog('DRAFT', `addFiles: upload callback for ${file.name}`, {
                                        code: response.code,
                                        hasFileInfos: Boolean(response.data?.file_infos?.length),
                                    });
                                    if (response.code !== 201 || !response.data?.file_infos?.length) {
                                        const errorMsg = (response.data?.message as string) || intl.formatMessage({id: 'mobile.post.upload_failed', defaultMessage: 'Failed to upload file'});
                                        debugLog('DRAFT', `addFiles: upload failed for ${file.name}: ${errorMsg}`);
                                        reject(new Error(errorMsg));
                                        return;
                                    }
                                    debugLog('DRAFT', `addFiles: upload successful for ${file.name}`);
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

                        debugLog('DRAFT', `addFiles: upload complete for file ${uploadIndex + 1}`, {
                            id: uploadedFile.id,
                            name: uploadedFile.name,
                            clientId: uploadedFile.clientId,
                            localPath: uploadedFile.localPath,
                        });

                        uploadedFiles.push(uploadedFile);

                    } catch (uploadErr) {
                        logError('[addFiles background upload]', uploadErr);
                        debugLog('DRAFT', `addFiles: upload ERROR for file ${uploadIndex + 1} (${file.name})`, {
                            error: uploadErr instanceof Error ? uploadErr.message : String(uploadErr),
                            stack: uploadErr instanceof Error ? uploadErr.stack : 'N/A',
                            postId: createdPostId,
                            fileId: file.id,
                        });
                        // Mark post as failed
                        try {
                            await markPostUploadFailed(serverUrl, createdPostId, file.name);
                            debugLog('DRAFT', `addFiles: post ${createdPostId} marked as failed`);
                        } catch (markErr) {
                            debugLog('DRAFT', `addFiles: ERROR marking post as failed: ${markErr instanceof Error ? markErr.message : String(markErr)}`);
                        }
                        return; // Stop uploading remaining files
                    }
                }

                // Update the single post with all uploaded file IDs
                if (uploadedFiles.length > 0) {
                    debugLog('DRAFT', `addFiles: updating post ${createdPostId} with ${uploadedFiles.length} file IDs`);
                    try {
                        await updatePostFileIds(serverUrl, createdPostId, uploadedFiles);
                        debugLog('DRAFT', `addFiles: post ${createdPostId} updated with all file IDs`);
                    } catch (updateErr) {
                        logError('[addFiles updatePostFileIds]', updateErr);
                        debugLog('DRAFT', `addFiles: ERROR updating post with file IDs`, {
                            error: updateErr instanceof Error ? updateErr.message : String(updateErr),
                        });
                    }
                }

                debugLog('DRAFT', `addFiles: all uploads complete`);


            } catch (err) {
                logError('[addFiles optimistic]', err);
                debugLog('DRAFT', `addFiles: CRITICAL ERROR in upload process`, {
                    error: err instanceof Error ? err.message : String(err),
                    stack: err instanceof Error ? err.stack : 'N/A',
                    fileCount: newFiles.length,
                });
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
