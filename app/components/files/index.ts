// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import {of as of$, from as from$, combineLatest} from 'rxjs';
import {switchMap, map} from 'rxjs/operators';

import {queryFilesForPost, queryMediaFilesForChannel} from '@queries/servers/file';
import {observeCanDownloadFiles, observeEnableSecureFilePreview} from '@queries/servers/security';
import {observeConfigBooleanValue, observeCurrentUserId} from '@queries/servers/system';
import {filesLocalPathValidation, isImage, isVideo} from '@utils/file';

import Files from './files';

import type {FileInfo} from '@typings/api/files';
import type {WithDatabaseArgs} from '@typings/database/database';
import type PostModel from '@typings/database/models/servers/post';

// Pending 文件元数据（存储在 post.props.pending_files 中）
// 对齐 webapp：使用 snake_case 字段名（client_id, mime_type）
type PendingFileMeta = {
    client_id: string;      // snake_case
    name: string;
    size: number;
    mime_type: string;      // snake_case
    file_id?: string;       // 可选：上传完成后的真实 file_id
    previewUrl?: string;    // 可选：预览 URL
};

// 上传进度信息（存储在 post.props.upload_progress 中）
type UploadProgressInfo = {
    progress: number;
    status: 'uploading' | 'done' | 'error';
    error?: string;
};

type EnhanceProps = WithDatabaseArgs & {
    post: PostModel;
    serverUrl: string;
}

const enhance = withObservables(['post'], ({database, post, serverUrl}: EnhanceProps) => {
    const publicLinkEnabled = observeConfigBooleanValue(database, 'EnablePublicLink');

    // 观察 post 的 props 变化，确保 upload_status / pending_files 更新时 UI 能响应
    const postProps = post.observe().pipe(
        switchMap((p) => of$(p.props)),
    );

    // DB 文件流
    const dbFilesInfo = queryFilesForPost(database, post.id).observeWithColumns(['local_path']).pipe(
        switchMap((fs) => from$(filesLocalPathValidation(fs, post.userId, serverUrl))),
    );

    // 合并 DB 文件 + pending_files（微信风格：接收端立刻渲染上传中的文件元信息）
    const filesInfo = combineLatest([dbFilesInfo, postProps]).pipe(
        map(([dbFiles, props]) => {
            const pendingFiles = (props?.pending_files as PendingFileMeta[] | undefined) || [];
            const uploadProgress = (props?.upload_progress as Record<string, UploadProgressInfo> | undefined) || {};

            if (pendingFiles.length === 0) {
                return dbFiles;
            }

            // 为每个 pending file 合成 FileInfo（让 Files 组件能渲染文件卡片）
            const pendingFileInfos: FileInfo[] = [];
            for (const pf of pendingFiles) {
                // 对齐 webapp：使用 client_id（snake_case）
                const progressInfo = uploadProgress[pf.client_id];

                // 如果 DB 中已有对应的真实文件记录（上传完成），跳过合成
                const realFileId = progressInfo?.status === 'done' ? undefined : undefined;
                if (dbFiles.some((f) => f.id === realFileId)) {
                    continue;
                }

                const extension = pf.name.includes('.') ? pf.name.split('.').pop() || '' : '';
                const syntheticFileInfo: FileInfo = {
                    id: `pending_${pf.client_id}`,  // 使用 client_id
                    user_id: post.userId,
                    post_id: post.id,
                    create_at: post.createAt,
                    update_at: post.updateAt,
                    delete_at: 0,
                    name: pf.name,
                    extension,
                    size: pf.size,
                    mime_type: pf.mime_type,  // 使用 mime_type（snake_case）
                    has_preview_image: false,
                    mini_preview: '',
                    link: '',
                    localPath: '',
                    pdfPreviewId: '',
                    imageThumbnail: '',
                    // 扩展字段（用于渲染上传进度）
                    _uploadProgress: progressInfo?.progress || 0,
                    _uploadStatus: progressInfo?.status || 'uploading',
                } as FileInfo & {_uploadProgress: number; _uploadStatus: string};

                pendingFileInfos.push(syntheticFileInfo);
            }

            // pending 文件在前，已上传文件在后
            return [...pendingFileInfos, ...dbFiles];
        }),
    );

    const channelMediaFiles = queryMediaFilesForChannel(database, post.channelId).observeWithColumns(['local_path']).pipe(
        switchMap((fs) => from$(
            filesLocalPathValidation(fs.filter((f) => isImage(f) || isVideo(f)), post.userId, serverUrl),
        )),
    );

    return {
        canDownloadFiles: observeCanDownloadFiles(database),
        enableSecureFilePreview: observeEnableSecureFilePreview(database),
        currentUserId: observeCurrentUserId(database),
        postId: of$(post.id),
        channelId: of$(post.channelId),
        message: of$(post.message),
        postProps,
        publicLinkEnabled,
        filesInfo,
        channelMediaFiles,
    };
});

export default withDatabase(enhance(Files));
