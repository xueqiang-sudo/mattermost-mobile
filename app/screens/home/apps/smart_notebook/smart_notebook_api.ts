// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Smart Notebook API layer for mobile
// Uses PostgreSQL backend via fact-extractor plugin

import NetworkManager from '@managers/network_manager';

const PLUGIN_BASE = '/plugins/com.mattermost.fact-extractor';

// ── Types ──

export type SmartNoteBlock = {
    id: string;
    type: 'paragraph' | 'heading' | 'bulleted-list' | 'numbered-list' | 'list-item' | 'blockquote' | 'code-block' | 'image' | 'video' | 'audio' | 'table' | 'divider' | 'horizontal-rule';
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
    createdAt: string;
    updatedAt: string;
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

// ── Timeline ──

export type TimelineEntry = {
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
    tags: string[];
    eventCount: number;
};

export async function getTimeline(
    serverUrl: string,
    userId: string,
    limit = 50,
): Promise<{ok: boolean; entries: TimelineEntry[]; total: number}> {
    const params = new URLSearchParams({user_id: userId, limit: String(limit)});
    return smartNotebookFetch(serverUrl, `/api/smart-notebook/timeline?${params}`, {method: 'get'});
}

// ── Related Notes ──

export type RelatedNote = {
    id: string;
    title: string;
    tags: string[];
    updatedAt: number;
};

export async function getRelatedNotes(
    serverUrl: string,
    userId: string,
    noteId: string,
    limit = 10,
): Promise<{ok: boolean; entries: RelatedNote[]; total: number}> {
    const params = new URLSearchParams({user_id: userId, note_id: noteId, limit: String(limit)});
    return smartNotebookFetch(serverUrl, `/api/smart-notebook/related?${params}`, {method: 'get'});
}

// ── Graphiti Push ──

export async function pushToGraphiti(
    serverUrl: string,
    userId: string,
    noteId: string,
): Promise<{ok: boolean; message: string; pushed: boolean; pushedAt?: number}> {
    return smartNotebookFetch(serverUrl, `/api/smart-notebook/push-graphiti`, {
        method: 'post',
        body: {userId, noteId},
    });
}
