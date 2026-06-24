// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {DeviceEventEmitter, FlatList, StyleSheet, Text, View} from 'react-native';

import {fetchDirectChannelsInfo} from '@actions/remote/channel';
import {Events} from '@constants';
import {CHANNEL, DRAFT, THREAD} from '@constants/screens';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {isDMorGM} from '@utils/channel';
import {changeOpacity, getChatListBackdropColor, makeStyleSheetFromTheme, WECHAT_HOME_DIVIDER_INSET, WECHAT_HOME_DIVIDER_OPACITY, WECHAT_HOME_SECONDARY_TEXT_OPACITY} from '@utils/theme';

import ConversationListSwipeableItem from './conversation_list_swipeable_item';

import type ChannelModel from '@typings/database/models/servers/channel';
import type {SwipeableMethods} from 'react-native-gesture-handler/ReanimatedSwipeable';

type Props = {
    sortedChannels: ChannelModel[];
    hasChannels: boolean;
    currentTeamId?: string;
    onChannelSwitch: (channel: ChannelModel) => void;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: theme.centerChannelColor,
        marginBottom: 8,
        textAlign: 'center',
    },
    emptyHint: {
        fontSize: 14,
        color: changeOpacity(theme.centerChannelColor, WECHAT_HOME_SECONDARY_TEXT_OPACITY),
        textAlign: 'center',
    },
    list: {
        backgroundColor: getChatListBackdropColor(theme),
    },
    divider: {
        marginLeft: WECHAT_HOME_DIVIDER_INSET,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.dividerColor,
    },
}));

const extractKey = (item: ChannelModel) => item.id;

const EmptyState = () => {
    const {formatMessage} = useIntl();
    const theme = useTheme();
    const styles = getStyleSheet(theme);

    return (
        <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>
                {formatMessage({id: 'conversation_list.empty.title', defaultMessage: 'No conversations'})}
            </Text>
            <Text style={styles.emptyHint}>
                {formatMessage({id: 'conversation_list.empty.hint', defaultMessage: 'Tap + to start a chat'})}
            </Text>
        </View>
    );
};

const ConversationListContent = ({sortedChannels, hasChannels, currentTeamId, onChannelSwitch}: Props) => {
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const serverUrl = useServerUrl();
    const [isChannelScreenActive, setChannelScreenActive] = useState(true);
    /** 用于追踪当前已打开的 swipeable 项，确保同时只有一个项处于滑动打开状态 */
    const swipeableRegistrar = useRef<{current: React.RefObject<SwipeableMethods> | null}>({current: null});

    useEffect(() => {
        const listener = DeviceEventEmitter.addListener(Events.ACTIVE_SCREEN, (screen: string) => {
            setChannelScreenActive(screen !== DRAFT && screen !== THREAD);
        });

        return () => {
            listener.remove();
        };
    }, []);

    const directChannels = useMemo(
        () => sortedChannels.filter(isDMorGM),
        [sortedChannels],
    );

    useEffect(() => {
        if (directChannels.length) {
            fetchDirectChannelsInfo(serverUrl, directChannels.filter((c) => !c.displayName));
        }
    }, [directChannels.length, serverUrl]);

    const renderItem = useCallback(
        ({item}: {item: ChannelModel}) => (
            <ConversationListSwipeableItem
                channel={item}
                onPress={onChannelSwitch}
                swipeableRegistrar={swipeableRegistrar.current}
                shouldHighlightActive={isChannelScreenActive}
                shouldHighlightState={true}
                isOnHome={true}
            />
        ),
        [isChannelScreenActive, onChannelSwitch],
    );

    if (!hasChannels || sortedChannels.length === 0) {
        return <EmptyState/>;
    }

    return (
        <FlatList
            key={currentTeamId || 'no-team'}
            extraData={currentTeamId}
            style={styles.list}
            data={sortedChannels}
            renderItem={renderItem}
            keyExtractor={extractKey}
        />
    );
};

export default ConversationListContent;
