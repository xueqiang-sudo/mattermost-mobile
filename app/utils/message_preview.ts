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

/** Strip !{file:ID} markers inserted by the webapp rich text editor */
const FILE_MARKER_RE = /!\{file:[a-z0-9_-]+\}\s*/g;

/** Format post message for conversation list preview */
export function formatMessagePreview(message: string | undefined, maxLength = MAX_PREVIEW_LENGTH): string {
    if (!message || typeof message !== 'string') {
        return '';
    }
    const withoutFileMarkers = message.replace(FILE_MARKER_RE, '').trim();
    const cleaned = stripBasicMarkdown(withoutFileMarkers);
    if (cleaned.length <= maxLength) {
        return cleaned;
    }
    return cleaned.substring(0, maxLength) + '...';
}
