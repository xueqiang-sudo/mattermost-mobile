// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import NetworkManager from '@managers/network_manager';

// ─── AI Customer Service (bot DM in GM channels) ───

export type BotInfo = {
    botId: string;
    label: string;
    teamId: string;
};

/**
 * Fetch bots available for a GM channel.
 * Server endpoint: GET /channels/{channelId}/bots
 */
export async function getChannelBots(serverUrl: string, channelId: string): Promise<BotInfo[]> {
    const client = NetworkManager.getClient(serverUrl);
    const data = await client.doFetch(
        `${client.getChannelRoute(channelId)}/bots`,
        {method: 'get'},
    );
    return (data || []).map((info: any) => ({
        botId: info.bot_id,
        label: info.team_name || info.bot_id,
        teamId: info.team_id || '',
    }));
}

/**
 * Open or create a DM channel with a bot user.
 */
export async function openDirectChannelWithBot(serverUrl: string, botUserId: string): Promise<{id: string} | null> {
    const client = NetworkManager.getClient(serverUrl);
    try {
        const channel = await client.createDirectChannel([botUserId]);
        return channel;
    } catch {
        return null;
    }
}

// ─── Consult Expert (ask-expert plugin) ───

const CONSULT_API_BASE = '/plugins/com.mattermost.ask-expert/api/v1/consultations';

export type ConsultationInfo = {
    id: string;
    source_channel_id: string;
    target_user_id: string;
    target_username: string;
    target_display_name: string;
    question: string;
    status: string;
    created_at: number;
    expert_group_id: string;
    expert_group_name: string;
    is_group_consult: boolean;
};

export type ConsultationResponse = {
    post_id: string;
    message: string;
    author_id: string;
    author_name: string;
    create_at: number;
    forwarded: boolean;
    is_requester: boolean;
};

async function apiPost<T>(serverUrl: string, url: string, body: Record<string, unknown>): Promise<T> {
    const client = NetworkManager.getClient(serverUrl);
    return client.doFetch(url, {
        method: 'post',
        body: JSON.stringify(body),
    });
}

async function apiGet<T>(serverUrl: string, url: string): Promise<T> {
    const client = NetworkManager.getClient(serverUrl);
    return client.doFetch(url, {method: 'get'});
}

export async function createConsultation(serverUrl: string, params: {
    target_user_id?: string;
    expert_group_id?: string;
    source_channel_id: string;
    team_id?: string;
    question: string;
}): Promise<any> {
    return apiPost(serverUrl, CONSULT_API_BASE, params);
}

export async function listConsultations(serverUrl: string, sourceChannelId: string): Promise<{consultations: ConsultationInfo[]}> {
    return apiGet(serverUrl, `${CONSULT_API_BASE}?source_channel_id=${encodeURIComponent(sourceChannelId)}`);
}

export async function getConsultationResponses(serverUrl: string, id: string): Promise<{responses: ConsultationResponse[]}> {
    return apiGet(serverUrl, `${CONSULT_API_BASE}/${encodeURIComponent(id)}/responses`);
}

export async function replyToConsultation(serverUrl: string, id: string, message: string): Promise<{status: string; post_id: string}> {
    return apiPost(serverUrl, `${CONSULT_API_BASE}/${encodeURIComponent(id)}/reply`, {message});
}

export async function closeConsultation(serverUrl: string, id: string): Promise<{status: string}> {
    return apiPost(serverUrl, `${CONSULT_API_BASE}/${encodeURIComponent(id)}/close`, {});
}

// ─── AI Assistant (fact-extractor plugin) ───

const AI_API_BASE = '/plugins/com.mattermost.fact-extractor';

export type AISearchResult = {
    id: string;
    memory: string;
    date?: string;
    channel_id?: string;
    channel_name?: string;
    type?: string;
    score?: number;
    path?: string;
    metadata?: Record<string, unknown>;
};

export async function queryAIAssistant(serverUrl: string, params: {
    team_id: string;
    mode: 'channel_latest' | 'channel_history' | 'channel_active';
    channel_id: string;
    date?: string;
}): Promise<{results: AISearchResult[]}> {
    return apiPost(serverUrl, `${AI_API_BASE}/api/query`, params);
}

export async function askKnowledgeBase(serverUrl: string, teamId: string, query: string): Promise<{answer: string}> {
    return apiPost(serverUrl, `${AI_API_BASE}/api/kb/ask?team_id=${encodeURIComponent(teamId)}`, {query});
}
