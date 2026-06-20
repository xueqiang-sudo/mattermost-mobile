// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import React, {useCallback, useMemo, useState} from 'react';
import {useIntl} from 'react-intl';
import {Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {switchMap} from 'rxjs/operators';

import {removeMemberFromChannel} from '@actions/remote/channel';
import CompassIcon from '@components/compass_icon';
import ProfilePicture from '@components/profile_picture';
import {ACCOUNT_OUTLINE_IMAGE} from '@constants/profile';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import {observeChannelMembers} from '@queries/servers/channel';
import {queryUsersById} from '@queries/servers/user';
import {dismissModal} from '@screens/navigation';
import {displayUsername, getLastPictureUpdate} from '@utils/user';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type ChannelMembershipModel from '@typings/database/models/servers/channel_membership';
import type UserModel from '@typings/database/models/servers/user';
import type {WithDatabaseArgs} from '@typings/database/database';
import type {AvailableScreens} from '@typings/screens/navigation';

type Props = {
    channelId: string;
    componentId: AvailableScreens;
    currentUserId: string;
    users: UserModel[];
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    safeArea: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    container: {
        flex: 1,
    },
    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingHorizontal: 8,
        paddingVertical: 8,
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderRadius: 8,
        marginHorizontal: 16,
        marginBottom: 8,
        paddingHorizontal: 12,
        height: 40,
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
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        gap: 12,
    },
    rowSelected: {
        backgroundColor: changeOpacity(theme.buttonBg, 0.06),
    },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxUnchecked: {
        borderColor: changeOpacity(theme.centerChannelColor, 0.32),
    },
    checkboxChecked: {
        backgroundColor: theme.buttonBg,
        borderColor: theme.buttonBg,
    },
    checkIcon: {
        color: '#fff',
    },
    name: {
        flex: 1,
        color: theme.centerChannelColor,
        ...typography('Body', 200),
    },
    emptyText: {
        textAlign: 'center',
        color: changeOpacity(theme.centerChannelColor, 0.5),
        paddingVertical: 40,
        ...typography('Body', 200),
    },
    doneBtn: {
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    doneBtnText: {
        color: theme.buttonBg,
        ...typography('Body', 200, 'SemiBold'),
    },
    doneBtnTextDisabled: {
        color: changeOpacity(theme.centerChannelColor, 0.32),
    },
}));

const RemoveMembers = ({
    channelId,
    componentId,
    currentUserId,
    users,
}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const serverUrl = useServerUrl();

    const [searchTerm, setSearchTerm] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isRemoving, setIsRemoving] = useState(false);

    const close = useCallback(() => {
        dismissModal({componentId});
    }, [componentId]);

    useAndroidHardwareBackHandler(componentId, close);

    const filteredUsers = useMemo(() => {
        if (!searchTerm.trim()) {
            return users;
        }
        const term = searchTerm.toLowerCase();
        return users.filter((u) => {
            const dName = displayUsername(u).toLowerCase();
            const uname = (u.username || '').toLowerCase();
            return dName.includes(term) || uname.includes(term);
        });
    }, [users, searchTerm]);

    const toggleUser = useCallback((userId: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(userId)) {
                next.delete(userId);
            } else {
                next.add(userId);
            }
            return next;
        });
    }, []);

    const handleDone = useCallback(() => {
        if (selectedIds.size === 0 || isRemoving) {
            return;
        }

        const count = selectedIds.size;
        Alert.alert(
            intl.formatMessage({id: 'gm_settings.remove_confirm_title', defaultMessage: 'Remove Members'}),
            intl.formatMessage(
                {id: 'gm_settings.remove_confirm_message', defaultMessage: 'Are you sure you want to remove {count, plural, one {# member} other {# members}} from this group?'},
                {count},
            ),
            [
                {
                    text: intl.formatMessage({id: 'gm_settings.cancel', defaultMessage: 'Cancel'}),
                    style: 'cancel',
                },
                {
                    text: intl.formatMessage({id: 'gm_settings.remove_confirm', defaultMessage: 'Remove'}),
                    style: 'destructive',
                    onPress: async () => {
                        setIsRemoving(true);
                        try {
                            for (const userId of selectedIds) {
                                await removeMemberFromChannel(serverUrl, channelId, userId);
                            }
                            close();
                        } catch {
                            setIsRemoving(false);
                        }
                    },
                },
            ],
        );
    }, [selectedIds, isRemoving, channelId, serverUrl, intl, close]);

    const renderItem = useCallback(({item: user}: {item: UserModel}) => {
        const isSelected = selectedIds.has(user.id);
        const name = displayUsername(user);
        const hasCustomAvatar = getLastPictureUpdate(user) > 0;
        const profileSource = hasCustomAvatar ? undefined : ACCOUNT_OUTLINE_IMAGE;

        return (
            <TouchableOpacity
                style={[styles.row, isSelected ? styles.rowSelected : undefined]}
                onPress={() => toggleUser(user.id)}
            >
                <View style={[styles.checkbox, isSelected ? styles.checkboxChecked : styles.checkboxUnchecked]}>
                    {isSelected && <CompassIcon name='check' size={14} style={styles.checkIcon}/>}
                </View>
                <ProfilePicture
                    author={hasCustomAvatar ? user : undefined}
                    size={40}
                    showStatus={false}
                    source={profileSource}
                />
                <Text style={styles.name} numberOfLines={1}>{name}</Text>
            </TouchableOpacity>
        );
    }, [selectedIds, styles, toggleUser]);

    const keyExtractor = useCallback((item: UserModel) => item.id, []);

    const canDone = selectedIds.size > 0 && !isRemoving;

    return (
        <SafeAreaView style={styles.safeArea} edges={['bottom', 'left', 'right']}>
            <View style={styles.container}>
                <View style={styles.topBar}>
                    <TouchableOpacity onPress={handleDone} style={styles.doneBtn} disabled={!canDone}>
                        <Text style={[styles.doneBtnText, !canDone ? styles.doneBtnTextDisabled : undefined]}>
                            {intl.formatMessage({id: 'gm_settings.done_button', defaultMessage: 'Done'})}
                            {selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
                        </Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.searchBar}>
                    <CompassIcon name='magnify' size={18} style={styles.searchIcon}/>
                    <TextInput
                        style={styles.searchInput}
                        value={searchTerm}
                        onChangeText={setSearchTerm}
                        placeholder={intl.formatMessage({id: 'gm_settings.remove_search_placeholder', defaultMessage: 'Search members'})}
                        placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.5)}
                        returnKeyType='search'
                    />
                </View>

                <FlatList
                    data={filteredUsers}
                    renderItem={renderItem}
                    keyExtractor={keyExtractor}
                    ListEmptyComponent={
                        <Text style={styles.emptyText}>
                            {intl.formatMessage({id: 'gm_settings.remove_no_members', defaultMessage: 'No members found'})}
                        </Text>
                    }
                />
            </View>
        </SafeAreaView>
    );
};

const enhanced = withObservables(['channelId', 'currentUserId'], ({channelId, currentUserId, database}: {channelId: string; currentUserId: string} & WithDatabaseArgs) => {
    const users = observeChannelMembers(database, channelId).pipe(
        switchMap((members: ChannelMembershipModel[]) => {
            const ids = members.filter((m) => m.userId !== currentUserId).map((m) => m.userId);
            if (ids.length === 0) {
                return [] as UserModel[];
            }
            return queryUsersById(database, ids).observe();
        }),
    );
    return {users};
});

export default withDatabase(enhanced(RemoveMembers));
