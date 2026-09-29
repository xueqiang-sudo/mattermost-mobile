// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {DeviceEventEmitter, FlatList, StyleSheet, View} from 'react-native';
import Animated, {Easing, useAnimatedStyle, useSharedValue, withTiming} from 'react-native-reanimated';

import {fetchDirectChannelsInfo} from '@actions/remote/channel';
import ChannelItem from '@components/channel_item';
import {ROW_HEIGHT as CHANNEL_ROW_HEIGHT} from '@components/channel_item/channel_item';
import {Events} from '@constants';
import {CHANNEL, DRAFT, THREAD} from '@constants/screens';
import {useServerUrl} from '@context/server';
import {isDMorGM} from '@utils/channel';

import ClassifiedHeader from './classified_header';

import type ChannelModel from '@typings/database/models/servers/channel';

type Props = {
    title: string;
    groupId: string;
    sortedChannels: ChannelModel[];
    onChannelSwitch: (channel: Channel | ChannelModel) => void;
}

const extractKey = (item: ChannelModel) => item.id;

const styles = StyleSheet.create({
    mainList: {
        flex: 1,
    },
});

const ClassifiedGroup = ({
    title,
    groupId,
    sortedChannels,
    onChannelSwitch,
}: Props) => {
    const serverUrl = useServerUrl();
    const [isChannelScreenActive, setChannelScreenActive] = useState(true);
    const [collapsed, setCollapsed] = useState(false);

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

    const toggleCollapse = useCallback(() => {
        setCollapsed((prev) => !prev);
    }, []);

    const sharedValue = useSharedValue(collapsed);

    useEffect(() => {
        sharedValue.value = collapsed;
    }, [collapsed]);

    const height = sortedChannels.length ? sortedChannels.length * CHANNEL_ROW_HEIGHT : 0;

    const animatedStyle = useAnimatedStyle(() => {
        return {
            height: withTiming(sharedValue.value ? 0 : height, {duration: 300}),
            opacity: withTiming(sharedValue.value ? 0 : 1, {duration: sharedValue.value ? 200 : 300, easing: Easing.inOut(Easing.exp)}),
        };
    }, [height]);

    if (sortedChannels.length === 0) {
        return null;
    }

    return (
        <View>
            <ClassifiedHeader
                title={title}
                collapsed={collapsed}
                onToggle={toggleCollapse}
            />
            <Animated.View style={animatedStyle}>
                <FlatList
                    data={sortedChannels}
                    renderItem={renderItem}
                    keyExtractor={extractKey}
                    style={{height}}
                    scrollEnabled={false}
                    strictMode={true}
                />
            </Animated.View>
        </View>
    );
};

export default ClassifiedGroup;
