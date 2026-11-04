// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {uploadMedia} from './smart_notebook_api';
import type {SmartNoteBlock} from './smart_notebook_api';

/**
 * 检查块是否包含本地文件
 */
export function isLocalBlock(block: SmartNoteBlock): boolean {
    if (!block.content) return false;

    // 检查 meta 标记
    if (block.meta?.isLocal) return true;

    // 检查路径前缀
    if (block.content.startsWith('file://')) return true;
    if (block.content.startsWith('/')) return true;

    // 检查是否是远程 URL
    if (block.content.startsWith('http://') || block.content.startsWith('https://')) {
        return false;
    }

    // 默认认为是本地文件
    return true;
}

/**
 * 上传单个本地文件到服务器
 */
export async function uploadLocalBlock(
    serverUrl: string,
    userId: string,
    block: SmartNoteBlock,
    onProgress?: (progress: number) => void,
): Promise<SmartNoteBlock> {
    if (!isLocalBlock(block)) {
        return block; // 已经是远程文件
    }

    const fileName = block.meta?.caption || 'file';
    const mimeType = block.meta?.mimeType || 'application/octet-stream';

    // 处理文件路径
    let fileUri = block.content;
    if (fileUri.startsWith('file://')) {
        fileUri = fileUri.substring(7); // 移除 file:// 前缀
    }

    try {
        // 上传文件
        const uploadResult = await uploadMedia(serverUrl, userId, {
            uri: fileUri,
            name: fileName,
            type: mimeType,
        });

        if (!uploadResult?.url) {
            throw new Error('上传失败：未获得URL');
        }

        // 创建新的块，替换本地路径为远程URL
        const uploadedBlock: SmartNoteBlock = {
            ...block,
            content: uploadResult.url,
            meta: {
                ...block.meta,
                isLocal: false, // 标记为已上传
            },
        };

        onProgress?.(1);
        return uploadedBlock;
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

    // 复制所有块
    const resultBlocks = [...blocks];

    // 逐个上传本地文件
    for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];

        if (!isLocalBlock(block)) {
            continue; // 跳过已上传的文件
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
            // 继续上传其他文件
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
    // 目前保留本地文件，以便用户离线查看
}
