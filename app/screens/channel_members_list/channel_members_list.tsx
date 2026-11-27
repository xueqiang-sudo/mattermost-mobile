// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useMemo, useState} from 'react';
import {useIntl} from 'react-intl';
import {FlatList, StyleSheet, Text, TextInput, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {observeChannelMembers} from '@queries/servers/channel';
import {observeUser} from '@queries/servers/user';
import {getThemeFromState} from '@selectors/theme';
import {makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';
import {changeOpacity} from '@utils/theme';
import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import {useDatabase} from '@context/database';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import ProfilePicture from '@components/profile_picture';
import CompassIcon from '@components/compass_icon';
import {displayUsername} from '@utils/user';
import {Screens} from '@constants';
import {dismissModal} from '@screens/navigation';

import type {WithDatabaseArgs} from '@typings/database/database';
import type UserModel from '@typings/database/models/servers/user';
import type ChannelMembershipModel from '@typings/database/models/servers/channel_membership';

type Props = {
    channelId: string;
    componentId: string;
    members: ChannelMembershipModel[];
    users: UserModel[];
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    searchIcon: {
        color: changeOpacity(theme.centerChannelColor, 0.5),
        marginRight: 8,
    },
    searchInput: {
        flex: 1,
        color: theme.centerChannelColor,
        ...typography('Body', 200, 'Regular'),
        padding: 0,
    },
    list: {
        flex: 1,
    },
    memberItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    avatar: {
        marginRight: 12,
    },
    memberInfo: {
        flex: 1,
    },
    memberName: {
        color: theme.centerChannelColor,
        ...typography('Body', 200, 'SemiBold'),
    },
    memberUsername: {
        color: changeOpacity(theme.centerChannelColor, 0.64),
        ...typography('Body', 75, 'Regular'),
        marginTop: 2,
    },
    separator: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.1),
        marginLeft: 72,
    },
}));

const ChannelMembersList = ({channelId, componentId, members, users}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const [searchTerm, setSearchTerm] = useState('');

    // Build a user map for quick lookup
    const userMap = useMemo(() => {
        const map = new Map<string, UserModel>();
        users.forEach((u) => map.set(u.id, u));
        return map;
    }, [users]);

    // Sort members: bots first, then alphabetically
    const sortedMembers = useMemo(() => {
        return members.slice().sort((a, b) => {
            const userA = userMap.get(a.userId);
            const userB = userMap.get(b.userId);

            // Bots first
            const isBotA = userA?.isBot ? 1 : 0;
            const isBotB = userB?.isBot ? 1 : 0;
            if (isBotB !== isBotA) {
                return isBotB - isBotA;
            }

            // Then alphabetically by display name
            const nameA = userA ? displayUsername(userA) : '';
            const nameB = userB ? displayUsername(userB) : '';
            return nameA.localeCompare(nameB);
        });
    }, [members, userMap]);

    // Filter members by search term
    const filteredMembers = useMemo(() => {
        if (!searchTerm.trim()) {
            return sortedMembers;
        }
        const term = searchTerm.toLowerCase();
        return sortedMembers.filter((member) => {
            const user = userMap.get(member.userId);
            if (!user) {
                return false;
            }
            const displayName = displayUsername(user).toLowerCase();
            const username = (user.username || '').toLowerCase();
            return displayName.includes(term) || username.includes(term);
        });
    }, [sortedMembers, searchTerm, userMap]);

    const renderMember = useCallback(({item}: {item: ChannelMembershipModel}) => {
        const user = userMap.get(item.userId);
        if (!user) {
            return null;
        }

        const displayName = displayUsername(user);
        const username = user.username || '';

        return (
            <View style={styles.memberItem}>
                <View style={styles.avatar}>
                    <ProfilePicture
                        author={user}
                        size={48}
                        showStatus={false}
                    />
                </View>
                <View style={styles.memberInfo}>
                    <Text style={styles.memberName} numberOfLines={1}>
                        {displayName}
                    </Text>
                    {username && (
                        <Text style={styles.memberUsername} numberOfLines={1}>
                            @{username}
                        </Text>
                    )}
                </View>
            </View>
        );
    }, [userMap, styles]);

    const ItemSeparatorComponent = useCallback(() => (
        <View style={styles.separator}/>
    ), [styles]);

    const ListHeaderComponent = useMemo(() => (
        <View style={styles.searchContainer}>
            <CompassIcon name='magnify' size={18} style={styles.searchIcon}/>
            <TextInput
                style={styles.searchInput}
                value={searchTerm}
                onChangeText={setSearchTerm}
                placeholder={intl.formatMessage({id: 'channel_members_list.search', defaultMessage: 'Search members'})}
                placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.5)}
                returnKeyType='search'
            />
        </View>
    ), [searchTerm, intl, theme, styles]);

    return (
        <SafeAreaView style={styles.container} testID='channel_members_list.screen'>
            <FlatList
                data={filteredMembers}
                renderItem={renderMember}
                keyExtractor={(item) => item.userId}
                ItemSeparatorComponent={ItemSeparatorComponent}
                ListHeaderComponent={ListHeaderComponent}
                style={styles.list}
            />
        </SafeAreaView>
    );
};

type OuterProps = {
    channelId: string;
    componentId: string;
}

const enhanced = withObservables(['channelId'], ({channelId, database}: OuterProps & WithDatabaseArgs) => ({
    members: observeChannelMembers(database, channelId),
    users: database.get<UserModel>('users').query().observeWithColumns(['username', 'first_name', 'last_name', 'nickname', 'is_bot', 'last_picture_update']),
}));

export default withDatabase(enhanced(ChannelMembersList));
