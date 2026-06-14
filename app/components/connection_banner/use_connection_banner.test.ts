// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {renderHook, act, waitFor} from '@testing-library/react-native';

import {resetConnectionBannerSessionForTests, useConnectionBanner} from './use_connection_banner';

import type {NetworkPerformanceState} from '@managers/network_performance_manager';
import type {NetInfoState} from '@react-native-community/netinfo';
import type {IntlShape} from 'react-intl';

const createMockIntl = (): IntlShape => ({
    formatMessage: jest.fn(({defaultMessage}) => defaultMessage || ''),
    formatDate: jest.fn(),
    formatTime: jest.fn(),
    formatNumber: jest.fn(),
    formatPlural: jest.fn(),
    formatList: jest.fn(),
    formatDisplayName: jest.fn(),
} as unknown as IntlShape);

const createMockNetInfo = ({isConnected = true, isInternetReachable = true}: {isConnected?: boolean; isInternetReachable?: boolean | null} = {}): NetInfoState => ({
    type: 'wifi',
    isConnected,
    isInternetReachable,
    details: {
        ssid: 'test-network',
        bssid: null,
        strength: 100,
        ipAddress: '192.168.1.1',
        subnet: '255.255.255.0',
        frequency: 2400,
        linkSpeed: 100,
        rxLinkSpeed: null,
        txLinkSpeed: null,
        isConnectionExpensive: false,
    },
} as NetInfoState);

describe('useConnectionBanner', () => {
    let mockIntl: IntlShape;

    beforeEach(() => {
        mockIntl = createMockIntl();
        resetConnectionBannerSessionForTests();
    });

    describe('initial session behavior', () => {
        it('should not show disconnection banner during initial session', async () => {
            const {result} = renderHook(() => useConnectionBanner({
                websocketState: 'not_connected' as WebsocketConnectedState,
                networkPerformanceState: 'normal' as NetworkPerformanceState,
                netInfo: createMockNetInfo(),
                appState: 'active',
                intl: mockIntl,
            }));

            await waitFor(() => {
                expect(result.current.visible).toBe(false);
                expect(result.current.bannerText).toBe('');
            });
        });

        it('should not show connecting banner during initial session', async () => {
            const {result} = renderHook(() => useConnectionBanner({
                websocketState: 'connecting' as WebsocketConnectedState,
                networkPerformanceState: 'normal' as NetworkPerformanceState,
                netInfo: createMockNetInfo(),
                appState: 'active',
                intl: mockIntl,
            }));

            await waitFor(() => {
                expect(result.current.visible).toBe(false);
            });
        });

        it('should show internet unreachable banner even during initial session', async () => {
            const {result} = renderHook(() => useConnectionBanner({
                websocketState: 'not_connected' as WebsocketConnectedState,
                networkPerformanceState: 'normal' as NetworkPerformanceState,
                netInfo: createMockNetInfo({isConnected: false}),
                appState: 'active',
                intl: mockIntl,
            }));

            await waitFor(() => {
                expect(result.current.visible).toBe(true);
                expect(result.current.bannerText).toBe('No network connection');
            });
        });

        it('should not show no-internet banner during initial session when only isInternetReachable is false', async () => {
            const {result} = renderHook(() => useConnectionBanner({
                websocketState: 'not_connected' as WebsocketConnectedState,
                networkPerformanceState: 'normal' as NetworkPerformanceState,
                netInfo: createMockNetInfo({isInternetReachable: false}),
                appState: 'active',
                intl: mockIntl,
            }));

            await waitFor(() => {
                expect(result.current.visible).toBe(false);
            });
        });
    });

    describe('after initial session (post-first-connection)', () => {
        it('should show disconnection banner after initial connection is established', async () => {
            const {result, rerender} = renderHook(
                ({websocketState, ...rest}) => useConnectionBanner({
                    websocketState,
                    ...rest,
                }),
                {
                    initialProps: {
                        websocketState: 'connecting' as WebsocketConnectedState,
                        networkPerformanceState: 'normal' as NetworkPerformanceState,
                        netInfo: createMockNetInfo(),
                        appState: 'active',
                        intl: mockIntl,
                    },
                },
            );

            // First, establish connection (ends initial session)
            act(() => {
                rerender({
                    websocketState: 'connected' as WebsocketConnectedState,
                    networkPerformanceState: 'normal' as NetworkPerformanceState,
                    netInfo: createMockNetInfo(),
                    appState: 'active',
                    intl: mockIntl,
                });
            });

            // Should not show "Connection restored" on initial connection
            await waitFor(() => {
                expect(result.current.visible).toBe(false);
            });

            // Now disconnect - should show banner
            act(() => {
                rerender({
                    websocketState: 'not_connected' as WebsocketConnectedState,
                    networkPerformanceState: 'normal' as NetworkPerformanceState,
                    netInfo: createMockNetInfo(),
                    appState: 'active',
                    intl: mockIntl,
                });
            });

            await waitFor(() => {
                expect(result.current.visible).toBe(true);
                expect(result.current.bannerText).toBe('Unable to reach server. Reconnecting...');
            });
        });

        it('should show connecting banner after initial session', async () => {
            const {result, rerender} = renderHook(
                (props) => useConnectionBanner(props),
                {
                    initialProps: {
                        websocketState: 'not_connected' as WebsocketConnectedState,
                        networkPerformanceState: 'normal' as NetworkPerformanceState,
                        netInfo: createMockNetInfo(),
                        appState: 'active',
                        intl: mockIntl,
                    },
                },
            );

            // First connect to end initial session
            act(() => {
                rerender({
                    websocketState: 'connected' as WebsocketConnectedState,
                    networkPerformanceState: 'normal' as NetworkPerformanceState,
                    netInfo: createMockNetInfo(),
                    appState: 'active',
                    intl: mockIntl,
                });
            });

            // Disconnect
            act(() => {
                rerender({
                    websocketState: 'not_connected' as WebsocketConnectedState,
                    networkPerformanceState: 'normal' as NetworkPerformanceState,
                    netInfo: createMockNetInfo(),
                    appState: 'active',
                    intl: mockIntl,
                });
            });

            // Now go to connecting state - should show banner
            act(() => {
                rerender({
                    websocketState: 'connecting' as WebsocketConnectedState,
                    networkPerformanceState: 'normal' as NetworkPerformanceState,
                    netInfo: createMockNetInfo(),
                    appState: 'active',
                    intl: mockIntl,
                });
            });

            await waitFor(() => {
                expect(result.current.visible).toBe(true);
                expect(result.current.bannerText).toBe('Connecting...');
            });
        });

        it('should show connection restored banner on reconnection', async () => {
            const {result, rerender} = renderHook(
                (props) => useConnectionBanner(props),
                {
                    initialProps: {
                        websocketState: 'not_connected' as WebsocketConnectedState,
                        networkPerformanceState: 'normal' as NetworkPerformanceState,
                        netInfo: createMockNetInfo(),
                        appState: 'active',
                        intl: mockIntl,
                    },
                },
            );

            // First connect to end initial session
            act(() => {
                rerender({
                    websocketState: 'connected' as WebsocketConnectedState,
                    networkPerformanceState: 'normal' as NetworkPerformanceState,
                    netInfo: createMockNetInfo(),
                    appState: 'active',
                    intl: mockIntl,
                });
            });

            await waitFor(() => {
                expect(result.current.visible).toBe(false);
            });

            // Disconnect
            act(() => {
                rerender({
                    websocketState: 'not_connected' as WebsocketConnectedState,
                    networkPerformanceState: 'normal' as NetworkPerformanceState,
                    netInfo: createMockNetInfo(),
                    appState: 'active',
                    intl: mockIntl,
                });
            });

            await waitFor(() => {
                expect(result.current.visible).toBe(true);
                expect(result.current.bannerText).toBe('Unable to reach server. Reconnecting...');
            });

            // Reconnect - should show "Connection restored"
            act(() => {
                rerender({
                    websocketState: 'connected' as WebsocketConnectedState,
                    networkPerformanceState: 'normal' as NetworkPerformanceState,
                    netInfo: createMockNetInfo(),
                    appState: 'active',
                    intl: mockIntl,
                });
            });

            await waitFor(() => {
                expect(result.current.visible).toBe(true);
                expect(result.current.bannerText).toBe('Connection restored');
                expect(result.current.isShowingConnectedBanner).toBe(true);
            });
        });
    });

    describe('slow network state', () => {
        it('should show slow network banner when network is slow', async () => {
            const {result} = renderHook(() => useConnectionBanner({
                websocketState: 'connected' as WebsocketConnectedState,
                networkPerformanceState: 'slow' as NetworkPerformanceState,
                netInfo: createMockNetInfo(),
                appState: 'active',
                intl: mockIntl,
            }));

            await waitFor(() => {
                expect(result.current.visible).toBe(true);
                expect(result.current.bannerText).toBe('Limited network connection');
            });
        });

        it('should only show slow network banner once', () => {
            jest.useFakeTimers();

            const {result, rerender} = renderHook(
                ({networkPerformanceState, ...rest}) => useConnectionBanner({
                    networkPerformanceState,
                    ...rest,
                }),
                {
                    initialProps: {
                        websocketState: 'connected' as WebsocketConnectedState,
                        networkPerformanceState: 'slow' as NetworkPerformanceState,
                        netInfo: createMockNetInfo(),
                        appState: 'active',
                        intl: mockIntl,
                    },
                },
            );

            expect(result.current.visible).toBe(true);

            // Wait for auto-close
            act(() => {
                jest.advanceTimersByTime(2100);
            });

            expect(result.current.visible).toBe(false);

            // Go to normal then back to slow
            act(() => {
                rerender({
                    websocketState: 'connected' as WebsocketConnectedState,
                    networkPerformanceState: 'normal' as NetworkPerformanceState,
                    netInfo: createMockNetInfo(),
                    appState: 'active',
                    intl: mockIntl,
                });
            });

            act(() => {
                rerender({
                    websocketState: 'connected' as WebsocketConnectedState,
                    networkPerformanceState: 'slow' as NetworkPerformanceState,
                    netInfo: createMockNetInfo(),
                    appState: 'active',
                    intl: mockIntl,
                });
            });

            // Should not show again
            expect(result.current.visible).toBe(false);

            jest.useRealTimers();
        });
    });

    describe('banner priorities', () => {
        it('should prioritize internet unreachable over disconnected', async () => {
            const {result, rerender} = renderHook(
                (props) => useConnectionBanner(props),
                {
                    initialProps: {
                        websocketState: 'connected' as WebsocketConnectedState,
                        networkPerformanceState: 'normal' as NetworkPerformanceState,
                        netInfo: createMockNetInfo(),
                        appState: 'active',
                        intl: mockIntl,
                    },
                },
            );

            await waitFor(() => {
                expect(result.current.visible).toBe(false);
            });

            act(() => {
                rerender({
                    websocketState: 'not_connected' as WebsocketConnectedState,
                    networkPerformanceState: 'normal' as NetworkPerformanceState,
                    netInfo: createMockNetInfo({isInternetReachable: false}),
                    appState: 'active',
                    intl: mockIntl,
                });
            });

            await waitFor(() => {
                expect(result.current.visible).toBe(true);
                expect(result.current.bannerText).toBe('Connected to network, but internet is unavailable');
            });
        });

        it('should not show no-internet banner when websocket is connected', async () => {
            const {result} = renderHook(() => useConnectionBanner({
                websocketState: 'connected' as WebsocketConnectedState,
                networkPerformanceState: 'normal' as NetworkPerformanceState,
                netInfo: createMockNetInfo({isInternetReachable: false}),
                appState: 'active',
                intl: mockIntl,
            }));

            await waitFor(() => {
                expect(result.current.visible).toBe(false);
            });
        });
    });

    describe('app state changes', () => {
        it('should hide banner when app goes to background', async () => {
            const {result, rerender} = renderHook(
                ({appState, ...rest}) => useConnectionBanner({
                    appState,
                    ...rest,
                }),
                {
                    initialProps: {
                        websocketState: 'connected' as WebsocketConnectedState,
                        networkPerformanceState: 'slow' as NetworkPerformanceState,
                        netInfo: createMockNetInfo(),
                        appState: 'active',
                        intl: mockIntl,
                    },
                },
            );

            await waitFor(() => {
                expect(result.current.visible).toBe(true);
            });

            // Go to background
            act(() => {
                rerender({
                    websocketState: 'connected' as WebsocketConnectedState,
                    networkPerformanceState: 'slow' as NetworkPerformanceState,
                    netInfo: createMockNetInfo(),
                    appState: 'background',
                    intl: mockIntl,
                });
            });

            await waitFor(() => {
                expect(result.current.visible).toBe(false);
                expect(result.current.bannerText).toBe('');
            });
        });

        it('should reset slow banner flag when app goes to background', async () => {
            const {result, rerender} = renderHook(
                ({appState, networkPerformanceState, ...rest}) => useConnectionBanner({
                    appState,
                    networkPerformanceState,
                    ...rest,
                }),
                {
                    initialProps: {
                        websocketState: 'connected' as WebsocketConnectedState,
                        networkPerformanceState: 'slow' as NetworkPerformanceState,
                        netInfo: createMockNetInfo(),
                        appState: 'active',
                        intl: mockIntl,
                    },
                },
            );

            await waitFor(() => {
                expect(result.current.visible).toBe(true);
            });

            // Go to background
            act(() => {
                rerender({
                    websocketState: 'connected' as WebsocketConnectedState,
                    networkPerformanceState: 'slow' as NetworkPerformanceState,
                    netInfo: createMockNetInfo(),
                    appState: 'background',
                    intl: mockIntl,
                });
            });

            // Come back to active
            act(() => {
                rerender({
                    websocketState: 'connected' as WebsocketConnectedState,
                    networkPerformanceState: 'slow' as NetworkPerformanceState,
                    netInfo: createMockNetInfo(),
                    appState: 'active',
                    intl: mockIntl,
                });
            });

            // Should show slow banner again (flag was reset)
            await waitFor(() => {
                expect(result.current.visible).toBe(true);
                expect(result.current.bannerText).toBe('Limited network connection');
            });
        });

        it('should not show connection restored banner when returning from background if websocket stayed connected', async () => {
            const {result, rerender} = renderHook(
                ({appState, websocketState, ...rest}) => useConnectionBanner({
                    appState,
                    websocketState,
                    ...rest,
                }),
                {
                    initialProps: {
                        websocketState: 'not_connected' as WebsocketConnectedState,
                        networkPerformanceState: 'normal' as NetworkPerformanceState,
                        netInfo: createMockNetInfo(),
                        appState: 'active',
                        intl: mockIntl,
                    },
                },
            );

            act(() => {
                rerender({
                    websocketState: 'connected' as WebsocketConnectedState,
                    networkPerformanceState: 'normal' as NetworkPerformanceState,
                    netInfo: createMockNetInfo(),
                    appState: 'active',
                    intl: mockIntl,
                });
            });

            await waitFor(() => {
                expect(result.current.visible).toBe(false);
            });

            act(() => {
                rerender({
                    websocketState: 'connected' as WebsocketConnectedState,
                    networkPerformanceState: 'normal' as NetworkPerformanceState,
                    netInfo: createMockNetInfo(),
                    appState: 'background',
                    intl: mockIntl,
                });
            });

            act(() => {
                rerender({
                    websocketState: 'connected' as WebsocketConnectedState,
                    networkPerformanceState: 'normal' as NetworkPerformanceState,
                    netInfo: createMockNetInfo(),
                    appState: 'active',
                    intl: mockIntl,
                });
            });

            await waitFor(() => {
                expect(result.current.visible).toBe(false);
                expect(result.current.bannerText).toBe('');
                expect(result.current.isShowingConnectedBanner).toBe(false);
            });
        });
    });

    describe('auto-close behavior', () => {
        it('should auto-close internet unreachable banner after 2 seconds', () => {
            jest.useFakeTimers();

            const {result, rerender} = renderHook(
                (props) => useConnectionBanner(props),
                {
                    initialProps: {
                        websocketState: 'connected' as WebsocketConnectedState,
                        networkPerformanceState: 'normal' as NetworkPerformanceState,
                        netInfo: createMockNetInfo(),
                        appState: 'active',
                        intl: mockIntl,
                    },
                },
            );

            act(() => {
                rerender({
                    websocketState: 'not_connected' as WebsocketConnectedState,
                    networkPerformanceState: 'normal' as NetworkPerformanceState,
                    netInfo: createMockNetInfo({isInternetReachable: false}),
                    appState: 'active',
                    intl: mockIntl,
                });
            });

            expect(result.current.visible).toBe(true);
            expect(result.current.bannerText).toBe('Connected to network, but internet is unavailable');

            // Internet becomes reachable again, then wait for timeout
            act(() => {
                rerender({
                    websocketState: 'connected' as WebsocketConnectedState,
                    networkPerformanceState: 'normal' as NetworkPerformanceState,
                    netInfo: createMockNetInfo(true),
                    appState: 'active',
                    intl: mockIntl,
                });
                jest.advanceTimersByTime(2100);
            });

            expect(result.current.visible).toBe(false);

            jest.useRealTimers();
        });

        it('should auto-close slow network banner after 2 seconds', () => {
            jest.useFakeTimers();

            const {result, rerender} = renderHook(
                (props) => useConnectionBanner(props),
                {
                    initialProps: {
                        websocketState: 'connected' as WebsocketConnectedState,
                        networkPerformanceState: 'slow' as NetworkPerformanceState,
                        netInfo: createMockNetInfo(),
                        appState: 'active',
                        intl: mockIntl,
                    },
                },
            );

            expect(result.current.visible).toBe(true);
            expect(result.current.bannerText).toBe('Limited network connection');

            // Network becomes normal, then wait for timeout
            act(() => {
                rerender({
                    websocketState: 'connected' as WebsocketConnectedState,
                    networkPerformanceState: 'normal' as NetworkPerformanceState,
                    netInfo: createMockNetInfo(),
                    appState: 'active',
                    intl: mockIntl,
                });
                jest.advanceTimersByTime(2100);
            });

            expect(result.current.visible).toBe(false);

            jest.useRealTimers();
        });

        it('should auto-close connection restored banner after 2 seconds', () => {
            jest.useFakeTimers();

            const {result, rerender} = renderHook(
                (props) => useConnectionBanner(props),
                {
                    initialProps: {
                        websocketState: 'not_connected' as WebsocketConnectedState,
                        networkPerformanceState: 'normal' as NetworkPerformanceState,
                        netInfo: createMockNetInfo(),
                        appState: 'active',
                        intl: mockIntl,
                    },
                },
            );

            // First connect to end initial session
            act(() => {
                rerender({
                    websocketState: 'connected' as WebsocketConnectedState,
                    networkPerformanceState: 'normal' as NetworkPerformanceState,
                    netInfo: createMockNetInfo(),
                    appState: 'active',
                    intl: mockIntl,
                });
            });

            expect(result.current.visible).toBe(false);

            // Disconnect
            act(() => {
                rerender({
                    websocketState: 'not_connected' as WebsocketConnectedState,
                    networkPerformanceState: 'normal' as NetworkPerformanceState,
                    netInfo: createMockNetInfo(),
                    appState: 'active',
                    intl: mockIntl,
                });
            });

            expect(result.current.visible).toBe(true);
            expect(result.current.bannerText).toBe('Unable to reach server. Reconnecting...');

            // Reconnect - should show "Connection restored"
            act(() => {
                rerender({
                    websocketState: 'connected' as WebsocketConnectedState,
                    networkPerformanceState: 'normal' as NetworkPerformanceState,
                    netInfo: createMockNetInfo(),
                    appState: 'active',
                    intl: mockIntl,
                });
            });

            expect(result.current.visible).toBe(true);
            expect(result.current.bannerText).toBe('Connection restored');
            expect(result.current.isShowingConnectedBanner).toBe(true);

            // Wait for auto-close
            act(() => {
                jest.advanceTimersByTime(2100);
            });

            expect(result.current.visible).toBe(false);
            expect(result.current.isShowingConnectedBanner).toBe(false);

            jest.useRealTimers();
        });
    });

    describe('session carry-over across mounts', () => {
        it('should show disconnected banner when component mounts after app has connected once', async () => {
            const connectedMount = renderHook(() => useConnectionBanner({
                websocketState: 'connected' as WebsocketConnectedState,
                networkPerformanceState: 'normal' as NetworkPerformanceState,
                netInfo: createMockNetInfo(),
                appState: 'active',
                intl: mockIntl,
            }));

            await waitFor(() => {
                expect(connectedMount.result.current.visible).toBe(false);
            });
            connectedMount.unmount();

            const disconnectedMount = renderHook(() => useConnectionBanner({
                websocketState: 'not_connected' as WebsocketConnectedState,
                networkPerformanceState: 'normal' as NetworkPerformanceState,
                netInfo: createMockNetInfo(),
                appState: 'active',
                intl: mockIntl,
            }));

            await waitFor(() => {
                expect(disconnectedMount.result.current.visible).toBe(true);
                expect(disconnectedMount.result.current.bannerText).toBe('Unable to reach server. Reconnecting...');
            });
        });
    });
});
