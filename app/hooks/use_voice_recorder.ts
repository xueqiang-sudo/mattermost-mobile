// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import VoiceRecorder from '@mattermost/voice-recorder';
import {getInfoAsync} from 'expo-file-system';
import {useCallback, useRef, useState} from 'react';
import {Platform} from 'react-native';
import Permissions from 'react-native-permissions';
import {useSharedValue} from 'react-native-reanimated';

import {lookupMimeType} from '@utils/file';
import {generateId} from '@utils/general';
import {logError, logDebug} from '@utils/log';

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

const safeResetRecordingState = async () => {
    logDebug('[useVoiceRecorder.safeResetRecordingState] 安全重置所有录音状态');
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
    const startTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const requestPermission = useCallback(async (): Promise<boolean> => {
        const permissions = [
            Permissions.PERMISSIONS.IOS.MICROPHONE,
            Permissions.PERMISSIONS.ANDROID.RECORD_AUDIO,
        ];
        const result = await Permissions.requestMultiple(permissions);
        const microphoneStatus = result[Permissions.PERMISSIONS.IOS.MICROPHONE] ?? result[Permissions.PERMISSIONS.ANDROID.RECORD_AUDIO];
        return microphoneStatus === Permissions.RESULTS.GRANTED;
    }, []);

    const startRecording = useCallback(async () => {
        logDebug('[useVoiceRecorder.startRecording] ========== 开始录音流程 ==========');
        logDebug('[useVoiceRecorder.startRecording] 当前 startingTsRef.current:', startingTsRef.current);
        logDebug('[useVoiceRecorder.startRecording] 当前 isGlobalRecorderBusy:', isGlobalRecorderBusy);

        if (startingTsRef.current) {
            logDebug('[useVoiceRecorder.startRecording] 正在启动中，忽略此次请求');
            return;
        }
        if (isGlobalRecorderBusy) {
            logDebug('[useVoiceRecorder.startRecording] 全局录音器忙，忽略此次请求');
            return;
        }

        let startingTs = Date.now();
        logDebug('[useVoiceRecorder.startRecording] 设置启动标记，startingTs:', startingTs);
        startingTsRef.current = startingTs;
        isGlobalRecorderBusy = true;

        const safeCleanup = async () => {
            if (startTimeoutRef.current) {
                clearTimeout(startTimeoutRef.current);
                startTimeoutRef.current = null;
            }
        };

        startTimeoutRef.current = setTimeout(async () => {
            logDebug('[useVoiceRecorder.startRecording] 超时，强制重置状态');
            await safeResetRecordingState();
            startingTsRef.current = null;
            setState('idle');
            meteringShared.value = DEFAULT_METERING;
        }, 10000);

        try {
            logDebug('[useVoiceRecorder.startRecording] 步骤1：请求麦克风权限');
            const hasPermission = await requestPermission();
            if (!hasPermission) {
                logDebug('[useVoiceRecorder.startRecording] 麦克风权限被拒绝');
                await safeCleanup();
                startingTsRef.current = null;
                await safeResetRecordingState();
                onError?.('permission_denied');
                return;
            }
            logDebug('[useVoiceRecorder.startRecording] 麦克风权限获取成功');

            if (startingTsRef.current !== startingTs) {
                logDebug('[useVoiceRecorder.startRecording] 启动标记丢失，忽略此次请求, startingTs:', startingTs);
                return;
            }

            logDebug('[useVoiceRecorder.startRecording] 步骤2：检查是否继续（权限对话框期间用户是否松开）');
            const proceed = optionsRef.current?.shouldProceedAfterPermission?.() ?? true;
            if (!proceed) {
                logDebug('[useVoiceRecorder.startRecording] 用户已松开，不继续录音');
                await safeCleanup();
                startingTsRef.current = null;
                await safeResetRecordingState();
                return;
            }

            if (startingTsRef.current !== startingTs) {
                logDebug('[useVoiceRecorder.startRecording] 启动标记丢失，忽略此次请求, startingTs:', startingTs);
                return;
            }

            const replaceBeforeTs = startingTsRef.current;
            startingTs = Date.now();
            startingTsRef.current = startingTs;

            logDebug('[useVoiceRecorder.startRecording] 步骤3：调用原生模块开始录音, replaceBeforeTs:', replaceBeforeTs, ' ,startingTs:', startingTs);
            const format = Platform.select({
                ios: IOS_RECORDING_EXTENSION,
                android: ANDROID_RECORDING_EXTENSION,
            });
            const success = await VoiceRecorder.startRecording({format, prefix: CVA_FILE_PREFIX});
            if (!success) {
                logDebug('[useVoiceRecorder.startRecording] 原生录音启动失败');
                await safeCleanup();
                startingTsRef.current = null;
                await safeResetRecordingState();
                onError?.('record_failed');
                return;
            }

            logDebug('[useVoiceRecorder.startRecording] 步骤4：保存录音时间并更新状态');
            recordStartTimeRef.current = Date.now();
            isRecordingGlobally = true;

            logDebug('[useVoiceRecorder.startRecording] 步骤5：更新 UI 状态为 recording');
            setState('recording');
            meteringShared.value = DEFAULT_METERING;

            await safeCleanup();
            logDebug('[useVoiceRecorder.startRecording] ========== 录音启动成功 ==========');
        } catch (err) {
            logError('[useVoiceRecorder.startRecording] 录音启动失败', err);
            await safeCleanup();
            setState('idle');
            meteringShared.value = DEFAULT_METERING;
            startingTsRef.current = null;
            await safeResetRecordingState();
            onError?.('record_failed');
        } finally {
            logDebug('[useVoiceRecorder.startRecording] 清除启动标记');
            startingTsRef.current = null;
        }
    }, [requestPermission, onError, meteringShared]);

    const stopRecordingAndSend = useCallback(async () => {
        logDebug('[useVoiceRecorder.stopRecordingAndSend] ========== 停止录音并发送 ==========');
        logDebug('[useVoiceRecorder.stopRecordingAndSend] 当前 startingTsRef.current:', startingTsRef.current);
        logDebug('[useVoiceRecorder.stopRecordingAndSend] 当前 isRecordingGlobally:', isRecordingGlobally);
        logDebug('[useVoiceRecorder.stopRecordingAndSend] 当前 isGlobalRecorderBusy:', isGlobalRecorderBusy);
        const startingTs = startingTsRef.current;
        let filePathToClean: string | null = null;

        try {
            logDebug('[useVoiceRecorder.stopRecordingAndSend] 步骤 1：调用原生模块停止录音');
            const result = await VoiceRecorder.stopRecording();

            // 停止录音后，立即更新 UI 状态
            setState('idle');
            meteringShared.value = DEFAULT_METERING;

            logDebug('[useVoiceRecorder.stopRecordingAndSend] 更新全局录音状态为 false');
            isRecordingGlobally = false;
            isGlobalRecorderBusy = false;

            if (!result.success || !result.filePath) {
                logDebug('[useVoiceRecorder.stopRecordingAndSend] 录音失败或无文件路径', result.error, ',startingTs:', startingTs, ',diff:', startingTs && (Date.now() - startingTs));
                onError?.(startingTs && (Date.now() - startingTs) < MIN_RECORDING_DURATION_MS ? 'too_short' : 'process_failed');
                return;
            }

            filePathToClean = result.filePath;
            logDebug('[useVoiceRecorder.stopRecordingAndSend] 录音结果:', result);

            const durationMs = result.durationMs ?? (Date.now() - recordStartTimeRef.current);
            logDebug('[useVoiceRecorder.stopRecordingAndSend] 步骤 2：检查录音时长');
            if (durationMs < MIN_RECORDING_DURATION_MS) {
                logDebug('[useVoiceRecorder.stopRecordingAndSend] 录音太短:', durationMs, 'ms，最小要求:', MIN_RECORDING_DURATION_MS, 'ms');
                try {
                    await VoiceRecorder.cancelRecording();
                } catch (e) {
                    logError('[useVoiceRecorder.stopRecordingAndSend] 清理短录音失败', e);
                }
                onError?.('too_short');
                return;
            }

            logDebug('[useVoiceRecorder.stopRecordingAndSend] 步骤 3：准备文件信息');
            const path = result.filePath;
            const localPath = toFileUri(path);
            const name = localPath.substring(localPath.lastIndexOf('/') + 1);
            const extension = name.split('.').pop()?.toLowerCase() || DEFAULT_RECORDING_EXTENSION;
            const fileInfo = await getInfoAsync(localPath, {size: true});
            const size = 'size' in fileInfo ? fileInfo.size : 0;

            logDebug('[useVoiceRecorder.stopRecordingAndSend] 文件信息:', {localPath, name, extension, size});

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

            logDebug('[useVoiceRecorder.stopRecordingAndSend] 步骤 4：回调 onRecorded');

            // 只有当 onRecorded 是异步函数时才 await
            const recedFnResult = onRecorded([file]);
            if (recedFnResult instanceof Promise) {
                await recedFnResult;
            }

            logDebug('[useVoiceRecorder.stopRecordingAndSend] ========== 录音发送成功 ==========');
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
                    logDebug('[useVoiceRecorder.stopRecordingAndSend] 清理临时录音文件:', filePathToClean);
                    await VoiceRecorder.deleteRecordingFile(filePathToClean);
                } catch (e) {
                    logError('[useVoiceRecorder.stopRecordingAndSend] 清理临时录音文件失败', e);
                }
            }
        }
    }, [onRecorded, onError, meteringShared]);

    const cancelRecording = useCallback(async () => {
        logDebug('[useVoiceRecorder.cancelRecording] ========== 取消录音 ==========');
        logDebug('[useVoiceRecorder.cancelRecording] 当前 startingTsRef.current:', startingTsRef.current);
        logDebug('[useVoiceRecorder.cancelRecording] 当前 isRecordingGlobally:', isRecordingGlobally);
        logDebug('[useVoiceRecorder.cancelRecording] 当前 isGlobalRecorderBusy:', isGlobalRecorderBusy);

        logDebug('[useVoiceRecorder.cancelRecording] 清除启动标记');
        startingTsRef.current = null;
        isGlobalRecorderBusy = false;

        logDebug('[useVoiceRecorder.cancelRecording] 清理引用');
        setState('idle');
        meteringShared.value = DEFAULT_METERING;

        logDebug('[useVoiceRecorder.cancelRecording] 更新全局录音状态为 false');
        isRecordingGlobally = false;

        try {
            logDebug('[useVoiceRecorder.cancelRecording] 调用原生模块取消录音');
            await VoiceRecorder.cancelRecording();
        } catch (err) {
            logError('[useVoiceRecorder.cancelRecording] 原生取消失败', err);
        }

        logDebug('[useVoiceRecorder.cancelRecording] ========== 取消完成 ==========');
    }, [meteringShared]);

    return {
        state,
        meteringShared,
        startRecording,
        stopRecordingAndSend,
        cancelRecording,
    };
}
