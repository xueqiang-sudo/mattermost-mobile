// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import VoiceRecorder, {VOICE_RECORDER_PERMISSION_DENIED_CODE} from '@mattermost/voice-recorder';
import {getInfoAsync} from 'expo-file-system';
import {useCallback, useRef, useState} from 'react';
import {Alert, Platform} from 'react-native';
import Permissions from 'react-native-permissions';
import {useSharedValue} from 'react-native-reanimated';

import {lookupMimeType} from '@utils/file';
import {generateId} from '@utils/general';
import {logError} from '@utils/log';

export type VoiceRecorderState = 'idle' | 'recording';

export type VoiceRecorderErrorCode = 'permission_denied' | 'record_failed' | 'process_failed' | 'too_short' | 'upload_failed';

export type UseVoiceRecorderOptions = {
    shouldProceedAfterPermission?: () => boolean;
};

const MIN_RECORDING_DURATION_MS = 500;

let isGlobalRecorderBusy = false;

let isRecordingGlobally = false;

export function getIsRecordingGlobally(): boolean {
    return isRecordingGlobally;
}

export function getIsRecorderBusy(): boolean {
    return isGlobalRecorderBusy;
}

const toFileUri = (path: string) => (path.startsWith('file://') ? path : `file://${path}`);

const DEFAULT_METERING = -160;

const IOS_RECORDING_EXTENSION = 'aac';

const ANDROID_RECORDING_EXTENSION = 'amr';

export const CVA_FILE_PREFIX = 'c_voice_asr';

const DEFAULT_RECORDING_EXTENSION = IOS_RECORDING_EXTENSION;

function isNativePermissionDenied(err: unknown): boolean {
    return (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as {code?: string}).code === VOICE_RECORDER_PERMISSION_DENIED_CODE
    );
}

const safeResetRecordingState = async () => {
    isGlobalRecorderBusy = false;
    isRecordingGlobally = false;
};

export function useVoiceRecorder(
    onRecorded: (files: FileInfo[]) => void | Promise<void>,
    onError?: (code: VoiceRecorderErrorCode) => void,
    options?: UseVoiceRecorderOptions,
) {
    const optionsRef = useRef(options);
    optionsRef.current = options;

    const [state, setState] = useState<VoiceRecorderState>('idle');

    const meteringShared = useSharedValue(DEFAULT_METERING);

    const startingTsRef = useRef<number | null>(null);
    const recordStartTimeRef = useRef<number>(0);

    const requestPermission = useCallback(async (): Promise<'granted' | 'denied' | 'blocked'> => {

        // First check current permission status
        const checkPermissions = [
            Permissions.PERMISSIONS.IOS.MICROPHONE,
            Permissions.PERMISSIONS.ANDROID.RECORD_AUDIO,
        ];
        const checkResult = await Permissions.checkMultiple(checkPermissions);

        const currentStatus = checkResult[Permissions.PERMISSIONS.IOS.MICROPHONE] ?? checkResult[Permissions.PERMISSIONS.ANDROID.RECORD_AUDIO];

        // If already granted, return immediately
        if (currentStatus === Permissions.RESULTS.GRANTED) {
            return 'granted';
        }

        // If blocked (permanently denied), return blocked without asking again
        if (currentStatus === Permissions.RESULTS.BLOCKED) {
            return 'blocked';
        }

        // If denied or unavailable, request permission
        const result = await Permissions.requestMultiple(checkPermissions);

        const microphoneStatus = result[Permissions.PERMISSIONS.IOS.MICROPHONE] ?? result[Permissions.PERMISSIONS.ANDROID.RECORD_AUDIO];

        if (microphoneStatus === Permissions.RESULTS.GRANTED) {
            return 'granted';
        } else if (microphoneStatus === Permissions.RESULTS.BLOCKED) {
            return 'blocked';
        } else {
            return 'denied';
        }
    }, []);

    const startRecording = useCallback(async () => {

        if (startingTsRef.current) {
            return;
        }
        if (isGlobalRecorderBusy) {
            return;
        }

        let startingTs = Date.now();
        startingTsRef.current = startingTs;
        isGlobalRecorderBusy = true;

        try {
            const permissionResult = await requestPermission();

            if (permissionResult === 'blocked') {
                // Permission permanently denied - show alert to guide user to settings
                startingTsRef.current = null;
                setState('idle');
                await safeResetRecordingState();

                Alert.alert(
                    '需要麦克风权限',
                    '请在设置中允许 Mattermost 访问麦克风以使用语音功能',
                    [
                        {text: '取消', style: 'cancel'},
                        {
                            text: '去设置',
                            onPress: () => {
                                Permissions.openSettings().catch(() => {
                                });
                            },
                        },
                    ],
                );
                return;
            }

            if (permissionResult === 'denied') {
                // Permission denied this time - show error and do nothing
                startingTsRef.current = null;
                setState('idle');
                await safeResetRecordingState();
                onError?.('permission_denied');
                return;
            }


            if (startingTsRef.current !== startingTs) {
                setState('idle');  // Trigger cleanup in parent component
                return;
            }

            const proceed = optionsRef.current?.shouldProceedAfterPermission?.() ?? true;
            if (!proceed) {
                startingTsRef.current = null;
                setState('idle');  // Trigger cleanup in parent component
                await safeResetRecordingState();
                return;
            }

            if (startingTsRef.current !== startingTs) {
                setState('idle');  // Trigger cleanup in parent component
                return;
            }

            // 权限刚授予后，给原生模块一点时间初始化（避免首次录音失败）
            await new Promise((resolve) => setTimeout(resolve, 150));

            const replaceBeforeTs = startingTsRef.current;
            startingTs = Date.now();
            startingTsRef.current = startingTs;

            const format = Platform.select({
                ios: IOS_RECORDING_EXTENSION,
                android: ANDROID_RECORDING_EXTENSION,
            });
            let success = await VoiceRecorder.startRecording({format, prefix: CVA_FILE_PREFIX});

            // 如果首次失败，重试一次（处理权限刚授予后的初始化延迟）
            if (!success) {
                await new Promise((resolve) => setTimeout(resolve, 150));

                // 再次检查用户是否还按着
                const stillProceed = optionsRef.current?.shouldProceedAfterPermission?.() ?? true;
                if (!stillProceed) {
                    startingTsRef.current = null;
                    setState('idle');  // Trigger cleanup in parent component
                    await safeResetRecordingState();
                    return;
                }

                success = await VoiceRecorder.startRecording({format, prefix: CVA_FILE_PREFIX});
            }

            if (!success) {
                startingTsRef.current = null;
                setState('idle');  // Trigger cleanup in parent component
                await safeResetRecordingState();

                // 权限弹窗可能中断了触摸事件，如果用户已松开则静默取消（类似微信行为）
                const stillHolding = optionsRef.current?.shouldProceedAfterPermission?.() ?? true;
                if (!stillHolding) {
                    return;
                }

                onError?.('record_failed');
                return;
            }

            recordStartTimeRef.current = Date.now();
            isRecordingGlobally = true;

            setState('recording');
            meteringShared.value = DEFAULT_METERING;

        } catch (err) {
            logError('[useVoiceRecorder.startRecording] 录音启动失败', err);
            setState('idle');
            meteringShared.value = DEFAULT_METERING;
            startingTsRef.current = null;
            await safeResetRecordingState();
            onError?.(isNativePermissionDenied(err) ? 'permission_denied' : 'record_failed');
        } finally {
            startingTsRef.current = null;
        }
    }, [requestPermission, onError, meteringShared]);

    const stopRecordingAndSend = useCallback(async () => {

        const startingTs = startingTsRef.current;
        let filePathToClean: string | null = null;

        try {
            const result = await VoiceRecorder.stopRecording();

            // 停止录音后，立即更新 UI 状态
            setState('idle');
            meteringShared.value = DEFAULT_METERING;

            isRecordingGlobally = false;
            isGlobalRecorderBusy = false;

            if (!result.success || !result.filePath) {
                onError?.(startingTs && (Date.now() - startingTs) < MIN_RECORDING_DURATION_MS ? 'too_short' : 'process_failed');
                return;
            }

            filePathToClean = result.filePath;

            const durationMs = result.durationMs ?? (Date.now() - recordStartTimeRef.current);
            if (durationMs < MIN_RECORDING_DURATION_MS) {
                try {
                    await VoiceRecorder.cancelRecording();
                } catch (e) {
                    logError('[useVoiceRecorder.stopRecordingAndSend] 清理短录音失败', e);
                }
                onError?.('too_short');
                return;
            }

            const path = result.filePath;
            const localPath = toFileUri(path);
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


            // 只有当 onRecorded 是异步函数时才 await
            const recedFnResult = onRecorded([file]);
            if (recedFnResult instanceof Promise) {
                await recedFnResult;
            }

        } catch (err) {
            logError('[useVoiceRecorder.stopRecordingAndSend] 处理失败', err);

            // 发生异常时也要确保状态被重置
            setState('idle');
            meteringShared.value = DEFAULT_METERING;
            isRecordingGlobally = false;
            isGlobalRecorderBusy = false;
            onError?.('process_failed');
        } finally {
            // 清理临时录音文件，无论成功或失败
            if (filePathToClean) {
                try {
                    await VoiceRecorder.deleteRecordingFile(filePathToClean);
                } catch (e) {
                    logError('[useVoiceRecorder.stopRecordingAndSend] 清理临时录音文件失败', e);
                }
            }
        }
    }, [onRecorded, onError, meteringShared]);

    const cancelRecording = useCallback(async () => {

        startingTsRef.current = null;
        isGlobalRecorderBusy = false;

        setState('idle');
        meteringShared.value = DEFAULT_METERING;

        isRecordingGlobally = false;

        try {
            await VoiceRecorder.cancelRecording();
        } catch (err) {
            logError('[useVoiceRecorder.cancelRecording] 原生取消失败', err);
        }

    }, [meteringShared]);

    return {
        state,
        meteringShared,
        startRecording,
        stopRecordingAndSend,
        cancelRecording,
    };
}
