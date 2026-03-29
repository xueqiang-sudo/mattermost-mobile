// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
import {MM_MOBILE_LOG_WS_IO} from '@env';
import {type ClientHeaders, getOrCreateWebSocketClient, type WebSocketClientInterface, WebSocketReadyState} from '@mattermost/react-native-network-client';
import {Platform} from 'react-native';

import * as ClientConstants from '@client/rest/constants';
import {WebsocketEvents} from '@constants';
import DatabaseManager from '@database/manager';
import {getConfigValue} from '@queries/servers/system';
import {hasReliableWebsocket} from '@utils/config';
import {toMilliseconds} from '@utils/datetime';
import {logDebug, logError, logInfo, logWarning} from '@utils/log';

const MAX_WEBSOCKET_FAILS = 7;
const WEBSOCKET_TIMEOUT = toMilliseconds({seconds: 30});
const MIN_WEBSOCKET_RETRY_TIME = toMilliseconds({seconds: 3});
const MAX_WEBSOCKET_RETRY_TIME = toMilliseconds({minutes: 5});
const PING_INTERVAL = toMilliseconds({seconds: 30});
const DEFAULT_OPTIONS = {
    forceConnection: true,
};
const TLS_HANDSHARE_ERROR = 1015;
const isEnvFlagEnabled = (value?: string) => value === 'true' || value === '1';

export default class WebSocketClient {
    private conn?: WebSocketClientInterface;
    private connectionTimeout: NodeJS.Timeout | undefined;
    private connectionId = '';
    private token: string;
    private preauthSecret?: string;
    private stop = false;
    private url = '';
    private serverUrl: string;
    private connectFailCount = 0;

    private pingInterval: NodeJS.Timeout | undefined;
    private waitingForPong: boolean = false;

    // The first time we connect to a server (on init or login)
    // we do the sync out of the websocket lifecycle.
    // This is used to avoid calling twice to the sync logic.
    private shouldSkipSync = false;

    // responseSequence is the number to track a response sent
    // via the websocket. A response will always have the same sequence number
    // as the request.
    private responseSequence = 1;

    // serverSequence is the incrementing sequence number from the
    // server-sent event stream.
    private serverSequence = 0;

    // Callbacks
    private eventCallback?: Function;
    private firstConnectCallback?: () => void;
    private missedEventsCallback?: () => void;
    private reconnectCallback?: () => void;
    private reliableReconnectCallback?: () => void;
    private errorCallback?: Function;
    private closeCallback?: (connectFailCount: number) => void;
    private connectingCallback?: () => void;
    private shouldLogWebSocketIO = () => isEnvFlagEnabled(MM_MOBILE_LOG_WS_IO);

    constructor(serverUrl: string, token: string, preauthSecret?: string) {
        this.token = token;
        this.serverUrl = serverUrl;
        this.preauthSecret = preauthSecret;
    }

    public async initialize(opts = {}, shouldSkipSync = false) {
        logInfo('[WebSocket] initialize 被调用', {
            serverUrl: this.serverUrl,
            opts,
            shouldSkipSync,
            stop: this.stop,
            connectFailCount: this.connectFailCount,
        });
        const {forceConnection} = Object.assign({}, DEFAULT_OPTIONS, opts);

        if (forceConnection) {
            logDebug('[WebSocket] forceConnection 为 true，重置 stop 标志');
            this.stop = false;
        }

        if (this.conn && this.conn.readyState !== WebSocketReadyState.CLOSED) {
            logDebug('[WebSocket] 连接已存在且未关闭，跳过初始化', {readyState: this.conn.readyState});
            return;
        }

        const database = DatabaseManager.serverDatabases[this.serverUrl]?.database;
        if (!database) {
            logWarning('[WebSocket] 找不到数据库，跳过初始化', {serverUrl: this.serverUrl});
            return;
        }

        const [websocketUrl, version, reliableWebsocketConfig] = await Promise.all([
            getConfigValue(database, 'WebsocketURL'),
            getConfigValue(database, 'Version'),
            getConfigValue(database, 'EnableReliableWebSockets'),
        ]);
        const connectionUrl = (websocketUrl || this.serverUrl) + '/api/v4/websocket';
        logDebug('[WebSocket] 配置信息', {
            websocketUrl,
            version,
            reliableWebsocketConfig,
            connectionUrl,
        });

        if (this.connectingCallback) {
            logDebug('[WebSocket] 调用 connectingCallback');
            this.connectingCallback();
        }

        const regex = /^(?:https?|wss?):(?:\/\/)?[^/]*/;
        const captured = (regex).exec(connectionUrl);

        let origin;
        if (captured) {
            origin = captured[0];
        } else {
            // If we're unable to set the origin header, the websocket won't connect, but the URL is likely malformed anyway
            const errorMessage = 'websocket failed to parse origin from ' + connectionUrl;
            logWarning(errorMessage);
            logError('[WebSocket] 无法解析 origin，初始化失败', {connectionUrl});
            return;
        }

        this.url = connectionUrl;

        const reliableWebSockets = hasReliableWebsocket(version, reliableWebsocketConfig);
        logDebug('[WebSocket] 可靠 WebSocket 配置', {
            reliableWebSockets,
            connectionId: this.connectionId,
            serverSequence: this.serverSequence,
        });
        if (reliableWebSockets) {
            // Add connection id, and last_sequence_number to the query param.
            // We cannot also send it as part of the auth_challenge, because the session cookie is already sent with the request.
            this.url = `${connectionUrl}?connection_id=${this.connectionId}&sequence_number=${this.serverSequence}`;
            logDebug('[WebSocket] 使用可靠 WebSocket，更新 URL', {newUrl: this.url});
        }

        // Manually changing protocol since getOrCreateWebsocketClient does not accept http/s
        if (this.url.startsWith('https:')) {
            this.url = 'wss:' + this.url.substring('https:'.length);
            logDebug('[WebSocket] 转换 https 为 wss 协议', {newUrl: this.url});
        }

        if (this.url.startsWith('http:')) {
            this.url = 'ws:' + this.url.substring('http:'.length);
            logDebug('[WebSocket] 转换 http 为 ws 协议', {newUrl: this.url});
        }

        if (this.connectFailCount === 0) {
            logInfo('websocket connecting to ' + this.url);
        } else {
            logInfo('[WebSocket] 重连尝试', {
                url: this.url,
                connectFailCount: this.connectFailCount,
            });
        }

        this.shouldSkipSync = shouldSkipSync;

        try {
            const headers: ClientHeaders = {origin};
            if (Platform.OS === 'android') {
                // Required to properly handled the reliableWebsocket reconnection
                // iOS is using he underlying cookieJar
                headers.Authorization = `Bearer ${this.token}`;
            }

            // Add shared password header if available
            if (this.preauthSecret) {
                headers[ClientConstants.HEADER_X_MATTERMOST_PREAUTH_SECRET] = this.preauthSecret;
                logDebug('WebSocket: Added shared password header for', this.serverUrl);
            }

            const {client} = await getOrCreateWebSocketClient(this.url, {headers, timeoutInterval: WEBSOCKET_TIMEOUT});

            // Check again if the client is the same, to avoid race conditions
            if (this.conn === client) {
                // In case turning on/off Wi-fi on Samsung devices
                // the websocket will call onClose then onError then initialize again with readyState CLOSED, we need to open it again
                if (this.conn.readyState === WebSocketReadyState.CLOSED) {
                    clearTimeout(this.connectionTimeout);
                    clearInterval(this.pingInterval);
                    this.conn.open();
                }
                return;
            }
            this.conn = client;
        } catch (error) {
            return;
        }

        this.conn!.onOpen(() => {
            logInfo('[WebSocket] onOpen - 连接已建立', {
                url: this.url,
                connectFailCount: this.connectFailCount,
                reliableWebSockets,
                connectionId: this.connectionId,
                serverSequence: this.serverSequence,
            });
            clearTimeout(this.connectionTimeout);
            clearInterval(this.pingInterval);

            // No need to reset sequence number here.
            if (!reliableWebSockets) {
                this.serverSequence = 0;
            }

            if (this.token) {
                // we check for the platform as a workaround until we fix on the server that further authentications
                // are ignored
                logInfo('[WebSocket] 发送 authentication_challenge');
                this.sendMessage('authentication_challenge', {token: this.token});
            }

            if (this.shouldSkipSync) {
                logInfo('websocket connected to', this.url);
                this.firstConnectCallback?.();
            } else {
                logInfo('websocket re-established connection to', this.url);
                if (!reliableWebSockets && this.reconnectCallback) {
                    this.reconnectCallback();
                } else if (reliableWebSockets) {
                    // If a sync is needed, it is handled when receiving the HELLO websocket message
                    this.reliableReconnectCallback?.();
                    if (this.serverSequence && this.missedEventsCallback) {
                        this.missedEventsCallback();
                    }
                }
            }

            // Send a ping immediately to test the socket
            this.waitingForPong = true;
            logDebug('[WebSocket] 立即发送 ping');
            this.ping();

            // And every 30 seconds after, checking to ensure
            // we're getting responses from the server
            logDebug('[WebSocket] 设置 ping 间隔', {intervalMs: PING_INTERVAL});
            this.pingInterval = setInterval(
                () => {
                    logDebug('[WebSocket] ping 定时器触发', {waitingForPong: this.waitingForPong});
                    if (!this.waitingForPong) {
                        this.waitingForPong = true;
                        this.ping();
                        return;
                    }

                    logWarning('[WebSocket] 未收到 pong 响应，将关闭连接并重连', {waitingForPong: this.waitingForPong});
                    // We are not calling this.close() because we need to auto-restart.
                    this.responseSequence = 1;
                    clearInterval(this.pingInterval);
                    this.conn?.close();
                },
                PING_INTERVAL,
            );

            this.connectFailCount = 0;
            logInfo('[WebSocket] onOpen 完成，连接失败计数已重置为 0');
        });

        this.conn!.onClose((ev) => {
            logInfo('[WebSocket] onClose - 连接已关闭', {
                url: this.url,
                event: ev,
                connectFailCount: this.connectFailCount,
                stop: this.stop,
            });
            clearTimeout(this.connectionTimeout);
            clearInterval(this.pingInterval);

            this.conn = undefined;
            this.responseSequence = 1;

            // We skip the sync on first connect, since we are syncing along
            // the init logic. If the connection closes at any point after that,
            // we don't want to skip the sync. If we keep the same connection and
            // reliable websockets are enabled this won't trigger a new sync.
            this.shouldSkipSync = false;

            if (ev.message && typeof ev.message === 'object' && 'code' in ev.message && ev.message.code === TLS_HANDSHARE_ERROR) {
                logDebug('websocket did not connect', this.url, ev.message.reason);
                logWarning('[WebSocket] TLS 握手错误，不会自动重连', {reason: ev.message.reason});
                this.closeCallback?.(this.connectFailCount);
                return;
            }

            if (this.connectFailCount === 0) {
                logInfo('websocket closed', this.url);
            }

            this.connectFailCount++;
            logInfo('[WebSocket] 连接失败计数递增', {newCount: this.connectFailCount});

            if (this.closeCallback) {
                this.closeCallback(this.connectFailCount);
            }

            if (this.stop) {
                logInfo('[WebSocket] stop 标志为 true，停止重连');
                return;
            }

            let retryTime = MIN_WEBSOCKET_RETRY_TIME;

            // If we've failed a bunch of connections then start backing off
            if (this.connectFailCount > MAX_WEBSOCKET_FAILS) {
                retryTime = Math.min(MIN_WEBSOCKET_RETRY_TIME * this.connectFailCount, MAX_WEBSOCKET_RETRY_TIME);
                logWarning('[WebSocket] 连接失败次数超过限制，使用退避重试', {
                    failCount: this.connectFailCount,
                    maxFails: MAX_WEBSOCKET_FAILS,
                    retryTimeMs: retryTime,
                });
            } else {
                logInfo('[WebSocket] 计划重连', {
                    retryTimeMs: retryTime,
                    failCount: this.connectFailCount,
                });
            }

            this.connectionTimeout = setTimeout(
                () => {
                    logInfo('[WebSocket] 重连定时器触发，开始初始化连接');
                    if (this.stop) {
                        logInfo('[WebSocket] 重连时 stop 标志为 true，取消重连');
                        clearTimeout(this.connectionTimeout);
                        return;
                    }
                    this.initialize(opts);
                },
                retryTime,
            );
        });

        this.conn!.onError((evt: any) => {
            logError('[WebSocket] onError - 发生错误', {
                url: this.url,
                eventUrl: evt.url,
                event: evt,
                connectFailCount: this.connectFailCount,
            });
            if (evt.url === this.url) {
                if (this.connectFailCount <= 1) {
                    logError('websocket error', this.url);
                    logError('WEBSOCKET ERROR EVENT', evt);
                }

                if (this.errorCallback) {
                    this.errorCallback(evt);
                }
            }
        });

        this.conn!.onMessage((evt: any) => {
            const msg = evt.message;
            if (this.shouldLogWebSocketIO()) {
                logDebug('websocket received message', msg);
            }

            // This indicates a reply to a websocket request.
            // We ignore sequence number validation of message responses
            // and only focus on the purely server side event stream.
            if (msg.seq_reply) {
                if (msg.error) {
                    logWarning('[WebSocket] 收到 seq_reply 错误', msg);
                }
                if (msg.data?.text === WebsocketEvents.PONG) {
                    logDebug('[WebSocket] 收到 pong 响应，重置 waitingForPong');
                    this.waitingForPong = false;
                }
            } else if (this.eventCallback) {
                if (reliableWebSockets) {
                    // We check the hello packet, which is always the first packet in a stream.
                    if (msg.event === WebsocketEvents.HELLO) {
                        logInfo(this.url, 'got connection id ', msg.data.connection_id);
                        logDebug('[WebSocket] 收到 HELLO 消息', {
                            connectionId: msg.data.connection_id,
                            currentConnectionId: this.connectionId,
                        });

                        // If we already have a connectionId present, and server sends a different one,
                        // that means it's either a long timeout, or server restart, or sequence number is not found.
                        // If the server is not available the first time we try to connect, we won't have a connection id
                        // but still we need to sync.
                        // Then we do the sync calls, and reset sequence number to 0.
                        if (this.connectionId !== msg.data.connection_id) {
                            if (this.connectionId) {
                                logInfo(this.url, 'got a new connection due to long timeout, or server restart, or sequence number is not found');
                            } else {
                                logInfo(this.url, 'got the expected new connection id');
                            }
                            if (!this.shouldSkipSync) {
                                logInfo('[WebSocket] 触发 reconnectCallback');
                                this.reconnectCallback?.();
                            }
                            this.serverSequence = 0;
                        }

                        // If it's a fresh connection, we have to set the connectionId regardless.
                        // And if it's an existing connection, setting it again is harmless, and keeps the code simple.
                        this.connectionId = msg.data.connection_id;
                    }

                    // Now we check for sequence number, and if it does not match,
                    // we just disconnect and reconnect.
                    if (msg.seq !== this.serverSequence) {
                        logDebug('[WebSocket] 序列号不匹配，将断开并重连', {
                            actualSeq: msg.seq,
                            expectedSeq: this.serverSequence,
                            url: this.url,
                        });
                        this.connectionId = ''; // There was some problem with the sequence number, so we reset the connection
                        this.close(false); // Will auto-reconnect after MIN_WEBSOCKET_RETRY_TIME.
                        return;
                    }
                } else if (msg.seq !== this.serverSequence) {
                    logDebug('[WebSocket] 序列号不匹配（非可靠模式），触发 reconnectCallback', {
                        actualSeq: msg.seq,
                        expectedSeq: this.serverSequence,
                        url: this.url,
                    });
                    this.reconnectCallback?.();
                }

                this.serverSequence = msg.seq + 1;
                this.eventCallback(msg);
            }
        });

        logInfo('[WebSocket] 调用 conn.open() 开始连接');
        this.conn.open();
    }

    public setConnectingCallback(callback: () => void) {
        this.connectingCallback = callback;
    }

    public setEventCallback(callback: Function) {
        this.eventCallback = callback;
    }

    public setFirstConnectCallback(callback: () => void) {
        this.firstConnectCallback = callback;
    }

    public setMissedEventsCallback(callback: () => void) {
        this.missedEventsCallback = callback;
    }

    public setReconnectCallback(callback: () => void) {
        this.reconnectCallback = callback;
    }

    public setReliableReconnectCallback(callback: () => void) {
        this.reliableReconnectCallback = callback;
    }

    public setErrorCallback(callback: Function) {
        this.errorCallback = callback;
    }

    public setCloseCallback(callback: (connectFailCount: number) => void) {
        this.closeCallback = callback;
    }

    public close(stop = false) {
        this.stop = stop;
        this.connectFailCount = 0;
        this.responseSequence = 1;
        clearTimeout(this.connectionTimeout);
        clearInterval(this.pingInterval);
        this.conn?.close();
    }

    public invalidate() {
        clearTimeout(this.connectionTimeout);
        clearInterval(this.pingInterval);
        this.conn?.invalidate();
        this.conn = undefined;
    }

    private ping() {
        const msg = {
            action: WebsocketEvents.PING,
            seq: this.responseSequence++,
        };

        logDebug('[WebSocket] ping 被调用', {
            readyState: this.conn?.readyState,
            waitingForPong: this.waitingForPong,
        });
        if (this.conn && this.conn.readyState === WebSocketReadyState.OPEN) {
            if (this.shouldLogWebSocketIO()) {
                logDebug('websocket send message', msg);
            }
            this.conn.send(JSON.stringify(msg));
        } else {
            logWarning('[WebSocket] 连接未打开，无法发送 ping', {
                readyState: this.conn?.readyState,
            });
        }
    }

    private sendMessage(action: string, data: any) {
        const msg = {
            action,
            seq: this.responseSequence++,
            data,
        };

        logDebug('[WebSocket] sendMessage 被调用', {
            action,
            readyState: this.conn?.readyState,
        });
        if (this.conn && this.conn.readyState === WebSocketReadyState.OPEN) {
            if (this.shouldLogWebSocketIO()) {
                const loggedData = action === 'authentication_challenge' ? {...data, token: '***'} : data;
                logDebug('websocket send message', {
                    action,
                    seq: msg.seq,
                    data: loggedData,
                });
            }
            this.conn.send(JSON.stringify(msg));
        } else {
            logWarning('[WebSocket] 连接未打开，无法发送消息', {
                action,
                readyState: this.conn?.readyState,
            });
        }
    }

    public sendUserTypingEvent(channelId: string, parentId?: string) {
        this.sendMessage('user_typing', {
            channel_id: channelId,
            parent_id: parentId,
        });
    }

    public isConnected(): boolean {
        return this.conn?.readyState === WebSocketReadyState.OPEN;
    }

    public getConnectionId(): string {
        return this.connectionId;
    }

    public getServerSequence(): number {
        return this.serverSequence;
    }
}
