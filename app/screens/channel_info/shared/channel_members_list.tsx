// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import React, {useCallback, useMemo, useState} from 'react';
import {useIntl} from 'react-intl';
import {FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import ProfilePicture from '@components/profile_picture';
import {ACCOUNT_OUTLINE_IMAGE} from '@constants/profile';
import {useTheme} from '@context/theme';
import {observeChannelMembers} from '@queries/servers/channel';
import {observeUser, queryUsersById} from '@queries/servers/user';
import {displayUsername, getLastPictureUpdate} from '@utils/user';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';
import {of as of$} from 'rxjs';
import {switchMap, map} from 'rxjs/operators';

import type UserModel from '@typings/database/models/servers/user';
import type {WithDatabaseArgs} from '@typings/database/database';

// --- MemberRow: single member in the list ---

type MemberRowProps = {
    user?: UserModel;
    nickname?: string;
    onPress?: (userId: string) => void;
}

const getMemberRowStyles = makeStyleSheetFromTheme((theme: Theme) => ({
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

const MemberRowBody = ({user, nickname, onPress}: MemberRowProps) => {
    const theme = useTheme();
    const styles = getMemberRowStyles(theme);

    const handlePress = useCallback(() => {
        if (user && onPress) {
            onPress(user.id);
        }
    }, [user, onPress]);

    if (!user) {
        return null;
    }

    const hasCustomAvatar = getLastPictureUpdate(user) > 0;
    const profileSource = hasCustomAvatar ? undefined : ACCOUNT_OUTLINE_IMAGE;

    return (
        <TouchableOpacity
            style={styles.container}
            onPress={handlePress}
            disabled={!onPress}
        >
            <View style={styles.avatar}>
                <ProfilePicture
                    author={hasCustomAvatar ? user : undefined}
                    size={40}
                    showStatus={false}
                    source={profileSource}
                />
            </View>
            <View style={styles.info}>
                <Text style={styles.name} numberOfLines={1}>
                    {nickname || displayUsername(user)}
                </Text>
                {user.username && (
                    <Text style={styles.username} numberOfLines={1}>
                        @{user.username}
                    </Text>
                )}
            </View>
        </TouchableOpacity>
    );
};

type MemberRowOwnProps = WithDatabaseArgs & {
    userId: string;
    nickname?: string;
    onPress?: (userId: string) => void;
}

const enhancedMemberRow = withObservables(['userId'], ({userId, database}: MemberRowOwnProps) => ({
    user: observeUser(database, userId),
}));

const MemberRow = withDatabase(enhancedMemberRow(MemberRowBody));

// --- ChannelMembersList (inner) ---

type Props = {
    memberIds: string[];
    users: UserModel[];
    currentUserId?: string;
    myNickname?: string;
    onMemberPress?: (userId: string) => void;
    testID?: string;
}

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
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
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.12),
        marginLeft: 68,
    },
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 40,
    },
    emptyText: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
        ...typography('Body', 200, 'Regular'),
    },
    countContainer: {
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    countText: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
        ...typography('Body', 75, 'SemiBold'),
    },
}));

const ChannelMembersListInner = ({
    memberIds,
    users,
    currentUserId,
    myNickname,
    onMemberPress,
    testID,
}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const styles = getStyleSheet(theme);
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
            <MemberRow
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

    const ListHeaderComponent = useMemo(() => (
        <View style={styles.countContainer}>
            <Text style={styles.countText}>
                {intl.formatMessage(
                    {id: 'channel_members_list.count', defaultMessage: '{count} members'},
                    {count: filteredIds.length},
                )}
            </Text>
        </View>
    ), [styles, intl, filteredIds.length]);

    const ListEmptyComponent = useMemo(() => (
        <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
                {intl.formatMessage({id: 'channel_members_list.empty', defaultMessage: 'No members found'})}
            </Text>
        </View>
    ), [styles, intl]);

    return (
        <SafeAreaView style={styles.container} testID={testID || 'channel_members_list.screen'}>
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
                ListHeaderComponent={ListHeaderComponent}
                ListEmptyComponent={ListEmptyComponent}
            />
        </SafeAreaView>
    );
};

// --- Enhanced ChannelMembersList: observes channel members from database ---

type OuterProps = {
    channelId: string;
    currentUserId?: string;
    myNickname?: string;
    onMemberPress?: (userId: string) => void;
    testID?: string;
}

const enhanced = withObservables(['channelId'], ({channelId, database}: OuterProps & WithDatabaseArgs) => {
    const memberIds$ = observeChannelMembers(database, channelId).pipe(
        map((members) => members.map((m) => m.userId)),
    );
    const users$ = memberIds$.pipe(
        switchMap((ids) => ids.length > 0
            ? queryUsersById(database, ids).observeWithColumns(['last_picture_update', 'username', 'first_name', 'last_name', 'nickname', 'is_bot'])
            : of$([] as UserModel[])),
    );
    return {
        memberIds: memberIds$,
        users: users$,
    };
});

const ChannelMembersList = withDatabase(enhanced(ChannelMembersListInner));

export default ChannelMembersList;
