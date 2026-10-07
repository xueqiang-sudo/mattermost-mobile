// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {makeBotGroupChannel} from '@actions/remote/channel';
import NetworkManager from '@managers/network_manager';
import {debugLog} from '@store/debug_log';

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
    debugLog('AI_API', `getChannelBots: serverUrl=${serverUrl}, channelId=${channelId}`);
    try {
        const client = NetworkManager.getClient(serverUrl);
        const url = `${client.getChannelRoute(channelId)}/bots`;
        debugLog('AI_API', `getChannelBots: fetching ${url}`);
        const data = await client.doFetch(url, {method: 'get'});
        debugLog('AI_API', `getChannelBots: response=${JSON.stringify(data)}`);
        return (data || []).map((info: any) => ({
            botId: info.bot_id,
            label: info.team_name || info.bot_id,
            teamId: info.team_id || '',
        }));
    } catch (err) {
        debugLog('AI_API', `getChannelBots error: ${err}`);
        throw err;
    }
}

/**
 * Open or create a bot GM channel with a bot user.
 * Uses makeBotGroupChannel to create a type-G channel with group_category "botgm_{teamId}".
 */
export async function openDirectChannelWithBot(serverUrl: string, botUserId: string, teamId: string): Promise<{data?: {id: string}; error?: unknown}> {
    debugLog('AI_API', `openDirectChannelWithBot: botUserId=${botUserId}, teamId=${teamId}`);
    try {
        const result = await makeBotGroupChannel(serverUrl, botUserId, teamId);
        debugLog('AI_API', `openDirectChannelWithBot: result=${JSON.stringify(result)}`);
        return result;
    } catch (err) {
        debugLog('AI_API', `openDirectChannelWithBot error: ${err}`);
        return {error: err};
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
        body,
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

export async function forwardResponseToCustomer(serverUrl: string, consultationId: string, postId: string): Promise<any> {
    return apiPost(serverUrl, `${CONSULT_API_BASE}/${encodeURIComponent(consultationId)}/forward`, {post_id: postId});
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
