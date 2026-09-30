// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {DeviceEventEmitter, FlatList, StyleSheet, Text, View} from 'react-native';
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

type FilterStats = {
    initial: number;
    afterArchived: number;
    afterManual: number;
    afterAuto: number;
    final: number;
};

type Props = {
    title: string;
    groupId: string;
    sortedChannels: ChannelModel[];
    filterStats?: FilterStats;
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
    filterStats,
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

    // Filter out undefined values to prevent crashes in keyExtractor
    const validChannels = sortedChannels.filter((c): c is ChannelModel => c != null);

    // DEBUG: Always show component state (for real device testing)
    if (validChannels.length === 0) {
        return (
            <View style={{padding: 10, backgroundColor: '#ffcccc', borderBottomWidth: 2, borderBottomColor: '#c00'}}>
                <Text style={{fontSize: 12, color: '#c00', fontWeight: 'bold'}}>
                    ❌ [{title}]: NO CHANNELS TO RENDER
                </Text>
                <Text style={{fontSize: 11, color: '#600'}}>
                    sortedChannels: {sortedChannels.length}, validChannels: {validChannels.length}
                </Text>
                {filterStats && (
                    <>
                        <Text style={{fontSize: 10, color: '#600'}}>
                            过滤统计:
                        </Text>
                        <Text style={{fontSize: 9, color: '#900'}}>
                            • 初始: {filterStats.initial}
                        </Text>
                        <Text style={{fontSize: 9, color: '#900'}}>
                            • 归档过滤: -{filterStats.afterArchived}
                        </Text>
                        <Text style={{fontSize: 9, color: '#900'}}>
                            • 手动关闭: -{filterStats.afterManual}
                        </Text>
                        <Text style={{fontSize: 9, color: '#900'}}>
                            • 自动关闭: -{filterStats.afterAuto}
                        </Text>
                        <Text style={{fontSize: 9, color: '#900'}}>
                            • 最终: {filterStats.final}
                        </Text>
                    </>
                )}
            </View>
        );
    }

    return (
        <View>
            <View style={{padding: 8, backgroundColor: '#ccffcc', borderBottomWidth: 1, borderBottomColor: '#090'}}>
                <Text style={{fontSize: 12, color: '#060', fontWeight: 'bold'}}>
                    ✅ [{title}]: {validChannels.length} 个频道
                </Text>
                {filterStats && (
                    <Text style={{fontSize: 9, color: '#333'}}>
                        初始{filterStats.initial} → 归档-{filterStats.afterArchived} → 手动-{filterStats.afterManual} → 自动-{filterStats.afterAuto} → 最终{filterStats.final}
                    </Text>
                )}
                <Text style={{fontSize: 9, color: '#333'}}>
                    height: {height}px, collapsed: {String(collapsed)}
                </Text>
            </View>
            <ClassifiedHeader
                title={title}
                collapsed={collapsed}
                onToggle={toggleCollapse}
            />
            <Animated.View style={animatedStyle}>
                <FlatList
                    data={validChannels}
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
