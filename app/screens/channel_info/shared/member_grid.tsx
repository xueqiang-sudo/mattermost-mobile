// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import React, {useCallback, useMemo, useState} from 'react';
import {useIntl} from 'react-intl';
import {FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import CompassIcon from '@components/compass_icon';
import ProfilePicture from '@components/profile_picture';
import {ACCOUNT_OUTLINE_IMAGE} from '@constants/profile';
import {useTheme} from '@context/theme';
import {observeUser, queryUsersById} from '@queries/servers/user';
import {displayUsername, getLastPictureUpdate} from '@utils/user';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type UserModel from '@typings/database/models/servers/user';
import type {WithDatabaseArgs} from '@typings/database/database';

// --- MemberAvatarItem: fetches user by ID and renders avatar + name ---

type MemberAvatarItemProps = {
    user?: UserModel;
    nickname?: string;
    onPress?: (userId: string) => void;
}

const avatarItemStyles = StyleSheet.create({
    container: {
        alignItems: 'center',
        width: 68,
        marginBottom: 8,
    },
    name: {
        fontSize: 11,
        lineHeight: 16,
        marginTop: 4,
        textAlign: 'center',
        overflow: 'hidden',
    },
});

const MemberAvatarItemBody = ({user, nickname, onPress}: MemberAvatarItemProps) => {
    const theme = useTheme();
    const name = nickname || displayUsername(user);

    // Show custom avatar if user has one, otherwise show default person icon
    const hasCustomAvatar = user ? getLastPictureUpdate(user) > 0 : false;
    const profileSource = hasCustomAvatar ? undefined : ACCOUNT_OUTLINE_IMAGE;

    return (
        <TouchableOpacity
            onPress={() => user && onPress?.(user.id)}
            style={avatarItemStyles.container}
        >
            <ProfilePicture
                author={hasCustomAvatar ? user : undefined}
                size={40}
                showStatus={false}
                source={profileSource}
            />
            <Text
                numberOfLines={1}
                style={[avatarItemStyles.name, {color: changeOpacity(theme.centerChannelColor, 0.75)}]}
            >
                {name}
            </Text>
        </TouchableOpacity>
    );
};

type MemberAvatarItemOwnProps = WithDatabaseArgs & {
    userId: string;
    nickname?: string;
    onPress?: (userId: string) => void;
}

const enhancedMemberAvatarItem = withObservables(['userId'], ({userId, database}: MemberAvatarItemOwnProps) => ({
    user: observeUser(database, userId),
}));

const MemberAvatarItem = withDatabase(enhancedMemberAvatarItem(MemberAvatarItemBody));

// --- ActionButton: "+" add or "−" remove ---

type ActionButtonProps = {
    type: 'add' | 'remove';
    label: string;
    onPress: () => void;
}

const actionBtnStyles = StyleSheet.create({
    container: {
        alignItems: 'center',
        width: 68,
        marginBottom: 8,
    },
    icon: {
        width: 40,
        height: 40,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderRadius: 4,
        alignItems: 'center',
        justifyContent: 'center',
    },
    label: {
        fontSize: 11,
        lineHeight: 16,
        marginTop: 4,
        textAlign: 'center',
    },
});

const ActionButton = ({type, label, onPress}: ActionButtonProps) => {
    const theme = useTheme();
    const borderColor = changeOpacity(theme.centerChannelColor, 0.3);
    const color = changeOpacity(theme.centerChannelColor, 0.5);

    return (
        <TouchableOpacity onPress={onPress} style={actionBtnStyles.container}>
            <View style={[actionBtnStyles.icon, {borderColor}]}>
                <CompassIcon
                    name={type === 'add' ? 'plus' : 'minus'}
                    size={20}
                    color={color}
                />
            </View>
            <Text style={[actionBtnStyles.label, {color}]}>{label}</Text>
        </TouchableOpacity>
    );
};

// --- MemberGrid (inner, receives observed users) ---

type Props = {
    memberIds: string[];
    users: UserModel[];
    currentUserId?: string;
    myNickname?: string;
    showAddButton?: boolean;
    showRemoveButton?: boolean;
    showSearch?: boolean;
    onAddPress?: () => void;
    onRemovePress?: () => void;
    maxVisible?: number; // for public/private channels: show max N + "+N more"
    testID?: string;
}

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        paddingHorizontal: 8,
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderRadius: 4,
        marginHorizontal: 8,
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
    grid: {
        paddingHorizontal: 4,
    },
    moreCount: {
        alignItems: 'center',
        justifyContent: 'center',
        width: 68,
        marginBottom: 8,
    },
    moreCountText: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
        ...typography('Body', 200, 'SemiBold'),
    },
}));

const MemberGridInner = ({
    memberIds,
    users,
    currentUserId,
    myNickname,
    showAddButton,
    showRemoveButton,
    showSearch,
    onAddPress,
    onRemovePress,
    maxVisible,
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

    // Filter members by search term (matching webapp logic: displayUsername + username)
    const filteredIds = useMemo(() => {
        if (!searchTerm.trim()) {
            return memberIds;
        }
        const term = searchTerm.toLowerCase();
        return memberIds.filter((id) => {
            const user = userMap.get(id);
            if (!user) {
                return false;
            }
            const dName = displayUsername(user).toLowerCase();
            const uname = (user.username || '').toLowerCase();
            return dName.includes(term) || uname.includes(term);
        });
    }, [memberIds, searchTerm, userMap]);

    const visibleIds = maxVisible ? filteredIds.slice(0, maxVisible) : filteredIds;
    const extraCount = maxVisible ? Math.max(0, filteredIds.length - maxVisible) : 0;

    const renderItem = useCallback(({item: userId}: {item: string}) => {
        const nickname = (userId === currentUserId) ? myNickname : undefined;
        return (
            <MemberAvatarItem
                userId={userId}
                nickname={nickname}
            />
        );
    }, [currentUserId, myNickname]);

    const keyExtractor = useCallback((item: string) => item, []);

    const ListFooterComponent = useMemo(() => {
        const items: React.ReactNode[] = [];
        if (extraCount > 0) {
            items.push(
                <View key='more' style={styles.moreCount}>
                    <Text style={styles.moreCountText}>{`+${extraCount}`}</Text>
                </View>,
            );
        }
        if (showAddButton) {
            items.push(
                <ActionButton
                    key='add'
                    type='add'
                    label={intl.formatMessage({id: 'gm_settings.add_label', defaultMessage: 'Add'})}
                    onPress={onAddPress || (() => {})}
                />,
            );
        }
        if (showRemoveButton) {
            items.push(
                <ActionButton
                    key='remove'
                    type='remove'
                    label={intl.formatMessage({id: 'gm_settings.remove_label', defaultMessage: 'Remove'})}
                    onPress={onRemovePress || (() => {})}
                />,
            );
        }
        return items.length > 0 ? <>{items}</> : null;
    }, [extraCount, styles, showAddButton, showRemoveButton, intl, onAddPress, onRemovePress]);

    return (
        <View style={styles.container} testID={testID || 'channel_info.shared.member_grid'}>
            {showSearch && (
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
            )}
            <FlatList
                data={visibleIds}
                renderItem={renderItem}
                keyExtractor={keyExtractor}
                horizontal={true}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.grid}
                ListFooterComponent={ListFooterComponent}
            />
        </View>
    );
};

// --- Enhanced MemberGrid: observes users from database ---

type OuterProps = {
    memberIds: string[];
    currentUserId?: string;
    myNickname?: string;
    showAddButton?: boolean;
    showRemoveButton?: boolean;
    showSearch?: boolean;
    onAddPress?: () => void;
    onRemovePress?: () => void;
    maxVisible?: number;
    testID?: string;
}

const enhanced = withObservables(['memberIds'], ({memberIds, database}: OuterProps & WithDatabaseArgs) => ({
    users: queryUsersById(database, memberIds).observeWithColumns(['last_picture_update', 'username', 'first_name', 'last_name', 'nickname']),
}));

const MemberGrid = withDatabase(enhanced(MemberGridInner));

export default MemberGrid;
