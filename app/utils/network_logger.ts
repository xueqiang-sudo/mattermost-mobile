// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// This module is only bundled when __DEBUG_PANEL__ is true.
// All imports of this file must be inside `if (__DEBUG_PANEL__)` blocks.

const MAX_NETWORK_ENTRIES = 200;

export type NetworkLogEntry = {
    id: string;
    url: string;
    method: string;
    status: number;
    duration: number;
    requestHeaders: Record<string, string>;
    requestBody: string;
    responseBody: string;
    timestamp: number;
    ok: boolean;
};

const networkLogs: NetworkLogEntry[] = [];
const listeners = new Set<() => void>();

function appendNetworkLog(entry: NetworkLogEntry) {
    if (networkLogs.length >= MAX_NETWORK_ENTRIES) {
        networkLogs.shift();
    }
    networkLogs.push(entry);
    listeners.forEach((fn) => fn());
}

/** Called explicitly by doFetchWithTracking to log a completed API request. */
export function logNetworkRequest(
    url: string,
    method: string,
    requestHeaders: Record<string, string>,
    status: number,
    requestData: unknown,
    responseData: unknown,
    duration: number,
) {
    let requestBody = '';
    try {
        requestBody = typeof requestData === 'string' ? requestData : JSON.stringify(requestData, null, 2);
    } catch {
        requestBody = String(requestData);
    }
    if (!requestBody || requestBody === 'undefined') {
        requestBody = '(empty)';
    } else if (requestBody.length > 4096) {
        requestBody = `${requestBody.slice(0, 4096)}… [truncated]`;
    }

    let responseBody = '';
    try {
        responseBody = typeof responseData === 'string' ? responseData : JSON.stringify(responseData, null, 2);
    } catch {
        responseBody = String(responseData);
    }
    if (responseBody.length > 4096) {
        responseBody = `${responseBody.slice(0, 4096)}… [truncated]`;
    }
    appendNetworkLog({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        url,
        method: method.toUpperCase(),
        status,
        duration,
        requestHeaders,
        requestBody,
        responseBody,
        timestamp: Date.now(),
        ok: status >= 200 && status < 300,
    });
}

export function clearNetworkLogs() {
    networkLogs.splice(0, networkLogs.length);
    listeners.forEach((fn) => fn());
}

export const networkLogStore = {
    getLogs(): NetworkLogEntry[] {
        return [...networkLogs];
    },
    subscribe(listener: () => void): () => void {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    },
};
