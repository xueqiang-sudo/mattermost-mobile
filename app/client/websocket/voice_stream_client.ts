// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * VoiceStreamClient - WebSocket client for real-time voice transcription
 * Used for smart notebook voice-to-text feature
 */
export class VoiceStreamClient {
    private ws: WebSocket | null = null;
    private serverUrl: string;
    private token: string;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 3;

    constructor(serverUrl: string, token: string) {
        this.serverUrl = serverUrl;
        this.token = token;
    }

    /**
     * Connect to the voice stream WebSocket endpoint
     */
    async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                // Build WebSocket URL
                const wsProtocol = this.serverUrl.startsWith('https') ? 'wss' : 'ws';
                const baseUrl = this.serverUrl.replace(/^https?:\/\//, '');
                const wsUrl = `${wsProtocol}://${baseUrl}/api/v4/plugins/voice-stream?token=${encodeURIComponent(this.token)}`;

                console.log('[VoiceStreamClient] Connecting to:', wsUrl.replace(/token=[^&]+/, 'token=***'));

                // Create WebSocket connection
                this.ws = new WebSocket(wsUrl);

                this.ws.onopen = () => {
                    console.log('[VoiceStreamClient] WebSocket connected');
                    this.reconnectAttempts = 0;
                    this.onConnected?.();
                    resolve();
                };

                this.ws.onerror = (error) => {
                    console.error('[VoiceStreamClient] WebSocket error:', error);
                    this.onError?.(error instanceof Error ? error.message : 'Unknown error');
                    reject(error);
                };

                this.ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        this.handleMessage(data);
                    } catch (error) {
                        console.error('[VoiceStreamClient] Failed to parse message:', error);
                    }
                };

                this.ws.onclose = (event) => {
                    console.log('[VoiceStreamClient] WebSocket closed:', event.code, event.reason);
                    this.onClose?.(event.code, event.reason);
                };

            } catch (error) {
                console.error('[VoiceStreamClient] Connection failed:', error);
                reject(error);
            }
        });
    }

    /**
     * Send audio chunk (base64 encoded PCM data)
     */
    sendAudioChunk(chunkBase64: string): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.warn('[VoiceStreamClient] WebSocket not connected');
            return;
        }

        try {
            // Convert base64 to binary
            const binaryString = atob(chunkBase64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            // Send as binary message
            this.ws.send(bytes.buffer);
        } catch (error) {
            console.error('[VoiceStreamClient] Failed to send audio chunk:', error);
        }
    }

    /**
     * Send control message (JSON)
     */
    sendControlMessage(type: 'start' | 'stop' | 'cancel', sessionId?: string): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.warn('[VoiceStreamClient] WebSocket not connected');
            return;
        }

        const message = {
            type,
            session_id: sessionId,
        };

        try {
            this.ws.send(JSON.stringify(message));
            console.log('[VoiceStreamClient] Sent control message:', type);
        } catch (error) {
            console.error('[VoiceStreamClient] Failed to send control message:', error);
        }
    }

    /**
     * Handle incoming message from server
     */
    private handleMessage(msg: any): void {
        console.log('[VoiceStreamClient] Received message:', msg.type);

        switch (msg.type) {
            case 'transcription':
                this.onTranscription?.(msg.text || '', msg.is_final || false);
                break;

            case 'started':
                console.log('[VoiceStreamClient] Session started:', msg.session_id);
                break;

            case 'completed':
                console.log('[VoiceStreamClient] Session completed');
                this.onCompleted?.(msg.text || '');
                break;

            case 'cancelled':
                console.log('[VoiceStreamClient] Session cancelled');
                break;

            case 'error':
                console.error('[VoiceStreamClient] Server error:', msg.error);
                this.onError?.(msg.error || 'Unknown server error');
                break;

            default:
                console.warn('[VoiceStreamClient] Unknown message type:', msg.type);
        }
    }

    /**
     * Close WebSocket connection
     */
    close(): void {
        if (this.ws) {
            console.log('[VoiceStreamClient] Closing connection');
            this.ws.close(1000, 'Normal closure');
            this.ws = null;
        }
    }

    /**
     * Check if connected
     */
    isConnected(): boolean {
        return this.ws?.readyState === WebSocket.OPEN;
    }

    // Callbacks
    onConnected?: () => void;
    onTranscription?: (text: string, isFinal: boolean) => void;
    onCompleted?: (finalText: string) => void;
    onError?: (error: string) => void;
    onClose?: (code: number, reason: string) => void;
}
