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

const isDirectChannel = (c: ChannelModel) => c.type === General.DM_CHANNEL;
const isTeamOpenOrPrivate = (c: ChannelModel) => c.type === General.OPEN_CHANNEL || c.type === General.PRIVATE_CHANNEL;
const isDiscussionGroup = (c: ChannelModel) => c.type === General.GM_CHANNEL;

const shouldShowChannelTypeTag = (c: ChannelModel) =>
    isTeamOpenOrPrivate(c) || isDiscussionGroup(c);

type Props = {
    category: FindChannelsCategory;
    close: () => Promise<void>;
    currentTeamDisplayName: string;
    enableInternalGroups: boolean;
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

const buildSections = (recentChannels: ChannelModel[], category: FindChannelsCategory, enableInternalGroups: boolean) => {
    let filtered: ChannelModel[];
    if (enableInternalGroups) {
        filtered = category === 'all' ? recentChannels :
            category === 'contacts' ? recentChannels.filter(isDirectChannel) :
                category === 'channels' ? recentChannels.filter(isTeamOpenOrPrivate) :
                    recentChannels.filter(isDiscussionGroup);
    } else {
        filtered = category === 'all' ? recentChannels :
            category === 'contacts' ? recentChannels.filter(isDirectChannel) :
                category === 'channels_and_discussion' ?
                    recentChannels.filter((c) => isTeamOpenOrPrivate(c) || isDiscussionGroup(c)).sort((a, b) => {
                        const aIsDefault = a.name === General.DEFAULT_CHANNEL;
                        const bIsDefault = b.name === General.DEFAULT_CHANNEL;
                        if (aIsDefault && !bIsDefault) {
                            return -1;
                        }
                        if (!aIsDefault && bIsDefault) {
                            return 1;
                        }
                        return (b.updateAt || 0) - (a.updateAt || 0);
                    }) :
                    recentChannels;
    }
    const sections = [];
    if (filtered.length) {
        sections.push({
            ...sectionNames.recent,
            data: filtered,
        });
    }

    return sections;
};

const UnfilteredList = ({category, close, currentTeamDisplayName, enableInternalGroups, keyboardOverlap, recentChannels, showTeamName, testID}: Props) => {
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const [sections, setSections] = useState(buildSections(recentChannels, category, enableInternalGroups));
    const sectionListStyle = useMemo(() => ({paddingBottom: keyboardOverlap}), [keyboardOverlap]);

    const onPress = useCallback(async (c: Channel | ChannelModel) => {
        await close();
        switchToChannelById(serverUrl, c.id);
    }, [serverUrl, close]);

    const renderSectionHeader = useCallback(({section}: SectionListRenderItemInfo<ChannelModel>) => (
        <FindChannelsHeader
            sectionName={intl.formatMessage({id: section.id, defaultMessage: section.defaultMessage})}
            teamDisplayName={currentTeamDisplayName}
        />
    ), [currentTeamDisplayName, intl]);

    const renderSectionItem = useCallback(({item, index}: SectionListRenderItemInfo<ChannelModel>) => {
        return (
            <ChannelItem
                channel={item}
                onPress={onPress}
                isOnCenterBg={true}
                listRowIndex={index}
                showChannelTypeTag={shouldShowChannelTypeTag(item)}
                showTeamName={showTeamName}
                shouldHighlightState={true}
                testID={`${testID}.channel_item`}
                useListInitialsForNonDm={true}
            />
        );
    }, [onPress, showTeamName, testID]);

    useEffect(() => {
        setSections(buildSections(recentChannels, category, enableInternalGroups));
    }, [recentChannels, category, enableInternalGroups]);

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
