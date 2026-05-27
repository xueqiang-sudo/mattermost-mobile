// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {NativeEventEmitter, NativeModules, Platform, type EmitterSubscription} from 'react-native';

export type LogcatLogEntry = {
    id: string;
    timestamp: number;
    line: string;
};

const MAX_LOGCAT_ENTRIES = 600;
const entries: LogcatLogEntry[] = [];
const listeners = new Set<() => void>();

let subscription: EmitterSubscription | null = null;
let emitter: NativeEventEmitter | null = null;

function notify() {
    listeners.forEach((fn) => fn());
}

function append(line: string, timestamp: number) {
    if (entries.length >= MAX_LOGCAT_ENTRIES) {
        entries.shift();
    }

    entries.push({
        id: `${timestamp}-${Math.random()}`,
        timestamp,
        line,
    });
    notify();
}

export function startLogcatMonitor() {
    if (Platform.OS !== 'android') {
        return;
    }

    const module = NativeModules.LogcatBridge;
    if (!module) {
        append('LogcatBridge 未注册，无法读取 Android logcat', Date.now());
        return;
    }

    if (!emitter) {
        emitter = new NativeEventEmitter(module);
    }

    if (!subscription) {
        subscription = emitter.addListener('LogcatBridge.line', (payload: {line?: string; timestamp?: number}) => {
            const line = payload?.line ?? '';
            const timestamp = payload?.timestamp ?? Date.now();
            append(line, timestamp);
        });
    }

    module.start?.().catch?.(() => undefined);
}

export function stopLogcatMonitor() {
    if (subscription) {
        subscription.remove();
        subscription = null;
    }

    const module = NativeModules.LogcatBridge;
    module?.stop?.().catch?.(() => undefined);
}

export function clearLogcatLogs() {
    entries.length = 0;
    notify();
}

export const logcatLogStore = {
    getLogs: () => [...entries],
    subscribe: (fn: () => void) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
    },
};
