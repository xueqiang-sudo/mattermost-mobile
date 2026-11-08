// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {uploadMedia} from './smart_notebook_api';
import type {SmartNoteBlock} from './smart_notebook_api';
import {debugLog} from '@store/debug_log';

// webapp 兼容的 VIDEO/AUDIO caption 编码格式
const MEDIA_CAPTION_RE = /^\[(VIDEO|AUDIO):([^\]]*)\](.*)$/;

/**
 * 检查块是否包含需要上传的本地文件
 * 对齐 webapp：
 *   - 普通块：检查 content 是否为本地路径
 *   - image + VIDEO/AUDIO caption：同时检查 content（缩略图）和 caption 中的媒体 URL
 */
export function isLocalBlock(block: SmartNoteBlock): boolean {
    if (!block.content && !block.meta?.caption) return false;

    // 检查 image 块的 VIDEO/AUDIO caption
    if (block.type === 'image' && block.meta?.caption) {
        const m = block.meta.caption.match(MEDIA_CAPTION_RE);
        if (m) {
            const mediaUrl = m[2];
            // caption 中的媒体 URL 是本地路径
            if (mediaUrl && !mediaUrl.startsWith('http://') && !mediaUrl.startsWith('https://')) {
                return true;
            }
        }
    }

    // meta.isLocal 明确标记
    if (block.meta?.isLocal) return true;

    // 本地路径
    if (block.content?.startsWith('file://')) return true;
    if (block.content?.startsWith('/')) return true;

    // 远程 URL 不需要上传
    if (block.content?.startsWith('http://') || block.content?.startsWith('https://')) {
        return false;
    }

    // 【关键修复】只对媒体类型块默认认为是本地文件，段落等文本块不应该被识别为本地文件
    if (block.type === 'file' || block.type === 'image' || block.type === 'video' || block.type === 'audio') {
        return Boolean(block.content);
    }

    // 段落、列表等文本块不需要上传
    return false;
}

/**
 * 上传单个块中的本地文件到服务器，对齐 webapp 块格式
 */
export async function uploadLocalBlock(
    serverUrl: string,
    userId: string,
    block: SmartNoteBlock,
    onProgress?: (progress: number) => void,
): Promise<SmartNoteBlock> {
    if (!isLocalBlock(block)) {
        return block;
    }

    const result = {...block, meta: {...block.meta}};

    // 处理 VIDEO/AUDIO caption 中的媒体文件
    const caption = result.meta?.caption || '';
    const mediaMatch = caption.match(MEDIA_CAPTION_RE);
    if (mediaMatch && block.type === 'image') {
        const mediaType = mediaMatch[1]; // 'VIDEO' or 'AUDIO'
        const mediaUrl = mediaMatch[2];
        const displayName = mediaMatch[3];

        // 上传媒体文件
        if (mediaUrl && !mediaUrl.startsWith('http://') && !mediaUrl.startsWith('https://')) {
            let fileUri = mediaUrl;
            if (fileUri.startsWith('file://')) {
                fileUri = fileUri.substring(7);
            }
            try {
                const uploadResult = await uploadMedia(serverUrl, userId, {
                    uri: fileUri,
                    name: displayName || 'media',
                    type: mediaType === 'VIDEO' ? 'video/mp4' : 'audio/mpeg',
                });
                if (uploadResult?.url) {
                    // 更新 caption 中的 URL
                    result.meta!.caption = `[${mediaType}:${uploadResult.url}]${displayName}`;
                }
            } catch (error) {
                console.error(`[SmartNotebookUpload] ${mediaType} upload failed:`, displayName, error);
                throw error;
            }
        }

        // 对于 VIDEO：content 是缩略图（如果有本地缩略图也上传）
        // 对于 AUDIO：content 可能是空的或 SVG 图标，不需要上传
        if (block.content && block.content.startsWith('/')) {
            try {
                const thumbResult = await uploadMedia(serverUrl, userId, {
                    uri: block.content,
                    name: 'thumb.jpg',
                    type: 'image/jpeg',
                });
                if (thumbResult?.url) {
                    result.content = thumbResult.url;
                    result.meta!.url = thumbResult.url;
                }
            } catch {
                // 缩略图上传失败不影响主流程
            }
        } else if (!block.content || block.content.startsWith('data:')) {
            // content 为空或 data URL（音频 SVG 图标），保持不变
        }

        result.meta!.isLocal = false;
        onProgress?.(1);
        return result;
    }

    // 普通文件/图片上传
    const fileName = result.meta?.fileName || result.meta?.caption || 'file';

    // 【关键修复】如果 MIME 类型为空，从文件扩展名推断
    let mimeType = result.meta?.mimeType;
    if (!mimeType || mimeType === '') {
        const ext = fileName.split('.').pop()?.toLowerCase() || '';
        const mimeMap: Record<string, string> = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'svg': 'image/svg+xml',
            'bmp': 'image/bmp',
            'mp4': 'video/mp4',
            'avi': 'video/x-msvideo',
            'mov': 'video/quicktime',
            'webm': 'video/webm',
            'mp3': 'audio/mpeg',
            'wav': 'audio/wav',
            'ogg': 'audio/ogg',
            'm4a': 'audio/mp4',
            'pdf': 'application/pdf',
            'doc': 'application/msword',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'xls': 'application/vnd.ms-excel',
            'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'ppt': 'application/vnd.ms-powerpoint',
            'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'txt': 'text/plain',
            'zip': 'application/zip',
            'rar': 'application/x-rar-compressed',
        };
        mimeType = mimeMap[ext] || 'application/octet-stream';
    }

    let fileUri = block.content;
    if (fileUri.startsWith('file://')) {
        fileUri = fileUri.substring(7);
    }

    try {
        debugLog('[SmartNotebookUpload] Uploading file', {
            fileName,
            mimeType,
            fileUri: fileUri.substring(0, 100),  // 避免日志过长
            uriStartsWithSlash: fileUri.startsWith('/'),
            uriLength: fileUri.length,
        });

        const uploadResult = await uploadMedia(serverUrl, userId, {
            uri: fileUri,
            name: fileName,
            type: mimeType,
        });

        if (!uploadResult?.url) {
            throw new Error('上传失败：未获得URL');
        }

        debugLog('[SmartNotebookUpload] Upload successful', {
            fileName,
            url: uploadResult.url.substring(0, 100),
            fileId: uploadResult.fileId,
        });

        result.content = uploadResult.url;
        result.meta!.url = uploadResult.url;
        result.meta!.mmFileId = uploadResult.mmFileId || '';  // Mattermost 文件 ID（用于 PDF 转换）
        result.meta!.fileId = uploadResult.fileId || '';  // 云盘文件 ID（用于下载）
        result.meta!.isLocal = false;

        onProgress?.(1);
        return result;
    } catch (error) {
        console.error('[SmartNotebookUpload] 上传失败:', fileName, error);
        debugLog('[SmartNotebookUpload] Upload failed', {
            fileName,
            mimeType,
            fileUri: fileUri.substring(0, 100),
            error: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }
}

/**
 * 批量上传所有本地文件
 */
export async function uploadAllLocalBlocks(
    serverUrl: string,
    userId: string,
    blocks: SmartNoteBlock[],
    onProgress?: (current: number, total: number) => void,
): Promise<{
    success: boolean;
    blocks: SmartNoteBlock[];
    errors: Array<{block: SmartNoteBlock; error: string}>;
}> {
    const localBlocks = blocks.filter(isLocalBlock);
    const total = localBlocks.length;
    let current = 0;
    const errors: Array<{block: SmartNoteBlock; error: string}> = [];

    // 调试日志：记录哪些块被识别为本地块
    debugLog('[SmartNotebookUpload] Found local blocks', {
        totalBlocks: blocks.length,
        localBlocksCount: localBlocks.length,
        localBlockDetails: localBlocks.map(b => ({
            type: b.type,
            id: b.id,
            fileName: b.meta?.fileName,
            isLocal: b.meta?.isLocal,
            contentPreview: b.content?.substring(0, 60),
        })),
    });

    const resultBlocks = [...blocks];

    for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];

        if (!isLocalBlock(block)) {
            continue;
        }

        try {
            const uploadedBlock = await uploadLocalBlock(serverUrl, userId, block);
            resultBlocks[i] = uploadedBlock;
            current++;
            onProgress?.(current, total);
        } catch (error: any) {
            // 上传失败的块也标记为非本地，避免重复上传
            const failedBlock = {...block, meta: {...block.meta, isLocal: false}};
            resultBlocks[i] = failedBlock;
            errors.push({
                block,
                error: error?.message || String(error),
            });
            current++;
            onProgress?.(current, total);
        }
    }

    debugLog('[SmartNotebookUpload] upload complete', {
        totalBlocks: blocks.length,
        localBlocks: total,
        successCount: total - errors.length,
        errorsCount: errors.length,
    });

    return {
        success: errors.length === 0,
        blocks: resultBlocks,
        errors,
    };
}

/**
 * 清理本地临时文件（可选）
 */
export async function cleanupLocalFiles(blocks: SmartNoteBlock[]): Promise<void> {
    // TODO: 如果需要，可以删除本地缓存文件
}
