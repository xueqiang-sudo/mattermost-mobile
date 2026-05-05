// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {Alert, FlatList, type ListRenderItemInfo, Platform, StyleSheet, View} from 'react-native';
import Animated, {FadeInDown, FadeOutUp} from 'react-native-reanimated';

import {joinChannelIfNeeded, makeDirectChannel, searchAllChannels, switchToChannelById} from '@actions/remote/channel';
import {searchProfiles} from '@actions/remote/user';
import ChannelItem, {ROW_HEIGHT_CENTER_LIST} from '@components/channel_item';
import Loading from '@components/loading';
import NoResultsWithTerm from '@components/no_results_with_term';
import UserItem from '@components/user_item';
import {General} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {useDebounce} from '@hooks/utils';
import {sortChannelsByDisplayName} from '@utils/channel';
import {getChannelListModalRowSurfaceStyle} from '@utils/channel_list_modal_row';
import {username2Nickname} from '@utils/user';

import type {FindChannelsCategory} from '@screens/find_channels/category_tabs';
import type ChannelModel from '@typings/database/models/servers/channel';
import type UserModel from '@typings/database/models/servers/user';

type ResultItem = ChannelModel|Channel|UserModel;

type RemoteChannels = {
    archived: Channel[];
    startWith: Channel[];
    matches: Channel[];
}

const isTeamOpenOrPrivate = (c: ChannelModel | Channel) => {
    const type = 'type' in c ? c.type : (c as Channel).type;
    return type === General.OPEN_CHANNEL || type === General.PRIVATE_CHANNEL;
};

const isDiscussionGroupChannel = (c: ChannelModel | Channel) => {
    const type = 'type' in c ? c.type : (c as Channel).type;
    return type === General.GM_CHANNEL;
};

const showChannelTypeTagForChannel = (c: ChannelModel | Channel) => {
    const type = 'type' in c ? c.type : (c as Channel).type;
    return type === General.OPEN_CHANNEL || type === General.PRIVATE_CHANNEL || type === General.GM_CHANNEL;
};

type Props = {
    archivedChannels: ChannelModel[];
    category: FindChannelsCategory;
    close: () => Promise<void>;
    channelsMatch: ChannelModel[];
    channelsMatchStart: ChannelModel[];
    currentTeamId: string;
    keyboardOverlap: number;
    loading: boolean;
    onLoading: (loading: boolean) => void;
    restrictDirectMessage: boolean;
    showTeamName: boolean;
    teamIds: Set<string>;
    teammateDisplayNameSetting: string;
    term: string;
    usersMatch: UserModel[];
    usersMatchStart: UserModel[];
    testID?: string;
}

const style = StyleSheet.create({
    flex: {flex: 1},
    noResultContainer: {
        flexGrow: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
});

export const MAX_RESULTS = 20;

const sortByLastPostAt = (a: Channel, b: Channel) => {
    return a.last_post_at > b.last_post_at ? 1 : -1;
};

const sortByUserOrChannel = <T extends Channel |UserModel>(locale: string, a: T, b: T): number => {
    const aDisplayName = 'display_name' in a ? a.display_name : username2Nickname(a, {locale});
    const bDisplayName = 'display_name' in b ? b.display_name : username2Nickname(b, {locale});

    return aDisplayName.toLowerCase().localeCompare(bDisplayName.toLowerCase(), locale, {numeric: true});
};

const FilteredList = ({
    archivedChannels, category, close, channelsMatch, channelsMatchStart, currentTeamId,
    keyboardOverlap, loading, onLoading, restrictDirectMessage, showTeamName,
    teamIds, teammateDisplayNameSetting: _teammateDisplayNameSetting, term, usersMatch, usersMatchStart, testID,
}: Props) => {
    const mounted = useRef(false);
    const serverUrl = useServerUrl();
    const theme = useTheme();
    const {locale, formatMessage} = useIntl();
    const flatListStyle = useMemo(() => ({flexGrow: 1, paddingBottom: keyboardOverlap}), [keyboardOverlap]);
    const [remoteChannels, setRemoteChannels] = useState<RemoteChannels>({archived: [], startWith: [], matches: []});

    const totalLocalResults = channelsMatchStart.length + channelsMatch.length + usersMatchStart.length;

    const search = useDebounce(useCallback(async () => {
        onLoading(true);
        if (mounted.current) {
            setRemoteChannels({archived: [], startWith: [], matches: []});
        }
        const lowerCasedTerm = (term.startsWith('@') ? term.substring(1) : term).toLowerCase();
        if ((channelsMatchStart.length + channelsMatch.length) < MAX_RESULTS) {
            if (restrictDirectMessage) {
                searchProfiles(serverUrl, lowerCasedTerm, {team_id: currentTeamId, allow_inactive: true});
            } else {
                searchProfiles(serverUrl, lowerCasedTerm, {allow_inactive: true});
            }
        }

        if (!term.startsWith('@')) {
            if (totalLocalResults < MAX_RESULTS) {
                const {channels} = await searchAllChannels(serverUrl, lowerCasedTerm, true);
                if (channels) {
                    const existingChannelIds = new Set(channelsMatchStart.concat(channelsMatch).concat(archivedChannels).map((c) => c.id));
                    const [startWith, matches, archived] = channels.reduce<[Channel[], Channel[], Channel[]]>(([s, m, a], c) => {
                        if (existingChannelIds.has(c.id)) {
                            return [s, m, a];
                        }
                        if (c.team_id && !teamIds.has(c.team_id)) {
                            return [s, m, a];
                        }
                        if (currentTeamId && c.team_id && c.team_id !== currentTeamId) {
                            return [s, m, a];
                        }
                        if (!c.team_id && (c.type === General.DM_CHANNEL || c.type === General.GM_CHANNEL)) {
                            return [s, m, a];
                        }
                        if (!c.delete_at) {
                            if (c.display_name.toLowerCase().startsWith(lowerCasedTerm)) {
                                return [[...s, c], m, a];
                            }
                            if (c.display_name.toLowerCase().includes(lowerCasedTerm)) {
                                return [s, [...m, c], a];
                            }
                            return [s, m, a];
                        }

                        if (c.display_name.toLowerCase().includes(lowerCasedTerm)) {
                            return [s, m, [...a, c]];
                        }

                        return [s, m, a];
                    }, [[], [], []]);

                    if (mounted.current) {
                        setRemoteChannels({
                            archived: archived.sort(sortChannelsByDisplayName.bind(null, locale)).slice(0, MAX_RESULTS + 1),
                            startWith: startWith.sort(sortByLastPostAt).slice(0, MAX_RESULTS + 1),
                            matches: matches.sort(sortChannelsByDisplayName.bind(null, locale)).slice(0, MAX_RESULTS + 1),
                        });
                    }
                }
            }
        }

        onLoading(false);
    }, [archivedChannels, channelsMatch, channelsMatchStart, currentTeamId, locale, onLoading, restrictDirectMessage, serverUrl, teamIds, term, totalLocalResults]), 500);

    const onJoinChannel = useCallback(async (c: Channel | ChannelModel) => {
        const res = await joinChannelIfNeeded(serverUrl, c.id);
        const displayName = 'display_name' in c ? c.display_name : c.displayName;
        if ('error' in res) {
            Alert.alert(
                '',
                formatMessage({
                    id: 'mobile.join_channel.error',
                    defaultMessage: "We couldn't join the channel {displayName}.",
                }, {displayName}),
            );
            return;
        }

        await close();
        switchToChannelById(serverUrl, c.id, undefined, true);
    }, [serverUrl, close, formatMessage]);

    const onOpenDirectMessage = useCallback(async (u: UserProfile | UserModel) => {
        const displayName = username2Nickname(u, {locale});
        const {data, error} = await makeDirectChannel(serverUrl, u.id, displayName, false, currentTeamId);
        if (error || !data) {
            Alert.alert(
                '',
                formatMessage({
                    id: 'mobile.direct_message.error',
                    defaultMessage: "We couldn't open a DM with {displayName}.",
                }, {displayName}),
            );
            return;
        }

        await close();
        switchToChannelById(serverUrl, data.id);
    }, [locale, serverUrl, close, formatMessage, currentTeamId]);

    const onSwitchToChannel = useCallback(async (c: Channel | ChannelModel) => {
        await close();
        switchToChannelById(serverUrl, c.id);
    }, [serverUrl, close]);

    const renderEmpty = useCallback(() => {
        if (loading) {
            return (
                <Loading
                    containerStyle={style.noResultContainer}
                    size='large'
                    color={theme.buttonBg}
                />
            );
        }

        if (term) {
            return (
                <View style={style.noResultContainer}>
                    <NoResultsWithTerm term={term}/>
                </View>
            );
        }

        return null;
    }, [term, loading, theme]);

    const listRowSurface = useMemo(() => getChannelListModalRowSurfaceStyle(theme), [theme]);

    const renderItem = useCallback(({item, index}: ListRenderItemInfo<ResultItem>) => {
        if ('teamId' in item) {
            return (
                <ChannelItem
                    channel={item}
                    isOnCenterBg={true}
                    listRowIndex={index}
                    onPress={onSwitchToChannel}
                    showChannelTypeTag={showChannelTypeTagForChannel(item)}
                    showTeamName={showTeamName}
                    shouldHighlightState={true}
                    testID='find_channels.filtered_list.channel_item'
                    useListInitialsForNonDm={true}
                />
            );
        }

        if ('username' in item) {
            return (
                <UserItem
                    containerStyle={[listRowSurface, {minHeight: ROW_HEIGHT_CENTER_LIST}]}
                    onUserPress={onOpenDirectMessage}
                    user={item}
                    testID='find_channels.filtered_list.user_item'
                    showBadges={true}
                />
            );
        }

        return (
            <ChannelItem
                channel={item}
                isOnCenterBg={true}
                listRowIndex={index}
                onPress={onJoinChannel}
                showChannelTypeTag={showChannelTypeTagForChannel(item)}
                showTeamName={showTeamName}
                shouldHighlightState={true}
                testID='find_channels.filtered_list.remote_channel_item'
                useListInitialsForNonDm={true}
            />
        );
    }, [listRowSurface, onJoinChannel, onOpenDirectMessage, onSwitchToChannel, showTeamName]);

    const data = useMemo(() => {
        const items: ResultItem[] = [];
        const showChannels = category === 'all' || category === 'channels' || category === 'discussion_groups';
        const showUsers = category === 'all' || category === 'contacts';

        const filterChannelByCategory = (c: ChannelModel | Channel) => {
            if (category === 'channels') {
                return isTeamOpenOrPrivate(c);
            }
            if (category === 'discussion_groups') {
                return isDiscussionGroupChannel(c);
            }
            return true;
        };

        if (showChannels) {
            const groupChannelsStart = category === 'all' ?
                channelsMatchStart :
                channelsMatchStart.filter(filterChannelByCategory);
            items.push(...groupChannelsStart);

            // Channels that matches
            if (items.length < MAX_RESULTS) {
                const groupChannelsMatch = category === 'all' ?
                    channelsMatch :
                    channelsMatch.filter(filterChannelByCategory);
                items.push(...groupChannelsMatch);
            }
        }

        if (showUsers) {
            // Users that start with
            if (items.length < MAX_RESULTS) {
                items.push(...usersMatchStart);
            }
        }

        if (showChannels) {
            // Archived channels local
            if (items.length < MAX_RESULTS) {
                const archivedSource = category === 'all' ?
                    archivedChannels :
                    archivedChannels.filter(filterChannelByCategory);
                const archivedAlpha = archivedSource.
                    sort(sortChannelsByDisplayName.bind(null, locale));
                items.push(...archivedAlpha.slice(0, MAX_RESULTS + 1));
            }

            // Remote Channels that start with
            if (items.length < MAX_RESULTS) {
                const startWith = category === 'all' ?
                    remoteChannels.startWith :
                    remoteChannels.startWith.filter(filterChannelByCategory);
                items.push(...startWith);
            }

            // Users & Channels that matches
            if (items.length < MAX_RESULTS) {
                const matches = category === 'all' ?
                    remoteChannels.matches :
                    remoteChannels.matches.filter(filterChannelByCategory);
                const toSort = showUsers ? [...usersMatch, ...matches] : [...matches];
                const sortedByAlpha = toSort.sort(sortByUserOrChannel.bind(null, locale));
                items.push(...sortedByAlpha.slice(0, MAX_RESULTS + 1));
            }

            // Archived channels (remote)
            if (items.length < MAX_RESULTS) {
                const archivedRemoteSource = category === 'all' ?
                    remoteChannels.archived :
                    remoteChannels.archived.filter(filterChannelByCategory);
                const archivedAlpha = archivedRemoteSource.
                    sort(sortChannelsByDisplayName.bind(null, locale));
                items.push(...archivedAlpha.slice(0, MAX_RESULTS + 1));
            }
        }

        if (showUsers && !showChannels) {
            // Contacts-only: add usersMatch
            if (items.length < MAX_RESULTS) {
                items.push(...usersMatch);
            }
        }

        return [...new Set(items)].slice(0, MAX_RESULTS + 1);
    }, [archivedChannels, category, channelsMatchStart, channelsMatch, remoteChannels, usersMatch, usersMatchStart, locale, term]);

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    useEffect(() => {
        search();

        // We only want to search if the term changes
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [term]);

    return (
        <Animated.View
            entering={FadeInDown.duration(100)}
            exiting={Platform.select({ios: FadeOutUp.duration(100)}) /* https://mattermost.atlassian.net/browse/MM-63814?focusedCommentId=178584 */}
            style={style.flex}
        >
            <FlatList
                contentContainerStyle={flatListStyle}
                keyboardDismissMode='interactive'
                keyboardShouldPersistTaps='handled'
                ListEmptyComponent={renderEmpty}
                renderItem={renderItem}
                data={data}
                showsVerticalScrollIndicator={false}
                testID={`${testID}.flat_list`}
            />
        </Animated.View>
    );
};

export default FilteredList;
