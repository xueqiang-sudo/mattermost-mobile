// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// import {useManagedConfig} from '@mattermost/react-native-emm';
import {useFocusEffect, useIsFocused, useNavigation, useRoute} from '@react-navigation/native';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {BackHandler, DeviceEventEmitter, StyleSheet, Text, TouchableOpacity, ToastAndroid, View} from 'react-native';
import Animated, {useAnimatedStyle, withTiming} from 'react-native-reanimated';
import {type Edge, SafeAreaView} from 'react-native-safe-area-context';

import {retryInitialTeamAndChannel} from '@actions/remote/retry';
import {refetchCurrentUser} from '@actions/remote/user';
import FloatingCallContainer from '@calls/components/floating_call_container';
import AnnouncementBanner from '@components/announcement_banner';

import {Navigation as NavigationConstants, Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {useIsTablet} from '@hooks/device';
import {useTeamsLoading} from '@hooks/teams_loading';
import PerformanceMetricsManager from '@managers/performance_metrics_manager';
import WebsocketManager from '@managers/websocket_manager';
import {queryMyTeams} from '@queries/servers/team';
import DatabaseManager from '@database/manager';
import {openToS} from '@screens/navigation';
import NavigationStore from '@store/navigation_store';
import {setTeamLoading} from '@store/team_load_store';
import {isMainActivity} from '@utils/helpers';
import {tryRunAppReview} from '@utils/reviews';
import {addSentryContext} from '@utils/sentry';

import AdditionalTabletView from './additional_tablet_view';
import CategoriesList from './categories_list';

import type {LaunchType} from '@typings/launch';

type ChannelProps = {
    hasChannels: boolean;
    isCRTEnabled: boolean;
    hasTeams: boolean;
    hasMoreThanOneTeam: boolean;
    isLicensed: boolean;
    showToS: boolean;
    launchType: LaunchType;
    coldStart?: boolean;
    currentUserId?: string;
    hasCurrentUser: boolean;
    showIncomingCalls: boolean;
};

/** 顶栏延伸至状态栏，顶部 inset 由 Header 自行 padding；底/左右仍走 SafeAreaView */
const edges: Edge[] = ['bottom', 'left', 'right'];

const styles = StyleSheet.create({
    content: {
        flex: 1,
        flexDirection: 'row',
    },
    flex: {
        flex: 1,
    },
    loadTimeoutContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
        zIndex: 10,
    },
    loadTimeoutText: {
        fontSize: 15,
        textAlign: 'center',
        marginBottom: 16,
        opacity: 0.7,
    },
    loadTimeoutButton: {
        paddingHorizontal: 24,
        paddingVertical: 10,
        borderRadius: 8,
    },
    loadTimeoutButtonText: {
        fontSize: 15,
        fontWeight: '600',
    },
});

let backPressedCount = 0;
let backPressTimeout: NodeJS.Timeout|undefined;

// This is needed since the Database Provider is recreating this component
// when the database is changed (couldn't find exactly why), re-triggering
// the effect. This makes sure the rate logic is only handle on the first
// run. Most of the normal users won't see this issue, but on edge times
// (near the time you will see the rate dialog) will show when switching
// servers.
let hasRendered = false;


const ChannelListScreen = (props: ChannelProps) => {
    const theme = useTheme();

    // const managedConfig = useManagedConfig<ManagedConfig>();
    const intl = useIntl();

    const isTablet = useIsTablet();
    const route = useRoute();
    const isFocused = useIsFocused();
    const navigation = useNavigation();
    const serverUrl = useServerUrl();
    const teamsLoading = useTeamsLoading(serverUrl);
    const hasTeamsRef = useRef(props.hasTeams);
    const teamsLoadingRef = useRef(teamsLoading);
    const params = route.params as {direction: string};

    hasTeamsRef.current = props.hasTeams;
    teamsLoadingRef.current = teamsLoading;

    const handleBackPress = useCallback(() => {
        const isHomeScreen = NavigationStore.getVisibleScreen() === Screens.HOME;
        const homeTab = NavigationStore.getVisibleTab() === Screens.HOME_TAB_CHAT;
        const focused = navigation.isFocused() && isHomeScreen && homeTab;

        if (isMainActivity()) {
            if (!backPressedCount && focused) {
                backPressedCount++;
                ToastAndroid.show(intl.formatMessage({
                    id: 'mobile.android.back_handler_exit',
                    defaultMessage: 'Press back again to exit',
                }), ToastAndroid.SHORT);

                if (backPressTimeout) {
                    clearTimeout(backPressTimeout);
                }
                backPressTimeout = setTimeout(() => {
                    clearTimeout(backPressTimeout!);
                    backPressedCount = 0;
                }, 2000);
                return true;
            } else if (isHomeScreen && !homeTab) {
                DeviceEventEmitter.emit(NavigationConstants.NAVIGATION_HOME);
                return true;
            }
        }
        return false;
    }, [intl, navigation]);

    const animated = useAnimatedStyle(() => {
        if (!isFocused) {
            let initial = 0;
            if (params?.direction) {
                initial = -25;
            }
            return {
                opacity: withTiming(0, {duration: 150}),
                transform: [{translateX: withTiming(initial, {duration: 150})}],
            };
        }
        return {
            opacity: withTiming(1, {duration: 150}),
            transform: [{translateX: withTiming(0, {duration: 150})}],
        };
    }, [isFocused, params]);

    // 响应式观察团队数量变化（替代定时器轮询）
    const database = DatabaseManager.serverDatabases[serverUrl]?.database;
    const [teamCount, setTeamCount] = useState(0);

    useEffect(() => {
        if (!database) {
            setTeamCount(0);
            return;
        }
        const subscription = queryMyTeams(database).observe().subscribe(
            (teams) => setTeamCount(teams.length),
            () => setTeamCount(0),
        );
        return () => subscription.unsubscribe();
    }, [database]);

    // 团队加载超时：teamCount=0 持续 30 秒后显示「加载超时，点击重试」UI
    // 替代原来的 resetToDebug() 跳转，对用户更友好。
    const noTeamsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [showLoadTimeout, setShowLoadTimeout] = useState(false);

    useEffect(() => {

        if (teamCount > 0 || teamsLoading) {
            // 团队已加载或正在加载，清除超时和超时提示
            if (noTeamsTimeoutRef.current) {
                clearTimeout(noTeamsTimeoutRef.current);
                noTeamsTimeoutRef.current = null;
            }
            // 清除超时提示（幂等操作，已经是 false 时调用无副作用）
            setShowLoadTimeout(false);
            return undefined;
        }

        // teamCount=0 且不在加载，启动较长超时等待 WebSocket 加载
        if (!noTeamsTimeoutRef.current) {
            noTeamsTimeoutRef.current = setTimeout(() => {
                noTeamsTimeoutRef.current = null;
                if (!teamsLoadingRef.current) {
                    setShowLoadTimeout(true);
                }
            }, 30000);
        }

        return () => {};
    }, [teamCount, teamsLoading]);

    // 团队加载超时后，用户点击「重新加载」的处理函数
    const handleRetryLoadTeams = useCallback(async () => {
        setShowLoadTimeout(false);
        setTeamLoading(serverUrl, true);
        try {
            await retryInitialTeamAndChannel(serverUrl);
        } catch (error) {
            // 重试失败不阻塞 UI，超时提示会再次出现
        } finally {
            setTeamLoading(serverUrl, false);
        }
    }, [serverUrl]);

    // 组件卸载时清除超时
    useEffect(() => {
        return () => {
            if (noTeamsTimeoutRef.current) {
                clearTimeout(noTeamsTimeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        const back = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
        return () => back.remove();
    }, [handleBackPress]);

    useEffect(() => {
        addSentryContext(serverUrl);
    }, [serverUrl]);

    useEffect(() => {
        if (props.showToS && !NavigationStore.isToSOpen()) {
            openToS();
        }
    }, [props.showToS]);

    useEffect(() => {
        if (!props.hasCurrentUser || !props.currentUserId) {
            refetchCurrentUser(serverUrl, props.currentUserId);
        }
    }, [props.currentUserId, props.hasCurrentUser]);

    // Init the rate app. Only run the effect on the first render if ToS is not open
    useEffect(() => {
        if (hasRendered) {
            return;
        }
        hasRendered = true;
        if (!NavigationStore.isToSOpen()) {
            tryRunAppReview(props.launchType, props.coldStart);
        }
    }, []);

    useEffect(() => {
        PerformanceMetricsManager.finishLoad('HOME', serverUrl);
        PerformanceMetricsManager.measureTimeToInteraction();
    }, []);

    // 首页获得焦点时，若 WebSocket 未连接则尝试重连，确保能实时接收新消息
    useFocusEffect(
        useCallback(() => {
            if (!serverUrl) {
                return;
            }
            if (!WebsocketManager.isConnected(serverUrl)) {
                WebsocketManager.openAll('WebSocket Reconnect');
            }
        }, [serverUrl]),
    );

    return (
        <SafeAreaView
            style={[styles.flex, {backgroundColor: theme.sidebarBg}]}
            edges={edges}
            testID='channel_list.screen'
        >

            {props.isLicensed &&
                <AnnouncementBanner/>
            }
            <View style={styles.content}>
                <Animated.View
                    style={[styles.content, animated]}
                >
                    {showLoadTimeout && (
                        <View style={styles.loadTimeoutContainer}>
                            <Text style={[styles.loadTimeoutText, {color: theme.centerChannelColor}]}>
                                {intl.formatMessage({
                                    id: 'channel_list.load_timeout',
                                    defaultMessage: '加载团队信息超时，请检查网络后重试',
                                })}
                            </Text>
                            <TouchableOpacity
                                onPress={handleRetryLoadTeams}
                                style={[styles.loadTimeoutButton, {backgroundColor: theme.buttonBg}]}
                            >
                                <Text style={[styles.loadTimeoutButtonText, {color: theme.buttonColor}]}>
                                    {intl.formatMessage({
                                        id: 'channel_list.retry',
                                        defaultMessage: '重新加载',
                                    })}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    )}
                    <CategoriesList
                        iconPad={false}
                        moreThanOneTeam={props.hasMoreThanOneTeam}
                        hasChannels={props.hasChannels}
                    />
                    {isTablet && props.hasChannels &&
                        <AdditionalTabletView/>
                    }
                    {props.showIncomingCalls && !isTablet &&
                        <FloatingCallContainer
                            showIncomingCalls={props.showIncomingCalls}
                            channelsScreen={true}
                        />
                    }
                </Animated.View>
            </View>
        </SafeAreaView>
    );
};

export default ChannelListScreen;
