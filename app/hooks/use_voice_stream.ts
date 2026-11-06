// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useCallback, useRef, useState} from 'react';
import {Alert, Platform} from 'react-native';
import Permissions from 'react-native-permissions';

import {VoiceStreamClient} from '@client/websocket/voice_stream_client';
import {startRealtimeRecording, stopRealtimeRecording} from '@mattermost/voice-recorder';
import {debugLog} from '@store/debug_log';

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
        console.log('[useVoiceStream] Starting stream...');

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
                console.log('[useVoiceStream] Transcription:', text, 'isFinal:', isFinal);
                setResult(r => ({
                    ...r,
                    partialText: isFinal ? r.partialText : text,
                    finalText: isFinal ? text : r.finalText,
                }));
            };

            client.onCompleted = (finalText) => {
                console.log('[useVoiceStream] Completed with text:', finalText);
                setResult(r => ({...r, finalText, partialText: ''}));
            };

            client.onError = (error) => {
                debugLog('VOICE_STREAM', '[startStreaming] ❌ Client error:', error);
                console.error('[useVoiceStream] Error:', error);
                setResult(r => ({...r, error}));
                setState('error');
            };

            client.onClose = (code, reason) => {
                debugLog('VOICE_STREAM', '[startStreaming] Connection closed:', {code, reason});
                console.log('[useVoiceStream] Connection closed:', code, reason);
                if (state === 'recording') {
                    // Unexpected closure
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

                // 添加超时保护（5秒）
                const recordingPromise = startRealtimeRecording(
                    (chunkBase64) => {
                        // Audio chunk callback - send to server
                        if (clientRef.current?.isConnected()) {
                            clientRef.current.sendAudioChunk(chunkBase64);
                        }
                    },
                    {format: 'pcm'}
                );

                const timeoutPromise = new Promise<boolean>((resolve) => {
                    setTimeout(() => {
                        debugLog('VOICE_STREAM', '[startStreaming] ❌ startRealtimeRecording timeout (5s)');
                        resolve(false);
                    }, 5000);
                });

                recordingStarted = await Promise.race([recordingPromise, timeoutPromise]);
                debugLog('VOICE_STREAM', '[startStreaming] Step 9.2: startRealtimeRecording returned:', {recordingStarted});
            } catch (recordError) {
                debugLog('VOICE_STREAM', '[startStreaming] ❌ startRealtimeRecording threw error:', {
                    message: recordError instanceof Error ? recordError.message : String(recordError),
                    stack: recordError instanceof Error ? recordError.stack : undefined,
                });
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
            console.log('[useVoiceStream] Streaming started successfully');
            return true;

        } catch (error: any) {
            debugLog('VOICE_STREAM', '[startStreaming] ❌ 异常捕获:', {
                message: error?.message || String(error),
                stack: error?.stack || 'no stack',
            });
            console.error('[useVoiceStream] Start failed:', error);
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
        console.log('[useVoiceStream] Stopping stream...');

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
            console.log('[useVoiceStream] Stopped, final text:', finalText);

            return finalText;

        } catch (error: any) {
            console.error('[useVoiceStream] Stop failed:', error);
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
        console.log('[useVoiceStream] Cancelling stream...');

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

            console.log('[useVoiceStream] Cancelled');

        } catch (error: any) {
            console.error('[useVoiceStream] Cancel failed:', error);

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
