// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {DeviceEventEmitter, FlatList, StyleSheet, Text, View} from 'react-native';
import {useIntl} from 'react-intl';

import {fetchDirectChannelsInfo} from '@actions/remote/channel';
import ChannelItem from '@components/channel_item';
import {Events} from '@constants';
import {CHANNEL, DRAFT, THREAD} from '@constants/screens';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {isDMorGM} from '@utils/channel';
import {makeStyleSheetFromTheme} from '@utils/theme';

import type ChannelModel from '@typings/database/models/servers/channel';

type Props = {
    sortedChannels: ChannelModel[];
    hasChannels: boolean;
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
        color: theme.centerChannelColor,
        opacity: 0.72,
        textAlign: 'center',
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

const ConversationListContent = ({sortedChannels, hasChannels, onChannelSwitch}: Props) => {
    const serverUrl = useServerUrl();
    const [isChannelScreenActive, setChannelScreenActive] = useState(true);

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
            <ChannelItem
                channel={item}
                onPress={onChannelSwitch}
                testID='channel_list.conversation.channel_item'
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
            data={sortedChannels}
            renderItem={renderItem}
            keyExtractor={extractKey}
        />
    );
};

export default ConversationListContent;
