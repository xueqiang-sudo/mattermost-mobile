// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// This module is only bundled when __DEBUG_PANEL__ is true.
// All imports of this file must be inside `if (__DEBUG_PANEL__)` blocks.

const MAX_LOG_ENTRIES = 500;

export type LogLevel = 'log' | 'warn' | 'error' | 'debug' | 'info';

export type ConsoleLogEntry = {
    id: string;
    level: LogLevel;
    message: string;
    timestamp: number;
};

const logs: ConsoleLogEntry[] = [];
const listeners = new Set<() => void>();

let interceptorInstalled = false;

function appendLog(level: LogLevel, message: string) {
    if (logs.length >= MAX_LOG_ENTRIES) {
        logs.shift();
    }
    logs.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        level,
        message,
        timestamp: Date.now(),
    });
    listeners.forEach((fn) => fn());
}

export function initConsoleInterceptor() {
    if (interceptorInstalled) {
        return;
    }
    interceptorInstalled = true;

    const originals: Record<LogLevel, (...args: unknown[]) => void> = {
        log: console.log.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console),
        debug: console.debug.bind(console),
        info: console.info.bind(console),
    };

    const levels: LogLevel[] = ['log', 'warn', 'error', 'debug', 'info'];
    levels.forEach((level) => {
        // eslint-disable-next-line no-console -- intentional monkey-patch for debug panel
        (console as Record<string, unknown>)[level] = (...args: unknown[]) => {
            originals[level](...args);
            const message = args.map((a) => {
                if (typeof a === 'string') {
                    return a;
                }
                try {
                    return JSON.stringify(a, null, 2);
                } catch {
                    return String(a);
                }
            }).join(' ');
            appendLog(level, message);
        };
    });
}

export function clearConsoleLogs() {
    logs.splice(0, logs.length);
    listeners.forEach((fn) => fn());
}

export const debugLogStore = {
    getLogs(): ConsoleLogEntry[] {
        return [...logs];
    },
    subscribe(listener: () => void): () => void {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    },
};
