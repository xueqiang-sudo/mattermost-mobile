// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Audio} from 'expo-av';
import {deleteAsync, getInfoAsync} from 'expo-file-system';
import {useCallback, useRef, useState} from 'react';
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
let isGlobalRecorderBusy = false;
let globalActiveRecorder: Audio.Recording | null = null;

const toFileUri = (path: string) => (path.startsWith('file://') ? path : `file://${path}`);
const DEFAULT_METERING = -160;
const IOS_RECORDING_EXTENSION = 'aac';
const ANDROID_RECORDING_EXTENSION = 'amr';
const DEFAULT_RECORDING_EXTENSION = IOS_RECORDING_EXTENSION;

const RECORDING_OPTIONS: Audio.RecordingOptions = {
    ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
    android: {
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY.android,
        extension: `.${ANDROID_RECORDING_EXTENSION}`,
        outputFormat: Audio.AndroidOutputFormat.THREE_GPP,
        audioEncoder: Audio.AndroidAudioEncoder.AMR_NB,
    },
    ios: {
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY.ios,
        extension: `.${IOS_RECORDING_EXTENSION}`,
        outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    },
};

const setRecordingAudioMode = async (isRecording: boolean) => {
    try {
        await Audio.setAudioModeAsync({
            allowsRecordingIOS: isRecording,
            playsInSilentModeIOS: true,
            shouldDuckAndroid: true,
            playThroughEarpieceAndroid: false,
            staysActiveInBackground: false,
        });
    } catch (err) {
        logError('[useVoiceRecorder.setRecordingAudioMode]', err);
    }
};

const clearGlobalActiveRecorder = () => {
    globalActiveRecorder = null;
};

const cleanupStaleGlobalRecording = async () => {
    const activeRecorder = globalActiveRecorder;
    if (!activeRecorder) {
        return;
    }

    const activePath = activeRecorder.getURI();
    activeRecorder.setOnRecordingStatusUpdate(null);
    try {
        await activeRecorder.stopAndUnloadAsync();
    } catch (err) {
        logError('[useVoiceRecorder.cleanupStaleGlobalRecording.stopAndUnloadAsync]', err);
    }

    if (activePath) {
        await deleteAsync(toFileUri(activePath), {idempotent: true}).catch((err) => {
            logError('[useVoiceRecorder.cleanupStaleGlobalRecording.deleteAsync]', err);
            return undefined;
        });
    }
    await setRecordingAudioMode(false);
    clearGlobalActiveRecorder();
};

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
    const meteringShared = useSharedValue(DEFAULT_METERING);
    const recordingRef = useRef<Audio.Recording | null>(null);
    const isStartingRef = useRef(false);
    const recordStartTimeRef = useRef<number>(0);
    const recordingPathRef = useRef<string | null>(null);
    const lastVoiceTimeRef = useRef<number>(0);
    const silenceCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const requestPermission = useCallback(async (): Promise<boolean> => {
        const permissions = [
            Permissions.PERMISSIONS.IOS.MICROPHONE,
            Permissions.PERMISSIONS.ANDROID.RECORD_AUDIO,
        ];
        const result = await Permissions.requestMultiple(permissions);
        const microphoneStatus = result[Permissions.PERMISSIONS.IOS.MICROPHONE] ?? result[Permissions.PERMISSIONS.ANDROID.RECORD_AUDIO];
        return microphoneStatus === Permissions.RESULTS.GRANTED;
    }, []);

    const stopRecordingAndSendRef = useRef<() => Promise<void>>();
    const scheduleSilenceAutoStop = useCallback((recording: Audio.Recording) => {
        silenceCheckTimeoutRef.current = setTimeout(() => {
            silenceCheckTimeoutRef.current = null;
            if (recordingPathRef.current && (Date.now() - lastVoiceTimeRef.current) >= SILENCE_DURATION_MS) {
                recording.setOnRecordingStatusUpdate(null);
                stopRecordingAndSendRef.current?.();
            }
        }, SILENCE_DURATION_MS);
    }, []);

    const startRecording = useCallback(async () => {
        if (recordingPathRef.current || isStartingRef.current || isGlobalRecorderBusy) {
            return;
        }
        isStartingRef.current = true;
        isGlobalRecorderBusy = true;
        try {
            await cleanupStaleGlobalRecording();
            const hasPermission = await requestPermission();
            if (!hasPermission) {
                isGlobalRecorderBusy = false;
                onError?.('permission_denied');
                return;
            }

            const proceed = optionsRef.current?.shouldProceedAfterPermission?.() ?? true;
            if (!proceed) {
                isGlobalRecorderBusy = false;
                return;
            }

            await setRecordingAudioMode(true);
            const recording = new Audio.Recording();
            await recording.prepareToRecordAsync(RECORDING_OPTIONS);
            recording.setProgressUpdateInterval(250);
            await recording.startAsync();

            recordingRef.current = recording;
            recordingPathRef.current = recording.getURI();
            globalActiveRecorder = recording;
            recordStartTimeRef.current = Date.now();
            lastVoiceTimeRef.current = Date.now();
            setState('recording');
            meteringShared.value = DEFAULT_METERING;

            recording.setOnRecordingStatusUpdate((status: Audio.RecordingStatus) => {
                const level = typeof status.metering === 'number' ? status.metering : DEFAULT_METERING;
                meteringShared.value = level;
                if (level > SILENCE_THRESHOLD_DB) {
                    lastVoiceTimeRef.current = Date.now();
                    if (silenceCheckTimeoutRef.current) {
                        clearTimeout(silenceCheckTimeoutRef.current);
                        silenceCheckTimeoutRef.current = null;
                    }
                } else if (!silenceCheckTimeoutRef.current) {
                    scheduleSilenceAutoStop(recording);
                }
            });
        } catch (err) {
            logError('[useVoiceRecorder.startRecording]', err);
            recordingRef.current = null;
            setState('idle');
            meteringShared.value = DEFAULT_METERING;
            isGlobalRecorderBusy = false;
            await setRecordingAudioMode(false);
            onError?.('record_failed');
        } finally {
            isStartingRef.current = false;
        }
    }, [requestPermission, onError, meteringShared, scheduleSilenceAutoStop]);

    const stopRecordingAndSend = useCallback(async () => {
        let path = recordingPathRef.current;
        if (!path) {
            await new Promise((r) => setTimeout(r, 350));
            path = recordingPathRef.current;
        }
        const recording = recordingRef.current;
        recordingPathRef.current = null;
        recordingRef.current = null;
        setState('idle');
        meteringShared.value = DEFAULT_METERING;

        if (silenceCheckTimeoutRef.current) {
            clearTimeout(silenceCheckTimeoutRef.current);
            silenceCheckTimeoutRef.current = null;
        }
        recording?.setOnRecordingStatusUpdate(null);

        if (!path && !recording) {
            isGlobalRecorderBusy = false;
            clearGlobalActiveRecorder();
            await setRecordingAudioMode(false);
            return;
        }
        if (!recording) {
            isGlobalRecorderBusy = false;
            clearGlobalActiveRecorder();
            await setRecordingAudioMode(false);
            onError?.('process_failed');
            return;
        }

        let durationMs = Date.now() - recordStartTimeRef.current;
        try {
            const status = await recording.stopAndUnloadAsync();
            if ('durationMillis' in status && typeof status.durationMillis === 'number') {
                durationMs = status.durationMillis;
            }
            path = path ?? recording.getURI() ?? null;
        } catch (err) {
            logError('[useVoiceRecorder.stopRecordingAndSend]', err);
            await cleanupStaleGlobalRecording();
            isGlobalRecorderBusy = false;
            await setRecordingAudioMode(false);
            onError?.('process_failed');
            return;
        } finally {
            clearGlobalActiveRecorder();
            await setRecordingAudioMode(false);
        }

        try {
            if (durationMs < MIN_RECORDING_DURATION_MS) {
                onError?.('too_short');
                return;
            }

            if (!path) {
                onError?.('process_failed');
                return;
            }

            const localPath = path.startsWith('file://') ? path : `file://${path}`;
            const name = localPath.substring(localPath.lastIndexOf('/') + 1);
            const extension = name.split('.').pop()?.toLowerCase() || DEFAULT_RECORDING_EXTENSION;
            const fileInfo = await getInfoAsync(localPath, {size: true});
            const size = 'size' in fileInfo ? fileInfo.size : 0;

            const file: FileInfo = {
                clientId: generateId(),
                localPath,
                name,
                extension,
                size,
                mime_type: lookupMimeType(name) || 'audio/mp4',
                has_preview_image: false,
                height: 0,
                user_id: '',
                width: 0,
            };
            onRecorded([file]);
            clearGlobalActiveRecorder();
            isGlobalRecorderBusy = false;
        } catch (err) {
            logError('[useVoiceRecorder.stopRecordingAndSend]', err);
            clearGlobalActiveRecorder();
            isGlobalRecorderBusy = false;
            onError?.('process_failed');
        }
    }, [onRecorded, onError, meteringShared]);

    stopRecordingAndSendRef.current = stopRecordingAndSend;

    const cancelRecording = useCallback(async () => {
        isStartingRef.current = false;
        isGlobalRecorderBusy = false;
        const path = recordingPathRef.current;
        const recording = recordingRef.current;
        recordingPathRef.current = null;
        recordingRef.current = null;
        setState('idle');
        meteringShared.value = DEFAULT_METERING;

        if (silenceCheckTimeoutRef.current) {
            clearTimeout(silenceCheckTimeoutRef.current);
            silenceCheckTimeoutRef.current = null;
        }
        recording?.setOnRecordingStatusUpdate(null);

        if (recording) {
            try {
                await recording.stopAndUnloadAsync();
            } catch (err) {
                logError('[useVoiceRecorder.cancelRecording.stopAndUnloadAsync]', err);
            }
        }
        const recordingUri = path ?? recording?.getURI();
        if (recordingUri) {
            try {
                await deleteAsync(toFileUri(recordingUri), {idempotent: true});
            } catch (err) {
                logError('[useVoiceRecorder.cancelRecording.deleteAsync]', err);
            }
        }
        await setRecordingAudioMode(false);
        clearGlobalActiveRecorder();
    }, [meteringShared]);

    return {
        state,
        meteringShared,
        startRecording,
        stopRecordingAndSend,
        cancelRecording,
    };
}
