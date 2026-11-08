// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useCallback, useEffect, useRef, useState} from 'react';
import {Alert, NativeEventEmitter, NativeModules, Platform} from 'react-native';
import Permissions from 'react-native-permissions';

import {stopRealtimeRecording} from '@mattermost/voice-recorder';
import {debugLog, flushLogsToDisk, isLogSystemReady} from '@store/debug_log';

const {VoiceRecorder} = NativeModules;
const voiceStreamEmitter = new NativeEventEmitter(VoiceRecorder);

export type VoiceStreamState = 'idle' | 'connecting' | 'recording' | 'error';

export type VoiceStreamResult = {
    partialText: string;
    finalText: string;
    error: string | null;
};

/**
 * Hook for real-time voice streaming and transcription
 * Used in smart notebook for live speech-to-text
 *
 * This hook is completely independent from useVoiceRecorder
 * and does not affect the chat window voice message feature.
 */
export function useVoiceStream(serverUrl: string, token: string) {
    const [state, setState] = useState<VoiceStreamState>('idle');
    const [result, setResult] = useState<VoiceStreamResult>({
        partialText: '',
        finalText: '',
        error: null,
    });

    // 【关键修复】使用 ref 来保存最新的 token，避免闭包捕获旧值
    const tokenRef = useRef(token);
    tokenRef.current = token;

    const serverUrlRef = useRef(serverUrl);
    serverUrlRef.current = serverUrl;

    // 【优化】添加事件监听器 - 接收原生端转录结果
    useEffect(() => {
        console.log('[useVoiceStream] 🎧 设置事件监听器...');
        debugLog('VOICE_STREAM', '[useVoiceStream] 🎧 设置事件监听器...');

        // 监听转录结果（低频，每秒 1-2 次）
        const transcriptionListener = voiceStreamEmitter.addListener(
            'VoiceStreamTranscription',
            (event: {text: string; isFinal: boolean}) => {
                console.log('[useVoiceStream] ✅ 收到转录事件:', event);
                debugLog('VOICE_STREAM', '[useVoiceStream] ✅ 收到转录:', event.text, 'isFinal:', event.isFinal);
                setResult(prev => ({
                    ...prev,
                    partialText: event.isFinal ? prev.partialText : event.text,
                    finalText: event.isFinal ? event.text : prev.finalText,
                }));
            }
        );

        // 监听连接状态
        const connectedListener = voiceStreamEmitter.addListener(
            'VoiceStreamConnected',
            () => {
                console.log('[useVoiceStream] ✅ WebSocket 已连接事件');
                debugLog('VOICE_STREAM', '[useVoiceStream] ✅ WebSocket 已连接（ASR 由服务器自动启动）');
                // 【优化】不再发送 start 消息 — 服务器在 WebSocket 连接建立时自动启动 ASR
            }
        );

        // 监听错误
        const errorListener = voiceStreamEmitter.addListener(
            'VoiceStreamError',
            (event: {error: string}) => {
                console.log('[useVoiceStream] ❌ 收到错误事件:', event);
                debugLog('VOICE_STREAM', '[useVoiceStream] ❌ 错误:', event.error);
                setResult(prev => ({...prev, error: event.error}));
                setState('error');
            }
        );

        // 监听关闭
        const closedListener = voiceStreamEmitter.addListener(
            'VoiceStreamClosed',
            (event: {code: number; reason: string}) => {
                console.log('[useVoiceStream] ⚠️ 连接关闭事件:', event);
                debugLog('VOICE_STREAM', '[useVoiceStream] ⚠️ 连接关闭:', event.code, event.reason);
                if (event.code !== 1000 && event.reason !== 'Normal closure') {
                    setState('error');
                    setResult(prev => ({...prev, error: '连接意外关闭'}));
                }
            }
        );

        // 监听原生日志（用于调试）
        const logListener = voiceStreamEmitter.addListener(
            'VoiceStreamLog',
            (event: {level: string; message: string}) => {
                const prefix = event.level === 'error' ? '❌' : '📝';
                console.log(`[useVoiceStream] ${prefix} [Native]`, event.message);
                debugLog('VOICE_STREAM', `[Native] ${event.message}`);
            }
        );

        console.log('[useVoiceStream] ✅ 事件监听器已注册');
        debugLog('VOICE_STREAM', '[useVoiceStream] ✅ 事件监听器已注册');

        // 清理监听器
        return () => {
            console.log('[useVoiceStream] 🧹 清理事件监听器');
            transcriptionListener.remove();
            connectedListener.remove();
            errorListener.remove();
            closedListener.remove();
            logListener.remove();
        };
    }, []);

    /**
     * Request microphone permission
     */
    const requestPermission = useCallback(async (): Promise<{granted: boolean; wasFreshlyGranted: boolean}> => {
        try {
            // 先检查当前权限状态
            const permission = Platform.select({
                ios: Permissions.PERMISSIONS.IOS.MICROPHONE,
                android: Permissions.PERMISSIONS.ANDROID.RECORD_AUDIO,
                default: Permissions.PERMISSIONS.ANDROID.RECORD_AUDIO,
            });

            const currentStatus = await Permissions.check(permission);

            // 如果已经授予，直接返回（不是新授予）
            if (currentStatus === Permissions.RESULTS.GRANTED) {
                return {granted: true, wasFreshlyGranted: false};
            }

            // 请求权限
            const result = await Permissions.request(permission);
            const granted = result === Permissions.RESULTS.GRANTED;

            return {granted, wasFreshlyGranted: granted};
        } catch (error) {
            console.error('[useVoiceStream] Permission request failed:', error);
            return {granted: false, wasFreshlyGranted: false};
        }
    }, []);

    /**
     * 【优化】Start streaming: 原生直传模式（避免 Bridge 瓶颈）
     */
    const startStreaming = useCallback(async () => {
        debugLog('VOICE_STREAM', '[startStreaming] ===== 开始启动语音流（原生直传模式）=====');

        // 【防御性检查】如果已经在录制或连接中，不要重复启动
        if (state === 'recording' || state === 'connecting') {
            debugLog('VOICE_STREAM', '[startStreaming] ⚠️ Already in progress, state:', state);
            return false;
        }

        try {
            // Reset state
            debugLog('VOICE_STREAM', '[startStreaming] Step 1: Reset state');
            setState('connecting');
            setResult({partialText: '', finalText: '', error: null});

            // 【关键修复】使用 ref 获取最新的 token
            debugLog('VOICE_STREAM', '[startStreaming] Step 2: Get latest token from ref');
            const currentToken = tokenRef.current;
            const currentServerUrl = serverUrlRef.current;

            debugLog('VOICE_STREAM', '[startStreaming] Step 3: Validate token', {
                hasToken: Boolean(currentToken),
                tokenLength: currentToken?.length || 0,
                hasServerUrl: Boolean(currentServerUrl),
            });

            // 检查 token 是否有效
            if (!currentToken || currentToken.trim() === '') {
                debugLog('VOICE_STREAM', '[startStreaming] ❌ Token is empty or invalid');
                setState('error');
                setResult(r => ({...r, error: '认证令牌无效，请重新登录'}));
                Alert.alert('认证失败', '语音转文字服务需要重新登录才能使用', [{text: '确定'}]);
                return false;
            }

            // Request permission
            debugLog('VOICE_STREAM', '[startStreaming] Step 4: Request microphone permission');
            const {granted: hasPermission, wasFreshlyGranted} = await requestPermission();
            debugLog('VOICE_STREAM', '[startStreaming] Permission result:', {hasPermission, wasFreshlyGranted});

            if (!hasPermission) {
                debugLog('VOICE_STREAM', '[startStreaming] ❌ Permission denied');
                setState('error');
                setResult(r => ({...r, error: '麦克风权限被拒绝'}));
                Alert.alert(
                    '需要麦克风权限',
                    '请在设置中允许 Mattermost 访问麦克风',
                    [
                        {text: '取消', style: 'cancel'},
                        {text: '去设置', onPress: () => Permissions.openSettings()},
                    ]
                );
                return false;
            }

            // 【关键修复】权限刚授予后，等待系统初始化音频服务
            const initDelay = wasFreshlyGranted ? 1000 : 300;
            debugLog('VOICE_STREAM', `[startStreaming] Step 4.5: Wait ${initDelay}ms for audio service initialization`);
            await new Promise(resolve => setTimeout(resolve, initDelay));

            // 【关键修复】在调用原生模块前，强制将日志写入磁盘
            debugLog('VOICE_STREAM', '[startStreaming] Step 5: Flushing logs to disk');
            await flushLogsToDisk();

            // 【优化】使用原生直传模式启动录音
            debugLog('VOICE_STREAM', '[startStreaming] Step 6: Start native direct recording');
            const recordingStarted = await VoiceRecorder.startRealtimeRecordingDirect({
                serverUrl: currentServerUrl,
                token: currentToken,
                format: 'pcm',
            });

            debugLog('VOICE_STREAM', '[startStreaming] Recording result:', {recordingStarted});

            if (!recordingStarted) {
                debugLog('VOICE_STREAM', '[startStreaming] ❌ Recording failed to start');
                setState('error');
                setResult(r => ({...r, error: '录音启动失败'}));
                return false;
            }

            // 【优化】无需发送 start 控制消息
            // 服务器在 WebSocket 连接建立时自动启动 ASR
            debugLog('VOICE_STREAM', '[startStreaming] Step 7: (ASR 由服务器在连接时自动启动)');

            debugLog('VOICE_STREAM', '[startStreaming] Step 8: Set state to recording');
            setState('recording');
            debugLog('VOICE_STREAM', '[startStreaming] ✅ 语音流启动成功（直传模式）');
            return true;

        } catch (error: any) {
            debugLog('VOICE_STREAM', '[startStreaming] ❌ 异常捕获:', {
                message: error?.message || String(error),
                stack: error?.stack || 'no stack',
            });
            setState('error');
            setResult(r => ({...r, error: error.message || '启动失败'}));

            // Cleanup
            stopRealtimeRecording().catch(() => {});
            VoiceRecorder.disconnectVoiceStream?.();

            return false;
        }
    }, [requestPermission, state]);

    /**
     * 【优化】Stop streaming: 原生直传模式
     */
    const stopStreaming = useCallback(async (): Promise<string> => {
        debugLog('VOICE_STREAM', '[stopStreaming] Stopping stream（原生直传模式）...');

        try {
            // 发送 stop 消息通知服务器 finalize ASR 并返回最终文本
            debugLog('VOICE_STREAM', '[stopStreaming] 📤 发送 stop 控制消息');
            VoiceRecorder.sendControlMessage({type: 'stop'});

            // 等待服务器处理 stop 并发送 completed 响应
            await new Promise(resolve => setTimeout(resolve, 500));

            // 停止录音并断开 WebSocket
            await stopRealtimeRecording();

            const finalText = result.finalText || result.partialText;

            setState('idle');
            debugLog('VOICE_STREAM', '[stopStreaming] Stopped, final text:', finalText);

            return finalText;

        } catch (error: any) {
            debugLog('VOICE_STREAM', '[stopStreaming] Stop failed:', error);
            setState('error');
            setResult(r => ({...r, error: error.message || '停止失败'}));

            // Force cleanup
            VoiceRecorder.disconnectVoiceStream?.();

            return '';
        }
    }, [result.finalText, result.partialText]);

    /**
     * 【优化】Cancel streaming without finalizing（原生直传模式）
     */
    const cancelStreaming = useCallback(async () => {
        debugLog('VOICE_STREAM', '[cancelStreaming] Cancelling stream（原生直传模式）...');

        try {
            await stopRealtimeRecording();

            // 断开 WebSocket
            VoiceRecorder.disconnectVoiceStream?.();

            setState('idle');
            setResult({partialText: '', finalText: '', error: null});

            debugLog('VOICE_STREAM', '[cancelStreaming] Cancelled');

        } catch (error: any) {
            debugLog('VOICE_STREAM', '[cancelStreaming] Cancel failed:', error);

            // Force cleanup
            VoiceRecorder.disconnectVoiceStream?.();

            setState('idle');
        }
    }, []);

    /**
     * Clear result
     */
    const clearResult = useCallback(() => {
        setResult({partialText: '', finalText: '', error: null});
    }, []);

    return {
        state,
        result,
        startStreaming,
        stopStreaming,
        cancelStreaming,
        clearResult,
    };
}
