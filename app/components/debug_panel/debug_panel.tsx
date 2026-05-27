// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Animated, Dimensions, PanResponder, Platform, StyleSheet, Text, TouchableOpacity, View} from 'react-native';

import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {clearConsoleLogs, debugLogStore} from '@utils/debug_logger';
import {clearNetworkLogs, networkLogStore} from '@utils/network_logger';
import {clearLogcatLogs, logcatLogStore, startLogcatMonitor, stopLogcatMonitor} from '@utils/logcat_logger';

import LogFilter, {type LogType} from './log_filter';
import LogList from './log_list';

import type {ConsoleLogEntry} from '@utils/debug_logger';
import type {NetworkLogEntry} from '@utils/network_logger';
import type {LogcatLogEntry} from '@utils/logcat_logger';

// ─── Layout constants ────────────────────────────────────────────────────────
const BUTTON_SIZE = 48;
const PANEL_BORDER_RADIUS = 16;
const PANEL_HEIGHT_RATIO = 0.75;
const DRAG_HIT_SLOP = {top: 8, bottom: 8, left: 8, right: 8};
const LOG_UI_SYNC_THROTTLE_MS = 200;

const getStyleSheet = makeStyleSheetFromTheme((theme) => ({
    // Floating button
    fab: {
        position: 'absolute',
        width: BUTTON_SIZE,
        height: BUTTON_SIZE,
        borderRadius: BUTTON_SIZE / 2,
        backgroundColor: theme.buttonBg,
        opacity: 0.88,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 6,
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.18,
        shadowRadius: 4,
    },
    fabText: {
        color: theme.buttonColor,
        fontSize: 14,
        fontWeight: '700',
        lineHeight: 18,
    },
    // Backdrop
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: changeOpacity('#000000', 0.4),
        zIndex: 1,
    },
    // Panel container
    panel: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        borderTopLeftRadius: PANEL_BORDER_RADIUS,
        borderTopRightRadius: PANEL_BORDER_RADIUS,
        backgroundColor: theme.centerChannelBg,
        borderTopWidth: 1,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.10),
        overflow: 'hidden',
        zIndex: 2,
        elevation: 8,
    },
    // Panel handle bar
    handle: {
        alignItems: 'center',
        paddingTop: 10,
        paddingBottom: 4,
    },
    handleBar: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.2),
    },
    // Panel header
    panelHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingBottom: 8,
    },
    panelTitle: {
        flex: 1,
        fontSize: 16,
        lineHeight: 22,
        fontWeight: '700',
        color: theme.centerChannelColor,
    },
    closeBtn: {
        padding: 6,
    },
    closeBtnText: {
        fontSize: 18,
        lineHeight: 22,
        color: changeOpacity(theme.centerChannelColor, 0.56),
    },
    // Count badge next to title
    countBadge: {
        marginLeft: 6,
        paddingHorizontal: 6,
        paddingVertical: 1,
        borderRadius: 8,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    countBadgeText: {
        fontSize: 11,
        lineHeight: 15,
        fontWeight: '600',
        color: changeOpacity(theme.centerChannelColor, 0.6),
    },
}));

// Platform bottom inset fallback (no SafeAreaProvider available in overlay context)
const BOTTOM_INSET = Platform.OS === 'android' ? 24 : 34;

const DebugPanel = () => {
    const theme = useTheme();
    const styles = getStyleSheet(theme);

    const {width: screenWidth, height: screenHeight} = Dimensions.get('window');
    const panelHeight = screenHeight * PANEL_HEIGHT_RATIO;

    // Draggable FAB position (default: bottom-right with safe-area margin)
    const defaultX = screenWidth - BUTTON_SIZE - 16;
    const defaultY = screenHeight - BUTTON_SIZE - (BOTTOM_INSET + 80);
    const pan = useRef(new Animated.ValueXY({x: defaultX, y: defaultY})).current;

    const [panelOpen, setPanelOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<LogType>('console');
    const [consoleLogs, setConsoleLogs] = useState<ConsoleLogEntry[]>(() => debugLogStore.getLogs());
    const [networkLogs, setNetworkLogs] = useState<NetworkLogEntry[]>(() => networkLogStore.getLogs());
    const [logcatLogs, setLogcatLogs] = useState<LogcatLogEntry[]>(() => logcatLogStore.getLogs());

    const panelAnim = useRef(new Animated.Value(0)).current;
    const isDragging = useRef(false);
    const consoleSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const networkSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const logcatSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const scheduleConsoleSync = useCallback(() => {
        if (consoleSyncTimerRef.current) {
            return;
        }
        consoleSyncTimerRef.current = setTimeout(() => {
            consoleSyncTimerRef.current = null;
            setConsoleLogs(debugLogStore.getLogs());
        }, LOG_UI_SYNC_THROTTLE_MS);
    }, []);

    const scheduleNetworkSync = useCallback(() => {
        if (networkSyncTimerRef.current) {
            return;
        }
        networkSyncTimerRef.current = setTimeout(() => {
            networkSyncTimerRef.current = null;
            setNetworkLogs(networkLogStore.getLogs());
        }, LOG_UI_SYNC_THROTTLE_MS);
    }, []);

    const scheduleLogcatSync = useCallback(() => {
        if (logcatSyncTimerRef.current) {
            return;
        }
        logcatSyncTimerRef.current = setTimeout(() => {
            logcatSyncTimerRef.current = null;
            setLogcatLogs(logcatLogStore.getLogs());
        }, LOG_UI_SYNC_THROTTLE_MS);
    }, []);

    // Subscribe to log store updates
    useEffect(() => {
        const unsub1 = debugLogStore.subscribe(() => {
            scheduleConsoleSync();
        });
        const unsub2 = networkLogStore.subscribe(() => {
            scheduleNetworkSync();
        });
        const unsub3 = logcatLogStore.subscribe(() => {
            scheduleLogcatSync();
        });
        return () => {
            unsub1();
            unsub2();
            unsub3();
            if (consoleSyncTimerRef.current) {
                clearTimeout(consoleSyncTimerRef.current);
                consoleSyncTimerRef.current = null;
            }
            if (networkSyncTimerRef.current) {
                clearTimeout(networkSyncTimerRef.current);
                networkSyncTimerRef.current = null;
            }
            if (logcatSyncTimerRef.current) {
                clearTimeout(logcatSyncTimerRef.current);
                logcatSyncTimerRef.current = null;
            }
        };
    }, [scheduleConsoleSync, scheduleLogcatSync, scheduleNetworkSync]);

    useEffect(() => {
        if (Platform.OS !== 'android') {
            return;
        }

        startLogcatMonitor();
        return () => {
            stopLogcatMonitor();
        };
    }, []);

    // Animate panel in/out
    useEffect(() => {
        Animated.spring(panelAnim, {
            toValue: panelOpen ? 1 : 0,
            useNativeDriver: true,
            tension: 65,
            friction: 12,
        }).start();
    }, [panelAnim, panelOpen]);

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: (_, gestureState) => {
                return Math.abs(gestureState.dx) > 4 || Math.abs(gestureState.dy) > 4;
            },
            onPanResponderGrant: () => {
                pan.extractOffset();
                isDragging.current = false;
            },
            onPanResponderMove: (_, gestureState) => {
                if (Math.abs(gestureState.dx) > 6 || Math.abs(gestureState.dy) > 6) {
                    isDragging.current = true;
                }
                Animated.event([null, {dx: pan.x, dy: pan.y}], {useNativeDriver: false})(_, gestureState);
            },
            onPanResponderRelease: (_, gestureState) => {
                pan.flattenOffset();
                if (!isDragging.current || (Math.abs(gestureState.dx) < 6 && Math.abs(gestureState.dy) < 6)) {
                    isDragging.current = false;
                    setPanelOpen((v) => !v);
                }
            },
        }),
    ).current;

    const closePanel = useCallback(() => setPanelOpen(false), []);

    const handleTabChange = useCallback((tab: LogType) => setActiveTab(tab), []);

    useEffect(() => {
        if (activeTab === 'console') {
            setConsoleLogs(debugLogStore.getLogs());
        } else if (activeTab === 'network') {
            setNetworkLogs(networkLogStore.getLogs());
        } else {
            setLogcatLogs(logcatLogStore.getLogs());
        }
    }, [activeTab]);

    const handleClear = useCallback(() => {
        if (activeTab === 'console') {
            clearConsoleLogs();
            setConsoleLogs([]);
        } else if (activeTab === 'logcat') {
            clearLogcatLogs();
            setLogcatLogs([]);
        } else if (activeTab === 'network') {
            clearNetworkLogs();
            setNetworkLogs([]);
        }
    }, [activeTab]);

    const currentLogs = activeTab === 'console' ? consoleLogs :
        activeTab === 'network' ? networkLogs : logcatLogs;
    const logCount = currentLogs.length;

    const panelTranslateY = panelAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [panelHeight, 0],
    });

    return (
        // Closed: let touches pass through except FAB.
        // Opened: capture touches in overlay (no pass-through), then route to panel/backdrop.
        <View
            style={StyleSheet.absoluteFillObject}
            pointerEvents={panelOpen ? 'auto' : 'box-none'}
        >
            {/* Draggable FAB (hidden while panel is open to avoid touch conflicts) */}
            {!panelOpen && (
                <Animated.View
                    style={[styles.fab, {transform: pan.getTranslateTransform()}]}
                    {...panResponder.panHandlers}
                    hitSlop={DRAG_HIT_SLOP}
                >
                    <Text style={styles.fabText}>{'DBG'}</Text>
                </Animated.View>
            )}

            {/* Backdrop — only rendered when panel is open */}
            {panelOpen && (
                <TouchableOpacity
                    style={styles.backdrop}
                    onPress={closePanel}
                    activeOpacity={1}
                />
            )}

            {/* Bottom panel */}
            <Animated.View
                style={[
                    styles.panel,
                    {height: panelHeight, transform: [{translateY: panelTranslateY}]},
                ]}
                pointerEvents={panelOpen ? 'auto' : 'none'}
            >
                {/* Handle */}
                <View style={styles.handle}>
                    <View style={styles.handleBar}/>
                </View>

                {/* Header */}
                <View style={styles.panelHeader}>
                    <Text style={styles.panelTitle}>
                        {'调试日志'}
                    </Text>
                    <View style={styles.countBadge}>
                        <Text style={styles.countBadgeText}>{logCount}</Text>
                    </View>
                    <TouchableOpacity
                        style={styles.closeBtn}
                        onPress={closePanel}
                        activeOpacity={0.7}
                    >
                        <Text style={styles.closeBtnText}>{'✕'}</Text>
                    </TouchableOpacity>
                </View>

                {/* Tabs */}
                <LogFilter
                    activeTab={activeTab}
                    onTabChange={handleTabChange}
                    theme={theme}
                />

                {/* Log list — extra bottom padding for home indicator */}
                <View style={{flex: 1, paddingBottom: BOTTOM_INSET}}>
                    <LogList
                        logs={currentLogs}
                        type={activeTab}
                        onClear={handleClear}
                        theme={theme}
                    />
                </View>
            </Animated.View>
        </View>
    );
};

export default DebugPanel;
