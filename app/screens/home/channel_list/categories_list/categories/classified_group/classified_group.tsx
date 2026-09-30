// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {DeviceEventEmitter, FlatList, StyleSheet, View} from 'react-native';

import {fetchDirectChannelsInfo} from '@actions/remote/channel';
import ChannelItem from '@components/channel_item';
import {Events} from '@constants';
import {CHANNEL, DRAFT, THREAD} from '@constants/screens';
import {useServerUrl} from '@context/server';
import {isDMorGM} from '@utils/channel';

import CollapsibleGroup from '../collapsible_group';

import type ChannelModel from '@typings/database/models/servers/channel';

type Props = {
    title: string;
    groupId: string;
    sortedChannels: ChannelModel[];
    onChannelSwitch: (channel: Channel | ChannelModel) => void;
}

const extractKey = (item: ChannelModel) => item.id;

const ClassifiedGroup = ({
    title,
    groupId,
    sortedChannels,
    onChannelSwitch,
}: Props) => {
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

    const directChannels = useMemo(() => {
        return sortedChannels.filter((c) => c && isDMorGM(c));
    }, [sortedChannels]);

    useEffect(() => {
        if (directChannels.length) {
            fetchDirectChannelsInfo(serverUrl, directChannels.filter((c) => !c.displayName));
        }
    }, [directChannels.length]);

    const renderItem = useCallback(({item}: {item: ChannelModel}) => {
        return (
            <ChannelItem
                channel={item}
                onPress={onChannelSwitch}
                key={item.id}
                testID={`channel_list.classified.${groupId}.channel_item`}
                shouldHighlightActive={isChannelScreenActive}
                shouldHighlightState={true}
                isOnHome={true}
            />
        );
    }, [groupId, isChannelScreenActive, onChannelSwitch]);

    // Filter out undefined values to prevent crashes in keyExtractor
    const validChannels = sortedChannels.filter((c): c is ChannelModel => c != null);

    if (validChannels.length === 0) {
        return null;
    }

    const containerHeight = validChannels.length * 40; // CHANNEL_ROW_HEIGHT

    return (
        <CollapsibleGroup title={title} count={validChannels.length}>
            <View style={{height: containerHeight}}>
                <FlatList
                    data={validChannels}
                    renderItem={renderItem}
                    keyExtractor={extractKey}
                    scrollEnabled={false}
                    strictMode={true}
                />
            </View>
        </CollapsibleGroup>
    );
};

export default ClassifiedGroup;
