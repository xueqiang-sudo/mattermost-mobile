// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {defineMessages, useIntl} from 'react-intl';
import {Platform, SectionList, type SectionListRenderItemInfo, StyleSheet} from 'react-native';
import Animated, {FadeInDown, FadeOutUp} from 'react-native-reanimated';

import {switchToChannelById} from '@actions/remote/channel';
import ChannelItem from '@components/channel_item';
import {General} from '@constants';
import {useServerUrl} from '@context/server';

import FindChannelsHeader from './header';

import type {FindChannelsCategory} from '@screens/find_channels/category_tabs';
import type ChannelModel from '@typings/database/models/servers/channel';

const isGroupChannel = (c: ChannelModel) => c.type === General.GM_CHANNEL || c.type === General.OPEN_CHANNEL || c.type === General.PRIVATE_CHANNEL;
const isDirectChannel = (c: ChannelModel) => c.type === General.DM_CHANNEL;

type Props = {
    category: FindChannelsCategory;
    close: () => Promise<void>;
    keyboardOverlap: number;
    recentChannels: ChannelModel[];
    showTeamName: boolean;
    testID?: string;
}

const sectionNames = defineMessages({
    recent: {
        id: 'mobile.channel_list.recent',
        defaultMessage: 'Recent',
    },
});

const style = StyleSheet.create({
    flex: {flex: 1},
});

const buildSections = (recentChannels: ChannelModel[], category: FindChannelsCategory) => {
    const filtered = category === 'all' ? recentChannels :
        category === 'contacts' ? recentChannels.filter(isDirectChannel) :
            recentChannels.filter(isGroupChannel);
    const sections = [];
    if (filtered.length) {
        sections.push({
            ...sectionNames.recent,
            data: filtered,
        });
    }

    return sections;
};

const UnfilteredList = ({category, close, keyboardOverlap, recentChannels, showTeamName, testID}: Props) => {
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const [sections, setSections] = useState(buildSections(recentChannels, category));
    const sectionListStyle = useMemo(() => ({paddingBottom: keyboardOverlap}), [keyboardOverlap]);

    const onPress = useCallback(async (c: Channel | ChannelModel) => {
        await close();
        switchToChannelById(serverUrl, c.id);
    }, [serverUrl, close]);

    const renderSectionHeader = useCallback(({section}: SectionListRenderItemInfo<ChannelModel>) => (
        <FindChannelsHeader sectionName={intl.formatMessage({id: section.id, defaultMessage: section.defaultMessage})}/>
    ), [intl]);

    const renderSectionItem = useCallback(({item}: SectionListRenderItemInfo<ChannelModel>) => {
        return (
            <ChannelItem
                channel={item}
                onPress={onPress}
                isOnCenterBg={true}
                showTeamName={showTeamName}
                shouldHighlightState={true}
                testID={`${testID}.channel_item`}
            />
        );
    }, [onPress, showTeamName, testID]);

    useEffect(() => {
        setSections(buildSections(recentChannels, category));
    }, [recentChannels, category]);

    return (
        <Animated.View
            entering={FadeInDown.duration(200)}
            exiting={Platform.select({ios: FadeOutUp.duration(100)}) /* https://mattermost.atlassian.net/browse/MM-63814?focusedCommentId=178584 */}
            style={style.flex}
        >
            <SectionList
                contentContainerStyle={sectionListStyle}
                keyboardDismissMode='interactive'
                keyboardShouldPersistTaps='handled'
                renderItem={renderSectionItem}
                renderSectionHeader={renderSectionHeader}
                sections={sections}
                showsVerticalScrollIndicator={false}
                stickySectionHeadersEnabled={true}
                testID={`${testID}.section_list`}
            />
        </Animated.View>
    );
};

export default UnfilteredList;
