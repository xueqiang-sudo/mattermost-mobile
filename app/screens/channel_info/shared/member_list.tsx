// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useMemo, useState} from 'react';
import {useIntl} from 'react-intl';
import {FlatList, StyleSheet, Text, TextInput, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import {useTheme} from '@context/theme';
import {displayUsername, getLastPictureUpdate} from '@utils/user';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';
import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import {observeUser, queryUsersById} from '@queries/servers/user';
import ProfilePicture from '@components/profile_picture';
import {ACCOUNT_OUTLINE_IMAGE} from '@constants/profile';
import {TouchableOpacity} from 'react-native';

import type UserModel from '@typings/database/models/servers/user';
import type {WithDatabaseArgs} from '@typings/database/database';

// --- MemberRow: single member item ---

type MemberRowProps = {
    user?: UserModel;
    nickname?: string;
    onPress?: (userId: string) => void;
}

const memberRowStyles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    info: {
        flex: 1,
        marginLeft: 12,
    },
    name: {
        ...typography('Body', 200, 'SemiBold'),
    },
    username: {
        ...typography('Body', 75, 'Regular'),
        marginTop: 2,
    },
});

const MemberRowBody = ({user, nickname, onPress}: MemberRowProps) => {
    const theme = useTheme();
    const name = nickname || displayUsername(user);
    const username = user?.username || '';

    const hasCustomAvatar = user ? getLastPictureUpdate(user) > 0 : false;
    const profileSource = hasCustomAvatar ? undefined : ACCOUNT_OUTLINE_IMAGE;

    return (
        <TouchableOpacity
            onPress={() => user && onPress?.(user.id)}
            style={memberRowStyles.container}
        >
            <ProfilePicture
                author={hasCustomAvatar ? user : undefined}
                size={40}
                showStatus={false}
                source={profileSource}
            />
            <View style={memberRowStyles.info}>
                <Text
                    numberOfLines={1}
                    style={[memberRowStyles.name, {color: theme.centerChannelColor}]}
                >
                    {name}
                </Text>
                {username && (
                    <Text
                        numberOfLines={1}
                        style={[memberRowStyles.username, {color: changeOpacity(theme.centerChannelColor, 0.64)}]}
                    >
                        @{username}
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

// --- MemberList (inner) ---

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
        margin: 12,
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
}));

const MemberListInner = ({
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

    // Filter and sort: bots first, then by search term
    const filteredIds = useMemo(() => {
        let ids = memberIds;

        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            ids = ids.filter((id) => {
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

    return (
        <SafeAreaView style={styles.container} testID={testID || 'channel_info.shared.member_list'}>
            <View style={styles.searchBar}>
                <CompassIcon name='magnify' size={18} style={styles.searchIcon}/>
                <TextInput
                    style={styles.searchInput}
                    value={searchTerm}
                    onChangeText={setSearchTerm}
                    placeholder={intl.formatMessage({id: 'channel_info_rhs.gm.search_members', defaultMessage: 'Search group members'})}
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
        </SafeAreaView>
    );
};

// --- Enhanced MemberList: observes users from database ---

type OuterProps = {
    memberIds: string[];
    currentUserId?: string;
    myNickname?: string;
    onMemberPress?: (userId: string) => void;
    testID?: string;
}

const enhanced = withObservables(['memberIds'], ({memberIds, database}: OuterProps & WithDatabaseArgs) => ({
    users: queryUsersById(database, memberIds).observeWithColumns(['last_picture_update', 'username', 'first_name', 'last_name', 'nickname', 'is_bot']),
}));

const MemberList = withDatabase(enhanced(MemberListInner));

export default MemberList;
