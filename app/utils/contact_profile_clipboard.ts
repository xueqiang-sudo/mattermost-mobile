// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * Build plain text for copying profile / contact info (label: value per line).
 */
export function buildClipboardTextFromLines(lines: Array<{label: string; value: string}>): string {
    return lines
        .filter((l) => l.value.trim().length > 0)
        .map((l) => `${l.label}: ${l.value.trim()}`)
        .join('\n');
}
