// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {debugLog} from '@store/debug_log';

export type KuaishouMetadata = {
    title: string;
    description: string;
    coverUrl?: string;
    avatarUrl?: string;
    userName?: string;
    siteName: string;
};

/**
 * Fetches and parses Kuaishou video metadata from the page HTML
 * This is a client-side fallback when server doesn't return complete metadata
 */
export async function fetchKuaishouMetadata(url: string): Promise<KuaishouMetadata | null> {
    try {
        debugLog('Kuaishou', `Fetching metadata for: ${url}`);

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
        });

        if (!response.ok) {
            debugLog('Kuaishou', `HTTP error: ${response.status}`);
            return null;
        }

        const html = await response.text();

        // Extract metadata from embedded JSON
        const title = extractJSONField(html, /"caption":"([^"]+)"/);
        const userName = extractJSONField(html, /"user_name":"([^"]+)"/);
        const coverUrl = extractJSONField(html, /"coverUrl":"([^"]+)"/) ||
                         extractJSONField(html, /"photoUrl":"([^"]+)"/);
        const avatarUrl = extractJSONField(html, /"headurl":"([^"]+)"/);
        const likeCount = extractJSONField(html, /"likeCount":(\d+)/);

        // Build description
        const descParts: string[] = [];
        if (likeCount) {
            descParts.push(`${likeCount}人喜欢`);
        }
        if (userName) {
            descParts.push(`@${userName} 的作品`);
        }
        const description = descParts.join('\n');

        if (!title) {
            debugLog('Kuaishou', 'Failed to extract title');
            return null;
        }

        const metadata: KuaishouMetadata = {
            title,
            description,
            coverUrl,
            avatarUrl,
            userName,
            siteName: '快手',
        };

        debugLog('Kuaishou', `Extracted metadata: ${JSON.stringify(metadata)}`);
        return metadata;
    } catch (error) {
        debugLog('Kuaishou', `Error fetching metadata: ${error}`);
        return null;
    }
}

/**
 * Extracts a field value from JSON-like string using regex
 */
function extractJSONField(html: string, pattern: RegExp): string | null {
    const match = html.match(pattern);
    if (match && match[1]) {
        try {
            // Try to unescape JSON string
            return JSON.parse(`"${match[1]}"`);
        } catch {
            return match[1];
        }
    }
    return null;
}

/**
 * Checks if URL is a Kuaishou link
 */
export function isKuaishouURL(url: string): boolean {
    return url.includes('kuaishou.com');
}
