// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

type RuntimeErrorInfo = {
    source: 'global_handler' | 'react_boundary';
    message: string;
    stack?: string;
    isFatal?: boolean;
    timestamp: string;
};

let latestRuntimeError: RuntimeErrorInfo | undefined;

const normalizeError = (error: unknown): {message: string; stack?: string} => {
    if (error instanceof Error) {
        return {
            message: error.message || 'Unknown Error',
            stack: error.stack,
        };
    }

    if (typeof error === 'string') {
        return {message: error};
    }

    try {
        return {message: JSON.stringify(error)};
    } catch {
        return {message: String(error)};
    }
};

export const setLatestRuntimeError = (error: unknown, source: RuntimeErrorInfo['source'], isFatal?: boolean) => {
    const normalized = normalizeError(error);
    latestRuntimeError = {
        source,
        message: normalized.message,
        stack: normalized.stack,
        isFatal,
        timestamp: new Date().toISOString(),
    };
};

export const getLatestRuntimeError = () => latestRuntimeError;

export const formatRuntimeErrorForClipboard = (error?: RuntimeErrorInfo) => {
    if (!error) {
        return 'No runtime error details available.';
    }

    return [
        `Source: ${error.source}`,
        `Fatal: ${String(Boolean(error.isFatal))}`,
        `Time: ${error.timestamp}`,
        `Message: ${error.message}`,
        'Stack:',
        error.stack ?? 'N/A',
    ].join('\n');
};
