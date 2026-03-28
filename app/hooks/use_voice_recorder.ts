// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Audio} from 'expo-av';
import {deleteAsync, getInfoAsync} from 'expo-file-system';
import {useCallback, useRef, useState} from 'react';
import Permissions from 'react-native-permissions';
import {useSharedValue} from 'react-native-reanimated';

import {lookupMimeType} from '@utils/file';
import {generateId} from '@utils/general';
import {logError, logDebug} from '@utils/log';

export type VoiceRecorderState = 'idle' | 'recording';

export type VoiceRecorderErrorCode = 'permission_denied' | 'record_failed' | 'process_failed' | 'too_short';

export type UseVoiceRecorderOptions = {

    /**
     * After mic permission resolves, return false to abort starting the recorder.
     * Use when the user may have released the hold while the system permission dialog was shown.
     */
    shouldProceedAfterPermission?: () => boolean;
};

/** 最小录音时长：小于 500ms 的录音会被忽略 */
const MIN_RECORDING_DURATION_MS = 500;

/** 全局录音器忙状态标记：防止同时启动多个录音 */
let isGlobalRecorderBusy = false;

/** 全局活跃录音器引用：用于清理可能遗留的录音 */
let globalActiveRecorder: Audio.Recording | null = null;

/**
 * 全局录音状态标记
 * 用于在 WebSocket 管理器等其他模块中检查当前是否正在录音
 * 在录音期间会忽略 AppState 变化，避免 WebSocket 意外断开
 */
let isRecordingGlobally = false;

/**
 * 获取当前是否正在录音的全局状态
 * @returns boolean - true 表示正在录音，false 表示未在录音
 */
export function getIsRecordingGlobally(): boolean {
    return isRecordingGlobally;
}

const toFileUri = (path: string) => (path.startsWith('file://') ? path : `file://${path}`);

/** 默认音量表读数：-160dB 表示完全静音 */
const DEFAULT_METERING = -160;

/** iOS 录音文件扩展名：使用 AAC 格式 */
const IOS_RECORDING_EXTENSION = 'aac';

/** Android 录音文件扩展名：使用 AMR 格式（压缩率高，适合语音） */
const ANDROID_RECORDING_EXTENSION = 'amr';

/** 默认录音文件扩展名：优先使用 iOS 的 AAC 格式 */
const DEFAULT_RECORDING_EXTENSION = IOS_RECORDING_EXTENSION;

/**
 * 录音配置选项
 * 基于高质量预设，针对移动端语音消息场景进行了优化
 */
const RECORDING_OPTIONS: Audio.RecordingOptions = {
    // 继承高质量预设的基础配置
    ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
    
    /** 启用音量计量：用于显示波形动画 */
    isMeteringEnabled: true,
    
    /** Android 平台特定配置 */
    android: {
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY.android,
        /** 文件扩展名：使用 AMR 格式 */
        extension: `.${ANDROID_RECORDING_EXTENSION}`,
        /** 输出格式：3GPP 容器 */
        outputFormat: Audio.AndroidOutputFormat.THREE_GPP,
        /** 音频编码器：AMR-NB（窄带），适合语音 */
        audioEncoder: Audio.AndroidAudioEncoder.AMR_NB,
    },
    
    /** iOS 平台特定配置 */
    ios: {
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY.ios,
        /** 文件扩展名：使用 AAC 格式 */
        extension: `.${IOS_RECORDING_EXTENSION}`,
        /** 输出格式：MPEG-4 AAC */
        outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    },
};

/**
 * 设置音频会话模式
 * 
 * @param isRecording - 是否正在录音：true 表示进入录音模式，false 表示退出录音模式
 * 
 * 关键配置说明：
 * 1. allowsRecordingIOS: iOS 平台是否允许录音
 * 2. playsInSilentModeIOS: iOS 静音模式下是否仍能播放音频
 * 3. shouldDuckAndroid: Android 平台是否降低其他应用音量（闪避）
 * 4. playThroughEarpieceAndroid: Android 是否通过听筒播放
 * 5. staysActiveInBackground: 【关键修改】应用进入后台时音频会话是否保持活跃
 *    - 设置为 true 可防止录音时因音频会话变化导致 AppState 波动
 *    - 从而避免 WebSocket 连接意外断开
 */
const setRecordingAudioMode = async (isRecording: boolean) => {
    try {
        await Audio.setAudioModeAsync({
            /** iOS：是否允许录音 */
            allowsRecordingIOS: isRecording,
            
            /** iOS：静音模式下仍可播放（避免录音提示音无法播放） */
            playsInSilentModeIOS: true,
            
            /** Android：录音时降低其他应用音量（闪避效果） */
            shouldDuckAndroid: true,
            
            /** Android：不通过听筒播放（使用扬声器/默认输出） */
            playThroughEarpieceAndroid: false,
            
            /**
             * 【关键配置】应用进入后台时音频会话保持活跃
             * 原设置为 false，改为 true 可防止：
             * 1. 录音时音频会话切换导致 AppState 短暂变化
             * 2. WebSocket 管理器误判为应用进入后台而断开连接
             */
            staysActiveInBackground: true,
        });
    } catch (err) {
        logError('[useVoiceRecorder.setRecordingAudioMode]', err);
    }
};

const clearGlobalActiveRecorder = () => {
    globalActiveRecorder = null;
};

/**
 * 安全重置所有录音状态
 * 用于确保在任何错误情况下状态都能正确重置
 */
const safeResetRecordingState = async () => {
    logDebug('[useVoiceRecorder.safeResetRecordingState] 安全重置所有录音状态');
    isGlobalRecorderBusy = false;
    isRecordingGlobally = false;
    clearGlobalActiveRecorder();
    try {
        await setRecordingAudioMode(false);
    } catch (err) {
        logError('[useVoiceRecorder.safeResetRecordingState.setRecordingAudioMode]', err);
    }
};

const cleanupStaleGlobalRecording = async () => {
    logDebug('[useVoiceRecorder.cleanupStaleGlobalRecording] 开始清理遗留录音');
    const activeRecorder = globalActiveRecorder;
    if (!activeRecorder) {
        logDebug('[useVoiceRecorder.cleanupStaleGlobalRecording] 没有活跃录音，无需清理');
        return;
    }

    const activePath = activeRecorder.getURI();
    logDebug('[useVoiceRecorder.cleanupStaleGlobalRecording] 活跃录音路径:', activePath);
    
    activeRecorder.setOnRecordingStatusUpdate(null);
    
    try {
        const status = await activeRecorder.getStatusAsync();
        logDebug('[useVoiceRecorder.cleanupStaleGlobalRecording] 录音状态:', status);
        
        if (status.isRecording || status.canRecord || status.isLoaded) {
            logDebug('[useVoiceRecorder.cleanupStaleGlobalRecording] 调用 stopAndUnloadAsync');
            await activeRecorder.stopAndUnloadAsync();
        } else {
            logDebug('[useVoiceRecorder.cleanupStaleGlobalRecording] 录音已停止或未加载，跳过 stopAndUnloadAsync');
        }
    } catch (err) {
        logError('[useVoiceRecorder.cleanupStaleGlobalRecording.stopAndUnloadAsync]', err);
    }

    if (activePath) {
        logDebug('[useVoiceRecorder.cleanupStaleGlobalRecording] 删除音频文件:', activePath);
        await deleteAsync(toFileUri(activePath), {idempotent: true}).catch((err) => {
            logError('[useVoiceRecorder.cleanupStaleGlobalRecording.deleteAsync]', err);
            return undefined;
        });
    }
    
    logDebug('[useVoiceRecorder.cleanupStaleGlobalRecording] 重置音频模式');
    await setRecordingAudioMode(false);
    
    logDebug('[useVoiceRecorder.cleanupStaleGlobalRecording] 清理完成');
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

    /**
     * 开始录音
     * 
     * 关键优化点：
     * 1. 【新功能】如果已有录音在进行，先立即停止并丢弃之前的录音
     * 2. 设置进度更新间隔为 500ms（原 250ms），减少主线程回调频率 50%
     * 3. 更新全局录音状态标记，让 WebSocket 管理器知道正在录音
     * 4. 添加详细的日志记录，便于问题排查
     */
    const startRecording = useCallback(async () => {
        logDebug('[useVoiceRecorder.startRecording] ========== 开始录音流程 ==========');
        
        // 【新功能】如果已有录音在进行，先立即停止并丢弃之前的录音
        if (recordingRef.current || recordingPathRef.current) {
            logDebug('[useVoiceRecorder.startRecording] 发现已有录音，先取消');
            await cancelRecording();
        }
        
        // 防止重复启动录音
        if (isStartingRef.current) {
            logDebug('[useVoiceRecorder.startRecording] 正在启动中，忽略此次请求');
            return;
        }
        if (isGlobalRecorderBusy) {
            logDebug('[useVoiceRecorder.startRecording] 全局录音器忙，忽略此次请求');
            return;
        }
        
        logDebug('[useVoiceRecorder.startRecording] 设置启动标记');
        isStartingRef.current = true;
        isGlobalRecorderBusy = true;
        
        // 添加超时安全机制，防止状态被永久卡住
        const safeCleanup = async () => {
            if (startTimeoutRef.current) {
                clearTimeout(startTimeoutRef.current);
                startTimeoutRef.current = null;
            }
        };
        
        // 10秒超时后强制重置状态
        startTimeoutRef.current = setTimeout(async () => {
            logDebug('[useVoiceRecorder.startRecording] 超时，强制重置状态');
            await safeResetRecordingState();
            isStartingRef.current = false;
            recordingRef.current = null;
            setState('idle');
            meteringShared.value = DEFAULT_METERING;
        }, 10000);
        
        try {
            logDebug('[useVoiceRecorder.startRecording] 步骤1：清理遗留录音');
            await cleanupStaleGlobalRecording();
            
            logDebug('[useVoiceRecorder.startRecording] 步骤2：请求麦克风权限');
            const hasPermission = await requestPermission();
            if (!hasPermission) {
                logDebug('[useVoiceRecorder.startRecording] 麦克风权限被拒绝');
                await safeCleanup();
                await safeResetRecordingState();
                onError?.('permission_denied');
                return;
            }
            logDebug('[useVoiceRecorder.startRecording] 麦克风权限获取成功');

            logDebug('[useVoiceRecorder.startRecording] 步骤3：检查是否继续（权限对话框期间用户是否松开）');
            const proceed = optionsRef.current?.shouldProceedAfterPermission?.() ?? true;
            if (!proceed) {
                logDebug('[useVoiceRecorder.startRecording] 用户已松开，不继续录音');
                await safeCleanup();
                await safeResetRecordingState();
                return;
            }

            logDebug('[useVoiceRecorder.startRecording] 步骤4：设置音频会话为录音模式');
            await setRecordingAudioMode(true);
            
            logDebug('[useVoiceRecorder.startRecording] 步骤5：创建录音实例');
            const recording = new Audio.Recording();
            logDebug('[useVoiceRecorder.startRecording] 步骤6：准备录音，应用配置');
            await recording.prepareToRecordAsync(RECORDING_OPTIONS);
            
            logDebug('[useVoiceRecorder.startRecording] 步骤7：设置进度更新间隔为 500ms');
            recording.setProgressUpdateInterval(500);
            
            logDebug('[useVoiceRecorder.startRecording] 步骤8：开始录音');
            await recording.startAsync();

            logDebug('[useVoiceRecorder.startRecording] 步骤9：保存录音引用');
            recordingRef.current = recording;
            recordingPathRef.current = recording.getURI();
            globalActiveRecorder = recording;
            recordStartTimeRef.current = Date.now();
            lastVoiceTimeRef.current = Date.now();
            logDebug('[useVoiceRecorder.startRecording] 录音路径:', recordingPathRef.current);
            
            logDebug('[useVoiceRecorder.startRecording] 步骤10：更新 UI 状态为 recording');
            setState('recording');
            meteringShared.value = DEFAULT_METERING;
            
            logDebug('[useVoiceRecorder.startRecording] 步骤11：更新全局录音状态标记');
            isRecordingGlobally = true;

            logDebug('[useVoiceRecorder.startRecording] 步骤12：设置录音状态更新回调');
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
            
            await safeCleanup();
            logDebug('[useVoiceRecorder.startRecording] ========== 录音启动成功 ==========');
        } catch (err) {
            logError('[useVoiceRecorder.startRecording] 录音启动失败', err);
            await safeCleanup();
            recordingRef.current = null;
            setState('idle');
            meteringShared.value = DEFAULT_METERING;
            await safeResetRecordingState();
            onError?.('record_failed');
        } finally {
            logDebug('[useVoiceRecorder.startRecording] 清除启动标记');
            isStartingRef.current = false;
        }
    }, [requestPermission, onError, meteringShared, scheduleSilenceAutoStop]);

    /**
     * 停止录音并发送
     * 
     * 关键操作：
     * 1. 立即更新全局录音状态标记为 false，让 WebSocket 管理器恢复正常处理
     * 2. 清理录音引用和定时器
     * 3. 停止录音并处理音频文件
     * 4. 添加详细的日志记录，便于问题排查
     */
    const stopRecordingAndSend = useCallback(async () => {
        logDebug('[useVoiceRecorder.stopRecordingAndSend] ========== 停止录音并发送 ==========');
        
        let path = recordingPathRef.current;
        logDebug('[useVoiceRecorder.stopRecordingAndSend] 当前录音路径:', path);
        
        if (!path) {
            logDebug('[useVoiceRecorder.stopRecordingAndSend] 路径为空，等待 350ms');
            await new Promise((r) => setTimeout(r, 350));
            path = recordingPathRef.current;
            logDebug('[useVoiceRecorder.stopRecordingAndSend] 等待后路径:', path);
        }
        
        const recording = recordingRef.current;
        logDebug('[useVoiceRecorder.stopRecordingAndSend] 清理引用');
        recordingPathRef.current = null;
        recordingRef.current = null;
        setState('idle');
        meteringShared.value = DEFAULT_METERING;
        
        logDebug('[useVoiceRecorder.stopRecordingAndSend] 更新全局录音状态为 false');
        isRecordingGlobally = false;

        logDebug('[useVoiceRecorder.stopRecordingAndSend] 清理静音检查定时器');
        if (silenceCheckTimeoutRef.current) {
            clearTimeout(silenceCheckTimeoutRef.current);
            silenceCheckTimeoutRef.current = null;
        }
        logDebug('[useVoiceRecorder.stopRecordingAndSend] 清除录音状态更新回调');
        recording?.setOnRecordingStatusUpdate(null);

        if (!path && !recording) {
            logDebug('[useVoiceRecorder.stopRecordingAndSend] 没有路径也没有录音实例，直接返回');
            isGlobalRecorderBusy = false;
            clearGlobalActiveRecorder();
            await setRecordingAudioMode(false);
            return;
        }
        if (!recording) {
            logDebug('[useVoiceRecorder.stopRecordingAndSend] 没有录音实例，返回 process_failed');
            isGlobalRecorderBusy = false;
            clearGlobalActiveRecorder();
            await setRecordingAudioMode(false);
            onError?.('process_failed');
            return;
        }

        logDebug('[useVoiceRecorder.stopRecordingAndSend] 步骤1：停止录音');
        let durationMs = Date.now() - recordStartTimeRef.current;
        try {
            logDebug('[useVoiceRecorder.stopRecordingAndSend] 调用 stopAndUnloadAsync');
            const status = await recording.stopAndUnloadAsync();
            if ('durationMillis' in status && typeof status.durationMillis === 'number') {
                durationMs = status.durationMillis;
                logDebug('[useVoiceRecorder.stopRecordingAndSend] 录音时长:', durationMs, 'ms');
            }
            path = path ?? recording.getURI() ?? null;
            logDebug('[useVoiceRecorder.stopRecordingAndSend] 最终录音路径:', path);
        } catch (err) {
            logError('[useVoiceRecorder.stopRecordingAndSend.stopAndUnloadAsync] 失败', err);
            await cleanupStaleGlobalRecording();
            isGlobalRecorderBusy = false;
            await setRecordingAudioMode(false);
            onError?.('process_failed');
            return;
        } finally {
            logDebug('[useVoiceRecorder.stopRecordingAndSend] 清理全局录音器，重置音频模式');
            clearGlobalActiveRecorder();
            await setRecordingAudioMode(false);
        }

        try {
            logDebug('[useVoiceRecorder.stopRecordingAndSend] 步骤2：检查录音时长');
            if (durationMs < MIN_RECORDING_DURATION_MS) {
                logDebug('[useVoiceRecorder.stopRecordingAndSend] 录音太短:', durationMs, 'ms，最小要求:', MIN_RECORDING_DURATION_MS, 'ms');
                clearGlobalActiveRecorder();
                isGlobalRecorderBusy = false;
                await setRecordingAudioMode(false);
                onError?.('too_short');
                return;
            }

            logDebug('[useVoiceRecorder.stopRecordingAndSend] 步骤3：准备文件信息');
            if (!path) {
                logDebug('[useVoiceRecorder.stopRecordingAndSend] 路径为空，返回 process_failed');
                clearGlobalActiveRecorder();
                isGlobalRecorderBusy = false;
                await setRecordingAudioMode(false);
                onError?.('process_failed');
                return;
            }

            const localPath = path.startsWith('file://') ? path : `file://${path}`;
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
            
            logDebug('[useVoiceRecorder.stopRecordingAndSend] 步骤4：回调 onRecorded');
            onRecorded([file]);
            clearGlobalActiveRecorder();
            isGlobalRecorderBusy = false;
            
            logDebug('[useVoiceRecorder.stopRecordingAndSend] ========== 录音发送成功 ==========');
        } catch (err) {
            logError('[useVoiceRecorder.stopRecordingAndSend] 处理失败', err);
            clearGlobalActiveRecorder();
            isGlobalRecorderBusy = false;
            onError?.('process_failed');
        }
    }, [onRecorded, onError, meteringShared]);

    stopRecordingAndSendRef.current = stopRecordingAndSend;

    /**
     * 取消录音（不发送）
     * 
     * 关键操作：
     * 1. 立即更新全局录音状态标记为 false
     * 2. 停止录音并删除音频文件
     * 3. 清理所有相关引用
     * 4. 添加详细的日志记录，便于问题排查
     */
    const cancelRecording = useCallback(async () => {
        logDebug('[useVoiceRecorder.cancelRecording] ========== 取消录音 ==========');
        
        logDebug('[useVoiceRecorder.cancelRecording] 清除启动标记');
        isStartingRef.current = false;
        isGlobalRecorderBusy = false;
        
        const path = recordingPathRef.current;
        const recording = recordingRef.current;
        logDebug('[useVoiceRecorder.cancelRecording] 录音路径:', path);
        
        logDebug('[useVoiceRecorder.cancelRecording] 清理引用');
        recordingPathRef.current = null;
        recordingRef.current = null;
        setState('idle');
        meteringShared.value = DEFAULT_METERING;
        
        logDebug('[useVoiceRecorder.cancelRecording] 更新全局录音状态为 false');
        isRecordingGlobally = false;

        logDebug('[useVoiceRecorder.cancelRecording] 清理静音检查定时器');
        if (silenceCheckTimeoutRef.current) {
            clearTimeout(silenceCheckTimeoutRef.current);
            silenceCheckTimeoutRef.current = null;
        }
        logDebug('[useVoiceRecorder.cancelRecording] 清除录音状态更新回调');
        recording?.setOnRecordingStatusUpdate(null);

        if (recording) {
            logDebug('[useVoiceRecorder.cancelRecording] 步骤1：停止录音');
            try {
                const status = await recording.getStatusAsync();
                logDebug('[useVoiceRecorder.cancelRecording] 录音状态:', status);
                
                if (status.isRecording || status.canRecord || status.isLoaded) {
                    logDebug('[useVoiceRecorder.cancelRecording] 调用 stopAndUnloadAsync');
                    await recording.stopAndUnloadAsync();
                } else {
                    logDebug('[useVoiceRecorder.cancelRecording] 录音已停止或未加载，跳过 stopAndUnloadAsync');
                }
            } catch (err) {
                logError('[useVoiceRecorder.cancelRecording.stopAndUnloadAsync]', err);
            }
        }
        
        logDebug('[useVoiceRecorder.cancelRecording] 步骤2：删除音频文件');
        const recordingUri = path ?? recording?.getURI();
        if (recordingUri) {
            logDebug('[useVoiceRecorder.cancelRecording] 删除文件:', recordingUri);
            try {
                await deleteAsync(toFileUri(recordingUri), {idempotent: true});
            } catch (err) {
                logError('[useVoiceRecorder.cancelRecording.deleteAsync]', err);
            }
        } else {
            logDebug('[useVoiceRecorder.cancelRecording] 没有文件需要删除');
        }
        
        logDebug('[useVoiceRecorder.cancelRecording] 步骤3：重置音频模式');
        await setRecordingAudioMode(false);
        
        logDebug('[useVoiceRecorder.cancelRecording] 清除全局录音器');
        clearGlobalActiveRecorder();
        
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
