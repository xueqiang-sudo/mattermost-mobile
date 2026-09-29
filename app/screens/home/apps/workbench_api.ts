// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * Workbench APIs — price_list, cloud_drive, knowledge_base, notebook.
 * Mirrors webapp workbench_panel APIs for React Native.
 */

import NetworkManager from '@managers/network_manager';

const FACT_EXTRACTOR_BASE = '/plugins/com.mattermost.fact-extractor';

async function apiFetch(serverUrl: string, path: string, options: {method: string; body?: any; headers?: Record<string, string>}): Promise<any> {
    const client = NetworkManager.getClient(serverUrl);
    const body = options.body ? JSON.stringify(options.body) : undefined;
    try {
        const resp = await client.doFetch(path, {method: options.method, ...(body ? {body} : {}), ...(options.headers ? {headers: options.headers} : {})});
        return resp;
    } catch (err: any) {
        // Extract error message from response if available
        if (err?.message) {
            throw new Error(err.message);
        }
        if (err?.status) {
            throw new Error(`HTTP ${err.status}`);
        }
        throw new Error('Network request failed');
    }
}

// ── Price List ──

export type PriceFile = {
    filename: string;
    fileSize: number;
    createdAt: string;
};

export async function listPriceFiles(serverUrl: string, teamId: string): Promise<PriceFile[]> {
    const data = await apiFetch(serverUrl, `${FACT_EXTRACTOR_BASE}/api/price-file/list?team_id=${encodeURIComponent(teamId)}`, {method: 'get'});
    return data?.data?.files || [];
}

export async function deletePriceFile(serverUrl: string, teamId: string, filename: string): Promise<void> {
    await apiFetch(serverUrl, `${FACT_EXTRACTOR_BASE}/api/price-file/delete?team_id=${encodeURIComponent(teamId)}&filename=${encodeURIComponent(filename)}`, {method: 'post'});
}

export function getPriceFileDownloadUrl(serverUrl: string, teamId: string, filename: string): string {
    return `${serverUrl}${FACT_EXTRACTOR_BASE}/api/price-file/download?team_id=${encodeURIComponent(teamId)}&filename=${encodeURIComponent(filename)}`;
}

// ── Cloud Drive ──

export type DriveFile = {
    id: string;
    team_id: string;
    parent_id: string;
    creator_id: string;
    type: 'file' | 'folder';
    name: string;
    extension: string;
    mime_type: string;
    size: number;
    scope: 'public' | 'private';
    owner_id: string;
    create_at: number;
    update_at: number;
};

export async function listDriveFiles(
    serverUrl: string,
    teamId: string,
    params: {parent_id?: string; scope?: string; owner_id?: string; page?: number; per_page?: number},
): Promise<{files: DriveFile[]; total_count: number}> {
    const query = new URLSearchParams();
    if (params.parent_id !== undefined) query.set('parent_id', params.parent_id);
    if (params.scope) query.set('scope', params.scope);
    if (params.owner_id) query.set('owner_id', params.owner_id);
    query.set('page', String(params.page ?? 0));
    query.set('per_page', String(params.per_page ?? 50));
    const data = await apiFetch(serverUrl, `/api/v4/teams/${teamId}/drive/files?${query.toString()}`, {method: 'get'});
    return {files: Array.isArray(data) ? data : [], total_count: 0};
}

export async function createDriveFolder(serverUrl: string, teamId: string, parentId: string, name: string, scope: string): Promise<DriveFile> {
    return apiFetch(serverUrl, `/api/v4/teams/${teamId}/drive/folders`, {
        method: 'post',
        body: {parent_id: parentId, name, scope},
    });
}

export async function renameDriveFile(serverUrl: string, teamId: string, fileId: string, name: string): Promise<DriveFile> {
    return apiFetch(serverUrl, `/api/v4/teams/${teamId}/drive/files/${fileId}`, {
        method: 'put',
        body: {name},
    });
}

export async function deleteDriveFile(serverUrl: string, teamId: string, fileId: string): Promise<void> {
    await apiFetch(serverUrl, `/api/v4/teams/${teamId}/drive/files/${fileId}`, {method: 'delete'});
}

export async function getDriveFilePath(serverUrl: string, teamId: string, fileId: string): Promise<DriveFile[]> {
    const data = await apiFetch(serverUrl, `/api/v4/teams/${teamId}/drive/files/${fileId}/path`, {method: 'get'});
    return Array.isArray(data) ? data : [];
}

export function getDriveDownloadUrl(serverUrl: string, teamId: string, fileId: string): string {
    return `${serverUrl}/api/v4/teams/${teamId}/drive/files/${fileId}/download`;
}

// ── Knowledge Base ──

export type KBDoc = {
    docId: string;
    title: string;
    content?: string;
    category: string;
    tags: string[];
    sourceUrl?: string;
    fileName?: string;
    fileSize?: number;
    chunks?: number;
    createdAt: string;
    updatedAt: string;
};

export type KBSearchResult = {
    docId: string;
    title: string;
    snippet: string;
    score: number;
    category: string;
};

export type KBAskSource = {
    type: string;
    title: string;
    snippet: string;
    score: number;
};

async function kbPost(serverUrl: string, path: string, teamId: string, body: Record<string, unknown>): Promise<any> {
    return apiFetch(serverUrl, `${FACT_EXTRACTOR_BASE}${path}?team_id=${encodeURIComponent(teamId)}`, {
        method: 'post',
        body,
    });
}

export async function listKBDocs(serverUrl: string, teamId: string, opts: {limit?: number; offset?: number; category?: string} = {}) {
    return kbPost(serverUrl, '/api/kb/list', teamId, {
        limit: opts.limit || 20,
        offset: opts.offset || 0,
        category: opts.category || '',
    });
}

export async function searchKBDocs(serverUrl: string, teamId: string, query: string, opts: {topK?: number; category?: string} = {}) {
    return kbPost(serverUrl, '/api/kb/search', teamId, {
        query,
        topK: opts.topK || 10,
        category: opts.category || '',
    });
}

export async function getKBDoc(serverUrl: string, teamId: string, docId: string) {
    return kbPost(serverUrl, '/api/kb/get', teamId, {docId});
}

export async function createKBDocText(serverUrl: string, teamId: string, title: string, content: string) {
    return kbPost(serverUrl, '/api/kb/create', teamId, {title, content, category: 'text'});
}

export async function createKBDocURL(serverUrl: string, teamId: string, title: string, sourceUrl: string) {
    return kbPost(serverUrl, '/api/kb/create', teamId, {title, sourceUrl});
}

export async function deleteKBDoc(serverUrl: string, teamId: string, docId: string) {
    return kbPost(serverUrl, '/api/kb/delete', teamId, {docId});
}

export async function askKB(serverUrl: string, teamId: string, query: string) {
    return kbPost(serverUrl, '/api/kb/ask', teamId, {query});
}

// ── Notebook ──

export type NoteListItem = {
    noteId: string;
    title: string;
    preview: string;
    tags: string[];
    createdAt: string;
};

export type NoteDetail = {
    noteId: string;
    content: string;
};

export async function listNoteEntries(serverUrl: string, teamId: string, scope: string, limit = 50) {
    const params = new URLSearchParams({team_id: teamId, scope, limit: String(limit)});
    return apiFetch(serverUrl, `${FACT_EXTRACTOR_BASE}/api/notebook/list?${params}`, {method: 'get'});
}

export async function getNoteEntry(serverUrl: string, teamId: string, entryId: string, scope: string) {
    const params = new URLSearchParams({team_id: teamId, scope});
    return apiFetch(serverUrl, `${FACT_EXTRACTOR_BASE}/api/notebook/entry/${entryId}?${params}`, {method: 'get'});
}

export async function addNoteEntry(serverUrl: string, teamId: string, scope: string, content: string) {
    return apiFetch(serverUrl, `${FACT_EXTRACTOR_BASE}/api/notebook/add?team_id=${teamId}`, {
        method: 'post',
        body: {teamId, scope, content},
    });
}

export async function deleteNoteEntry(serverUrl: string, teamId: string, entryId: string, scope: string) {
    const params = new URLSearchParams({team_id: teamId, scope});
    return apiFetch(serverUrl, `${FACT_EXTRACTOR_BASE}/api/notebook/entry/${entryId}?${params}`, {method: 'delete'});
}

export async function searchNoteEntries(serverUrl: string, teamId: string, scope: string, query: string, limit = 20) {
    const params = new URLSearchParams({team_id: teamId, scope, query, limit: String(limit)});
    return apiFetch(serverUrl, `${FACT_EXTRACTOR_BASE}/api/notebook/search?${params}`, {method: 'get'});
}
