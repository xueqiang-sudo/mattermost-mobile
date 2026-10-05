// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useState} from 'react';
import {type LayoutChangeEvent, Platform, StyleSheet, View} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Animated, {runOnJS, useSharedValue} from 'react-native-reanimated';
import {type Edge, SafeAreaView} from 'react-native-safe-area-context';

import {storeLastViewedChannelIdAndServer, removeLastViewedChannelIdAndServer} from '@actions/app/global';
import {fetchProfilesInGroupChannels} from '@actions/remote/user';
import FloatingCallContainer from '@calls/components/floating_call_container';

import FreezeScreen from '@components/freeze_screen';
import PlusMenuOverlay from '@components/plus_menu_overlay';
import PostDraft from '@components/post_draft';
import ScheduledPostIndicator from '@components/scheduled_post_indicator';
import {Screens, General} from '@constants';
import {useServerUrl} from '@context/server';
import {ExtraKeyboardProvider} from '@context/extra_keyboard';
import {PlusMenuProvider} from '@context/plus_menu';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import {useChannelSwitch} from '@hooks/channel_switch';
import {useDefaultHeaderHeight} from '@hooks/header';
import {useTeamSwitch} from '@hooks/team_switch';
import SecurityManager from '@managers/security_manager';
import {popTopScreen} from '@screens/navigation';
import {debugLog} from '@store/debug_log';
import EphemeralStore from '@store/ephemeral_store';
import {getChatListBackdropColor} from '@utils/theme';

import ChannelPostList from './channel_post_list';
import ChannelHeader from './header';
import useGMasDMNotice from './use_gm_as_dm_notice';

import type PreferenceModel from '@typings/database/models/servers/preference';
import type {AvailableScreens} from '@typings/screens/navigation';

type ChannelProps = {
    channelId: string;
    componentId?: AvailableScreens;
    showJoinCallBanner: boolean;
    isInACall: boolean;
    isCallsEnabledInChannel: boolean;
    groupCallsAllowed: boolean;
    showIncomingCalls: boolean;
    isTabletView?: boolean;
    dismissedGMasDMNotice: PreferenceModel[];
    currentUserId: string;
    channelType: ChannelType;
    hasGMasDMFeature: boolean;
    includeBookmarkBar?: boolean;
    includeChannelBanner: boolean;
    scheduledPostCount: number;
};

const edges: Edge[] = ['left', 'right'];

const styles = StyleSheet.create({
    flex: {
        flex: 1,
    },
    messageArea: {
        flex: 1,
        flexDirection: 'column',
    },
});

const Channel = ({
    channelId,
    componentId,
    showJoinCallBanner,
    isInACall,
    isCallsEnabledInChannel,
    groupCallsAllowed,
    showIncomingCalls,
    isTabletView,
    dismissedGMasDMNotice,
    channelType,
    currentUserId,
    hasGMasDMFeature,
    includeBookmarkBar,
    includeChannelBanner,
    scheduledPostCount,
}: ChannelProps) => {
    const theme = useTheme();
    useGMasDMNotice(currentUserId, channelType, dismissedGMasDMNotice, hasGMasDMFeature);
    const switchingTeam = useTeamSwitch();
    const switchingChannels = useChannelSwitch();
    const defaultHeight = useDefaultHeaderHeight();
    const [containerHeight, setContainerHeight] = useState(0);

    /** 与 channelId 同步即可；勿用「首帧 false + rAF 再 true」否则刚进频道会长时间只有顶栏、无消息区与输入栏 */
    const shouldRender = !switchingTeam && !switchingChannels && Boolean(channelId);
    const handleBack = useCallback(() => {
        popTopScreen(componentId);
    }, [componentId]);

    useAndroidHardwareBackHandler(componentId, handleBack);

    // 左滑返回手势：从左边缘开始的右滑触发返回
    // iOS 已有 RNN popGesture，这里主要为 Android 添加相同功能
    const startX = useSharedValue(0);
    const swipeBackGesture = Platform.OS === 'android' ? Gesture.Pan()
        .activeOffsetX(10)
        .failOffsetY([-20, 20])
        .onStart((event) => {
            'worklet';
            startX.value = event.x;
        })
        .onEnd((event) => {
            'worklet';
            // 只允许从屏幕左边缘 30px 内开始滑动，且右滑速度足够快
            if (startX.value <= 30 && event.velocityX > 500) {
                runOnJS(handleBack)();
            }
        }) : undefined;

    const serverUrl = useServerUrl();

    /** 消息区从顶栏占位底边开始，避免绝对定位顶栏（zIndex 10）盖住断网条 */
    const marginTop = defaultHeight;
    useEffect(() => {
        // Give time to the WS event
        const t = setTimeout(() => {
            EphemeralStore.removeSwitchingToChannel(channelId);
        }, 500);

        storeLastViewedChannelIdAndServer(channelId);

        return () => {
            clearTimeout(t);
            removeLastViewedChannelIdAndServer();
            EphemeralStore.removeSwitchingToChannel(channelId);
        };
    }, [channelId]);

    // Sync GM channel members when entering a GM channel
    useEffect(() => {
        if (channelType === General.GM_CHANNEL && channelId && serverUrl) {
            debugLog('GM_SYNC', `entering GM channel ${channelId}, refreshing members`);
            // Fire-and-forget: refresh GM members when entering the channel
            // This ensures member list is up-to-date when user views the channel
            fetchProfilesInGroupChannels(serverUrl, [channelId], false, undefined, 0).catch((error) => {
                debugLog('GM_SYNC', `error refreshing members: ${error}`);
            });
        }
    }, [channelId, channelType, serverUrl]);

    const onLayout = useCallback((e: LayoutChangeEvent) => {
        setContainerHeight(e.nativeEvent.layout.height);
    }, []);

    const showFloatingCallContainer = showJoinCallBanner || isInACall || showIncomingCalls;

    const content = (
        <SafeAreaView
            style={[styles.flex, {backgroundColor: getChatListBackdropColor(theme)}]}
            mode='margin'
            edges={edges}
            testID='channel.screen'
            onLayout={onLayout}
            nativeID={componentId ? SecurityManager.getShieldScreenId(componentId) : undefined}
        >
                    <ChannelHeader
                    channelId={channelId}
                    componentId={componentId}
                    callsEnabledInChannel={isCallsEnabledInChannel}
                    groupCallsAllowed={groupCallsAllowed}
                    isTabletView={isTabletView}
                    shouldRenderBookmarks={shouldRender}
                    shouldRenderChannelBanner={includeChannelBanner}
                />
                {shouldRender &&
                <ExtraKeyboardProvider>
                    <View style={[styles.messageArea, {marginTop, backgroundColor: getChatListBackdropColor(theme)}]}>
                        <View style={{flex: 1}}>
                            <ChannelPostList
                                channelId={channelId}
                                nativeID={channelId}
                            />
                        </View>
                    </View>
                    <>
                        {scheduledPostCount > 0 &&
                            <ScheduledPostIndicator scheduledPostCount={scheduledPostCount}/>
                        }
                    </>
                    <PostDraft
                        channelId={channelId}
                        testID='channel.post_draft'
                        containerHeight={containerHeight}
                        isChannelScreen={true}
                        canShowPostPriority={true}
                        location={Screens.CHANNEL}
                    />
                </ExtraKeyboardProvider>
                }
                {showFloatingCallContainer && shouldRender &&
                    <FloatingCallContainer
                        channelId={channelId}
                        showJoinCallBanner={showJoinCallBanner}
                        showIncomingCalls={showIncomingCalls}
                        isInACall={isInACall}
                        includeBookmarkBar={includeBookmarkBar}
                        includeChannelBanner={includeChannelBanner}
                    />
                }
                <PlusMenuOverlay/>
            </SafeAreaView>
    );

    return (
        <FreezeScreen>
            <PlusMenuProvider>
                {swipeBackGesture ? (
                    <GestureDetector gesture={swipeBackGesture}>
                        {content}
                    </GestureDetector>
                ) : content}
            </PlusMenuProvider>
        </FreezeScreen>
    );
};

export default Channel;
