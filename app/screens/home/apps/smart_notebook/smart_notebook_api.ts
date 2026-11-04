// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Smart Notebook API layer for mobile
// Uses PostgreSQL backend via fact-extractor plugin

import NetworkManager from '@managers/network_manager';

const PLUGIN_BASE = '/plugins/com.mattermost.fact-extractor';

// ── Types ──

export type SmartNoteBlock = {
    id: string;
    type: 'paragraph' | 'heading' | 'bulleted-list' | 'numbered-list' | 'list-item' | 'checklist' | 'blockquote' | 'code-block' | 'image' | 'video' | 'audio' | 'file' | 'table' | 'divider' | 'horizontal-rule';
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

export async function uploadMedia(
    serverUrl: string,
    userId: string,
    file: {uri: string; name: string; type: string},
): Promise<{url: string; fileId: string}> {
    const client = NetworkManager.getClient(serverUrl);

    const formData = new FormData();
    formData.append('user_id', userId);
    formData.append('file', {
        uri: file.uri,
        name: file.name,
        type: file.type,
    } as any);

    const resp = await client.doFetch(PLUGIN_BASE + '/api/smart-notebook/upload', {
        method: 'post',
        body: formData,
    });

    return resp.data;
}

// ── Voice Transcription (Direct API) ──

export async function transcribeAudio(
    serverUrl: string,
    file: {uri: string; name: string; type: string},
): Promise<{success: boolean; text?: string; error?: string}> {
    const client = NetworkManager.getClient(serverUrl);

    const formData = new FormData();
    formData.append('audio', {
        uri: file.uri,
        name: file.name,
        type: file.type,
    } as any);

    // Use voice-to-text-plugin's direct transcription API
    const VOICE_PLUGIN_BASE = '/plugins/com.superera.voice-recognition';
    const endpoint = VOICE_PLUGIN_BASE + '/api/v1/transcribe';

    try {
        const resp = await client.doFetch(endpoint, {
            method: 'post',
            body: formData,
        });

        // doFetch returns {data: ...} or throws on error
        return resp?.data || resp;
    } catch (e: any) {
        // Extract error details
        const errorMessage = e?.message || String(e);
        const serverMessage = e?.server_error?.message || e?.details?.error || '';
        console.log('[transcribeAudio] Error:', errorMessage, serverMessage);
        return {
            success: false,
            error: serverMessage || errorMessage || '语音转文字服务暂不可用',
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
            case 'image':
                return `![${block.meta?.caption || 'image'}](${content})`;
            case 'video':
                return `🎬 [video](${content})`;
            case 'audio':
                return `🎵 [audio](${content})`;
            case 'divider':
            case 'horizontal-rule':
                return '---';
            case 'table':
                // Tables are complex, just show content for now
                return content;
            default:
                return content;
        }
    }).join('\n\n');
}
