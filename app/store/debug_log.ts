// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * Global debug log for diagnosing login/entry/team-loading issues.
 * Collects timestamped messages from key points in the app flow.
 * Displayed on the DebugScreen when errors occur.
 */

export type DebugEntry = {
    time: string;
    tag: string;
    message: string;
}

const MAX_ENTRIES = 200;
const entries: DebugEntry[] = [];

export function debugLog(tag: string, message: string) {
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
    entries.push({time, tag, message});
    if (entries.length > MAX_ENTRIES) {
        entries.shift();
    }
}

export function getDebugEntries(): DebugEntry[] {
    return [...entries];
}

export function clearDebugLog() {
    entries.length = 0;
}
