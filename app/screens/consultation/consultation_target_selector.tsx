// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    FlatList,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

import CompassIcon from '@components/compass_icon';
import Loading from '@components/loading';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {queryUsers} from '@queries/servers/user';
import {queryChannels} from '@queries/servers/channel';
import {useDatabase} from '@context/database';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';
import {withObservables} from '@nozbe/watermelondb/react';
import {of as of$, combineLatest} from 'rxjs';
import {switchMap, distinctUntilChanged} from 'rxjs/operators';

import type {WithDatabaseArgs} from '@typings/database/database';
import type UserModel from '@typings/database/models/servers/user';
import type ChannelModel from '@typings/database/models/servers/channel';

type TargetType = 'member' | 'group';

type Props = {
    teamId: string;
    currentUserId: string;
    users: UserModel[];
    channels: ChannelModel[];
    onSelect: (targetUserId: string, expertGroupId?: string) => void;
    onClose: () => void;
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
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    closeButton: {
        padding: 8,
        marginRight: 8,
    },
    title: {
        ...typography('Heading', 400, 'SemiBold'),
        color: theme.centerChannelColor,
        flex: 1,
    },
    tabs: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingTop: 12,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    tab: {
        flex: 1,
        paddingVertical: 12,
        alignItems: 'center',
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    activeTab: {
        borderBottomColor: theme.buttonBg,
    },
    tabText: {
        ...typography('Body', 75, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.56),
    },
    activeTabText: {
        color: theme.buttonBg,
    },
    searchContainer: {
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    searchInput: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    searchText: {
        flex: 1,
        marginLeft: 8,
        ...typography('Body', 200),
        color: theme.centerChannelColor,
    },
    section: {
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 8,
    },
    sectionTitle: {
        ...typography('Body', 50, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        textTransform: 'uppercase',
    },
    recentChips: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: 16,
        paddingBottom: 8,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
        borderRadius: 16,
        paddingHorizontal: 12,
        paddingVertical: 6,
        marginRight: 8,
        marginBottom: 8,
    },
    chipText: {
        ...typography('Body', 75),
        color: theme.centerChannelColor,
        marginLeft: 4,
    },
    listItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.06),
    },
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    avatarText: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    itemInfo: {
        flex: 1,
    },
    itemName: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    itemMeta: {
        ...typography('Body', 50),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginTop: 2,
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 48,
    },
    emptyText: {
        ...typography('Body', 100),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginTop: 12,
    },
}));

const ConsultationTargetSelector = ({
    teamId,
    currentUserId,
    users,
    channels,
    onSelect,
    onClose,
}: Props) => {
    const theme = useTheme();
    const intl = useIntl();
    const styles = getStyleSheet(theme);

    const [activeTab, setActiveTab] = useState<TargetType>('member');
    const [searchQuery, setSearchQuery] = useState('');

    // Filter users: exclude current user and external contacts
    const filteredUsers = useMemo(() => {
        return users.filter((u) => {
            if (u.id === currentUserId) {
                return false;
            }
            // TODO: Filter out external contacts based on user props
            return true;
        });
    }, [users, currentUserId]);

    // Filter channels: GM channels where all members are internal and current user is NOT a member
    const filteredChannels = useMemo(() => {
        return channels.filter((c) => {
            // Only GM channels
            if (c.type !== 'G') {
                return false;
            }
            // TODO: Check if current user is NOT a member
            // TODO: Check if all members are internal
            return true;
        });
    }, [channels]);

    // Apply search filter
    const searchResults = useMemo(() => {
        const query = searchQuery.toLowerCase().trim();
        if (!query) {
            return activeTab === 'member' ? filteredUsers : filteredChannels;
        }

        if (activeTab === 'member') {
            return filteredUsers.filter((u) => {
                const name = (u.firstName + ' ' + u.lastName).toLowerCase();
                const username = u.username.toLowerCase();
                const position = (u.position || '').toLowerCase();
                return name.includes(query) || username.includes(query) || position.includes(query);
            });
        } else {
            return filteredChannels.filter((c) => {
                const name = (c.displayName || c.name || '').toLowerCase();
                return name.includes(query);
            });
        }
    }, [searchQuery, activeTab, filteredUsers, filteredChannels]);

    const handleSelect = useCallback((item: UserModel | ChannelModel) => {
        if (activeTab === 'member') {
            onSelect((item as UserModel).id);
        } else {
            onSelect('', (item as ChannelModel).id);
        }
        onClose();
    }, [activeTab, onSelect, onClose]);

    const renderItem = useCallback(({item}: {item: UserModel | ChannelModel}) => {
        const isUser = activeTab === 'member';
        const name = isUser
            ? `${(item as UserModel).firstName} ${(item as UserModel).lastName}`.trim() || (item as UserModel).username
            : (item as ChannelModel).displayName || (item as ChannelModel).name;
        const meta = isUser
            ? `${(item as UserModel).position || ''}`
            : '';

        return (
            <TouchableOpacity
                style={styles.listItem}
                onPress={() => handleSelect(item)}
                activeOpacity={0.7}
            >
                <View style={styles.avatar}>
                    <CompassIcon
                        name={isUser ? 'account-outline' : 'account-multiple-outline'}
                        size={24}
                        color={theme.centerChannelColor}
                    />
                </View>
                <View style={styles.itemInfo}>
                    <Text style={styles.itemName} numberOfLines={1}>
                        {name}
                    </Text>
                    {meta ? (
                        <Text style={styles.itemMeta} numberOfLines={1}>
                            {meta}
                        </Text>
                    ) : null}
                </View>
            </TouchableOpacity>
        );
    }, [activeTab, handleSelect, styles, theme]);

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                    <CompassIcon name='close' size={24} color={theme.centerChannelColor}/>
                </TouchableOpacity>
                <Text style={styles.title}>
                    {intl.formatMessage({id: 'consultation.select_target', defaultMessage: 'Select Expert'})}
                </Text>
            </View>

            <View style={styles.tabs}>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'member' && styles.activeTab]}
                    onPress={() => setActiveTab('member')}
                >
                    <Text style={[styles.tabText, activeTab === 'member' && styles.activeTabText]}>
                        {intl.formatMessage({id: 'consultation.target.tab_members', defaultMessage: 'Internal Members'})}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'group' && styles.activeTab]}
                    onPress={() => setActiveTab('group')}
                >
                    <Text style={[styles.tabText, activeTab === 'group' && styles.activeTabText]}>
                        {intl.formatMessage({id: 'consultation.target.tab_groups', defaultMessage: 'Internal Groups'})}
                    </Text>
                </TouchableOpacity>
            </View>

            <View style={styles.searchContainer}>
                <View style={styles.searchInput}>
                    <CompassIcon name='magnify' size={20} color={changeOpacity(theme.centerChannelColor, 0.56)}/>
                    <TextInput
                        style={styles.searchText}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        placeholder={intl.formatMessage({id: 'consultation.target.search_placeholder', defaultMessage: 'Search experts...'})}
                        placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.56)}
                    />
                </View>
            </View>

            <FlatList
                data={searchResults}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                ListEmptyComponent={
                    <View style={styles.emptyState}>
                        <CompassIcon name='account-search-outline' size={48} color={changeOpacity(theme.centerChannelColor, 0.32)}/>
                        <Text style={styles.emptyText}>
                            {intl.formatMessage({id: 'consultation.target.no_results', defaultMessage: 'No experts found'})}
                        </Text>
                    </View>
                }
            />
        </View>
    );
};

const enhance = withObservables(['database', 'teamId'], ({database, teamId}: WithDatabaseArgs & {teamId: string}) => {
    const users = queryUsers(database).observe();
    const channels = queryChannels(database, {team_id: teamId}).observe();
    return {
        users,
        channels,
    };
});

export default withDatabase(enhance(ConsultationTargetSelector));
