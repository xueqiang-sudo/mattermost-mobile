// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {Alert, FlatList, Modal, Platform, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {searchContactEmployees} from '@actions/remote/contact_new';
import {fetchTeamManagers, setTeamManagerRole} from '@actions/remote/team';
import CompassIcon from '@components/compass_icon';
import ContactAvatar from '@components/contact_avatar';
import Loading from '@components/loading';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import NetworkManager from '@managers/network_manager';
import {getContactListDisplayName} from '@utils/contact_section';
import {buildEnterpriseUserTagKeys, type EnterpriseUserTagKey} from '@utils/enterprise_user_tags';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

type Props = {
    visible: boolean;
    companyId: string;
    onClose: () => void;
    onChanged?: () => void;
    excludeUserId?: string;
    testIDPrefix?: string;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    modalBackdrop: {
        flex: 1,
        backgroundColor: changeOpacity('#000000', 0.45),
        justifyContent: 'flex-end',
    },
    flex: {flex: 1},
    sheet: {
        width: '100%',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        backgroundColor: theme.centerChannelBg,
        maxHeight: '78%',
        overflow: 'hidden',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    title: {
        ...typography('Heading', 300, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    searchWrap: {
        paddingHorizontal: 16,
        paddingTop: 10,
        paddingBottom: 8,
    },
    searchInput: {
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.18),
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: Platform.select({ios: 10, android: 8}) ?? 8,
        color: theme.centerChannelColor,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
    },
    sectionTitle: {
        ...typography('Body', 75, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.64),
        paddingHorizontal: 16,
        paddingTop: 10,
        paddingBottom: 4,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.06),
    },
    name: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.centerChannelColor,
        flex: 1,
        marginLeft: 12,
        marginRight: 12,
    },
    action: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
    },
    removeAction: {
        backgroundColor: changeOpacity(theme.errorTextColor, 0.1),
        borderColor: changeOpacity(theme.errorTextColor, 0.25),
    },
    addAction: {
        backgroundColor: changeOpacity(theme.buttonBg, 0.1),
        borderColor: changeOpacity(theme.buttonBg, 0.3),
    },
    removeActionText: {
        ...typography('Body', 50, 'SemiBold'),
        color: theme.errorTextColor,
    },
    addActionText: {
        ...typography('Body', 50, 'SemiBold'),
        color: theme.buttonBg,
    },
    hint: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.64),
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    tagsWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginRight: 8,
    },
    tag: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 8,
        borderWidth: 1,
        backgroundColor: changeOpacity(theme.buttonBg, 0.14),
        borderColor: changeOpacity(theme.buttonBg, 0.35),
    },
    tagText: {
        ...typography('Body', 50, 'SemiBold'),
        color: theme.buttonBg,
    },
    selfTag: {
        backgroundColor: changeOpacity(theme.linkColor, 0.12),
        borderColor: changeOpacity(theme.linkColor, 0.35),
    },
    selfTagText: {
        color: theme.linkColor,
    },
    ownerTag: {
        backgroundColor: changeOpacity(theme.buttonBg, 0.14),
        borderColor: changeOpacity(theme.buttonBg, 0.35),
    },
    ownerTagText: {
        color: theme.buttonBg,
    },
}));

const TeamManagerModal = ({visible, companyId, onClose, onChanged, excludeUserId, testIDPrefix = 'team_manager_modal'}: Props) => {
    const theme = useTheme();
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const insets = useSafeAreaInsets();
    const styles = getStyleSheet(theme);

    const [managers, setManagers] = useState<UserProfile[]>([]);
    const [managersLoading, setManagersLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchPending, setSearchPending] = useState(false);
    const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
    const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
    const searchSeq = useRef(0);
    const [ownerId, setOwnerId] = useState<string | undefined>();
    const [currentUserId, setCurrentUserId] = useState<string | undefined>();
    const isCurrentUserOwner = Boolean(ownerId && currentUserId && ownerId === currentUserId);

    const managerEntries = useMemo(() => {
        return searchResults;
    }, [searchResults]);
    const managerIdSet = useMemo(() => new Set(managers.map((u) => u.id)), [managers]);

    const loadManagers = useCallback(async () => {
        if (!serverUrl) {
            return;
        }
        setManagersLoading(true);
        const result = await fetchTeamManagers(serverUrl, companyId);
        if (result.error || !result.data) {
            setManagersLoading(false);
            return;
        }
        setManagers(result.data.map((item) => item.user));
        setManagersLoading(false);
    }, [companyId, serverUrl]);

    useEffect(() => {
        if (!visible) {
            return;
        }
        setSearchQuery('');
        setSearchResults([]);
        setSearchPending(false);
        loadManagers();
    }, [loadManagers, visible]);

    useEffect(() => {
        if (!visible || !serverUrl) {
            return;
        }
        let cancelled = false;
        const client = NetworkManager.getClient(serverUrl);
        const loadOwnerAndSelf = async () => {
            try {
                const [team, me] = await Promise.all([
                    client.getTeam(companyId),
                    client.getMe(),
                ]);
                if (cancelled) {
                    return;
                }
                setOwnerId(team?.creator_id);
                setCurrentUserId(me?.id);
            } catch {
                // no-op
            }
        };
        loadOwnerAndSelf();
        return () => {
            cancelled = true;
        };
    }, [companyId, serverUrl, visible]);

    const renderTags = useCallback((userId: string) => {
        const tagKeys = buildEnterpriseUserTagKeys({
            userId,
            ownerId,
            currentUserId,
            managerIds: managerIdSet,
        });
        if (tagKeys.length === 0) {
            return null;
        }
        return (
            <View style={styles.tagsWrap}>
                {tagKeys.map((tagKey: EnterpriseUserTagKey) => {
                    if (tagKey === 'owner') {
                        return (
                            <View
                                key={`${userId}-owner`}
                                style={[styles.tag, styles.ownerTag]}
                            >
                                <Text style={[styles.tagText, styles.ownerTagText]}>
                                    {intl.formatMessage({id: 'contacts.owner_tag', defaultMessage: 'Owner'})}
                                </Text>
                            </View>
                        );
                    }
                    if (tagKey === 'self') {
                        return (
                            <View
                                key={`${userId}-self`}
                                style={[styles.tag, styles.selfTag]}
                            >
                                <Text style={[styles.tagText, styles.selfTagText]}>
                                    {intl.formatMessage({id: 'contacts.self_tag', defaultMessage: 'Self'})}
                                </Text>
                            </View>
                        );
                    }
                    return (
                        <View
                            key={`${userId}-manager`}
                            style={styles.tag}
                        >
                            <Text style={styles.tagText}>
                                {intl.formatMessage({id: 'contacts.manager_tag', defaultMessage: 'Manager'})}
                            </Text>
                        </View>
                    );
                })}
            </View>
        );
    }, [currentUserId, intl, managerIdSet, ownerId, styles.ownerTag, styles.ownerTagText, styles.selfTag, styles.selfTagText, styles.tag, styles.tagText, styles.tagsWrap]);

    useEffect(() => {
        if (!visible) {
            return;
        }
        const q = searchQuery.trim();
        if (!q) {
            setSearchResults([]);
            setSearchPending(false);
            return;
        }
        setSearchPending(true);
        const seq = ++searchSeq.current;
        const timer = setTimeout(async () => {
            if (!serverUrl) {
                setSearchPending(false);
                return;
            }
            const res = await searchContactEmployees(serverUrl, companyId, q);
            if (seq !== searchSeq.current) {
                return;
            }
            if (res.error || !res.data) {
                setSearchResults([]);
                setSearchPending(false);
                return;
            }
            const filtered = res.data.filter((u) => {
                if (managerIdSet.has(u.id)) {
                    return false;
                }
                if (excludeUserId && u.id === excludeUserId) {
                    return false;
                }
                return true;
            });
            setSearchResults(filtered);
            setSearchPending(false);
        }, 300);
        return () => clearTimeout(timer);
    }, [companyId, excludeUserId, managerIdSet, searchQuery, serverUrl, visible]);

    const applySetManager = useCallback(async (user: UserProfile, isManager: boolean) => {
        if (!serverUrl || !isCurrentUserOwner) {
            return;
        }
        if (!isManager && ownerId && user.id === ownerId) {
            return;
        }
        setUpdatingUserId(user.id);
        const result = await setTeamManagerRole(serverUrl, companyId, user.id, isManager);
        if (result.error) {
            setUpdatingUserId(null);
            Alert.alert(
                intl.formatMessage({id: 'contacts.manager_management', defaultMessage: 'Manager management'}),
                intl.formatMessage({id: 'contacts.manager_update_failed', defaultMessage: 'Failed to update manager role. Please try again.'}),
            );
            return;
        }
        // Optimistically update UI first to avoid stale visual state.
        setManagers((prev) => {
            if (isManager) {
                return prev.some((u) => u.id === user.id) ? prev : [user, ...prev];
            }
            return prev.filter((u) => u.id !== user.id);
        });
        if (isManager) {
            setSearchResults((prev) => prev.filter((u) => u.id !== user.id));
        }
        setUpdatingUserId(null);
        onChanged?.();
        // Re-sync from server for eventual consistency.
        await loadManagers();
    }, [companyId, intl, isCurrentUserOwner, loadManagers, onChanged, ownerId, serverUrl]);

    const handleSetManager = useCallback((user: UserProfile, isManager: boolean) => {
        const actionLabel = isManager ?
            intl.formatMessage({id: 'common.add', defaultMessage: 'Add'}) :
            intl.formatMessage({id: 'common.remove', defaultMessage: 'Remove'});
        const message = isManager ?
            intl.formatMessage(
                {id: 'contacts.manager_add_confirm', defaultMessage: 'Add {name} as an admin?'},
                {name: getContactListDisplayName(user)},
            ) :
            intl.formatMessage(
                {id: 'contacts.manager_remove_confirm', defaultMessage: 'Remove admin role from {name}?'},
                {name: getContactListDisplayName(user)},
            );
        Alert.alert(
            intl.formatMessage({id: 'contacts.manager_management', defaultMessage: 'Manager management'}),
            message,
            [
                {
                    text: intl.formatMessage({id: 'common.cancel', defaultMessage: 'Cancel'}),
                    style: 'cancel',
                },
                {
                    text: actionLabel,
                    style: isManager ? 'default' : 'destructive',
                    onPress: () => applySetManager(user, isManager),
                },
            ],
        );
    }, [applySetManager, intl]);

    return (
        <Modal
            visible={visible}
            animationType='slide'
            transparent={true}
            onRequestClose={onClose}
        >
            <View style={styles.modalBackdrop}>
                <TouchableOpacity
                    style={styles.flex}
                    activeOpacity={1}
                    onPress={onClose}
                />
                <View style={[styles.sheet, {paddingBottom: insets.bottom + 8}]}>
                    <View style={styles.header}>
                        <Text style={styles.title}>
                            {isCurrentUserOwner ?
                                intl.formatMessage({id: 'contacts.manager_management', defaultMessage: 'Manager management'}) :
                                intl.formatMessage({id: 'contacts.manager_list', defaultMessage: 'Manager list'})
                            }
                        </Text>
                        <TouchableOpacity
                            onPress={onClose}
                            testID={`${testIDPrefix}.close`}
                        >
                            <CompassIcon
                                name='close'
                                size={22}
                                color={theme.centerChannelColor}
                            />
                        </TouchableOpacity>
                    </View>

                    {isCurrentUserOwner ? (
                        <View style={styles.searchWrap}>
                            <TextInput
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                placeholder={intl.formatMessage({id: 'contacts.manager_search.placeholder', defaultMessage: 'Search users to add as manager'})}
                                placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.54)}
                                style={styles.searchInput}
                                autoCorrect={false}
                                autoCapitalize='none'
                                returnKeyType='search'
                                clearButtonMode={Platform.OS === 'ios' ? 'while-editing' : 'never'}
                                testID={`${testIDPrefix}.search`}
                            />
                        </View>
                    ) : null}

                    <Text style={styles.sectionTitle}>
                        {intl.formatMessage({id: 'contacts.current_managers', defaultMessage: 'Current managers'})}
                    </Text>
                    {managersLoading && managers.length === 0 ? (
                        <View style={{paddingVertical: 24, alignItems: 'center'}}>
                            <Loading
                                color={theme.centerChannelColor}
                                size='small'
                            />
                        </View>
                    ) : managers.length === 0 ? (
                        <Text style={styles.hint}>
                            {intl.formatMessage({id: 'contacts.current_managers_empty', defaultMessage: 'No managers yet'})}
                        </Text>
                    ) : (
                        <FlatList<UserProfile>
                            data={managers}
                            keyExtractor={(item: UserProfile) => item.id}
                            keyboardShouldPersistTaps='handled'
                            renderItem={({item}: {item: UserProfile}) => (
                                <View style={styles.row}>
                                    <ContactAvatar
                                        employee={item}
                                        size={36}
                                    />
                                    <Text
                                        style={styles.name}
                                        numberOfLines={1}
                                    >
                                        {getContactListDisplayName(item)}
                                    </Text>
                                    {renderTags(item.id)}
                                    {isCurrentUserOwner && item.id !== ownerId ? (
                                        <TouchableOpacity
                                            style={[styles.action, styles.removeAction]}
                                            onPress={() => handleSetManager(item, false)}
                                            disabled={Boolean((excludeUserId && item.id === excludeUserId) || updatingUserId === item.id)}
                                            testID={`${testIDPrefix}.remove.${item.id}`}
                                        >
                                            <Text style={styles.removeActionText}>
                                                {intl.formatMessage({id: 'common.remove', defaultMessage: 'Remove'})}
                                            </Text>
                                        </TouchableOpacity>
                                    ) : null}
                                </View>
                            )}
                        />
                    )}

                    {isCurrentUserOwner ? (
                        <>
                            <Text style={styles.sectionTitle}>
                                {intl.formatMessage({id: 'contacts.search_result', defaultMessage: 'Search result'})}
                            </Text>
                            {searchQuery.trim() && searchPending ? (
                                <View style={{paddingVertical: 24, alignItems: 'center'}}>
                                    <Loading
                                        color={theme.centerChannelColor}
                                        size='small'
                                    />
                                </View>
                            ) : !searchQuery.trim() ? (
                                <Text style={styles.hint}>
                                    {intl.formatMessage({id: 'contacts.manager_search_hint', defaultMessage: 'Type a name, email, or phone to search users'})}
                                </Text>
                            ) : managerEntries.length === 0 ? (
                                <Text style={styles.hint}>
                                    {intl.formatMessage({id: 'contacts.manager_search_empty', defaultMessage: 'No users available to add'})}
                                </Text>
                            ) : (
                                <FlatList<UserProfile>
                                    data={managerEntries}
                                    keyExtractor={(entry: UserProfile) => `manager-search-${entry.id}`}
                                    keyboardShouldPersistTaps='handled'
                                    renderItem={({item}: {item: UserProfile}) => (
                                        <View style={styles.row}>
                                            <ContactAvatar
                                                employee={item}
                                                size={36}
                                            />
                                            <Text
                                                style={styles.name}
                                                numberOfLines={1}
                                            >
                                                {getContactListDisplayName(item)}
                                            </Text>
                                            {renderTags(item.id)}
                                            <TouchableOpacity
                                                style={[styles.action, styles.addAction]}
                                                onPress={() => handleSetManager(item, true)}
                                                disabled={updatingUserId === item.id}
                                                testID={`${testIDPrefix}.add.${item.id}`}
                                            >
                                                <Text style={styles.addActionText}>
                                                    {intl.formatMessage({id: 'common.add', defaultMessage: 'Add'})}
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                />
                            )}
                        </>
                    ) : null}
                </View>
            </View>
        </Modal>
    );
};

export default TeamManagerModal;
