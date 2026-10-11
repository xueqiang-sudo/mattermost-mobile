// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {Alert, FlatList, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {type Edge, SafeAreaView} from 'react-native-safe-area-context';

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

const SAFE_AREA_EDGES: Edge[] = ['top', 'bottom', 'left', 'right'];

type Props = {
    visible: boolean;
    companyId: string;
    onClose: () => void;
    onChanged?: () => void;
    excludeUserId?: string;
    testIDPrefix?: string;
};

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
                intl.formatMessage({id: 'contacts.manager_management', defaultMessage: '管理员管理'}),
                intl.formatMessage({id: 'contacts.manager_update_failed', defaultMessage: '更新管理员角色失败，请重试。'}),
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
            intl.formatMessage({id: 'common.add', defaultMessage: '添加'}) :
            intl.formatMessage({id: 'common.remove', defaultMessage: '移除'});
        const message = isManager ?
            intl.formatMessage(
                {id: 'contacts.manager_add_confirm', defaultMessage: '将 {name} 添加为管理员？'},
                {name: getContactListDisplayName(user)},
            ) :
            intl.formatMessage(
                {id: 'contacts.manager_remove_confirm', defaultMessage: '移除 {name} 的管理员角色？'},
                {name: getContactListDisplayName(user)},
            );
        Alert.alert(
            intl.formatMessage({id: 'contacts.manager_management', defaultMessage: '管理员管理'}),
            message,
            [
                {
                    text: intl.formatMessage({id: 'common.cancel', defaultMessage: '取消'}),
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
            transparent={false}
            onRequestClose={onClose}
        >
            <SafeAreaView edges={SAFE_AREA_EDGES} style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity
                        style={styles.backBtn}
                        onPress={onClose}
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
                    <View style={styles.backBtn}/>
                </View>

                {isCurrentUserOwner ? (
                    <View style={styles.searchWrap}>
                        <TextInput
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            placeholder={intl.formatMessage({id: 'contacts.manager_search.placeholder', defaultMessage: '搜索用户添加为管理员'})}
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
                    {intl.formatMessage({id: 'contacts.current_managers', defaultMessage: '当前管理员'})}
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
                        {intl.formatMessage({id: 'contacts.current_managers_empty', defaultMessage: '暂无管理员'})}
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
                                            {intl.formatMessage({id: 'common.remove', defaultMessage: '移除'})}
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
                            {intl.formatMessage({id: 'contacts.search_result', defaultMessage: '搜索结果'})}
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
                                {intl.formatMessage({id: 'contacts.manager_search_hint', defaultMessage: '输入姓名、邮箱或手机号搜索用户'})}
                            </Text>
                        ) : managerEntries.length === 0 ? (
                            <Text style={styles.hint}>
                                {intl.formatMessage({id: 'contacts.manager_search_empty', defaultMessage: '没有可添加的用户'})}
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
                                                {intl.formatMessage({id: 'common.add', defaultMessage: '添加'})}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            />
                        )}
                    </>
                ) : null}
            </SafeAreaView>
        </Modal>
    );
};

export default TeamManagerModal;
