// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useMemo, useState} from 'react';
import {useIntl} from 'react-intl';
import {FlatList, StyleSheet, Text, TextInput, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import MemberItem from './member_item';

import type UserModel from '@typings/database/models/servers/user';

type Props = {
    memberIds: string[];
    users: UserModel[];
    currentUserId?: string;
    myNickname?: string;
    onMemberPress?: (userId: string) => void;
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
        borderRadius: 4,
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
        marginLeft: 72,
    },
    emptyText: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
        ...typography('Body', 200, 'Regular'),
        textAlign: 'center',
        marginTop: 32,
    },
}));

const MembersScreen = ({
    memberIds,
    users,
    currentUserId,
    myNickname,
    onMemberPress,
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

    // Filter members by search term (matching webapp logic: displayUsername + username)
    // Bots always appear first
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
                const displayName = user.nickname || user.firstName || user.lastName || user.username || '';
                const dName = displayName.toLowerCase();
                const uname = (user.username || '').toLowerCase();
                return dName.includes(term) || uname.includes(term);
            });
        }

        // Sort: bots first, then alphabetically
        return ids.slice().sort((a, b) => {
            const userA = userMap.get(a);
            const userB = userMap.get(b);
            const isBotA = userA?.isBot ? 1 : 0;
            const isBotB = userB?.isBot ? 1 : 0;
            if (isBotB !== isBotA) {
                return isBotB - isBotA;
            }
            // Both same type, sort alphabetically by display name
            const nameA = userA ? (userA.nickname || userA.firstName || userA.lastName || userA.username || '') : '';
            const nameB = userB ? (userB.nickname || userB.firstName || userB.lastName || userB.username || '') : '';
            return nameA.localeCompare(nameB);
        });
    }, [memberIds, searchTerm, userMap]);

    const renderItem = useCallback(({item: userId}: {item: string}) => {
        const nickname = (userId === currentUserId) ? myNickname : undefined;
        return (
            <MemberItem
                userId={userId}
                nickname={nickname}
                onPress={onMemberPress}
            />
        );
    }, [currentUserId, myNickname, onMemberPress]);

    const keyExtractor = useCallback((item: string) => item, []);

    const ItemSeparatorComponent = useCallback(() => <View style={styles.separator}/>, [styles]);

    const ListEmptyComponent = useCallback(() => (
        <Text style={styles.emptyText}>
            {intl.formatMessage({id: 'channel_members_list.empty', defaultMessage: 'No members found'})}
        </Text>
    ), [styles, intl]);

    return (
        <SafeAreaView style={styles.container} testID='channel_members_list.screen'>
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
                ListEmptyComponent={ListEmptyComponent}
            />
        </SafeAreaView>
    );
};

export default MembersScreen;
