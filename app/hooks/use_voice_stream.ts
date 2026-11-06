// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useCallback, useRef, useState} from 'react';
import {Alert, Platform} from 'react-native';
import Permissions from 'react-native-permissions';

import {VoiceStreamClient} from '@client/websocket/voice_stream_client';
import {startRealtimeRecording, stopRealtimeRecording} from '@mattermost/voice-recorder';
import {debugLog, flushLogsToDisk, isLogSystemReady} from '@store/debug_log';

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

    const clientRef = useRef<VoiceStreamClient | null>(null);
    const sessionIdRef = useRef<string | null>(null);

    // 【关键修复】使用 ref 来保存最新的 token，避免闭包捕获旧值
    const tokenRef = useRef(token);
    tokenRef.current = token;

    const serverUrlRef = useRef(serverUrl);
    serverUrlRef.current = serverUrl;

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
     * Start streaming: connect WebSocket + start recording
     */
    const startStreaming = useCallback(async () => {
        debugLog('VOICE_STREAM', '[startStreaming] ===== 开始启动语音流 =====');
        debugLog('VOICE_STREAM', '[startStreaming] Starting stream...');

        // 【防御性检查】如果已经在录制或连接中，不要重复启动
        if (state === 'recording' || state === 'connecting') {
            debugLog('VOICE_STREAM', '[startStreaming] ⚠️ Already in progress, state:', state);
            debugLog('VOICE_STREAM', '[startStreaming] Already streaming, state:', state);
            return false;
        }

        // 【防御性检查】如果已有 client 实例，先清理
        if (clientRef.current) {
            debugLog('VOICE_STREAM', '[startStreaming] ⚠️ Existing client found, cleaning up');
            debugLog('VOICE_STREAM', '[startStreaming] Existing client found, cleaning up');
            try {
                clientRef.current.close();
            } catch (e) {
                debugLog('VOICE_STREAM', '[startStreaming] Cleanup error:', e);
            }
            clientRef.current = null;
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
                tokenPrefix: currentToken ? `${currentToken.substring(0, 10)}...` : 'none',
                hasServerUrl: Boolean(currentServerUrl),
                serverUrl: currentServerUrl,
            });

            // 检查 token 是否有效
            if (!currentToken || currentToken.trim() === '') {
                debugLog('VOICE_STREAM', '[startStreaming] ❌ Token is empty or invalid');
                console.error('[useVoiceStream] Token is empty or invalid');
                setState('error');
                setResult(r => ({...r, error: '认证令牌无效，请重新登录'}));
                Alert.alert(
                    '认证失败',
                    '语音转文字服务需要重新登录才能使用',
                    [{text: '确定'}]
                );
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

            // 【关键修复】权限刚授予后，等待系统初始化音频服务（防止原生层崩溃）
            // 首次授权需要更长时间（iOS AVAudioSession / Android AudioRecord 初始化）
            const initDelay = wasFreshlyGranted ? 1000 : 300;
            debugLog('VOICE_STREAM', `[startStreaming] Step 4.5: Wait ${initDelay}ms for audio service initialization`, {wasFreshlyGranted});
            await new Promise(resolve => setTimeout(resolve, initDelay));

            // Create WebSocket client with latest token
            debugLog('VOICE_STREAM', '[startStreaming] Step 5: Create VoiceStreamClient', {
                serverUrl: currentServerUrl,
                tokenPrefix: `${currentToken.substring(0, 10)}...`,
            });
            const client = new VoiceStreamClient(currentServerUrl, currentToken);

            // Set up callbacks
            debugLog('VOICE_STREAM', '[startStreaming] Step 6: Set up client callbacks');
            client.onTranscription = (text, isFinal) => {
                debugLog('VOICE_STREAM', '[startStreaming] Transcription:', text, 'isFinal:', isFinal);
                setResult(r => ({
                    ...r,
                    partialText: isFinal ? r.partialText : text,
                    finalText: isFinal ? text : r.finalText,
                }));
            };

            client.onCompleted = (finalText) => {
                debugLog('VOICE_STREAM', '[startStreaming] Completed with text:', finalText);
                setResult(r => ({...r, finalText, partialText: ''}));
            };

            client.onError = (error) => {
                debugLog('VOICE_STREAM', '[startStreaming] ❌ Client error:', error);
                debugLog('VOICE_STREAM', '[startStreaming] Error:', error);
                setResult(r => ({...r, error}));
                setState('error');
            };

            client.onClose = (code, reason) => {
                debugLog('VOICE_STREAM', '[startStreaming] Connection closed:', {code, reason});
                console.log('[useVoiceStream] Connection closed:', code, reason);
                // 【修复】使用 ref 避免闭包捕获旧的 state 值
                // 注意：这里我们无法直接访问最新的 state，所以只在明显异常的情况下处理
                if (code !== 1000 && reason !== 'Normal closure') {
                    // Unexpected closure (not normal close)
                    debugLog('VOICE_STREAM', '[startStreaming] ⚠️ Unexpected closure, code:', code);
                    setState('error');
                    setResult(r => ({...r, error: '连接意外关闭'}));
                }
            };

            // Connect to WebSocket
            debugLog('VOICE_STREAM', '[startStreaming] Step 7: Connect to WebSocket');
            await client.connect();
            debugLog('VOICE_STREAM', '[startStreaming] ✅ WebSocket connected');
            clientRef.current = client;

            // Send start message
            debugLog('VOICE_STREAM', '[startStreaming] Step 8: Send start control message');
            client.sendControlMessage('start');

            // Start real-time recording
            debugLog('VOICE_STREAM', '[startStreaming] Step 9: Start real-time recording');

            // 【关键修复】包装 startRealtimeRecording 调用，捕获原生层崩溃
            let recordingStarted = false;
            try {
                debugLog('VOICE_STREAM', '[startStreaming] Step 9.1: About to call startRealtimeRecording');
                debugLog('VOICE_STREAM', '[startStreaming] About to call native startRealtimeRecording');

                // 【关键修复】在调用原生模块前，强制将日志写入磁盘
                // 这样即使原生模块崩溃导致 JS 线程立即终止，日志也已保存
                debugLog('VOICE_STREAM', '[startStreaming] Step 9.1.1: Flushing logs to disk before native call');
                await flushLogsToDisk();
                debugLog('VOICE_STREAM', '[startStreaming] Step 9.1.2: Logs flushed to disk');

                // 添加超时保护（5秒）
                const recordingPromise = startRealtimeRecording(
                    (chunkBase64) => {
                        // Audio chunk callback - send to server
                        try {
                            if (clientRef.current?.isConnected()) {
                                clientRef.current.sendAudioChunk(chunkBase64);
                            }
                        } catch (chunkError) {
                            debugLog('VOICE_STREAM', '[startStreaming] ⚠️ Audio chunk callback error:', chunkError);
                        }
                    },
                    {format: 'pcm'}
                );

                const timeoutPromise = new Promise<boolean>((resolve) => {
                    setTimeout(() => {
                        debugLog('VOICE_STREAM', '[startStreaming] ❌ startRealtimeRecording timeout (5s)');
                        debugLog('VOICE_STREAM', '[startStreaming] startRealtimeRecording timeout');
                        resolve(false);
                    }, 5000);
                });

                recordingStarted = await Promise.race([recordingPromise, timeoutPromise]);
                debugLog('VOICE_STREAM', '[startStreaming] Step 9.2: startRealtimeRecording returned:', {recordingStarted});
                debugLog('VOICE_STREAM', '[startStreaming] startRealtimeRecording returned:', recordingStarted);
            } catch (recordError) {
                debugLog('VOICE_STREAM', '[startStreaming] ❌ startRealtimeRecording threw error:', {
                    message: recordError instanceof Error ? recordError.message : String(recordError),
                    stack: recordError instanceof Error ? recordError.stack : undefined,
                });
                debugLog('VOICE_STREAM', '[startStreaming] startRealtimeRecording error:', recordError);
                recordingStarted = false;
            }

            debugLog('VOICE_STREAM', '[startStreaming] Recording result:', {recordingStarted});

            if (!recordingStarted) {
                debugLog('VOICE_STREAM', '[startStreaming] ❌ Recording failed to start');
                client.close();
                clientRef.current = null;
                setState('error');
                setResult(r => ({...r, error: '录音启动失败'}));
                return false;
            }

            debugLog('VOICE_STREAM', '[startStreaming] Step 10: Set state to recording');
            setState('recording');
            debugLog('VOICE_STREAM', '[startStreaming] ✅ 语音流启动成功');
            debugLog('VOICE_STREAM', '[startStreaming] Streaming started successfully');
            return true;

        } catch (error: any) {
            debugLog('VOICE_STREAM', '[startStreaming] ❌ 异常捕获:', {
                message: error?.message || String(error),
                stack: error?.stack || 'no stack',
            });
            debugLog('VOICE_STREAM', '[startStreaming] Start failed:', error);
            setState('error');
            setResult(r => ({...r, error: error.message || '启动失败'}));

            // Cleanup
            clientRef.current?.close();
            clientRef.current = null;
            stopRealtimeRecording().catch(() => {});

            return false;
        }
    }, [requestPermission]);

    /**
     * Stop streaming: stop recording + finalize transcription
     */
    const stopStreaming = useCallback(async (): Promise<string> => {
        debugLog('VOICE_STREAM', '[stopStreaming] Stopping stream...');

        try {
            // Stop recording first
            await stopRealtimeRecording();

            // Send stop message and wait for final result
            if (clientRef.current?.isConnected()) {
                clientRef.current.sendControlMessage('stop');

                // Wait a bit for final result
                await new Promise(resolve => setTimeout(resolve, 1000));

                // Close connection
                clientRef.current.close();
            }

            clientRef.current = null;
            sessionIdRef.current = null;

            const finalText = result.finalText || result.partialText;

            setState('idle');
            debugLog('VOICE_STREAM', '[stopStreaming] Stopped, final text:', finalText);

            return finalText;

        } catch (error: any) {
            debugLog('VOICE_STREAM', '[stopStreaming] Stop failed:', error);
            setState('error');
            setResult(r => ({...r, error: error.message || '停止失败'}));

            // Force cleanup
            clientRef.current?.close();
            clientRef.current = null;

            return '';
        }
    }, [result.finalText, result.partialText]);

    /**
     * Cancel streaming without finalizing
     */
    const cancelStreaming = useCallback(async () => {
        debugLog('VOICE_STREAM', '[cancelStreaming] Cancelling stream...');

        try {
            await stopRealtimeRecording();

            if (clientRef.current?.isConnected()) {
                clientRef.current.sendControlMessage('cancel');
                clientRef.current.close();
            }

            clientRef.current = null;
            sessionIdRef.current = null;

            setState('idle');
            setResult({partialText: '', finalText: '', error: null});

            debugLog('VOICE_STREAM', '[cancelStreaming] Cancelled');

        } catch (error: any) {
            debugLog('VOICE_STREAM', '[cancelStreaming] Cancel failed:', error);

            // Force cleanup
            clientRef.current?.close();
            clientRef.current = null;

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
