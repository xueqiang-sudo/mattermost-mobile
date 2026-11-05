// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useCallback, useRef, useState} from 'react';
import {Alert, Platform} from 'react-native';
import Permissions from 'react-native-permissions';

import {VoiceStreamClient} from '@client/websocket/voice_stream_client';
import {startRealtimeRecording, stopRealtimeRecording} from '@mattermost/voice-recorder';

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

    /**
     * Request microphone permission
     */
    const requestPermission = useCallback(async (): Promise<boolean> => {
        try {
            const result = await Permissions.request(
                Platform.select({
                    ios: Permissions.PERMISSIONS.IOS.MICROPHONE,
                    android: Permissions.PERMISSIONS.ANDROID.RECORD_AUDIO,
                    default: Permissions.PERMISSIONS.ANDROID.RECORD_AUDIO,
                })
            );
            return result === Permissions.RESULTS.GRANTED;
        } catch (error) {
            console.error('[useVoiceStream] Permission request failed:', error);
            return false;
        }
    }, []);

    /**
     * Start streaming: connect WebSocket + start recording
     */
    const startStreaming = useCallback(async () => {
        console.log('[useVoiceStream] Starting stream...');

        try {
            // Reset state
            setState('connecting');
            setResult({partialText: '', finalText: '', error: null});

            // Request permission
            const hasPermission = await requestPermission();
            if (!hasPermission) {
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

            // Create WebSocket client
            const client = new VoiceStreamClient(serverUrl, token);

            // Set up callbacks
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
                console.error('[useVoiceStream] Error:', error);
                setResult(r => ({...r, error}));
                setState('error');
            };

            client.onClose = (code, reason) => {
                console.log('[useVoiceStream] Connection closed:', code, reason);
                if (state === 'recording') {
                    // Unexpected closure
                    setState('error');
                    setResult(r => ({...r, error: '连接意外关闭'}));
                }
            };

            // Connect to WebSocket
            await client.connect();
            clientRef.current = client;

            // Send start message
            client.sendControlMessage('start');

            // Start real-time recording
            const recordingStarted = await startRealtimeRecording(
                (chunkBase64) => {
                    // Audio chunk callback - send to server
                    if (clientRef.current?.isConnected()) {
                        clientRef.current.sendAudioChunk(chunkBase64);
                    }
                },
                {format: 'pcm'}
            );

            if (!recordingStarted) {
                client.close();
                clientRef.current = null;
                setState('error');
                setResult(r => ({...r, error: '录音启动失败'}));
                return false;
            }

            setState('recording');
            console.log('[useVoiceStream] Streaming started successfully');
            return true;

        } catch (error: any) {
            console.error('[useVoiceStream] Start failed:', error);
            setState('error');
            setResult(r => ({...r, error: error.message || '启动失败'}));

            // Cleanup
            clientRef.current?.close();
            clientRef.current = null;
            stopRealtimeRecording().catch(() => {});

            return false;
        }
    }, [serverUrl, token, requestPermission]);

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
