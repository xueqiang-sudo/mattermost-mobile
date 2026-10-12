// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {Alert, FlatList, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {type Edge, SafeAreaView} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import ContactAvatar from '@components/contact_avatar';
import Loading from '@components/loading';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {setTeamManagerRole} from '@actions/remote/team';
import {fetchTeamManagers} from '@actions/remote/team';
import {searchContactEmployees} from '@actions/remote/search';
import NetworkManager from '@managers/network_manager';
import {dismissModal} from '@screens/navigation';
import {getContactListDisplayName} from '@utils/user';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {AvailableScreens} from '@typings/screens/navigation';

const SAFE_AREA_EDGES: Edge[] = ['top', 'bottom', 'left', 'right'];

type Props = {
    componentId: AvailableScreens;
    companyId: string;
    onBack?: () => void;
    onChanged?: () => void;
    excludeUserId?: string;
    testIDPrefix?: string;
};

type EnterpriseUserTagKey = 'owner' | 'self' | 'manager';

function buildEnterpriseUserTagKeys({
    userId,
    ownerId,
    currentUserId,
    managerIds,
}: {
    userId: string;
    ownerId?: string;
    currentUserId?: string;
    managerIds: Set<string>;
}): EnterpriseUserTagKey[] {
    const keys: EnterpriseUserTagKey[] = [];
    if (ownerId && userId === ownerId) {
        keys.push('owner');
    }
    if (currentUserId && userId === currentUserId) {
        keys.push('self');
    }
    if (managerIds.has(userId)) {
        keys.push('manager');
    }
    return keys;
}

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: theme.sidebarBg,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.sidebarText, 0.1),
    },
    backBtn: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        flex: 1,
        ...typography('Heading', 300, 'SemiBold'),
        color: theme.sidebarText,
        textAlign: 'center',
    },
    saveBtn: {
        minWidth: 60,
        height: 40,
        alignItems: 'flex-end',
        justifyContent: 'center',
    },
    saveBtnText: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.sidebarText,
    },
    saveBtnTextDisabled: {
        color: changeOpacity(theme.sidebarText, 0.4),
    },
    searchWrap: {
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    searchInput: {
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.18),
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        color: theme.centerChannelColor,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        ...typography('Body', 100),
    },
    listContent: {
        paddingBottom: 20,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    checkbox: {
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 2,
        borderColor: changeOpacity(theme.centerChannelColor, 0.36),
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    checkboxChecked: {
        backgroundColor: theme.buttonBg,
        borderColor: theme.buttonBg,
    },
    checkmark: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#ffffff',
    },
    name: {
        flex: 1,
        ...typography('Body', 200, 'SemiBold'),
        color: theme.centerChannelColor,
        marginRight: 8,
    },
    tagsWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
    },
    tag: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    tagText: {
        ...typography('Body', 75, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.72),
    },
    selfTag: {
        backgroundColor: changeOpacity(theme.buttonBg, 0.12),
    },
    selfTagText: {
        color: theme.buttonBg,
    },
    ownerTag: {
        backgroundColor: changeOpacity(theme.buttonBg, 0.12),
    },
    ownerTagText: {
        color: theme.buttonBg,
    },
    hint: {
        ...typography('Body', 200),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        textAlign: 'center',
        paddingVertical: 40,
        paddingHorizontal: 24,
    },
}));

const TeamManagerScreen = ({componentId, companyId, onBack, onChanged, excludeUserId, testIDPrefix = 'team_manager'}: Props) => {
    const theme = useTheme();
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const styles = getStyleSheet(theme);

    const [allMembers, setAllMembers] = useState<UserProfile[]>([]);
    const [membersLoading, setMembersLoading] = useState(false);
    const [selectedManagerIds, setSelectedManagerIds] = useState<Set<string>>(new Set());
    const [initialManagerIds, setInitialManagerIds] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [searchPending, setSearchPending] = useState(false);
    const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
    const [saving, setSaving] = useState(false);
    const searchSeq = useRef(0);
    const [ownerId, setOwnerId] = useState<string | undefined>();
    const [currentUserId, setCurrentUserId] = useState<string | undefined>();
    const isCurrentUserOwner = Boolean(ownerId && currentUserId && ownerId === currentUserId);

    const hasChanges = useMemo(() => {
        if (selectedManagerIds.size !== initialManagerIds.size) {
            return true;
        }
        for (const id of selectedManagerIds) {
            if (!initialManagerIds.has(id)) {
                return true;
            }
        }
        return false;
    }, [selectedManagerIds, initialManagerIds]);

    const filteredMembers = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) {
            return allMembers;
        }
        return allMembers.filter((u) =>
            u.username?.toLowerCase().includes(q) ||
            u.nickname?.toLowerCase().includes(q) ||
            u.email?.toLowerCase().includes(q) ||
            u.first_name?.toLowerCase().includes(q) ||
            u.last_name?.toLowerCase().includes(q),
        );
    }, [allMembers, searchQuery]);

    const loadAllMembers = useCallback(async () => {
        if (!serverUrl || !companyId) {
            return;
        }
        setMembersLoading(true);
        try {
            const client = NetworkManager.getClient(serverUrl);
            const [managersResult, members] = await Promise.all([
                fetchTeamManagers(serverUrl, companyId),
                client.getTeamMembers(companyId, 0, 500),
            ]);

            const managerIds = new Set<string>();
            if (!managersResult.error && managersResult.data) {
                managersResult.data.forEach((item) => managerIds.add(item.user.id));
            }

            const userIds = members.map((m: {user_id: string}) => m.user_id);
            let users: UserProfile[] = [];
            if (userIds.length > 0) {
                users = await client.getProfilesByIds(userIds);
            }

            if (excludeUserId) {
                users = users.filter((u) => u.id !== excludeUserId);
            }

            setAllMembers(users);
            setSelectedManagerIds(managerIds);
            setInitialManagerIds(new Set(managerIds));
        } catch {
            setAllMembers([]);
            setSelectedManagerIds(new Set());
            setInitialManagerIds(new Set());
        } finally {
            setMembersLoading(false);
        }
    }, [companyId, excludeUserId, serverUrl]);

    useEffect(() => {
        setSearchQuery('');
        setSearchResults([]);
        setSearchPending(false);
        loadAllMembers();
    }, [loadAllMembers]);

    useEffect(() => {
        if (!serverUrl) {
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
    }, [companyId, serverUrl]);

    useEffect(() => {
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
                if (excludeUserId && u.id === excludeUserId) {
                    return false;
                }
                return true;
            });
            setSearchResults(filtered);
            setSearchPending(false);
        }, 300);
        return () => clearTimeout(timer);
    }, [companyId, excludeUserId, searchQuery, serverUrl]);

    const displayList = useMemo(() => {
        if (searchQuery.trim()) {
            return searchResults;
        }
        return filteredMembers;
    }, [searchQuery, searchResults, filteredMembers]);

    const handleClose = useCallback(() => {
        if (onBack) {
            onBack();
        } else {
            dismissModal({componentId});
        }
    }, [onBack, componentId]);

    const renderTags = useCallback((userId: string) => {
        const tagKeys = buildEnterpriseUserTagKeys({
            userId,
            ownerId,
            currentUserId,
            managerIds: selectedManagerIds,
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
                                    {intl.formatMessage({id: 'contacts.owner_tag', defaultMessage: '所有者'})}
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
                                    {intl.formatMessage({id: 'contacts.self_tag', defaultMessage: '自己'})}
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
                                {intl.formatMessage({id: 'contacts.manager_tag', defaultMessage: '管理员'})}
                            </Text>
                        </View>
                    );
                })}
            </View>
        );
    }, [currentUserId, intl, ownerId, selectedManagerIds, styles.ownerTag, styles.ownerTagText, styles.selfTag, styles.selfTagText, styles.tag, styles.tagText, styles.tagsWrap]);

    const handleToggleManager = useCallback((userId: string) => {
        if (!isCurrentUserOwner) {
            return;
        }
        // Owner cannot be removed from managers
        if (ownerId && userId === ownerId && selectedManagerIds.has(userId)) {
            return;
        }
        setSelectedManagerIds((prev) => {
            const next = new Set(prev);
            if (next.has(userId)) {
                next.delete(userId);
            } else {
                next.add(userId);
            }
            return next;
        });
    }, [isCurrentUserOwner, ownerId, selectedManagerIds]);

    const handleConfirm = useCallback(async () => {
        if (!serverUrl || !isCurrentUserOwner || !hasChanges) {
            return;
        }
        setSaving(true);

        const toAdd: string[] = [];
        const toRemove: string[] = [];

        for (const id of selectedManagerIds) {
            if (!initialManagerIds.has(id)) {
                toAdd.push(id);
            }
        }
        for (const id of initialManagerIds) {
            if (!selectedManagerIds.has(id)) {
                toRemove.push(id);
            }
        }

        const client = NetworkManager.getClient(serverUrl);
        const allUserIds = Array.from(new Set([...toAdd, ...toRemove, ...Array.from(selectedManagerIds)]));
        let users: UserProfile[] = [];
        if (allUserIds.length > 0) {
            try {
                users = await client.getProfilesByIds(allUserIds);
            } catch {
                // no-op
            }
        }
        const userMap = new Map(users.map((u) => [u.id, u]));

        let hasError = false;

        // Add new managers
        for (const userId of toAdd) {
            const result = await setTeamManagerRole(serverUrl, companyId, userId, true);
            if (result.error) {
                hasError = true;
            }
        }

        // Remove managers
        for (const userId of toRemove) {
            const result = await setTeamManagerRole(serverUrl, companyId, userId, false);
            if (result.error) {
                hasError = true;
            }
        }

        setSaving(false);

        if (hasError) {
            Alert.alert(
                intl.formatMessage({id: 'contacts.manager_management', defaultMessage: '管理员管理'}),
                intl.formatMessage({id: 'contacts.manager_update_failed', defaultMessage: '更新管理员角色失败，请重试。'}),
            );
        }

        setInitialManagerIds(new Set(selectedManagerIds));
        onChanged?.();
        handleClose();
    }, [companyId, hasChanges, initialManagerIds, intl, isCurrentUserOwner, onChanged, handleClose, selectedManagerIds, serverUrl]);

    const handleCancel = useCallback(() => {
        if (hasChanges) {
            Alert.alert(
                intl.formatMessage({id: 'contacts.manager_management', defaultMessage: '管理员管理'}),
                intl.formatMessage({id: 'contacts.manager_discard_changes', defaultMessage: '有未保存的更改，确定要放弃吗？'}),
                [
                    {
                        text: intl.formatMessage({id: 'common.cancel', defaultMessage: '取消'}),
                        style: 'cancel',
                    },
                    {
                        text: intl.formatMessage({id: 'common.discard', defaultMessage: '放弃'}),
                        style: 'destructive',
                        onPress: handleClose,
                    },
                ],
            );
        } else {
            handleClose();
        }
    }, [hasChanges, intl, handleClose]);

    const renderItem = useCallback(({item}: {item: UserProfile}) => {
        const isSelected = selectedManagerIds.has(item.id);
        const isOwner = ownerId === item.id;
        const canToggle = isCurrentUserOwner && !isOwner;

        return (
            <TouchableOpacity
                style={styles.row}
                onPress={() => canToggle && handleToggleManager(item.id)}
                disabled={!canToggle}
                activeOpacity={canToggle ? 0.7 : 1}
            >
                {isCurrentUserOwner ? (
                    <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                        {isSelected ? <View style={styles.checkmark}/> : null}
                    </View>
                ) : null}
                <ContactAvatar
                    employee={item}
                    size={36}
                />
                <Text
                    style={[styles.name, {marginLeft: 12}]}
                    numberOfLines={1}
                >
                    {getContactListDisplayName(item)}
                </Text>
                {renderTags(item.id)}
            </TouchableOpacity>
        );
    }, [handleToggleManager, isCurrentUserOwner, ownerId, renderTags, selectedManagerIds, styles.checkbox, styles.checkboxChecked, styles.checkmark, styles.name, styles.row]);

    return (
        <SafeAreaView edges={SAFE_AREA_EDGES} style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.backBtn}
                    onPress={handleCancel}
                    testID={`${testIDPrefix}.back`}
                >
                    <CompassIcon
                        name='arrow-left'
                        size={24}
                        color={theme.sidebarText}
                    />
                </TouchableOpacity>
                <Text style={styles.headerTitle} numberOfLines={1}>
                    {isCurrentUserOwner ?
                        intl.formatMessage({id: 'contacts.manager_management', defaultMessage: '管理员管理'}) :
                        intl.formatMessage({id: 'contacts.manager_list', defaultMessage: '管理员列表'})
                    }
                </Text>
                {isCurrentUserOwner ? (
                    <TouchableOpacity
                        style={styles.saveBtn}
                        onPress={handleConfirm}
                        disabled={!hasChanges || saving}
                        testID={`${testIDPrefix}.confirm`}
                    >
                        <Text style={[styles.saveBtnText, (!hasChanges || saving) && styles.saveBtnTextDisabled]}>
                            {saving ?
                                intl.formatMessage({id: 'mobile.post.saving', defaultMessage: '保存中...'}) :
                                intl.formatMessage({id: 'common.confirm', defaultMessage: '确认'})
                            }
                        </Text>
                    </TouchableOpacity>
                ) : (
                    <View style={styles.saveBtn}/>
                )}
            </View>

            {isCurrentUserOwner ? (
                <View style={styles.searchWrap}>
                    <TextInput
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        placeholder={intl.formatMessage({id: 'contacts.transfer_search_placeholder', defaultMessage: '输入手机号,昵称...'})}
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

            {membersLoading && allMembers.length === 0 ? (
                <View style={{paddingVertical: 24, alignItems: 'center'}}>
                    <Loading
                        color={theme.centerChannelColor}
                        size='small'
                    />
                </View>
            ) : displayList.length === 0 ? (
                <Text style={styles.hint}>
                    {searchQuery.trim() ?
                        intl.formatMessage({id: 'contacts.transfer_no_members', defaultMessage: '没有匹配的成员'}) :
                        intl.formatMessage({id: 'contacts.current_managers_empty', defaultMessage: '暂无成员'})
                    }
                </Text>
            ) : (
                <FlatList<UserProfile>
                    data={displayList}
                    keyExtractor={(item: UserProfile) => item.id}
                    keyboardShouldPersistTaps='handled'
                    renderItem={renderItem}
                    contentContainerStyle={styles.listContent}
                />
            )}
        </SafeAreaView>
    );
};

export default TeamManagerScreen;
