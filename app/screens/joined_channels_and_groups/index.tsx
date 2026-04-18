// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import {FlashList, type ListRenderItemInfo} from '@shopify/flash-list';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {Text, View} from 'react-native';
import {of as of$} from 'rxjs';
import {combineLatestWith, distinctUntilChanged, map, switchMap} from 'rxjs/operators';

import {fetchGroupMessageMembersCommonTeams, switchToChannelById} from '@actions/remote/channel';
import ChannelItem, {ROW_HEIGHT_CENTER_LIST} from '@components/channel_item';
import Loading from '@components/loading';
import {Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import SecurityManager from '@managers/security_manager';
import {
    observeMyArchivedGroupMessageChannels,
    observeMyArchivedTeamChannelsForCurrentTeam,
    observeMyGroupMessageChannels,
    observeMyJoinedTeamChannelsForCurrentTeam,
    sortChannelsForJoinedArchivedList,
} from '@queries/servers/channel';
import {observeCurrentTeamId} from '@queries/servers/system';
import {queryJoinedTeams} from '@queries/servers/team';
import {dismissModal, popTopScreen} from '@screens/navigation';
import {removeChannelsFromArchivedTeams} from '@screens/find_channels/utils';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';
import {logError} from '@utils/log';

import MembershipTabs, {type JoinedMembershipTab} from './membership_tabs';

import type {WithDatabaseArgs} from '@typings/database/database';
import type ChannelModel from '@typings/database/models/servers/channel';
import type {AvailableScreens} from '@typings/screens/navigation';

const SCREEN_PADDING_H = 16;
const LIST_ESTIMATED_ITEM_SIZE = ROW_HEIGHT_CENTER_LIST;
const GM_COMMON_TEAMS_CONCURRENCY = 4;

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
    banner: {
        ...typography('Body', 75, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        paddingVertical: 8,
        textAlign: 'center',
    },
    bannerError: {
        color: theme.errorTextColor,
    },
    loadingFill: {
        flex: 1,
        minHeight: 120,
        justifyContent: 'center',
        alignItems: 'center',
    },
}));

type GmEnterpriseFilterStatus = 'idle' | 'loading' | 'done' | 'error';

type Props = {
    componentId: AvailableScreens;
    groupMessages: ChannelModel[];
    showTeamName: boolean;
    teamChannels: ChannelModel[];
    archivedTeamChannels: ChannelModel[];
    archivedGmCandidates: ChannelModel[];
    currentTeamId: string;
};

const JoinedChannelsAndGroups = ({
    componentId,
    groupMessages,
    showTeamName,
    teamChannels,
    archivedTeamChannels,
    archivedGmCandidates,
    currentTeamId,
}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const styles = getStyleSheet(theme);
    const [activeTab, setActiveTab] = useState<JoinedMembershipTab>('channels');
    const [archivedEnterpriseGms, setArchivedEnterpriseGms] = useState<ChannelModel[]>([]);
    const [gmEnterpriseFilterStatus, setGmEnterpriseFilterStatus] = useState<GmEnterpriseFilterStatus>('idle');
    const commonTeamsCache = useRef(new Map<string, boolean>());

    const archivedGmCandidateIds = useMemo(
        () => archivedGmCandidates.map((c) => c.id).sort().join(','),
        [archivedGmCandidates],
    );

    useEffect(() => {
        commonTeamsCache.current.clear();
    }, [currentTeamId, serverUrl]);

    useEffect(() => {
        if (activeTab !== 'archived') {
            setGmEnterpriseFilterStatus('idle');
            return;
        }
        if (!currentTeamId || !serverUrl) {
            setGmEnterpriseFilterStatus('done');
            setArchivedEnterpriseGms([]);
            return;
        }

        const ac = new AbortController();
        const candidates = archivedGmCandidates;

        if (candidates.length === 0) {
            setArchivedEnterpriseGms([]);
            setGmEnterpriseFilterStatus('done');
            return;
        }

        setGmEnterpriseFilterStatus('loading');
        setArchivedEnterpriseGms([]);

        const run = async () => {
            const kept: ChannelModel[] = [];
            try {
                for (let i = 0; i < candidates.length; i += GM_COMMON_TEAMS_CONCURRENCY) {
                    if (ac.signal.aborted) {
                        return;
                    }
                    const chunk = candidates.slice(i, i + GM_COMMON_TEAMS_CONCURRENCY);
                    const results = await Promise.all(
                        chunk.map(async (ch) => {
                            const cacheKey = `${serverUrl}\0${currentTeamId}\0${ch.id}`;
                            const cached = commonTeamsCache.current.get(cacheKey);
                            if (cached !== undefined) {
                                return cached ? ch : null;
                            }
                            const res = await fetchGroupMessageMembersCommonTeams(serverUrl, ch.id);
                            if (ac.signal.aborted) {
                                return null;
                            }
                            if ('error' in res && res.error) {
                                logError('[JoinedChannelsAndGroups.filterArchivedGMs]', res.error);
                                commonTeamsCache.current.set(cacheKey, false);
                                return null;
                            }
                            const teams = res.teams ?? [];
                            const match = teams.some((t) => t.id === currentTeamId);
                            commonTeamsCache.current.set(cacheKey, match);
                            return match ? ch : null;
                        }),
                    );
                    for (const row of results) {
                        if (row) {
                            kept.push(row);
                        }
                    }
                }
                if (!ac.signal.aborted) {
                    setArchivedEnterpriseGms(kept);
                    setGmEnterpriseFilterStatus('done');
                }
            } catch (e) {
                if (!ac.signal.aborted) {
                    logError('[JoinedChannelsAndGroups.filterArchivedGMs]', e);
                    setArchivedEnterpriseGms([]);
                    setGmEnterpriseFilterStatus('error');
                }
            }
        };

        void run();
        return () => ac.abort();
    }, [activeTab, archivedGmCandidateIds, archivedGmCandidates, currentTeamId, serverUrl]);

    const archivedListData = useMemo(
        () => sortChannelsForJoinedArchivedList([...archivedTeamChannels, ...archivedEnterpriseGms]),
        [archivedTeamChannels, archivedEnterpriseGms],
    );

    const channelsForTab = activeTab === 'channels' ?
        teamChannels :
        activeTab === 'group_messages' ?
            groupMessages :
            archivedListData;

    const emptyMessage = activeTab === 'channels' ?
        intl.formatMessage({
            id: 'joined_channels.empty.channels',
            defaultMessage: 'No groups',
        }) :
        activeTab === 'group_messages' ?
            intl.formatMessage({
                id: 'joined_channels.empty.group_messages',
                defaultMessage: 'No discussion groups',
            }) :
            intl.formatMessage({
                id: 'joined_channels.empty.archived',
                defaultMessage: 'No archived groups or discussion groups',
            });

    const onChannelPress = useCallback(async (channel: ChannelModel | Channel) => {
        await dismissModal({componentId: Screens.FIND_CHANNELS});
        switchToChannelById(serverUrl, channel.id);
    }, [serverUrl]);

    const showChannelTypeTag = activeTab === 'archived';

    const renderItem = useCallback(({item, index}: ListRenderItemInfo<ChannelModel>) => (
        <ChannelItem
            channel={item}
            isOnCenterBg={true}
            listRowIndex={index}
            onPress={onChannelPress}
            shouldHighlightState={true}
            showChannelTypeTag={showChannelTypeTag}
            showTeamName={showTeamName}
            testID='joined_channels.list.channel_item'
            useListInitialsForNonDm={true}
        />
    ), [onChannelPress, showChannelTypeTag, showTeamName]);

    const keyExtractor = useCallback((item: ChannelModel) => item.id, []);

    const onAndroidBack = useCallback(() => {
        void popTopScreen(componentId);
    }, [componentId]);

    useAndroidHardwareBackHandler(componentId, onAndroidBack);

    const listExtraData = useMemo(
        () => ({activeTab, showTeamName, showChannelTypeTag}),
        [activeTab, showChannelTypeTag, showTeamName],
    );

    const showArchivedGmLoading =
        activeTab === 'archived' &&
        gmEnterpriseFilterStatus === 'loading' &&
        archivedGmCandidates.length > 0;

    const showArchivedGmError =
        activeTab === 'archived' &&
        gmEnterpriseFilterStatus === 'error';

    const showArchivedFullScreenLoading =
        activeTab === 'archived' &&
        gmEnterpriseFilterStatus === 'loading' &&
        archivedTeamChannels.length === 0 &&
        archivedGmCandidates.length > 0;

    const showEmptyState =
        channelsForTab.length === 0 &&
        !(activeTab === 'archived' && showArchivedFullScreenLoading);

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
                {showArchivedGmLoading && (
                    <Text style={styles.banner}>
                        {intl.formatMessage({
                            id: 'joined_channels.archived_gms_loading',
                            defaultMessage: 'Loading archived discussion groups…',
                        })}
                    </Text>
                )}
                {showArchivedGmError && (
                    <Text style={[styles.banner, styles.bannerError]}>
                        {intl.formatMessage({
                            id: 'joined_channels.archived_gms_filter_error',
                            defaultMessage: 'Could not load all archived discussion groups. Pull to refresh or try again later.',
                        })}
                    </Text>
                )}
                {showArchivedFullScreenLoading ? (
                    <View style={styles.loadingFill}>
                        <Loading/>
                    </View>
                ) : showEmptyState ? (
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
    const teamIds = queryJoinedTeams(database).observe().pipe(
        switchMap((teams) => of$(new Set(teams.map((t) => t.id)))),
    );

    const teamChannels = observeMyJoinedTeamChannelsForCurrentTeam(database).pipe(
        combineLatestWith(teamIds),
        switchMap(([channels, tmIds]) => of$(removeChannelsFromArchivedTeams(channels, tmIds))),
    );

    const groupMessages = observeMyGroupMessageChannels(database);

    const archivedTeamChannels = observeMyArchivedTeamChannelsForCurrentTeam(database).pipe(
        combineLatestWith(teamIds),
        switchMap(([channels, tmIds]) => of$(removeChannelsFromArchivedTeams(channels, tmIds))),
    );

    const archivedGmCandidates = observeMyArchivedGroupMessageChannels(database);

    const currentTeamId = observeCurrentTeamId(database).pipe(
        map((id) => id || ''),
        distinctUntilChanged(),
    );

    return {
        groupMessages,
        showTeamName: of$(false),
        teamChannels,
        archivedTeamChannels,
        archivedGmCandidates,
        currentTeamId,
    };
});

export default withDatabase(enhanced(JoinedChannelsAndGroups));
