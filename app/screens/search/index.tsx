// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {FlatList, Keyboard, StyleSheet, Text, View} from 'react-native';
import {type Edge, SafeAreaView} from 'react-native-safe-area-context';

import {searchAllChannels} from '@actions/remote/channel';
import {searchProfiles} from '@actions/remote/user';
import ChannelItem, {ROW_HEIGHT_CENTER_LIST} from '@components/channel_item';
import CompassIcon from '@components/compass_icon';
import {General} from '@constants';
import DatabaseManager from '@database/manager';
import Loading from '@components/loading';
import SearchBar from '@components/search';
import UserItem from '@components/user_item';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {useDebounce} from '@hooks/utils';
import {queryUserChannelsByTypes} from '@queries/servers/channel';
import {getCurrentTeamId, getCurrentUserId} from '@queries/servers/system';
import {debugLog} from '@store/debug_log';
import {changeOpacity, getKeyboardAppearanceFromTheme, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';
import {username2Nickname} from '@utils/user';

import type ChannelModel from '@typings/database/models/servers/channel';
import type UserModel from '@typings/database/models/servers/user';

type ResultItem = {
    type: 'header' | 'contact' | 'channel';
    data?: UserModel | ChannelModel | Channel;
    title?: string;
    icon?: string;
};

const MAX_RESULTS = 20;

const getStyles = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    content: {
        flex: 1,
    },
    searchBarContainer: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: theme.sidebarBg,
    },
    inputContainerStyle: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
        borderRadius: 8,
        height: 36,
    },
    inputStyle: {
        color: theme.centerChannelColor,
        ...typography('Body', 200),
    },
    groupHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        marginTop: 8,
    },
    groupHeaderIcon: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginRight: 8,
    },
    groupHeaderTitle: {
        ...typography('Body', 200, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.72),
    },
    listContent: {
        paddingBottom: 24,
    },
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 48,
    },
    emptyText: {
        ...typography('Body', 200),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginTop: 16,
    },
}));

type Props = {
    componentId: string;
};

const SearchScreen = ({componentId}: Props) => {
    const theme = useTheme();
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const styles = getStyles(theme);
    const color = useMemo(() => changeOpacity(theme.centerChannelColor, 0.72), [theme]);

    const [term, setTerm] = useState('');
    const [loading, setLoading] = useState(false);
    const [contacts, setContacts] = useState<UserModel[]>([]);
    const [channels, setChannels] = useState<(ChannelModel | Channel)[]>([]);

    const mountedRef = useRef(false);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const doSearch = useDebounce(useCallback(async (searchTerm: string) => {
        if (!searchTerm.trim()) {
            setContacts([]);
            setChannels([]);
            setLoading(false);
            return;
        }

        setLoading(true);

        try {
            const teamId = await getCurrentTeamId(serverUrl);
            const lowerCasedTerm = searchTerm.toLowerCase();

            // Search contacts (users in current team)
            const usersResult = await searchProfiles(serverUrl, lowerCasedTerm, {
                team_id: teamId,
                allow_inactive: false,
            });

            // Search channels in current team
            const channelsResult = await searchAllChannels(serverUrl, lowerCasedTerm, true);

            if (!mountedRef.current) {
                return;
            }

            // Filter and sort contacts
            let filteredContacts: UserModel[] = [];
            if (!usersResult.error && usersResult.data) {
                filteredContacts = usersResult.data.slice(0, MAX_RESULTS);
            }

            // Filter and sort channels (only current team, exclude GM - we'll add them separately)
            let filteredChannels: (ChannelModel | Channel)[] = [];
            if (!channelsResult.error && channelsResult.channels) {
                filteredChannels = channelsResult.channels
                    .filter((c: Channel) => c.team_id === teamId && !c.delete_at && c.type !== General.GM_CHANNEL)
                    .slice(0, MAX_RESULTS);
            }

            // Find GM channels containing matched users
            try {
                const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
                const currentUserId = await getCurrentUserId(database);

                // Get current user's GM channel IDs (for intersection)
                const myGmChannels = await queryUserChannelsByTypes(
                    database,
                    currentUserId,
                    [General.GM_CHANNEL],
                ).fetch();
                const myGmChannelIdSet = new Set(myGmChannels.map((c) => c.id));

                // Get already-matched channel IDs to avoid duplicates
                const existingChannelIds = new Set(filteredChannels.map((c) => c.id));

                const gmChannelMap = new Map<string, ChannelModel>();

                // For each matched user, find GM channels they share with the current user
                for (const user of filteredContacts.slice(0, 10)) {
                    const userGmChannels = await queryUserChannelsByTypes(
                        database,
                        user.id,
                        [General.GM_CHANNEL],
                    ).fetch();

                    for (const ch of userGmChannels) {
                        if (existingChannelIds.has(ch.id) || gmChannelMap.has(ch.id)) {
                            continue;
                        }
                        // Only include if current user is also a member
                        if (myGmChannelIdSet.has(ch.id)) {
                            gmChannelMap.set(ch.id, ch);
                        }
                    }
                }

                const gmChannels = Array.from(gmChannelMap.values());
                filteredChannels = [...filteredChannels, ...gmChannels];
            } catch (gmError) {
                debugLog('Error finding GM channels for search:', gmError);
            }

            setContacts(filteredContacts);
            setChannels(filteredChannels);
        } catch (error) {
            console.error('Search error:', error);
        } finally {
            if (mountedRef.current) {
                setLoading(false);
            }
        }
    }, [serverUrl]), 300);

    const onChangeText = useCallback((text: string) => {
        setTerm(text);
        doSearch(text);
    }, [doSearch]);

    const buildListData = useMemo(() => {
        const data: ResultItem[] = [];

        if (!term.trim()) {
            return data;
        }

        // Add contacts section
        if (contacts.length > 0) {
            data.push({
                type: 'header',
                title: intl.formatMessage({id: 'search.contacts', defaultMessage: '联系人'}),
                icon: 'account-outline',
            });
            contacts.forEach((user) => {
                data.push({type: 'contact', data: user});
            });
        }

        // Add channels section
        if (channels.length > 0) {
            data.push({
                type: 'header',
                title: intl.formatMessage({id: 'search.channels', defaultMessage: '群聊'}),
                icon: 'forum-outline',
            });
            channels.forEach((channel) => {
                data.push({type: 'channel', data: channel});
            });
        }

        return data;
    }, [contacts, channels, term, intl]);

    const renderGroupHeader = useCallback((title: string, icon: string) => {
        return (
            <View style={styles.groupHeader}>
                <CompassIcon
                    name={icon}
                    size={18}
                    style={styles.groupHeaderIcon}
                />
                <Text style={styles.groupHeaderTitle}>{title}</Text>
            </View>
        );
    }, [styles]);

    const onContactPress = useCallback((user: UserModel) => {
        // TODO: Open direct message with user
        console.log('Open DM with:', user.username);
    }, []);

    const onChannelPress = useCallback((channel: ChannelModel | Channel) => {
        // TODO: Open channel
        console.log('Open channel:', channel.display_name);
    }, []);

    const renderItem = useCallback(({item}: {item: ResultItem}) => {
        if (item.type === 'header') {
            return renderGroupHeader(item.title || '', item.icon || '');
        }

        if (item.type === 'contact') {
            const user = item.data as UserModel;
            return (
                <UserItem
                    onUserPress={onContactPress}
                    user={user}
                    testID='search.user_item'
                    showBadges={true}
                />
            );
        }

        const channel = item.data as ChannelModel | Channel;
        return (
            <ChannelItem
                channel={channel}
                isOnCenterBg={true}
                onPress={onChannelPress}
                showChannelTypeTag={true}
                shouldHighlightState={true}
                testID='search.channel_item'
            />
        );
    }, [onContactPress, onChannelPress, renderGroupHeader, styles]);

    const renderEmpty = useCallback(() => {
        if (loading) {
            return (
                <View style={styles.emptyContainer}>
                    <Loading color={theme.centerChannelColor}/>
                    <Text style={styles.emptyText}>
                        {intl.formatMessage({id: 'search.searching', defaultMessage: '搜索中...'})}
                    </Text>
                </View>
            );
        }

        if (term.trim()) {
            return (
                <View style={styles.emptyContainer}>
                    <CompassIcon
                        name='magnify'
                        size={64}
                        color={changeOpacity(theme.centerChannelColor, 0.32)}
                    />
                    <Text style={styles.emptyText}>
                        {intl.formatMessage(
                            {id: 'search.no_results', defaultMessage: '未找到"{term}"相关结果'},
                            {term},
                        )}
                    </Text>
                </View>
            );
        }

        return null;
    }, [loading, term, intl, theme, styles]);

    return (
        <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.container}>
            <View style={styles.searchBarContainer}>
                <SearchBar
                    autoCapitalize='none'
                    autoFocus={true}
                    clearIconColor={color}
                    inputContainerStyle={styles.inputContainerStyle}
                    inputStyle={styles.inputStyle}
                    keyboardAppearance={getKeyboardAppearanceFromTheme(theme)}
                    onChangeText={onChangeText}
                    placeholder={intl.formatMessage({id: 'search.placeholder', defaultMessage: '搜索联系人和群聊'})}
                    placeholderTextColor={color}
                    searchIconColor={color}
                    selectionColor={theme.buttonBg}
                    showCancel={false}
                    showLoading={loading}
                    value={term}
                    testID='search.search_bar'
                />
            </View>
            <View style={styles.content}>
                <FlatList
                    data={buildListData}
                    renderItem={renderItem}
                    keyExtractor={(item, index) => {
                        if (item.type === 'header') {
                            return `header-${item.title}`;
                        }
                        if (item.type === 'contact') {
                            return `contact-${(item.data as UserModel).id}`;
                        }
                        const channel = item.data as ChannelModel | Channel;
                        return `channel-${channel.id}`;
                    }}
                    ListEmptyComponent={renderEmpty}
                    contentContainerStyle={styles.listContent}
                    keyboardDismissMode='interactive'
                    keyboardShouldPersistTaps='handled'
                    showsVerticalScrollIndicator={false}
                    testID='search.flat_list'
                />
            </View>
        </SafeAreaView>
    );
};

export default SearchScreen;
