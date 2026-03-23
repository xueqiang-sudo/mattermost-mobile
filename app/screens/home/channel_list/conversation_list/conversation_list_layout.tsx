// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {DeviceEventEmitter, useWindowDimensions} from 'react-native';
import Animated, {useAnimatedStyle, useSharedValue, withTiming} from 'react-native-reanimated';

import {switchToChannelById} from '@actions/remote/channel';
import ThreadsButton from '@components/threads_button';
import {Events} from '@constants';
import {CHANNEL, THREAD} from '@constants/screens';
import {TABLET_SIDEBAR_WIDTH, TEAM_SIDEBAR_WIDTH} from '@constants/view';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {useIsTablet} from '@hooks/device';
import PerformanceMetricsManager from '@managers/performance_metrics_manager';
import PlaybooksButton from '@playbooks/components/playbooks_button';
import {makeStyleSheetFromTheme} from '@utils/theme';

import ChannelListHeader from '../categories_list/header';
import SubHeader from '../categories_list/subheader';

import ConversationListContent from './conversation_list';

import type ChannelModel from '@typings/database/models/servers/channel';

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.sidebarBg,
        paddingTop: 6,
    },
}));

type Props = {
    sortedChannels: ChannelModel[];
    hasChannels: boolean;
    iconPad?: boolean;
    isCRTEnabled?: boolean;
    moreThanOneTeam: boolean;
    playbooksEnabled?: boolean;
};

const getTabletWidth = (moreThanOneTeam: boolean) => {
    return TABLET_SIDEBAR_WIDTH - (moreThanOneTeam ? TEAM_SIDEBAR_WIDTH : 0);
};

type ScreenType = typeof THREAD | typeof CHANNEL;

const ConversationListLayout = ({
    sortedChannels,
    hasChannels,
    iconPad,
    isCRTEnabled,
    moreThanOneTeam,
    playbooksEnabled,
}: Props) => {
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const serverUrl = useServerUrl();
    const isTablet = useIsTablet();
    const {width} = useWindowDimensions();
    const tabletWidth = useSharedValue(isTablet ? getTabletWidth(moreThanOneTeam) : 0);
    const [activeScreen, setActiveScreen] = useState<ScreenType>(CHANNEL);

    useEffect(() => {
        if (isTablet) {
            tabletWidth.value = getTabletWidth(moreThanOneTeam);
        }

        // tabletWidth is a sharedValue, so it's safe to ignore this warning
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isTablet, moreThanOneTeam]);

    useEffect(() => {
        const listener = DeviceEventEmitter.addListener(Events.ACTIVE_SCREEN, (screen: string) => {
            if (screen === THREAD) {
                setActiveScreen(THREAD);
            } else {
                setActiveScreen(CHANNEL);
            }
        });

        return () => {
            listener.remove();
        };
    }, []);

    const tabletStyle = useAnimatedStyle(() => {
        if (!isTablet) {
            return {
                maxWidth: width,
            };
        }

        return {maxWidth: withTiming(tabletWidth.value, {duration: 350})};
    }, [isTablet, width]);

    const onChannelSwitch = useCallback(
        (channel: ChannelModel) => {
            DeviceEventEmitter.emit(Events.ACTIVE_SCREEN, CHANNEL);
            PerformanceMetricsManager.startMetric('mobile_channel_switch');
            switchToChannelById(serverUrl, channel.id);
        },
        [serverUrl],
    );

    const threadsButtonForHeader = useMemo(() => {
        if (!isCRTEnabled) {
            return null;
        }
        return (
            <ThreadsButton
                isOnHome={true}
                shouldHighlightActive={activeScreen === THREAD}
                variant='header'
            />
        );
    }, [activeScreen, isCRTEnabled]);

    const playbooksButtonComponent = useMemo(() => {
        if (!playbooksEnabled) {
            return null;
        }

        return (
            <PlaybooksButton/>
        );
    }, [playbooksEnabled]);

    return (
        <Animated.View style={[styles.container, tabletStyle]}>
            <ChannelListHeader
                iconPad={iconPad}
                threadsButton={threadsButtonForHeader}
            />
            <SubHeader/>
            {playbooksButtonComponent}
            <ConversationListContent
                sortedChannels={sortedChannels}
                hasChannels={hasChannels}
                onChannelSwitch={onChannelSwitch}
            />
        </Animated.View>
    );
};

export default ConversationListLayout;
