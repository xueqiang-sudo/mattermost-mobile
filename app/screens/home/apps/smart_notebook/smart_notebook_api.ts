// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Smart Notebook API layer for mobile
// Uses PostgreSQL backend via fact-extractor plugin

import DatabaseManager from '@database/manager';
import NetworkManager from '@managers/network_manager';
import {getCurrentTeamId} from '@queries/servers/system';
import {debugLog} from '@store/debug_log';

import {uploadDriveFile} from '../workbench_api';

const PLUGIN_BASE = '/plugins/com.mattermost.fact-extractor';

// ── Types ──

export type SmartNoteBlock = {
    id: string;
    type: 'paragraph' | 'heading' | 'bulleted-list' | 'numbered-list' | 'checklist' | 'blockquote' | 'code-block' | 'image' | 'file' | 'table' | 'divider' | 'horizontal-rule';
    content: string;
    order: number;
    meta?: Record<string, any>;
    children?: SmartNoteBlock[];
};

export type SmartNote = {
    id: string;
    title: string;
    blocks: SmartNoteBlock[];
    tags: string[];
    pinned: boolean;
    wordCount: number;
    createdAt: string;
    updatedAt: string;
};

export type SmartNoteSummary = {
    id: string;
    title: string;
    preview: string;
    tags: string[];
    pinned: boolean;
    createdAt: number;
    updatedAt: number;
};

// ── API helpers ──

async function smartNotebookFetch(serverUrl: string, path: string, options: {method: string; body?: any}): Promise<any> {
    const client = NetworkManager.getClient(serverUrl);
    return client.doFetch(PLUGIN_BASE + path, {
        method: options.method,
        ...(options.body ? {body: options.body} : {}),
    });
}

// ── Public API ──

export async function listNotes(serverUrl: string, userId: string, scope = 'private'): Promise<{total: number; entries: SmartNoteSummary[]}> {
    const params = new URLSearchParams({user_id: userId, scope});
    return smartNotebookFetch(serverUrl, `/api/smart-notebook/list?${params}`, {method: 'get'});
}

export async function getNote(serverUrl: string, userId: string, noteId: string): Promise<SmartNote | null> {
    const params = new URLSearchParams({user_id: userId});
    const result = await smartNotebookFetch(serverUrl, `/api/smart-notebook/entry/${noteId}?${params}`, {method: 'get'});
    return result?.data || null;
}

export async function createNote(serverUrl: string, userId: string, title?: string, scope = 'private'): Promise<SmartNote> {
    const result = await smartNotebookFetch(serverUrl, `/api/smart-notebook/create?user_id=${userId}`, {
        method: 'post',
        body: {
            userId,
            scope,
            title: title || '无标题',
            blocks: [],
        },
    });
    return result.data;
}

export async function updateNote(serverUrl: string, userId: string, noteId: string, updates: {
    title?: string;
    blocks?: SmartNoteBlock[];
    tags?: string[];
    pinned?: boolean;
}): Promise<SmartNote | null> {
    const params = new URLSearchParams({user_id: userId});
    const result = await smartNotebookFetch(serverUrl, `/api/smart-notebook/entry/${noteId}?${params}`, {
        method: 'put',
        body: {
            userId,
            noteId,
            ...updates,
        },
    });
    return result?.data || null;
}

export async function deleteNote(serverUrl: string, userId: string, noteId: string): Promise<boolean> {
    const params = new URLSearchParams({user_id: userId});
    const result = await smartNotebookFetch(serverUrl, `/api/smart-notebook/entry/${noteId}?${params}`, {
        method: 'delete',
    });
    return result?.ok || false;
}

export async function searchNotes(serverUrl: string, userId: string, query: string, limit = 20, scope = 'private'): Promise<{total: number; entries: SmartNoteSummary[]}> {
    const params = new URLSearchParams({user_id: userId, scope, query, limit: String(limit)});
    return smartNotebookFetch(serverUrl, `/api/smart-notebook/search?${params}`, {method: 'get'});
}

// ── Graphiti Push ──

export async function pushToGraphiti(
    serverUrl: string,
    userId: string,
    noteId: string,
): Promise<{ok: boolean; message: string; pushed: boolean; pushedAt?: number}> {
    return smartNotebookFetch(serverUrl, '/api/smart-notebook/push-graphiti', {
        method: 'post',
        body: {userId, noteId},
    });
}

// ── Knowledge Graph Query ──

export type GraphEntity = {
    name: string;
    summary: string;
    uuid: string;
    attributes: Record<string, any>;
};

export type GraphRelation = {
    source: string;
    target: string;
    relation_type: string;
    summary: string;
    uuid: string;
};

export async function queryGraph(
    serverUrl: string,
    userId: string,
    query: string,
    limit = 10,
): Promise<{success: boolean; entities: GraphEntity[]; relations: GraphRelation[]; total: number}> {
    return smartNotebookFetch(serverUrl, '/api/smart-notebook/query-graph', {
        method: 'post',
        body: {userId, query, limit},
    });
}

export async function getGraphEntities(
    serverUrl: string,
    userId: string,
    limit = 100,
): Promise<{success: boolean; entities: GraphEntity[]; total: number}> {
    const params = new URLSearchParams({user_id: userId, limit: String(limit)});
    return smartNotebookFetch(serverUrl, `/api/smart-notebook/graph-entities?${params}`, {method: 'get'});
}

export async function getGraphRelations(
    serverUrl: string,
    userId: string,
    limit = 100,
): Promise<{success: boolean; relations: GraphRelation[]; total: number}> {
    const params = new URLSearchParams({user_id: userId, limit: String(limit)});
    return smartNotebookFetch(serverUrl, `/api/smart-notebook/graph-relations?${params}`, {method: 'get'});
}

// ── Media Upload ──

async function ensureUploadBasename(fileUri: string, fileName: string): Promise<string> {
    try {
        const safeName = fileName.replace(/[/\\]/g, '');
        if (!safeName) {
            debugLog('[ensureUploadBasename] 文件名为空，返回原 URI');
            return fileUri;
        }
        const withScheme = fileUri.startsWith('file://') ? fileUri : `file://${fileUri}`;
        const currentBase = decodeURIComponent(withScheme.split('/').pop() || '');

        debugLog('[ensureUploadBasename] 路径分析:', {
            originalUri: fileUri,
            withScheme,
            currentBase,
            safeName,
            match: currentBase === safeName,
        });

        if (currentBase === safeName) {
            debugLog('[ensureUploadBasename] basename 已正确，返回原 URI');
            return fileUri; // basename 已正确，无需复制
        }

        debugLog('[ensureUploadBasename] basename 不匹配，复制文件...');
        const {cacheDirectory, makeDirectoryAsync, copyAsync} = await import('expo-file-system');
        const dir = `${cacheDirectory}smart_notebook_upload_${Date.now()}/`;
        await makeDirectoryAsync(dir, {intermediates: true});
        const dest = `${dir}${safeName}`;
        await copyAsync({from: withScheme, to: dest});

        debugLog('[ensureUploadBasename] 文件已复制到:', dest);
        return dest;
    } catch (e) {
        debugLog('[ensureUploadBasename] 处理失败:', e);
        return fileUri;
    }
}

export async function uploadMedia(
    serverUrl: string,
    userId: string,
    file: {uri: string; name: string; type: string},
): Promise<{url: string; fileId: string; mmFileId: string}> {
    debugLog('[uploadMedia] 开始上传（使用云盘 API）:', {
        originalUri: file.uri,
        fileName: file.name,
        fileType: file.type,
    });

    // 获取当前 teamId
    const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
    const teamId = await getCurrentTeamId(database);

    if (!teamId) {
        debugLog('[uploadMedia] 无法获取 teamId');
        throw new Error('无法获取团队信息');
    }

    debugLog('[uploadMedia] 获取到 teamId:', teamId);

    // 使用云盘 API 上传（不需要 channelID）
    const driveFile = await uploadDriveFile(
        serverUrl,
        teamId,
        '', // parentId: 空字符串表示上传到根目录
        'private', // scope: 私有文件
        file.uri,
        file.name,
        file.type,
    );

    // 构建文件 URL（对齐 webapp：使用相对路径，不带 serverUrl）
    const fileUrl = `/api/v4/teams/${teamId}/drive/files/${driveFile.id}/download`;

    debugLog('[uploadMedia] 上传成功:', {
        url: fileUrl,
        fileId: driveFile.id,
        mmFileId: driveFile.mm_file_id || '',
    });

    return {
        url: fileUrl,
        fileId: driveFile.id,
        mmFileId: driveFile.mm_file_id || '',
    };
}

// ── Voice Transcription (Direct API) ──

export async function transcribeAudio(
    serverUrl: string,
    file: {uri: string; name: string; type: string},
): Promise<{success: boolean; text?: string; error?: string; statusCode?: number}> {
    const client = NetworkManager.getClient(serverUrl);

    // 确保文件名有正确的扩展名
    let fileName = file.name;
    const extension = fileName.split('.').pop()?.toLowerCase();
    if (!extension || !['mp3', 'wav', 'amr', 'aac', 'm4a', 'ogg'].includes(extension)) {
        // 从 MIME type 推断扩展名
        const mimeToExt: Record<string, string> = {
            'audio/mpeg': 'mp3',
            'audio/wav': 'wav',
            'audio/x-wav': 'wav',
            'audio/amr': 'amr',
            'audio/aac': 'aac',
            'audio/mp4': 'm4a',
            'audio/x-m4a': 'm4a',
            'audio/ogg': 'ogg',
        };
        const correctExt = mimeToExt[file.type] || 'aac'; // 默认使用 aac
        if (!extension) {
            fileName = `${fileName}.${correctExt}`;
        } else {
            fileName = `${fileName.substring(0, fileName.lastIndexOf('.'))}.${correctExt}`;
        }
    }

    const VOICE_PLUGIN_BASE = '/plugins/com.superera.voice-recognition';
    const endpoint = VOICE_PLUGIN_BASE + '/api/v1/transcribe';

    console.log('[transcribeAudio] 请求信息:', {
        endpoint,
        originalName: file.name,
        finalName: fileName,
        mimeType: file.type,
        uri: file.uri,
    });

    const formData = new FormData();
    formData.append('audio', {
        uri: file.uri,
        name: fileName,
        type: file.type,
    } as any);

    try {
        const resp = await client.doFetch(endpoint, {
            method: 'post',
            body: formData,
        });

        console.log('[transcribeAudio] 成功响应:', resp);
        // doFetch returns {data: ...} or throws on error
        return resp?.data || resp;
    } catch (e: any) {
        // Extract error details
        const errorMessage = e?.message || String(e);
        const serverMessage = e?.server_error?.message || e?.details?.error || '';
        const statusCode = e?.status_code || e?.statusCode;
        const responseData = e?.details?.data || e?.response?.data;

        console.error('[transcribeAudio] 错误详情:', {
            message: errorMessage,
            serverMessage,
            statusCode,
            responseData,
            fullError: JSON.stringify(e, null, 2),
        });

        return {
            success: false,
            error: serverMessage || errorMessage || '语音转文字服务暂不可用',
            statusCode,
        };
    }
}

// ── Markdown <-> Blocks Conversion Helpers ──

export function markdownToBlocks(markdown: string): SmartNoteBlock[] {
    // Store entire markdown as a single paragraph block
    // This is the simplest approach that works with the backend
    if (!markdown.trim()) {
        return [];
    }
    return [{
        id: 'blk_markdown',
        type: 'paragraph',
        content: markdown,
        order: 0,
        meta: {format: 'markdown'},
    }];
}

export function blocksToMarkdown(blocks: SmartNoteBlock[]): string {
    if (!blocks || blocks.length === 0) {
        return '';
    }

    // Check if it's a single markdown block (mobile format)
    if (blocks.length === 1 && blocks[0].meta?.format === 'markdown') {
        return blocks[0].content;
    }

    // Convert Editor.js style blocks to markdown
    // Handle HTML tags from webapp (like <br>, <b>, <i>, etc.)
    const cleanHtml = (text: string): string => {
        if (!text) return '';
        return text
            .replace(/<br\s*\/?>/gi, '\n')          // <br> → newline
            .replace(/<\/?b>/gi, '**')               // <b> → **bold**
            .replace(/<\/?strong>/gi, '**')          // <strong> → **bold**
            .replace(/<\/?i>/gi, '*')                // <i> → *italic*
            .replace(/<\/?em>/gi, '*')               // <em> → *italic*
            .replace(/<\/?u>/gi, '')                 // <u> → remove
            .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')  // <a> → markdown link
            .replace(/<code>(.*?)<\/code>/gi, '`$1`')  // <code> → `code`
            .replace(/<mark>(.*?)<\/mark>/gi, '==$1==')  // <mark> → ==highlight==
            .replace(/<\/?[^>]+>/g, '');             // Remove remaining HTML tags
    };

    return blocks.map(block => {
        const content = cleanHtml(block.content || '');
        const url = block.content || '';

        switch (block.type) {
            case 'heading': {
                const level = block.meta?.level || 2;
                const prefix = '#'.repeat(Math.min(level, 6));
                return `${prefix} ${content}`;
            }
            case 'blockquote':
                return `> ${content}`;
            case 'code-block':
                return `\`\`\`\n${content}\n\`\`\``;
            case 'bulleted-list': {
                const items = block.meta?.items || [content];
                return items.map((item: string) => `- ${cleanHtml(item)}`).join('\n');
            }
            case 'numbered-list': {
                const items = block.meta?.items || [content];
                return items.map((item: string, i: number) => `${i + 1}. ${cleanHtml(item)}`).join('\n');
            }
            case 'image': {
                // 对齐 webapp：检测 VIDEO/AUDIO caption 编码
                const imgCaption = block.meta?.caption || '';
                const mediaMatch = imgCaption.match(/^\[(VIDEO|AUDIO):([^\]]*)\](.*)$/);
                if (mediaMatch) {
                    const mediaType = mediaMatch[1];
                    const mediaUrl = mediaMatch[2];
                    const displayName = mediaMatch[3] || 'media';
                    if (mediaType === 'VIDEO') {
                        return `🎬 [${displayName}](${mediaUrl})`;
                    }
                    return `🎵 [${displayName}](${mediaUrl})`;
                }
                return `![${imgCaption || 'image'}](${url})`;
            }
            case 'file':
                return `📄 [${block.meta?.fileName || block.meta?.caption || 'file'}](${url})`;
            case 'divider':
            case 'horizontal-rule':
                return '---';
            case 'table':
                return content;
            default:
                return content;
        }
    }).join('\n\n');
}
