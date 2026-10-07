// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {Alert, FlatList, Text, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {fetchChannelMemberships} from '@actions/remote/channel';
import CompassIcon from '@components/compass_icon';
import Loading from '@components/loading';
import ProfilePicture from '@components/profile_picture';
import {PER_PAGE_DEFAULT} from '@client/rest/constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import NetworkManager from '@managers/network_manager';
import {popTopScreen} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';
import {displayUsername} from '@utils/user';

import type {AvailableScreens} from '@typings/screens/navigation';

type Props = {
    canManageAndRemoveMembers: boolean;
    channelId: string;
    componentId: AvailableScreens;
    currentTeamId: string;
    currentUserId: string;
    tutorialWatched: boolean;
    teammateDisplayNameSetting: string;
    channelAbacPolicyEnforced: boolean;
}

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    notice: {
        backgroundColor: changeOpacity(theme.buttonBg, 0.08),
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    noticeText: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.72),
        lineHeight: 18,
    },
    listContent: {
        paddingBottom: 24,
    },
    memberRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.06),
    },
    memberInfo: {
        flex: 1,
        marginLeft: 12,
    },
    memberName: {
        ...typography('Body', 200),
        color: theme.centerChannelColor,
    },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: changeOpacity(theme.centerChannelColor, 0.32),
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxChecked: {
        backgroundColor: theme.buttonBg,
        borderColor: theme.buttonBg,
    },
    loading: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
}));

export default function ManageChannelMembers({
    channelId,
    componentId,
    currentUserId,
    teammateDisplayNameSetting,
}: Props) {
    const serverUrl = useServerUrl();
    const theme = useTheme();
    const {formatMessage, locale} = useIntl();
    const styles = getStyleSheet(theme);

    const mounted = useRef(false);

    const [profiles, setProfiles] = useState<UserProfile[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [initialIds, setInitialIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useAndroidHardwareBackHandler(componentId, () => popTopScreen(componentId));

    // Fetch members and current restricted views
    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                const options: GetUsersOptions = {sort: 'admin', active: true, per_page: PER_PAGE_DEFAULT, page: 0};
                const {users} = await fetchChannelMemberships(serverUrl, channelId, options, true);

                // Filter out current user
                const filteredUsers = users.filter((u) => u.id !== currentUserId);
                setProfiles(filteredUsers);

                // Fetch current restricted views
                const client = NetworkManager.getClient(serverUrl);
                const restrictedViews = await client.getChannelRestrictedViews(channelId);

                const restricted = new Set<string>();
                for (const [userId, isRestricted] of Object.entries(restrictedViews)) {
                    if (isRestricted) {
                        restricted.add(userId);
                    }
                }
                setSelectedIds(restricted);
                setInitialIds(new Set(restricted));
            } catch {
                // ignore - will show empty list
            } finally {
                setLoading(false);
            }
        };
        loadData();

        return () => {
            mounted.current = false;
        };
    }, [channelId, currentUserId, serverUrl]);

    const toggleSelection = useCallback((userId: string) => {
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

    const handleCancel = useCallback(() => {
        popTopScreen(componentId);
    }, [componentId]);

    const handleConfirm = useCallback(async () => {
        setSaving(true);
        try {
            const client = NetworkManager.getClient(serverUrl);

            // Find changed members
            const toAdd: string[] = [];
            const toRemove: string[] = [];

            for (const userId of selectedIds) {
                if (!initialIds.has(userId)) {
                    toAdd.push(userId);
                }
            }
            for (const userId of initialIds) {
                if (!selectedIds.has(userId)) {
                    toRemove.push(userId);
                }
            }

            // Apply changes
            const promises: Promise<any>[] = [];
            for (const userId of toAdd) {
                promises.push(client.setMemberRestrictedView(channelId, userId, true));
            }
            for (const userId of toRemove) {
                promises.push(client.setMemberRestrictedView(channelId, userId, false));
            }

            await Promise.all(promises);
            popTopScreen(componentId);
        } catch (error) {
            Alert.alert(
                formatMessage({id: 'mobile.error.title', defaultMessage: 'Error'}),
                formatMessage({id: 'mobile.restricted_views.save_failed', defaultMessage: 'Failed to save restricted view settings.'}),
            );
        } finally {
            setSaving(false);
        }
    }, [channelId, componentId, formatMessage, initialIds, selectedIds, serverUrl]);

    useNavButtonPressed('cancel-manage-members', componentId, handleCancel, [handleCancel]);
    useNavButtonPressed('confirm-manage-members', componentId, handleConfirm, [handleConfirm]);

    const renderItem = useCallback(({item}: {item: UserProfile}) => {
        const isSelected = selectedIds.has(item.id);
        const displayName = displayUsername(item, locale, teammateDisplayNameSetting);

        return (
            <TouchableOpacity
                style={styles.memberRow}
                onPress={() => toggleSelection(item.id)}
                activeOpacity={0.7}
            >
                <ProfilePicture
                    author={item}
                    size={40}
                    showStatus={false}
                />
                <View style={styles.memberInfo}>
                    <Text style={styles.memberName} numberOfLines={1}>
                        {displayName}
                    </Text>
                </View>
                <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                    {isSelected && (
                        <CompassIcon name='check' size={16} color='#fff'/>
                    )}
                </View>
            </TouchableOpacity>
        );
    }, [selectedIds, locale, teammateDisplayNameSetting, styles, toggleSelection]);

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.loading}>
                    <Loading color={theme.centerChannelColor} size='large'/>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView
            style={styles.container}
            testID='manage_members.screen'
        >
            <View style={styles.notice}>
                <Text style={styles.noticeText}>
                    {formatMessage({
                        id: 'restricted_views.notice',
                        defaultMessage: 'Restricted members can only see group announcements, messages where they @mention others, and messages where others @mention them. All other messages are hidden.',
                    })}
                </Text>
            </View>
            <FlatList
                data={profiles}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                contentContainerStyle={styles.listContent}
            />
        </SafeAreaView>
    );
}
