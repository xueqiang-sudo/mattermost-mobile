// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useState} from 'react';
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
import NetworkManager from '@managers/network_manager';
import {dismissModal} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';
import {displayUsername} from '@utils/user';

import type {AvailableScreens} from '@typings/screens/navigation';

type Props = {
    componentId: AvailableScreens;
    channelId: string;
    currentUserId: string;
    teammateDisplayNameSetting: string;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    headerButton: {
        padding: 4,
        minWidth: 48,
    },
    cancelButton: {
        color: changeOpacity(theme.centerChannelColor, 0.64),
        ...typography('Body', 200),
    },
    confirmButton: {
        color: theme.buttonBg,
        ...typography('Body', 200, 'SemiBold'),
    },
    headerTitle: {
        ...typography('Heading', 400, 'SemiBold'),
        color: theme.centerChannelColor,
        flex: 1,
        textAlign: 'center',
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

const ManageRestrictedViews = ({
    componentId,
    channelId,
    currentUserId,
    teammateDisplayNameSetting,
}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const serverUrl = useServerUrl();

    const [profiles, setProfiles] = useState<UserProfile[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [initialIds, setInitialIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useAndroidHardwareBackHandler(componentId, () => dismissModal({componentId}));

    // Fetch members and current restricted views
    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                // Fetch channel members
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
        dismissModal({componentId});
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
            dismissModal({componentId});
        } catch (error) {
            Alert.alert(
                intl.formatMessage({id: 'mobile.error.title', defaultMessage: 'Error'}),
                intl.formatMessage({id: 'mobile.restricted_views.save_failed', defaultMessage: 'Failed to save restricted view settings.'}),
            );
        } finally {
            setSaving(false);
        }
    }, [channelId, componentId, initialIds, intl, selectedIds, serverUrl]);

    const renderItem = useCallback(({item}: {item: UserProfile}) => {
        const isSelected = selectedIds.has(item.id);
        const displayName = displayUsername(item, intl.locale, teammateDisplayNameSetting);

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
    }, [selectedIds, intl.locale, teammateDisplayNameSetting, styles, toggleSelection]);

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
        <SafeAreaView style={styles.container} testID='manage_restricted_views'>
            <View style={styles.header}>
                <TouchableOpacity style={styles.headerButton} onPress={handleCancel}>
                    <Text style={styles.cancelButton}>
                        {intl.formatMessage({id: 'mobile.cancel', defaultMessage: 'Cancel'})}
                    </Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>
                    {intl.formatMessage({id: 'restricted_views.title', defaultMessage: 'Restricted View'})}
                </Text>
                <TouchableOpacity style={styles.headerButton} onPress={handleConfirm} disabled={saving}>
                    <Text style={[styles.confirmButton, saving && {opacity: 0.5}]}>
                        {saving
                            ? intl.formatMessage({id: 'mobile.saving', defaultMessage: 'Saving...'})
                            : intl.formatMessage({id: 'mobile.confirm', defaultMessage: 'Confirm'})}
                    </Text>
                </TouchableOpacity>
            </View>
            <View style={styles.notice}>
                <Text style={styles.noticeText}>
                    {intl.formatMessage({
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
};

export default ManageRestrictedViews;
