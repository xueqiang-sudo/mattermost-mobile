// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import {FlashList, type ListRenderItemInfo} from '@shopify/flash-list';
import React, {useCallback, useMemo, useState} from 'react';
import {useIntl} from 'react-intl';
import {Text, View} from 'react-native';
import {of as of$} from 'rxjs';
import {combineLatestWith, switchMap} from 'rxjs/operators';

import {switchToChannelById} from '@actions/remote/channel';
import ChannelItem from '@components/channel_item';
import {Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import SecurityManager from '@managers/security_manager';
import {observeMyGroupMessageChannels, observeMyJoinedTeamChannels} from '@queries/servers/channel';
import {queryJoinedTeams} from '@queries/servers/team';
import {dismissModal, popTopScreen} from '@screens/navigation';
import {removeChannelsFromArchivedTeams} from '@screens/find_channels/utils';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import MembershipTabs, {type JoinedMembershipTab} from './membership_tabs';

import type {WithDatabaseArgs} from '@typings/database/database';
import type ChannelModel from '@typings/database/models/servers/channel';
import type {AvailableScreens} from '@typings/screens/navigation';

const SCREEN_PADDING_H = 16;
const LIST_ESTIMATED_ITEM_SIZE = 64;

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    inner: {
        flex: 1,
        paddingHorizontal: SCREEN_PADDING_H,
        paddingTop: 16,
    },
    list: {
        flex: 1,
        marginTop: 8,
    },
    flashList: {
        flex: 1,
    },
    empty: {
        ...typography('Body', 200, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        paddingVertical: 24,
        textAlign: 'center',
    },
}));

type Props = {
    componentId: AvailableScreens;
    groupMessages: ChannelModel[];
    showTeamName: boolean;
    teamChannels: ChannelModel[];
};

const JoinedChannelsAndGroups = ({
    componentId,
    groupMessages,
    showTeamName,
    teamChannels,
}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const styles = getStyleSheet(theme);
    const [activeTab, setActiveTab] = useState<JoinedMembershipTab>('channels');

    const channelsForTab = activeTab === 'channels' ? teamChannels : groupMessages;

    const emptyMessage = activeTab === 'channels' ?
        intl.formatMessage({
            id: 'joined_channels.empty.channels',
            defaultMessage: 'No channels',
        }) :
        intl.formatMessage({
            id: 'joined_channels.empty.group_messages',
            defaultMessage: 'No group messages',
        });

    const onChannelPress = useCallback(async (channel: ChannelModel | Channel) => {
        await dismissModal({componentId: Screens.FIND_CHANNELS});
        switchToChannelById(serverUrl, channel.id);
    }, [serverUrl]);

    const renderItem = useCallback(({item}: ListRenderItemInfo<ChannelModel>) => (
        <ChannelItem
            channel={item}
            isOnCenterBg={true}
            onPress={onChannelPress}
            shouldHighlightState={true}
            showTeamName={showTeamName}
            testID='joined_channels.list.channel_item'
        />
    ), [onChannelPress, showTeamName]);

    const keyExtractor = useCallback((item: ChannelModel) => item.id, []);

    const onAndroidBack = useCallback(() => {
        void popTopScreen(componentId);
    }, [componentId]);

    useAndroidHardwareBackHandler(componentId, onAndroidBack);

    const listExtraData = useMemo(() => ({activeTab, showTeamName}), [activeTab, showTeamName]);

    return (
        <View
            style={styles.container}
            nativeID={SecurityManager.getShieldScreenId(componentId)}
            testID='joined_channels.screen'
        >
            <View style={styles.inner}>
                <MembershipTabs
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                />
                {channelsForTab.length === 0 ? (
                    <Text
                        style={styles.empty}
                        testID='joined_channels.empty'
                    >
                        {emptyMessage}
                    </Text>
                ) : (
                    <View style={styles.list} testID='joined_channels.list'>
                        <FlashList
                            data={channelsForTab}
                            estimatedItemSize={LIST_ESTIMATED_ITEM_SIZE}
                            extraData={listExtraData}
                            keyExtractor={keyExtractor}
                            renderItem={renderItem}
                            style={styles.flashList}
                        />
                    </View>
                )}
            </View>
        </View>
    );
};

const enhanced = withObservables([], ({database}: WithDatabaseArgs) => {
    const teamsCount = queryJoinedTeams(database).observeCount();
    const teamIds = queryJoinedTeams(database).observe().pipe(
        switchMap((teams) => of$(new Set(teams.map((t) => t.id)))),
    );

    const teamChannels = observeMyJoinedTeamChannels(database).pipe(
        combineLatestWith(teamIds),
        switchMap(([channels, tmIds]) => of$(removeChannelsFromArchivedTeams(channels, tmIds))),
    );

    const groupMessages = observeMyGroupMessageChannels(database);

    const showTeamName = teamsCount.pipe(
        switchMap((count) => of$(count > 1)),
    );

    return {
        groupMessages,
        showTeamName,
        teamChannels,
    };
});

export default withDatabase(enhanced(JoinedChannelsAndGroups));
