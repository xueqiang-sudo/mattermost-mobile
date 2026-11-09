// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Smart Notebook API layer for mobile
// 对齐 webapp：使用标准频道帖子存储笔记，标准 Posts API 做 CRUD
// 知识图谱查询使用 fact-extractor 插件 API

import DatabaseManager from '@database/manager';
import NetworkManager from '@managers/network_manager';
import {getCurrentTeamId, getCurrentUserId} from '@queries/servers/system';

const PLUGIN_BASE = '/plugins/com.mattermost.fact-extractor';
const API_BASE = '/api/v4';

// ── Types ──

export type Post = {
    id: string;
    channel_id: string;
    user_id: string;
    message: string;
    create_at: number;
    update_at: number;
    delete_at: number;
    file_ids?: string[];
};

export type Channel = {
    id: string;
    team_id: string;
    name: string;
    display_name: string;
    type: string;
};

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

// ── API helpers ──

async function doFetch(serverUrl: string, path: string, options: {method: string; body?: any}): Promise<any> {
    const client = NetworkManager.getClient(serverUrl);
    return client.doFetch(path, {
        method: options.method,
        ...(options.body ? {body: options.body} : {}),
    });
}

async function pluginFetch(serverUrl: string, path: string, options: {method: string; body?: any}): Promise<any> {
    return doFetch(serverUrl, PLUGIN_BASE + path, options);
}

// ── Channel API ──

/**
 * 获取或创建智能笔记本频道 sn_{userId}
 * 对齐 webapp：笔记存储在私有频道帖子中
 */
export async function getOrCreateSmartNotebookChannel(
    serverUrl: string,
): Promise<Channel | null> {
    const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
    const userId = await getCurrentUserId(database);
    const teamId = await getCurrentTeamId(database);

    if (!userId || !teamId) {
        return null;
    }

    const channelName = 'sn_' + userId;

    // 尝试查找已存在的频道
    try {
        const channel = await doFetch(serverUrl, `${API_BASE}/teams/${teamId}/channels/name/${channelName}`, {
            method: 'get',
        });
        if (channel?.id) {
            return channel;
        }
    } catch {
        // 频道不存在，需要创建
    }

    // 创建私有频道
    try {
        const channel = await doFetch(serverUrl, `${API_BASE}/channels`, {
            method: 'post',
            body: {
                team_id: teamId,
                name: channelName,
                display_name: '智能笔记本',
                type: 'P',
                header: '在这里记录你的想法，自动同步到知识图谱',
                purpose: '智能笔记本',
            },
        });
        return channel;
    } catch (err) {
        console.error('Failed to create smart notebook channel:', err);
        return null;
    }
}

// ── Posts API (CRUD) ──

/**
 * 获取频道帖子列表（= 笔记列表）
 */
export async function getChannelPosts(
    serverUrl: string,
    channelId: string,
    limit = 100,
): Promise<Post[]> {
    try {
        const result = await doFetch(serverUrl, `${API_BASE}/channels/${channelId}/posts?per_page=${limit}`, {
            method: 'get',
        });
        if (result?.posts) {
            // API 返回 {posts: {[id]: Post}, order: [id]}，转为数组并按时间降序
            const posts: Post[] = Object.values(result.posts);
            return posts.sort((a: Post, b: Post) => b.create_at - a.create_at);
        }
        return [];
    } catch {
        return [];
    }
}

/**
 * 获取单个帖子（= 笔记详情）
 */
export async function getPost(
    serverUrl: string,
    postId: string,
): Promise<Post | null> {
    try {
        const post = await doFetch(serverUrl, `${API_BASE}/posts/${postId}`, {
            method: 'get',
        });
        return post?.id ? post : null;
    } catch {
        return null;
    }
}

/**
 * 创建帖子（= 新建笔记）
 */
export async function createPost(
    serverUrl: string,
    channelId: string,
    message: string,
    fileIds?: string[],
): Promise<Post | null> {
    try {
        const body: any = {
            channel_id: channelId,
            message,
        };
        if (fileIds && fileIds.length > 0) {
            body.file_ids = fileIds;
        }
        const post = await doFetch(serverUrl, `${API_BASE}/posts`, {
            method: 'post',
            body,
        });
        return post?.id ? post : null;
    } catch (err) {
        console.error('Failed to create post:', err);
        return null;
    }
}

/**
 * 编辑帖子（= 编辑笔记）
 */
export async function editPost(
    serverUrl: string,
    postId: string,
    message: string,
): Promise<Post | null> {
    try {
        const post = await doFetch(serverUrl, `${API_BASE}/posts/${postId}/patch`, {
            method: 'put',
            body: {message},
        });
        return post?.id ? post : null;
    } catch (err) {
        console.error('Failed to edit post:', err);
        return null;
    }
}

/**
 * 删除帖子（= 删除笔记）
 */
export async function deletePost(
    serverUrl: string,
    postId: string,
): Promise<boolean> {
    try {
        await doFetch(serverUrl, `${API_BASE}/posts/${postId}`, {
            method: 'delete',
        });
        return true;
    } catch {
        return false;
    }
}

// ── Knowledge Graph Query API (plugin) ──

export async function queryGraph(
    serverUrl: string,
    userId: string,
    query: string,
    limit = 10,
): Promise<{success: boolean; entities: GraphEntity[]; relations: GraphRelation[]; total: number}> {
    return pluginFetch(serverUrl, '/api/smart-notebook/query-graph', {
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
    return pluginFetch(serverUrl, `/api/smart-notebook/graph-entities?${params}`, {method: 'get'});
}

export async function getGraphRelations(
    serverUrl: string,
    userId: string,
    limit = 100,
): Promise<{success: boolean; relations: GraphRelation[]; total: number}> {
    const params = new URLSearchParams({user_id: userId, limit: String(limit)});
    return pluginFetch(serverUrl, `/api/smart-notebook/graph-relations?${params}`, {method: 'get'});
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
        const correctExt = mimeToExt[file.type] || 'aac';
        if (!extension) {
            fileName = `${fileName}.${correctExt}`;
        } else {
            fileName = `${fileName.substring(0, fileName.lastIndexOf('.'))}.${correctExt}`;
        }
    }

    const VOICE_PLUGIN_BASE = '/plugins/com.superera.voice-recognition';
    const endpoint = VOICE_PLUGIN_BASE + '/api/v1/transcribe';

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
        const data = resp?.data || resp;
        return {success: true, ...data};
    } catch (e: any) {
        const errorMessage = e?.message || String(e);
        const serverMessage = e?.server_error?.message || e?.details?.error || '';
        const statusCode = e?.status_code || e?.statusCode;

        return {
            success: false,
            error: serverMessage || errorMessage || '语音转文字服务暂不可用',
            statusCode,
        };
    }
}
