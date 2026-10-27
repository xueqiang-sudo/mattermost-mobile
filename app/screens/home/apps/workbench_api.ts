// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * Workbench APIs — price_list, cloud_drive, knowledge_base, notebook.
 * Mirrors webapp workbench_panel APIs for React Native.
 */

import NetworkManager from '@managers/network_manager';

const FACT_EXTRACTOR_BASE = '/plugins/com.mattermost.fact-extractor';
const FRAPPE_SYNC_BASE = '/plugins/com.mattermost.frappe-sync';

async function apiFetch(serverUrl: string, path: string, options: {method: string; body?: any; headers?: Record<string, string>}): Promise<any> {
    const client = NetworkManager.getClient(serverUrl);
    try {
        const resp = await client.doFetch(path, {method: options.method, ...(options.body ? {body: options.body} : {}), ...(options.headers ? {headers: options.headers} : {})});
        return resp;
    } catch (err: any) {
        // Build detailed error message including server error info
        const parts: string[] = [];
        if (err?.message) {
            parts.push(err.message);
        }
        if (err?.details?.message) {
            parts.push(err.details.message);
        }
        if (err?.server_error_id) {
            parts.push(`(server_error_id: ${err.server_error_id})`);
        }
        if (err?.status_code) {
            parts.push(`(status ${err.status_code})`);
        }
        if (err?.details?.data) {
            parts.push(`(data: ${JSON.stringify(err.details.data)})`);
        }
        throw new Error(parts.length > 0 ? parts.join(' | ') : 'Network request failed');
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
    mm_file_id?: string;
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

export function getDrivePreviewUrl(serverUrl: string, teamId: string, fileId: string): string {
    return `${serverUrl}/api/v4/teams/${teamId}/drive/files/${fileId}/preview`;
}

export async function copyDriveFileToChannel(serverUrl: string, teamId: string, fileId: string, channelId: string): Promise<any> {
    return apiFetch(serverUrl, `/api/v4/teams/${teamId}/drive/files/${fileId}/copy-to-channel`, {
        method: 'post',
        body: {channel_id: channelId},
    });
}

import {debugLog} from '@store/debug_log';
import {toMilliseconds} from '@utils/datetime';

export async function uploadDriveFile(
    serverUrl: string,
    teamId: string,
    parentId: string,
    scope: string,
    fileUri: string,
    fileName: string,
    fileType: string,
): Promise<DriveFile> {
    // Debug: Log upload parameters
    debugLog('[uploadDriveFile] Parameters:', JSON.stringify({
        teamId,
        parentId,
        scope,
        fileUri,
        fileName,
        fileType,
    }));

    const client = NetworkManager.getClient(serverUrl);

    // Use the same upload method as chat window (apiClient.upload)
    // This handles file URIs correctly, including URL-encoded characters
    const url = `/api/v4/teams/${teamId}/drive/files`;
    const options = {
        method: 'POST',
        multipart: {
            data: {
                parent_id: parentId,
                scope: scope,
            },
        },
        timeoutInterval: toMilliseconds({minutes: 3}),
        headers: client.getRequestHeaders('POST'),
    };

    // Remove file:// prefix if present (apiClient.upload expects plain path)
    const localPath = fileUri.replace('file://', '');

    debugLog('[uploadDriveFile] Using apiClient.upload with localPath:', localPath);

    return new Promise<DriveFile>((resolve, reject) => {
        const promise = client.apiClient.upload(url, localPath, options);

        promise.then((response: any) => {
            debugLog('[uploadDriveFile] Upload response:', JSON.stringify({
                ok: response.ok,
                status: response.status,
                hasData: Boolean(response.data),
            }));

            if (!response.ok) {
                const errorMsg = response.data?.message || response.error || 'Upload failed';
                reject(new Error(errorMsg));
                return;
            }

            // Parse response - server returns array of files or single file object
            const files = response.data?.data || response.data || response;
            const file = Array.isArray(files) ? files[0] : files;
            resolve(file as DriveFile);
        }).catch((error: any) => {
            debugLog('[uploadDriveFile] Upload error:', JSON.stringify({
                message: error?.message,
                status: error?.status,
                data: error?.data,
            }));
            reject(new Error(error?.data?.message || error?.message || 'Upload failed'));
        });
    });
}

// ── Conversations ──

export type ConversationChannel = {
    id: string;
    display_name: string;
    type: string;
    last_post_at: number;
    member_ids: string[];
};

export type ConversationItem = {
    channel_id: string;
    channel_name: string;
    date: string;
    summary: string;
    message_count: number;
    participant_count: number;
    last_activity: number;
};

export type ConversationMessage = {
    id: string;
    user_id: string;
    username: string;
    message: string;
    create_at: number;
    file_ids?: string[];
};

export type ConversationDetail = {
    channel_id: string;
    channel_name: string;
    date: string;
    summary: string;
    messages: ConversationMessage[];
};

export async function listConversations(
    serverUrl: string,
    teamId: string,
    userId: string,
    _date?: string,
): Promise<ConversationChannel[]> {
    const params = new URLSearchParams({
        team_id: teamId,
    });
    if (userId) {
        params.set('user_id', userId);
    }
    const data = await apiFetch(
        serverUrl,
        `${FRAPPE_SYNC_BASE}/api/conversations/list?${params}`,
        {method: 'get'},
    );
    return data?.channels || [];
}

export async function getConversationDetail(
    serverUrl: string,
    teamId: string,
    channelId: string,
    date: string,
): Promise<ConversationDetail> {
    const params = new URLSearchParams({
        team_id: teamId,
        channel_id: channelId,
        date,
    });
    const data = await apiFetch(
        serverUrl,
        `${FACT_EXTRACTOR_BASE}/api/conversations/detail?${params}`,
        {method: 'get'},
    );
    return data || {channel_id: channelId, channel_name: '', date, summary: '', messages: []};
}

export type FactQueryResult = {
    memory: string;
    raw_messages: Array<{user: string; text: string; time: string}>;
    raw_messages_available: boolean;
    raw_messages_truncated: boolean;
};

export async function fetchFactQuery(
    serverUrl: string,
    teamId: string,
    channelId: string,
    mode: string,
    extra: Record<string, any>,
): Promise<{results: FactQueryResult[]}> {
    return apiFetch(serverUrl, `${FACT_EXTRACTOR_BASE}/api/query`, {
        method: 'post',
        body: {team_id: teamId, channel_id: channelId, mode, include_raw: true, ...extra},
    });
}

export async function graduateMemory(
    serverUrl: string,
    teamId: string,
    memoryPath: string,
): Promise<any> {
    return apiFetch(serverUrl, `${FACT_EXTRACTOR_BASE}/api/kb/graduate?team_id=${encodeURIComponent(teamId)}`, {
        method: 'post',
        body: {memoryPath},
    });
}

export async function fetchActiveDates(
    serverUrl: string,
    teamId: string,
    channelIds: string[],
    year: number,
    month: number,
): Promise<Map<string, string[]>> {
    const data = await apiFetch(serverUrl, `${FACT_EXTRACTOR_BASE}/api/query/active-dates`, {
        method: 'post',
        body: {
            team_id: teamId,
            channel_ids: channelIds,
            year,
            month,
        },
    });

    const result = new Map<string, string[]>();
    if (data?.active_dates) {
        for (const [channelId, dates] of Object.entries(data.active_dates)) {
            result.set(channelId, dates as string[]);
        }
    }
    return result;
}

// ── Knowledge Base ──

export type KBDoc = {
    docId: string;
    title: string;
    content?: string;
    category: string;
    tags: string[];
    sourceUrl?: string;
    filename?: string;
    fileName?: string;
    fileSize?: number;
    chunks?: number;
    createdAt: string;
    updatedAt?: string;
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
    debugLog('[createKBDocText] Creating text document:', JSON.stringify({teamId, title}));
    return kbPost(serverUrl, '/api/kb/create', teamId, {
        title,
        content,
        category: 'text',
    });
}

export async function createKBDocURL(serverUrl: string, teamId: string, title: string, sourceUrl: string) {
    debugLog('[createKBDocURL] Creating URL document:', JSON.stringify({teamId, title, sourceUrl}));
    return kbPost(serverUrl, '/api/kb/create', teamId, {
        title,
        sourceUrl,
        category: 'url',
    });
}

export async function deleteKBDoc(serverUrl: string, teamId: string, docId: string) {
    return kbPost(serverUrl, '/api/kb/delete', teamId, {docId});
}

export async function askKB(serverUrl: string, teamId: string, query: string) {
    return kbPost(serverUrl, '/api/kb/ask', teamId, {query});
}

// File upload support
export const KB_SUPPORTED_EXTENSIONS = '.pdf,.doc,.docx,.txt,.md,.xlsx,.xls,.csv,.pptx,.ppt,.rtf,.json,.yaml,.py,.js,.ts,.java,.go,.rs,.c,.cpp,.h,.hpp,.eml,.msg,.png,.jpg,.jpeg,.epub,.odt';

export const KB_SUPPORTED_LABEL = 'PDF, Word, Excel, CSV, PowerPoint, TXT, Markdown, HTML, RTF, JSON, YAML, 代码文件, EML, MSG, 图片, EPUB, ODT';

export async function uploadKBFile(
    serverUrl: string,
    teamId: string,
    fileUri: string,
    fileName: string,
    fileType: string,
): Promise<{file_uuid: string; filename: string}> {
    debugLog('[uploadKBFile] Starting upload:', JSON.stringify({
        teamId,
        fileUri,
        fileName,
        fileType,
    }));

    const client = NetworkManager.getClient(serverUrl);
    const formData = new FormData();
    formData.append('file', {
        uri: fileUri,
        name: fileName,
        type: fileType,
    } as any);

    try {
        const resp = await client.doFetch(
            `${FACT_EXTRACTOR_BASE}/api/kb/upload?team_id=${encodeURIComponent(teamId)}`,
            {method: 'post', body: formData},
        );

        debugLog('[uploadKBFile] Upload response:', JSON.stringify({
            ok: resp.ok,
            hasFileUuid: Boolean(resp.file_uuid),
            hasError: Boolean(resp.error),
            error: resp.error,
        }));

        if (!resp.ok) {
            throw new Error(resp.error || 'Upload failed');
        }
        if (!resp.file_uuid) {
            throw new Error('上传成功但未返回文件ID');
        }
        return {file_uuid: resp.file_uuid, filename: resp.filename || fileName};
    } catch (err) {
        debugLog('[uploadKBFile] Error:', String(err));
        throw err;
    }
}

export async function createKBDocFile(
    serverUrl: string,
    teamId: string,
    fileUri: string,
    fileName: string,
    fileType: string,
): Promise<any> {
    debugLog('[createKBDocFile] Starting file upload process:', JSON.stringify({
        teamId,
        fileName,
        fileType,
    }));

    try {
        // Step 1: Upload file
        debugLog('[createKBDocFile] Step 1: Uploading file...');
        const {file_uuid} = await uploadKBFile(serverUrl, teamId, fileUri, fileName, fileType);
        debugLog('[createKBDocFile] File uploaded, file_uuid:', file_uuid);

        // Step 2: Create KB entry
        // Explicitly set category to 'file' for proper filtering (matching webapp behavior)
        debugLog('[createKBDocFile] Step 2: Creating KB entry...');
        const result = await kbPost(serverUrl, '/api/kb/create', teamId, {
            fileId: file_uuid,
            fileName,
            title: fileName,
            category: 'file',
        });
        debugLog('[createKBDocFile] KB entry created:', JSON.stringify({
            docId: result?.docId,
            hasError: Boolean(result?.error),
        }));

        return result;
    } catch (err) {
        debugLog('[createKBDocFile] Error:', String(err));
        throw err;
    }
}

export async function updateKBDoc(
    serverUrl: string,
    teamId: string,
    docId: string,
    updates: {title?: string; content?: string; tags?: string; category?: string},
): Promise<any> {
    return kbPost(serverUrl, '/api/kb/update', teamId, {docId, ...updates});
}

export function getKBDownloadUrl(serverUrl: string, docId: string, teamId: string): string {
    const params = new URLSearchParams({docId, team_id: teamId});
    return `${serverUrl}${FACT_EXTRACTOR_BASE}/api/kb/download?${params.toString()}`;
}

/**
 * Resolve a KB document to a first-class Mattermost FileInfo.
 * The plugin downloads the file from OpenSquilla (if not cached) and uploads
 * it as a Mattermost file, returning the real `mm_file_id` that can be used
 * with /api/v4/files/{id}/* endpoints (PDF conversion, preview, etc.).
 */
export async function getKBFileInfo(
    serverUrl: string,
    docId: string,
    teamId: string,
): Promise<{mm_file_id: string; filename: string}> {
    const params = new URLSearchParams({docId, team_id: teamId});
    const data = await apiFetch(
        serverUrl,
        `${FACT_EXTRACTOR_BASE}/api/kb/file-info?${params.toString()}`,
        {method: 'get'},
    );
    return {
        mm_file_id: data?.mm_file_id || '',
        filename: data?.filename || '',
    };
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

// ---- Category Management API ----

export async function deleteCategory(
    serverUrl: string,
    userId: string,
    teamId: string,
    categoryId: string,
): Promise<void> {
    await apiFetch(serverUrl, `/api/v4/users/${userId}/teams/${teamId}/channels/categories/${categoryId}`, {method: 'delete'});
}
