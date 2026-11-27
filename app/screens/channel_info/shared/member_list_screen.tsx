// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useMemo, useState} from 'react';
import {FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {useIntl} from 'react-intl';

import CompassIcon from '@components/compass_icon';
import ProfilePicture from '@components/profile_picture';
import {ACCOUNT_OUTLINE_IMAGE} from '@constants/profile';
import {useTheme} from '@context/theme';
import {observeUser} from '@queries/servers/user';
import {displayUsername, getLastPictureUpdate} from '@utils/user';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';
import {withDatabase, withObservables} from '@nozbe/watermelondb/react';

import type UserModel from '@typings/database/models/servers/user';
import type {WithDatabaseArgs} from '@typings/database/database';

// --- MemberListItem: displays a single member in the list ---

type MemberListItemProps = {
    user?: UserModel;
    nickname?: string;
    onPress?: (userId: string) => void;
}

const getListItemStyles = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    avatar: {
        marginRight: 12,
    },
    info: {
        flex: 1,
    },
    name: {
        color: theme.centerChannelColor,
        ...typography('Body', 200, 'SemiBold'),
    },
    username: {
        color: changeOpacity(theme.centerChannelColor, 0.64),
        ...typography('Body', 75, 'Regular'),
        marginTop: 2,
    },
}));

const MemberListItemBody = ({user, nickname, onPress}: MemberListItemProps) => {
    const theme = useTheme();
    const styles = getListItemStyles(theme);
    const name = nickname || displayUsername(user);

    if (!user) {
        return null;
    }

    const hasCustomAvatar = getLastPictureUpdate(user) > 0;
    const profileSource = hasCustomAvatar ? undefined : ACCOUNT_OUTLINE_IMAGE;

    return (
        <TouchableOpacity
            onPress={() => onPress?.(user.id)}
            style={styles.container}
        >
            <View style={styles.avatar}>
                <ProfilePicture
                    author={hasCustomAvatar ? user : undefined}
                    size={48}
                    showStatus={false}
                    source={profileSource}
                />
            </View>
            <View style={styles.info}>
                <Text numberOfLines={1} style={styles.name}>
                    {name}
                </Text>
                {user.username && (
                    <Text numberOfLines={1} style={styles.username}>
                        @{user.username}
                    </Text>
                )}
            </View>
        </TouchableOpacity>
    );
};

type MemberListItemOwnProps = WithDatabaseArgs & {
    userId: string;
    nickname?: string;
    onPress?: (userId: string) => void;
}

const enhancedMemberListItem = withObservables(['userId'], ({userId, database}: MemberListItemOwnProps) => ({
    user: observeUser(database, userId),
}));

const MemberListItem = withDatabase(enhancedMemberListItem(MemberListItemBody));

// --- MemberListScreen: displays all members in a searchable list ---

type Props = {
    memberIds: string[];
    users: UserModel[];
    currentUserId?: string;
    myNickname?: string;
    onMemberPress?: (userId: string) => void;
}

const getScreenStyles = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderRadius: 8,
        marginHorizontal: 16,
        marginTop: 12,
        marginBottom: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    searchIcon: {
        color: changeOpacity(theme.centerChannelColor, 0.5),
        marginRight: 8,
    },
    searchInput: {
        flex: 1,
        color: theme.centerChannelColor,
        fontSize: 14,
        padding: 0,
    },
    separator: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.1),
        marginLeft: 76,
    },
}));

const MemberListScreenInner = ({
    memberIds,
    users,
    currentUserId,
    myNickname,
    onMemberPress,
}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const styles = getScreenStyles(theme);
    const [searchTerm, setSearchTerm] = useState('');

    // Build a lookup map for users by ID
    const userMap = useMemo(() => {
        const map = new Map<string, UserModel>();
        users.forEach((u) => map.set(u.id, u));
        return map;
    }, [users]);

    // Filter members by search term, bots first
    const filteredIds = useMemo(() => {
        let ids: string[];
        if (!searchTerm.trim()) {
            ids = memberIds;
        } else {
            const term = searchTerm.toLowerCase();
            ids = memberIds.filter((id) => {
                const user = userMap.get(id);
                if (!user) {
                    return false;
                }
                const dName = displayUsername(user).toLowerCase();
                const uname = (user.username || '').toLowerCase();
                return dName.includes(term) || uname.includes(term);
            });
        }

        // Sort: bots first
        return ids.slice().sort((a, b) => {
            const userA = userMap.get(a);
            const userB = userMap.get(b);
            const isBotA = userA?.isBot ? 1 : 0;
            const isBotB = userB?.isBot ? 1 : 0;
            return isBotB - isBotA;
        });
    }, [memberIds, searchTerm, userMap]);

    const renderItem = useCallback(({item: userId}: {item: string}) => {
        const nickname = (userId === currentUserId) ? myNickname : undefined;
        return (
            <MemberListItem
                userId={userId}
                nickname={nickname}
                onPress={onMemberPress}
            />
        );
    }, [currentUserId, myNickname, onMemberPress]);

    const keyExtractor = useCallback((item: string) => item, []);

    const ItemSeparatorComponent = useCallback(() => (
        <View style={styles.separator}/>
    ), [styles]);

    return (
        <View style={styles.container}>
            <View style={styles.searchBar}>
                <CompassIcon name='magnify' size={18} style={styles.searchIcon}/>
                <TextInput
                    style={styles.searchInput}
                    value={searchTerm}
                    onChangeText={setSearchTerm}
                    placeholder={intl.formatMessage({id: 'channel_info_rhs.gm.search_members', defaultMessage: 'Search members'})}
                    placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.5)}
                    returnKeyType='search'
                />
            </View>
            <FlatList
                data={filteredIds}
                renderItem={renderItem}
                keyExtractor={keyExtractor}
                ItemSeparatorComponent={ItemSeparatorComponent}
            />
        </View>
    );
};

// --- Enhanced MemberListScreen: observes users from database ---

type OuterProps = {
    memberIds: string[];
    currentUserId?: string;
    myNickname?: string;
    onMemberPress?: (userId: string) => void;
}

const enhanced = withObservables(['memberIds'], ({memberIds, database}: OuterProps & WithDatabaseArgs) => ({
    users: queryUsersById(database, memberIds).observeWithColumns(['last_picture_update', 'username', 'first_name', 'last_name', 'nickname', 'is_bot']),
}));

const MemberListScreen = withDatabase(enhanced(MemberListScreenInner));

export default MemberListScreen;
