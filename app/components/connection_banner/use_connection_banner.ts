// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useCallback, useEffect, useRef, useState} from 'react';

import useDidUpdate from '@hooks/did_update';
import {logDebug} from '@utils/log';

import type {NetworkPerformanceState} from '@managers/network_performance_manager';
import type {NetInfoState} from '@react-native-community/netinfo';
import type {IntlShape} from 'react-intl';

const CLOSE_TIMEOUT_DURATION_MS = 2000;
const INITIAL_DISCONNECTED_DELAY_MS = 1500;
const DISCONNECTED_DELAY_MS = 500;
let hasConnectedInCurrentAppSession = false;
const shouldDebugConnectionBanner = __DEV__ && Boolean((globalThis as {MM_DEBUG_CONNECTION_BANNER?: boolean}).MM_DEBUG_CONNECTION_BANNER);

const debugBanner = (stage: string, payload?: Record<string, unknown>) => {
    if (shouldDebugConnectionBanner) {
        logDebug('[useConnectionBanner]', stage, payload ?? {});
    }
};

export const resetConnectionBannerSessionForTests = () => {
    hasConnectedInCurrentAppSession = false;
};

const clearTimeoutRef = (ref: React.MutableRefObject<NodeJS.Timeout | null | undefined>) => {
    if (ref.current) {
        clearTimeout(ref.current);
        ref.current = null;
    }
};

type UseConnectionBannerParams = {
    websocketState: WebsocketConnectedState;
    networkPerformanceState: NetworkPerformanceState;
    netInfo: NetInfoState;
    isInternetReachable?: boolean | null;
    appState: string;
    intl: IntlShape;
};

type UseConnectionBannerReturn = {
    visible: boolean;
    bannerText: string;
    isShowingConnectedBanner: boolean;
};

export const useConnectionBanner = ({
    websocketState,
    networkPerformanceState,
    netInfo,
    isInternetReachable: isInternetReachableOverride,
    appState,
    intl,
}: UseConnectionBannerParams): UseConnectionBannerReturn => {
    const closeTimeout = useRef<NodeJS.Timeout | null>();
    const openTimeout = useRef<NodeJS.Timeout | null>();
    const initialAppSession = useRef(!(hasConnectedInCurrentAppSession || websocketState === 'connected'));
    const previousWebsocketState = useRef<WebsocketConnectedState>(websocketState);
    const hasShownSlowBanner = useRef(false);

    const [visible, setVisible] = useState(false);
    const [bannerText, setBannerText] = useState('');
    const [isShowingConnectedBanner, setIsShowingConnectedBanner] = useState(false);

    const closeCallback = useCallback(() => {
        setVisible(false);
        clearTimeoutRef(closeTimeout);
    }, []);

    const openCallback = useCallback(() => {
        clearTimeoutRef(closeTimeout);
        clearTimeoutRef(openTimeout);
        setVisible(true);
    }, []);

    const handleDisconnectedState = useCallback((): boolean => {
        if (websocketState === 'not_connected') {
            previousWebsocketState.current = 'not_connected';
            debugBanner('handleDisconnectedState:not_connected', {
                initialAppSession: initialAppSession.current,
            });

            const disconnectedMessage = intl.formatMessage({
                id: 'connection_banner.server_unreachable',
                defaultMessage: 'Unable to reach server. Reconnecting...',
            });

            if (visible && bannerText === disconnectedMessage) {
                return true;
            }

            // Websocket can briefly flap while app is healthy.
            // Delay the banner and only show if disconnection persists.
            if (!openTimeout.current) {
                openTimeout.current = setTimeout(() => {
                    if (previousWebsocketState.current === 'not_connected') {
                        setBannerText(disconnectedMessage);
                        openCallback();
                        debugBanner('show:not_connected_delayed', {
                            initialAppSession: initialAppSession.current,
                        });
                    }
                    clearTimeoutRef(openTimeout);
                }, initialAppSession.current ? INITIAL_DISCONNECTED_DELAY_MS : DISCONNECTED_DELAY_MS);
            }
            return true;
        }
        clearTimeoutRef(openTimeout);
        return false;
    }, [websocketState, openCallback, intl, visible, bannerText]);

    const handleInternetUnreachableState = useCallback((): boolean => {
        const isInternetReachable = isInternetReachableOverride === undefined ? netInfo.isInternetReachable : isInternetReachableOverride;

        if (netInfo.isConnected === false) {
            debugBanner('handleInternetUnreachableState:device_offline');
            setBannerText(intl.formatMessage({
                id: 'connection_banner.device_offline',
                defaultMessage: 'No network connection',
            }));
            openCallback();
            closeTimeout.current = setTimeout(closeCallback, CLOSE_TIMEOUT_DURATION_MS);
            debugBanner('show:device_offline');
            return true;
        }

        if (isInternetReachable === false) {
            // Server ping (via connection_banner) replaces NetInfo isInternetReachable.
            // An active websocket also proves the server is reachable.
            if (websocketState === 'connected') {
                debugBanner('handleInternetUnreachableState:skip_no_internet_ws_connected');
                return false;
            }

            // Wait for the first ping result before showing this banner on cold start.
            if (initialAppSession.current) {
                debugBanner('handleInternetUnreachableState:skip_no_internet_initial_session');
                return false;
            }

            debugBanner('handleInternetUnreachableState:no_internet');
            setBannerText(intl.formatMessage({
                id: 'connection_banner.no_internet',
                defaultMessage: 'Connected to network, but internet is unavailable',
            }));
            openCallback();
            closeTimeout.current = setTimeout(closeCallback, CLOSE_TIMEOUT_DURATION_MS);
            debugBanner('show:no_internet');
            return true;
        }
        return false;
    }, [netInfo.isConnected, netInfo.isInternetReachable, isInternetReachableOverride, websocketState, intl, openCallback, closeCallback]);

    const handleSlowNetworkState = useCallback((): boolean => {
        if (networkPerformanceState === 'slow' && !hasShownSlowBanner.current) {
            hasShownSlowBanner.current = true;
            debugBanner('handleSlowNetworkState:slow');

            setBannerText(intl.formatMessage({id: 'connection_banner.slow', defaultMessage: 'Limited network connection'}));
            openCallback();
            closeTimeout.current = setTimeout(() => {
                closeCallback();
            }, CLOSE_TIMEOUT_DURATION_MS);
            debugBanner('show:slow');
            return true;
        }
        return false;
    }, [networkPerformanceState, intl, openCallback, closeCallback]);

    const handleConnectedState = useCallback((): boolean => {
        if (websocketState === 'connected' && previousWebsocketState.current !== 'connected') {
            clearTimeoutRef(openTimeout);
            previousWebsocketState.current = 'connected';
            hasConnectedInCurrentAppSession = true;
            debugBanner('handleConnectedState:connected', {
                initialAppSession: initialAppSession.current,
                isShowingConnectedBanner,
            });
            if (!initialAppSession.current && !isShowingConnectedBanner) {
                setIsShowingConnectedBanner(true);
                setBannerText(intl.formatMessage({id: 'connection_banner.connected', defaultMessage: 'Connection restored'}));
                openCallback();
                debugBanner('show:connected');
                closeTimeout.current = setTimeout(() => {
                    closeCallback();

                    setIsShowingConnectedBanner(false);
                }, CLOSE_TIMEOUT_DURATION_MS);
                return true;
            }

            initialAppSession.current = false;
            return true;
        }
        return false;
    }, [websocketState, intl, openCallback, closeCallback, isShowingConnectedBanner]);

    const handleConnectingState = useCallback((): boolean => {
        if (websocketState === 'connecting') {
            clearTimeoutRef(openTimeout);
            debugBanner('handleConnectingState:connecting', {
                initialAppSession: initialAppSession.current,
            });
            if (!initialAppSession.current) {
                setBannerText(intl.formatMessage({id: 'connection_banner.connecting', defaultMessage: 'Connecting...'}));
                openCallback();
                debugBanner('show:connecting');
                return true;
            }
            previousWebsocketState.current = 'connecting';
        }
        return false;
    }, [websocketState, intl, openCallback]);

    useEffect(() => {
        if (websocketState === 'connected') {
            hasConnectedInCurrentAppSession = true;
            initialAppSession.current = false;
        }
    }, [websocketState]);

    useEffect(() => {
        return () => {
            clearTimeoutRef(closeTimeout);
            clearTimeoutRef(openTimeout);
        };
    }, []);

    useEffect(() => {
        debugBanner('priorities:begin', {
            appState,
            visible,
            websocketState,
            networkPerformanceState,
            isConnected: netInfo.isConnected,
        });
        if (appState !== 'active') {
            return;
        }
        if (visible && closeTimeout.current) {
            return;
        }

        const priorities = () => {
            if (handleInternetUnreachableState()) {
                return;
            }
            if (handleDisconnectedState()) {
                return;
            }
            if (handleSlowNetworkState()) {
                return;
            }
            if (handleConnectedState()) {
                return;
            }
            handleConnectingState();
        };

        priorities();
    }, [
        handleInternetUnreachableState,
        handleDisconnectedState,
        handleSlowNetworkState,
        handleConnectedState,
        handleConnectingState,
        visible,
        appState,
        websocketState,
        networkPerformanceState,
        netInfo.isConnected,
        netInfo.isInternetReachable,
        isInternetReachableOverride,
    ]);

    useDidUpdate(() => {
        if (appState !== 'active') {
            setVisible(false);
            setBannerText('');
            clearTimeoutRef(openTimeout);
            clearTimeoutRef(closeTimeout);
            hasShownSlowBanner.current = false;
            setIsShowingConnectedBanner(false);
        }
    }, [appState]);

    return {
        visible,
        bannerText,
        isShowingConnectedBanner,
    };
};

