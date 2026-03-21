// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

const MAX_PREVIEW_LENGTH = 50;

/**  strip basic markdown for list preview */
function stripBasicMarkdown(text: string): string {
    return text.
        replace(/\*\*([^*]+)\*\*/g, '$1').
        replace(/\*([^*]+)\*/g, '$1').
        replace(/__([^_]+)__/g, '$1').
        replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').
        replace(/^#+\s*/gm, '').
        replace(/\n/g, ' ').
        trim();
}

/** Format post message for conversation list preview */
export function formatMessagePreview(message: string | undefined, maxLength = MAX_PREVIEW_LENGTH): string {
    if (!message || typeof message !== 'string') {
        return '';
    }
    const cleaned = stripBasicMarkdown(message);
    if (cleaned.length <= maxLength) {
        return cleaned;
    }
    return cleaned.substring(0, maxLength) + '...';
}
