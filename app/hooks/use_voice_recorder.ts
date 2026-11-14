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

    const requestPermission = useCallback(async (): Promise<{status: 'granted' | 'denied' | 'blocked'; wasFreshlyGranted: boolean}> => {

        // First check current permission status
        const checkPermissions = [
            Permissions.PERMISSIONS.IOS.MICROPHONE,
            Permissions.PERMISSIONS.ANDROID.RECORD_AUDIO,
        ];
        const checkResult = await Permissions.checkMultiple(checkPermissions);

        const currentStatus = checkResult[Permissions.PERMISSIONS.IOS.MICROPHONE] ?? checkResult[Permissions.PERMISSIONS.ANDROID.RECORD_AUDIO];

        // If already granted, return immediately (not freshly granted)
        if (currentStatus === Permissions.RESULTS.GRANTED) {
            return {status: 'granted', wasFreshlyGranted: false};
        }

        // If blocked (permanently denied), return blocked without asking again
        if (currentStatus === Permissions.RESULTS.BLOCKED) {
            return {status: 'blocked', wasFreshlyGranted: false};
        }

        // If denied or unavailable, request permission
        const result = await Permissions.requestMultiple(checkPermissions);

        const microphoneStatus = result[Permissions.PERMISSIONS.IOS.MICROPHONE] ?? result[Permissions.PERMISSIONS.ANDROID.RECORD_AUDIO];

        if (microphoneStatus === Permissions.RESULTS.GRANTED) {
            // Permission was just granted by user action
            return {status: 'granted', wasFreshlyGranted: true};
        } else if (microphoneStatus === Permissions.RESULTS.BLOCKED) {
            return {status: 'blocked', wasFreshlyGranted: false};
        } else {
            return {status: 'denied', wasFreshlyGranted: false};
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
            const {status: permissionResult, wasFreshlyGranted} = await requestPermission();

            if (permissionResult === 'blocked') {
                // Permission permanently denied - show alert to guide user to settings
                startingTsRef.current = null;
                setState('idle');
                await safeResetRecordingState();

                Alert.alert(
                    '需要麦克风权限',
                    '请在设置中允许 Dedalix 访问麦克风以使用语音功能',
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

            // 【关键修复】权限刚授予后，iOS 需要更多时间初始化 AVAudioSession（首次录音容易卡死）
            // 给系统足够的时间完成音频服务初始化，避免阻塞主线程
            if (wasFreshlyGranted) {
                // 新授权：iOS 需要激活 AVAudioSession，Android 需要获取 AudioFocus
                // 至少等待 800ms 让系统完成初始化
                await new Promise((resolve) => setTimeout(resolve, 800));
            } else {
                // 已授权：短暂延迟即可
                await new Promise((resolve) => setTimeout(resolve, 100));
            }

            const replaceBeforeTs = startingTsRef.current;
            startingTs = Date.now();
            startingTsRef.current = startingTs;

            const format = Platform.select({
                ios: IOS_RECORDING_EXTENSION,
                android: ANDROID_RECORDING_EXTENSION,
            });

            let success = false;
            let retryCount = 0;
            const MAX_RETRIES = 3;

            // 【增强重试】最多重试 3 次，每次间隔递增（处理音频服务初始化延迟）
            while (!success && retryCount < MAX_RETRIES) {
                try {
                    // 【关键修复】添加超时保护（5秒），防止原生层卡死导致应用无响应
                    const startPromise = VoiceRecorder.startRecording({format, prefix: CVA_FILE_PREFIX});
                    const timeoutPromise = new Promise<boolean>((_, reject) => {
                        setTimeout(() => reject(new Error('Recording start timeout (5s)')), 5000);
                    });

                    success = await Promise.race([startPromise, timeoutPromise]);
                } catch (startErr) {
                    logError(`[useVoiceRecorder.startRecording] 尝试 ${retryCount + 1} 失败`, startErr);
                }

                if (!success) {
                    retryCount++;
                    if (retryCount < MAX_RETRIES) {
                        // 指数退避：300ms, 600ms, 1200ms
                        const delay = 300 * Math.pow(2, retryCount - 1);
                        await new Promise((resolve) => setTimeout(resolve, delay));

                        // 再次检查用户是否还按着
                        const stillProceed = optionsRef.current?.shouldProceedAfterPermission?.() ?? true;
                        if (!stillProceed) {
                            startingTsRef.current = null;
                            setState('idle');
                            await safeResetRecordingState();
                            return;
                        }
                    }
                }
            }

            if (!success) {
                startingTsRef.current = null;
                setState('idle');
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
            // 【关键修复】添加超时保护（3秒），防止 stopRecording 卡死
            const stopPromise = VoiceRecorder.stopRecording();
            const timeoutPromise = new Promise<{success: boolean; filePath?: string; durationMs?: number}>((resolve) => {
                setTimeout(() => resolve({success: false}), 3000);
            });

            const result = await Promise.race([stopPromise, timeoutPromise]);

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
