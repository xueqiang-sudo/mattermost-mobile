// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {cacheDirectory, getInfoAsync} from 'expo-file-system';
import {useCallback, useRef, useState} from 'react';
import {Platform} from 'react-native';
import AudioRecorderPlayer from 'react-native-audio-recorder-player';
import Permissions from 'react-native-permissions';
import {useSharedValue} from 'react-native-reanimated';

import {lookupMimeType} from '@utils/file';
import {generateId} from '@utils/general';
import {logError} from '@utils/log';

export type VoiceRecorderState = 'idle' | 'recording';

export type VoiceRecorderErrorCode = 'permission_denied' | 'record_failed' | 'process_failed' | 'too_short';

export type UseVoiceRecorderOptions = {

    /**
     * After mic permission resolves, return false to abort starting the recorder.
     * Use when the user may have released the hold while the system permission dialog was shown.
     */
    shouldProceedAfterPermission?: () => boolean;
};

const MIN_RECORDING_DURATION_MS = 500;

/** 静音判定：低于此 dB 视为静音（通常 -160 为无声，-50 以下为安静环境） */
const SILENCE_THRESHOLD_DB = -50;

/** 持续静音超过此时长则自动结束录音（毫秒） */
const SILENCE_DURATION_MS = 2500;

export function useVoiceRecorder(
    onRecorded: (files: FileInfo[]) => void,
    onError?: (code: VoiceRecorderErrorCode) => void,
    options?: UseVoiceRecorderOptions,
) {
    const optionsRef = useRef(options);
    optionsRef.current = options;

    const [state, setState] = useState<VoiceRecorderState>('idle');

    /** 语音 HUD 音量条（dB，约 -160～0）；SharedValue 在 UI 线程驱动动画，避免每帧 setState 卡顿 */
    const meteringShared = useSharedValue(-160);
    const audioRecorderPlayerRef = useRef<AudioRecorderPlayer | null>(null);
    const recordStartTimeRef = useRef<number>(0);
    const recordingPathRef = useRef<string | null>(null);
    const lastVoiceTimeRef = useRef<number>(0);
    const silenceCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const getAudioRecorderPlayer = useCallback(() => {
        if (!audioRecorderPlayerRef.current) {
            audioRecorderPlayerRef.current = new AudioRecorderPlayer();
        }
        return audioRecorderPlayerRef.current;
    }, []);

    const requestPermission = useCallback(async (): Promise<boolean> => {
        const permission = Platform.OS === 'ios'
            ? Permissions.PERMISSIONS.IOS.MICROPHONE
            : Permissions.PERMISSIONS.ANDROID.RECORD_AUDIO;
        const result = await Permissions.request(permission);
        return result === Permissions.RESULTS.GRANTED;
    }, []);

    const stopRecordingAndSendRef = useRef<() => Promise<void>>();

    const startRecording = useCallback(async () => {
        if (recordingPathRef.current) {
            return;
        }
        try {
            const hasPermission = await requestPermission();
            if (!hasPermission) {
                onError?.('permission_denied');
                return;
            }

            const proceed = optionsRef.current?.shouldProceedAfterPermission?.() ?? true;
            if (!proceed) {
                return;
            }

            const cacheDir = cacheDirectory?.replace(/^file:\/\//, '') ?? '';
            const ext = Platform.OS === 'ios' ? 'm4a' : 'mp4';
            const path = `${cacheDir}/voice_${generateId()}.${ext}`;

            const audioRecorderPlayer = getAudioRecorderPlayer();
            await audioRecorderPlayer.startRecorder(path, undefined, true);
            recordingPathRef.current = path;
            recordStartTimeRef.current = Date.now();
            lastVoiceTimeRef.current = Date.now();
            setState('recording');
            meteringShared.value = -160;

            audioRecorderPlayer.addRecordBackListener((meta) => {
                const level = meta.currentMetering ?? -160;
                meteringShared.value = level;
                if (level > SILENCE_THRESHOLD_DB) {
                    lastVoiceTimeRef.current = Date.now();
                    if (silenceCheckTimeoutRef.current) {
                        clearTimeout(silenceCheckTimeoutRef.current);
                        silenceCheckTimeoutRef.current = null;
                    }
                } else if (!silenceCheckTimeoutRef.current) {
                    silenceCheckTimeoutRef.current = setTimeout(() => {
                        silenceCheckTimeoutRef.current = null;
                        if (recordingPathRef.current && (Date.now() - lastVoiceTimeRef.current) >= SILENCE_DURATION_MS) {
                            audioRecorderPlayer.removeRecordBackListener();
                            stopRecordingAndSendRef.current?.();
                        }
                    }, SILENCE_DURATION_MS);
                }
            });
        } catch (err) {
            logError('[useVoiceRecorder.startRecording]', err);
            audioRecorderPlayerRef.current = null;
            setState('idle');
            meteringShared.value = -160;
            onError?.('record_failed');
        }
    }, [requestPermission, getAudioRecorderPlayer, onError, meteringShared]);

    const stopRecordingAndSend = useCallback(async () => {
        let path = recordingPathRef.current;
        if (!path) {
            await new Promise((r) => setTimeout(r, 350));
            path = recordingPathRef.current;
        }
        const audioRecorderPlayer = audioRecorderPlayerRef.current;
        recordingPathRef.current = null;
        setState('idle');
        meteringShared.value = -160;

        if (silenceCheckTimeoutRef.current) {
            clearTimeout(silenceCheckTimeoutRef.current);
            silenceCheckTimeoutRef.current = null;
        }
        audioRecorderPlayer?.removeRecordBackListener();

        if (!path) {
            return;
        }
        if (!audioRecorderPlayer) {
            onError?.('process_failed');
            return;
        }

        try {
            await audioRecorderPlayer.stopRecorder();
        } catch (err) {
            logError('[useVoiceRecorder.stopRecordingAndSend]', err);
            audioRecorderPlayerRef.current = null;
            onError?.('process_failed');
            return;
        } finally {
            audioRecorderPlayerRef.current = null;
        }

        try {
            const durationMs = Date.now() - recordStartTimeRef.current;
            const uri = path;

            if (durationMs < MIN_RECORDING_DURATION_MS) {
                onError?.('too_short');
                return;
            }

            const localPath = uri.startsWith('file://') ? uri : `file://${uri}`;
            const name = localPath.substring(localPath.lastIndexOf('/') + 1);
            const extension = name.split('.').pop()?.toLowerCase() || 'm4a';
            const fileInfo = await getInfoAsync(localPath, {size: true});
            const size = 'size' in fileInfo ? fileInfo.size : 0;

            const file: FileInfo = {
                clientId: generateId(),
                localPath,
                name,
                extension,
                size,
                mime_type: lookupMimeType(name) || 'audio/mp4',
            };
            onRecorded([file]);
        } catch (err) {
            logError('[useVoiceRecorder.stopRecordingAndSend]', err);
            onError?.('process_failed');
        }
    }, [onRecorded, onError, meteringShared]);

    stopRecordingAndSendRef.current = stopRecordingAndSend;

    const cancelRecording = useCallback(async () => {
        const path = recordingPathRef.current;
        const audioRecorderPlayer = audioRecorderPlayerRef.current;
        recordingPathRef.current = null;
        audioRecorderPlayerRef.current = null;
        setState('idle');
        meteringShared.value = -160;

        if (silenceCheckTimeoutRef.current) {
            clearTimeout(silenceCheckTimeoutRef.current);
            silenceCheckTimeoutRef.current = null;
        }
        audioRecorderPlayer?.removeRecordBackListener();

        if (path && audioRecorderPlayer) {
            try {
                await audioRecorderPlayer.stopRecorder();
            } catch {
                // Ignore
            }
        }
    }, []);

    return {
        state,
        meteringShared,
        startRecording,
        stopRecordingAndSend,
        cancelRecording,
    };
}
