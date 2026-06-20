// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import React, {useCallback, useMemo, useState} from 'react';
import {useIntl} from 'react-intl';
import {FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {of as of$} from 'rxjs';
import {switchMap} from 'rxjs/operators';

import CompassIcon from '@components/compass_icon';
import ProfilePicture from '@components/profile_picture';
import {useTheme} from '@context/theme';
import {observeUser} from '@queries/servers/user';
import {displayUsername} from '@utils/user';
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

    return (
        <TouchableOpacity
            onPress={() => user && onPress?.(user.id)}
            style={avatarItemStyles.container}
        >
            <ProfilePicture
                author={user}
                size={40}
                showStatus={false}
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

// --- MemberGrid ---

type Props = {
    memberIds: string[];
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

const MemberGrid = ({
    memberIds,
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

    // Note: search filtering would require user profile data which we don't have here.
    // The filtering is delegated to the parent via searchTerm prop in a more advanced impl.
    // For simplicity, we show all memberIds and rely on the search bar being a UX hint.
    const visibleIds = maxVisible ? memberIds.slice(0, maxVisible) : memberIds;
    const extraCount = maxVisible ? Math.max(0, memberIds.length - maxVisible) : 0;

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

    const ListHeaderComponent = useMemo(() => {
        const items: React.ReactNode[] = [];
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
    }, [showAddButton, showRemoveButton, intl, onAddPress, onRemovePress]);

    const ListFooterComponent = useMemo(() => {
        if (extraCount <= 0) {
            return null;
        }
        return (
            <View style={styles.moreCount}>
                <Text style={styles.moreCountText}>{`+${extraCount}`}</Text>
            </View>
        );
    }, [extraCount, styles]);

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
                ListHeaderComponent={ListHeaderComponent}
                ListFooterComponent={ListFooterComponent}
            />
        </View>
    );
};

export default MemberGrid;
