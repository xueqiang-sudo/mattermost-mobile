// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {uploadMedia} from './smart_notebook_api';
import type {SmartNoteBlock} from './smart_notebook_api';

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

    // 默认认为是本地文件
    return Boolean(block.content);
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
    const mimeType = result.meta?.mimeType || 'application/octet-stream';

    let fileUri = block.content;
    if (fileUri.startsWith('file://')) {
        fileUri = fileUri.substring(7);
    }

    try {
        const uploadResult = await uploadMedia(serverUrl, userId, {
            uri: fileUri,
            name: fileName,
            type: mimeType,
        });

        if (!uploadResult?.url) {
            throw new Error('上传失败：未获得URL');
        }

        result.content = uploadResult.url;
        result.meta!.url = uploadResult.url;
        result.meta!.mmFileId = uploadResult.fileId || '';
        result.meta!.isLocal = false;

        onProgress?.(1);
        return result;
    } catch (error) {
        console.error('[SmartNotebookUpload] 上传失败:', fileName, error);
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
            errors.push({
                block,
                error: error?.message || String(error),
            });
        }
    }

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
