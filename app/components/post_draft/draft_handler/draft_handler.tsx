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
import {copyDriveFileToChannel} from '@screens/home/apps/workbench_api';
import {getErrorMessage} from '@utils/errors';
import {
    clearDraftVideoProcessingAborted,
    isDraftVideoLocalProcessingFile,
    isDraftVideoProcessingAborted,
    markDraftVideoProcessingAborted,
    type DraftVideoProcessingBridge,
} from '@utils/file/draft_video_local_processing';
import {fileExists, fileMaxWarning, fileSizeWarning, getExtensionFromMime, getLocalFilePathFromFile, uploadDisabledWarning} from '@utils/file';
import {completeProgress, emitProgress, failProgress, startProgress} from '@utils/file/optimistic_upload_progress';
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

                // 微信式：每个文件一条 post，各自头像/时间戳，垂直排列，
                // 通过同一个 batch_id 关联为一个批次（支持「撤回本条 / 撤回本次全部」）。
                // 单文件时 batchId 仍生成但只有一条，长按走单条撤回分支。
                // batch_id 格式对齐 webapp（use_submit.tsx）：batch_<ts>_<rand>。
                // 注意：mobile 的 deletePostBatch 用 WatermelonDB Q.like 匹配 props，
                // 其中 '_' 是 LIKE 单字符通配符——已在 deletePostBatch 内对 batchId 做转义。
                const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                debugLog('DRAFT', `addFiles: batchId=${batchId}, fileCount pending`);

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

                // Debug: log all incoming files to check post_id presence
                filesToUpload.forEach((file, i) => {
                    debugLog('DRAFT', `addFiles: Phase 1 - file ${i}: id=${file.id}, post_id=${file.post_id}, source=${(file as any).source}, hasUri=${Boolean(file.uri)}`);
                });

                const filesWithPostData = await Promise.all(
                    filesToUpload.map(async (file, index) => {
                        debugLog('DRAFT', `addFiles: Phase 1 - processing file ${index + 1}/${filesToUpload.length}: ${file.name}`);

                        // Detect existing server files (from group files tab) - they have a real server ID and post_id
                        // OR from channel source (聊天tab) where post_id might be empty but it's still a server file
                        const isExistingServerFile =
                            (Boolean(file.post_id) && Boolean(file.id) && !file.id.startsWith('pending_')) ||
                            ((file as any).source === 'channel' && Boolean(file.id) && !file.id.startsWith('pending_'));

                        if (isExistingServerFile) {
                            debugLog('DRAFT', `addFiles: Phase 1 - file ${index + 1}: existing server file, id=${file.id}, source=${(file as any).source}`);
                        } else {
                            debugLog('DRAFT', `addFiles: Phase 1 - file ${index + 1}: new local file (will upload), post_id=${file.post_id}, id=${file.id}, source=${(file as any).source}, isPending=${file.id?.startsWith('pending_')}`);
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
                            // 稳定的 clientId 用于逐文件上传进度订阅（渲染层按此订阅进度条）
                            clientId: file.clientId || pendingFileId,
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

                debugLog('DRAFT', `addFiles: Phase 1 COMPLETE, prepared ${filesWithPostData.length} files`);

                // Phase 2: 每个文件一条 pending post（各自头像/时间戳），共享 batch_id。
                // batch_order/batch_total 便于 UI 判断批次与排序。
                // 【性能】所有 post 合并成一次 createBatchPendingPosts 写入：单次 DB 事务、
                // 聊天列表只触发一次 observe() 重渲染。多文件时 N 条 post 同时出现，
                // 避免逐条写库导致的 N 次重渲染卡顿。
                debugLog('DRAFT', `addFiles: Phase 2 - create ${filesWithPostData.length} pending posts in one batch, batchId=${batchId}`);

                const batchTotal = filesWithPostData.length;

                const postsToCreate = filesWithPostData.map(({localFile, isExistingServerFile}, orderIdx) => ({
                    post: {
                        pending_post_id: `${batchId}#${orderIdx}`,
                        user_id: currentUserId,
                        channel_id: channelId,
                        root_id: rootId,
                        message: '',
                        file_ids: [localFile.id!],
                        props: {
                            upload_status: isExistingServerFile ? 'complete' : 'uploading',
                            batch_id: batchId,
                            batch_order: orderIdx,
                            batch_total: batchTotal,
                        },
                    } as Post,
                    files: [localFile],
                }));

                const batchResult = await createBatchPendingPosts(serverUrl, postsToCreate);
                if (batchResult.error) {
                    debugLog('DRAFT', `addFiles: Phase 2 ERROR - ${batchResult.error}`);
                    throw batchResult.error;
                }
                const batchData = batchResult.data ?? [];
                debugLog('DRAFT', `addFiles: Phase 2 COMPLETE, created ${batchData.length} posts`);

                // Phase 3: 为每条 pending post 各自调服务端 createPost。
                // 【优化】并行调用 createPost，限制并发数为 3，避免串行 API 调用
                // 9 个 post：串行 9×200ms=1800ms → 并行 3×200ms=600ms（3x 提升）
                const POST_CREATE_CONCURRENCY = 3;
                debugLog('DRAFT', `addFiles: Phase 3 - calling server API for ${batchData.length} posts (parallel)`);

                const createdPostIds: string[] = new Array(batchData.length);
                const postQueue = batchData.map((item, index) => ({...item, index}));

                while (postQueue.length > 0) {
                    const postBatch = postQueue.splice(0, POST_CREATE_CONCURRENCY);
                    debugLog('DRAFT', `addFiles: Phase 3 - creating batch of ${postBatch.length} posts`);

                    await Promise.all(postBatch.map(async ({pendingPostId: serverPendingPostId, post: serverPost, files: serverFiles, index}) => {
                        let createdPostId = serverPendingPostId;
                        try {
                            const result = await createPost(
                                serverUrl,
                                {...serverPost, pending_post_id: serverPendingPostId},
                                serverFiles,
                                true, // Skip pending post creation (already done in batch)
                            );

                            if (result.error) {
                                debugLog('DRAFT', `addFiles: Phase 3 ERROR (post ${index}) - ${result.error}`);
                            } else if (result.data?.postId) {
                                createdPostId = result.data.postId;
                                debugLog('DRAFT', `addFiles: Phase 3 - post ${index} created, id=${createdPostId}`);
                            }
                        } catch (err) {
                            logError('[addFiles createPost]', err);
                            debugLog('DRAFT', `addFiles: Phase 3 exception (post ${index}) - ${err}`);
                        }
                        createdPostIds[index] = createdPostId;
                    }));
                }

                // Emit scroll to bottom immediately so user sees their post
                DeviceEventEmitter.emit(Events.POST_LIST_SCROLL_TO_BOTTOM, Screens.CHANNEL);

                // 每个文件各自上传并更新对应的那条 post（每文件一条 post）。
                debugLog('DRAFT', `addFiles: background upload - ${filesWithPostData.length} files, one post each`);

                // 【优化】并行上传文件，限制并发数为 3，避免串行上传导致用户等待过久
                // 9 个文件：串行 90秒 → 并行 30秒（3x 提升）
                const UPLOAD_CONCURRENCY = 3;
                const uploadQueue = filesWithPostData.map((item, index) => ({
                    ...item,
                    postId: createdPostIds[index],
                    index,
                }));

                while (uploadQueue.length > 0) {
                    const batch = uploadQueue.splice(0, UPLOAD_CONCURRENCY);
                    debugLog('DRAFT', `addFiles: uploading batch of ${batch.length} files (remaining: ${uploadQueue.length})`);

                    // 并行上传当前批次
                    await Promise.all(batch.map(async ({localFile: file, isExistingServerFile, postId, index}) => {

                    // 进度键用 pending 文件 id（file.id），因为聊天列表从 DB 读取的 File 只有 id，无 clientId
                    const progressKey = file.id!;

                    // Existing server files (group files tab): already uploaded, keep as-is
                    if (isExistingServerFile) {
                        debugLog('DRAFT', `addFiles: existing server file ${file.name}, no upload needed`);
                        completeProgress(progressKey);
                        try {
                            await updatePostFileIds(serverUrl, postId, [file]);
                        } catch (updateErr) {
                            logError('[addFiles updatePostFileIds]', updateErr);
                        }
                        return;
                    }

                    startProgress(progressKey);

                    // 云盘文件：后台调 copyDriveFileToChannel 把文件复制进频道（服务端到服务端），
                    // 成功后用返回的真实频道 FileInfo 更新这条 post；失败则标记该 post 失败。
                    const cdFile = file as FileInfo & {_needsCopyToChannel?: boolean; _cloudDriveFileId?: string; _cloudDriveTeamId?: string};
                    if (cdFile._needsCopyToChannel && cdFile._cloudDriveFileId && cdFile._cloudDriveTeamId) {
                        try {
                            debugLog('DRAFT', `addFiles: cloud drive copy-to-channel for ${file.name} (driveId=${cdFile._cloudDriveFileId})`);
                            const copied = await copyDriveFileToChannel(serverUrl, cdFile._cloudDriveTeamId, cdFile._cloudDriveFileId, channelId);
                            if (!copied || !copied.id) {
                                throw new Error('copyDriveFileToChannel returned no file');
                            }
                            completeProgress(progressKey);
                            await updatePostFileIds(serverUrl, postId, [copied as FileInfo]);
                            debugLog('DRAFT', `addFiles: cloud drive file ${file.name} copied, post ${postId} updated`);
                        } catch (cdErr) {
                            logError('[addFiles cloudDriveCopy]', cdErr);
                            failProgress(progressKey);
                            await markPostUploadFailed(serverUrl, postId, file.name);
                        }
                        return;
                    }

                    debugLog('DRAFT', `addFiles: uploading file ${index + 1}/${filesWithPostData.length}: ${file.name}`, {
                        postId,
                        fileId: file.id,
                        localPath: file.localPath,
                        uri: file.uri,
                        extension: file.extension,
                        mime_type: file.mime_type,
                    });

                    try {
                        debugLog('DRAFT', `addFiles: creating upload promise for file ${index + 1}`);
                        const uploadedFile = await new Promise<FileInfo>((resolve, reject) => {
                            debugLog('DRAFT', `addFiles: calling uploadFile for ${file.name}`);
                            const {error} = uploadFile(
                                serverUrl,
                                file,
                                channelId,
                                (progress) => {
                                    emitProgress(progressKey, progress);
                                },
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

                        debugLog('DRAFT', `addFiles: upload complete for file ${index + 1}`, {
                            id: uploadedFile.id,
                            name: uploadedFile.name,
                            clientId: uploadedFile.clientId,
                            localPath: uploadedFile.localPath,
                        });

                        completeProgress(progressKey);

                        // 上传成功：把相册/手机文件的缓存中转副本移到持久目录
                        // （documentDirectory/<server>/Files/...），并让 local_path 指向它。
                        // 否则自己发的文件 local_path 指向易失缓存，被系统清理后聊天里会裂图。
                        // 与「别人发的文件下载到持久目录」保持一致。
                        try {
                            const curPath = uploadedFile.localPath;
                            debugLog('DRAFT', `addFiles: checking persistent storage for ${uploadedFile.name}`, {
                                curPath,
                                fileId: uploadedFile.id,
                            });
                            if (curPath && uploadedFile.id) {
                                const persistentPath = getLocalFilePathFromFile(serverUrl, uploadedFile);
                                const srcWithScheme = curPath.startsWith('file://') ? curPath : `file://${curPath}`;
                                const dstWithScheme = persistentPath.startsWith('file://') ? persistentPath : `file://${persistentPath}`;
                                debugLog('DRAFT', `addFiles: paths`, {
                                    srcWithScheme,
                                    dstWithScheme,
                                    pathsMatch: srcWithScheme === dstWithScheme,
                                    fileExists: await fileExists(curPath),
                                });
                                if (srcWithScheme !== dstWithScheme && (await fileExists(curPath))) {
                                    const {moveAsync, makeDirectoryAsync} = await import('expo-file-system');
                                    const dir = dstWithScheme.slice(0, dstWithScheme.lastIndexOf('/'));
                                    await makeDirectoryAsync(dir, {intermediates: true});
                                    await moveAsync({from: srcWithScheme, to: dstWithScheme});
                                    uploadedFile.localPath = persistentPath;
                                    debugLog('DRAFT', `addFiles: moved to persistent path ${persistentPath}`);
                                } else if (srcWithScheme === dstWithScheme) {
                                    debugLog('DRAFT', `addFiles: file already at persistent path, no move needed`);
                                }
                            }
                        } catch (moveErr) {
                            // 移动失败不致命：local_path 仍指向缓存，最坏是被清后重下。
                            debugLog('DRAFT', `addFiles: persist move failed (non-fatal): ${moveErr instanceof Error ? moveErr.message : String(moveErr)}`);
                        }

                        // 该文件上传完成，更新它自己那条 post 的真实 file id。
                        try {
                            await updatePostFileIds(serverUrl, postId, [uploadedFile]);
                            debugLog('DRAFT', `addFiles: post ${postId} updated with file ${uploadedFile.name}`);
                        } catch (updateErr) {
                            logError('[addFiles updatePostFileIds]', updateErr);
                            debugLog('DRAFT', `addFiles: ERROR updating post ${postId}`, {
                                error: updateErr instanceof Error ? updateErr.message : String(updateErr),
                            });
                        }
                    } catch (uploadErr) {
                        logError('[addFiles background upload]', uploadErr);
                        debugLog('DRAFT', `addFiles: upload ERROR for file ${index + 1} (${file.name})`, {
                            error: uploadErr instanceof Error ? uploadErr.message : String(uploadErr),
                            stack: uploadErr instanceof Error ? uploadErr.stack : 'N/A',
                            postId,
                            fileId: file.id,
                        });
                        failProgress(progressKey);
                        // 该文件上传失败，标记它自己那条 post 为失败。
                        try {
                            await markPostUploadFailed(serverUrl, postId, file.name);
                            debugLog('DRAFT', `addFiles: post ${postId} marked as failed`);
                        } catch (markErr) {
                            debugLog('DRAFT', `addFiles: ERROR marking post as failed: ${markErr instanceof Error ? markErr.message : String(markErr)}`);
                        }
                        // Continue with other files even if one fails
                    }
                    })); // End of Promise.all

                    debugLog('DRAFT', `addFiles: batch complete, ${uploadQueue.length} files remaining`);
                } // End of while loop

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
