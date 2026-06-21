// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {FlatList, Platform, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {type Edge, SafeAreaView} from 'react-native-safe-area-context';

import {searchPosts} from '@actions/remote/search';
import CompassIcon from '@components/compass_icon';
import Loading from '@components/loading';
import Search from '@components/search';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import DatabaseManager from '@database/manager';
import {queryUsersById} from '@queries/servers/user';
import {popTopScreen} from '@screens/navigation';
import {changeOpacity, getKeyboardAppearanceFromTheme} from '@utils/theme';
import {displayUsername} from '@utils/user';

import DatePickerModal from './components/date_picker_modal';
import MemberListItem from './components/member_list_item';
import SearchResultItem from './components/search_result_item';
import TabBar, {type SearchTab} from './components/tab_bar';

import type ChannelModel from '@typings/database/models/servers/channel';
import type UserModel from '@typings/database/models/servers/user';
import type {AvailableScreens} from '@typings/screens/navigation';

const TEST_ID = 'search_chat_history';
const DEBOUNCE_MS = 300;
const PAGE_SIZE = 20;

type Props = {
    channel: ChannelModel;
    channelId: string;
    componentId: AvailableScreens;
    memberIds: string[];
    memberUsers: UserModel[];
    teamId: string;
}

const edges: Edge[] = ['bottom', 'left', 'right'];

const styles = StyleSheet.create({
    flex: {
        flex: 1,
    },
    searchBar: {
        marginLeft: 20,
        marginRight: Platform.select({ios: 12, default: 20}),
        marginTop: 12,
    },
    content: {
        flex: 1,
    },
    empty: {
        alignItems: 'center',
        flex: 1,
        justifyContent: 'center',
        paddingVertical: 40,
    },
    loading: {
        justifyContent: 'center',
        paddingVertical: 20,
    },
    dateGroupLabel: {
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 4,
    },
    memberFilterTag: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 6,
    },
    dateTrigger: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
});

const getStyleSheet = (theme: Theme) => ({
    dateGroupText: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
        fontSize: 12,
        fontWeight: '600' as const,
    },
    emptyText: {
        color: changeOpacity(theme.centerChannelColor, 0.48),
        fontSize: 14,
        marginTop: 8,
    },
    memberFilterTagBg: {
        backgroundColor: changeOpacity(theme.buttonBg, 0.1),
        borderRadius: 16,
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    memberFilterName: {
        color: theme.buttonBg,
        fontSize: 13,
        marginRight: 6,
    },
    memberFilterClose: {
        color: theme.buttonBg,
    },
    dateTriggerText: {
        color: theme.centerChannelColor,
        fontSize: 14,
        marginLeft: 8,
        flex: 1,
    },
    dateTriggerPlaceholder: {
        color: changeOpacity(theme.centerChannelColor, 0.48),
        fontSize: 14,
        marginLeft: 8,
        flex: 1,
    },
    dateTriggerIcon: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
    },
});

// Group posts by date string
const groupPostsByDate = (posts: Post[]): Array<{date: string; posts: Post[]}> => {
    const groups: Record<string, Post[]> = {};
    const order: string[] = [];

    posts.forEach((post) => {
        const dateKey = new Date(post.create_at).toLocaleDateString();
        if (!groups[dateKey]) {
            groups[dateKey] = [];
            order.push(dateKey);
        }
        groups[dateKey].push(post);
    });

    return order.map((date) => ({date, posts: groups[date]}));
};

// A section header component for date groups
const DateGroupHeader = ({date, theme}: {date: string; theme: Theme}) => {
    const s = getStyleSheet(theme);
    return (
        <View style={styles.dateGroupLabel}>
            <Text style={s.dateGroupText}>{date}</Text>
        </View>
    );
};

const SearchChatHistory = ({
    channel,
    channelId,
    componentId,
    memberIds,
    memberUsers,
    teamId,
}: Props) => {
    const theme = useTheme();
    const s = getStyleSheet(theme);
    const serverUrl = useServerUrl();
    const {formatMessage} = useIntl();

    const close = useCallback(() => {
        popTopScreen(componentId);
    }, [componentId]);

    useAndroidHardwareBackHandler(componentId, close);

    // Search state
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState<SearchTab>('text');
    const [results, setResults] = useState<Post[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [selectedDate, setSelectedDate] = useState('');
    const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
    const [memberFilter, setMemberFilter] = useState('');
    const [showDatePicker, setShowDatePicker] = useState(false);

    // User profiles map for post authors (populated after search results come in)
    const [authorMap, setAuthorMap] = useState<Record<string, UserModel>>({});

    const debounceTimer = useRef<ReturnType<typeof setTimeout>>();
    const lastSearchRequest = useRef<number>(0);
    const flatListRef = useRef<FlatList>(null);

    // Build a combined user map from memberUsers (always available) and authorMap (from search results)
    const userMap = useMemo(() => {
        const map: Record<string, UserModel> = {};
        memberUsers.forEach((u) => {
            map[u.id] = u;
        });
        Object.assign(map, authorMap);
        return map;
    }, [memberUsers, authorMap]);

    // Build search terms and perform search
    const performSearch = useCallback(async (terms: string, searchPage: number) => {
        const t = Date.now();
        lastSearchRequest.current = t;
        setIsLoading(true);

        try {
            let searchTerms = `channel:${channelId}`;

            if (activeTab === 'files') {
                searchTerms += ' has:file';
            } else if (activeTab === 'media') {
                searchTerms += ' has:image';
            }

            if (selectedDate && activeTab === 'date') {
                searchTerms += ` on:${selectedDate}`;
            }

            if (selectedMemberId) {
                const member = userMap[selectedMemberId];
                if (member) {
                    searchTerms += ` from:${member.username}`;
                }
            }

            if (terms.trim()) {
                searchTerms += ` ${terms.trim()}`;
            }

            const result = await searchPosts(serverUrl, teamId, {
                terms: searchTerms,
                is_or_search: true,
                page: searchPage,
                per_page: PAGE_SIZE,
            });

            // Bail if a newer search was initiated
            if (lastSearchRequest.current !== t) {
                return;
            }

            if (result?.posts && result.posts.length > 0) {
                const sortedPosts = [...result.posts].sort((a, b) => b.create_at - a.create_at);

                if (searchPage === 0) {
                    setResults(sortedPosts);
                } else {
                    setResults((prev) => [...prev, ...sortedPosts]);
                }
                setHasMore(sortedPosts.length >= PAGE_SIZE);

                // Fetch user profiles for post authors from local DB
                const authorIds = [...new Set(sortedPosts.map((p) => p.user_id))];
                const newIds = authorIds.filter((id) => !userMap[id]);
                if (newIds.length > 0) {
                    try {
                        const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
                        const authors = await queryUsersById(database, newIds).fetch();
                        if (authors.length > 0) {
                            const map: Record<string, UserModel> = {};
                            authors.forEach((u) => {
                                map[u.id] = u;
                            });
                            setAuthorMap((prev) => ({...prev, ...map}));
                        }
                    } catch {
                        // authors not yet in local DB — that's ok, avatars will be empty
                    }
                }
            } else {
                if (searchPage === 0) {
                    setResults([]);
                }
                setHasMore(false);
            }
        } catch {
            if (searchPage === 0) {
                setResults([]);
            }
            setHasMore(false);
        } finally {
            if (lastSearchRequest.current === t) {
                setIsLoading(false);
            }
        }
    }, [channelId, serverUrl, teamId, activeTab, selectedDate, selectedMemberId, userMap]);

    // Debounced search on input/filter change
    useEffect(() => {
        if (activeTab === 'members') {
            return;
        }

        if (debounceTimer.current) {
            clearTimeout(debounceTimer.current);
        }

        debounceTimer.current = setTimeout(() => {
            setPage(0);
            performSearch(searchTerm, 0);
        }, DEBOUNCE_MS);

        return () => {
            if (debounceTimer.current) {
                clearTimeout(debounceTimer.current);
            }
        };
    }, [searchTerm, activeTab, selectedDate, selectedMemberId, performSearch]);

    // Load more on scroll
    const handleLoadMore = useCallback(() => {
        if (isLoading || !hasMore) {
            return;
        }
        const nextPage = page + 1;
        setPage(nextPage);
        performSearch(searchTerm, nextPage);
    }, [isLoading, hasMore, page, performSearch, searchTerm]);

    // Handle search text change
    const onTextChange = useCallback((text: string) => {
        if (activeTab === 'members') {
            setMemberFilter(text);
        } else {
            setSearchTerm(text);
        }
    }, [activeTab]);

    const clearSearch = useCallback(() => {
        setSearchTerm('');
        setMemberFilter('');
    }, []);

    // Handle tab press
    const handleTabPress = useCallback((tab: SearchTab) => {
        setActiveTab(tab);
        if (tab !== 'members') {
            setSelectedMemberId(null);
        }
    }, []);

    // Handle member press (filter by member)
    const handleMemberPress = useCallback((userId: string) => {
        setSelectedMemberId(userId);
        setActiveTab('text');
        setSearchTerm('');
    }, []);

    // Handle post press (navigate to post)
    const handlePostPress = useCallback((post: Post) => {
        // Close search screen
        close();
    }, [close]);

    // Handle date picker
    const handleDateConfirm = useCallback((date: string) => {
        setSelectedDate(date);
        setShowDatePicker(false);
    }, []);

    const handleDateCancel = useCallback(() => {
        setShowDatePicker(false);
    }, []);

    // Filter members for Members tab
    const filteredMembers = useMemo(() => {
        if (!memberFilter.trim()) {
            return memberUsers;
        }
        const term = memberFilter.toLowerCase();
        return memberUsers.filter((u) =>
            u.username.toLowerCase().includes(term) ||
            (u.firstName || '').toLowerCase().includes(term) ||
            (u.lastName || '').toLowerCase().includes(term) ||
            (u.nickname || '').toLowerCase().includes(term),
        );
    }, [memberUsers, memberFilter]);

    // Group results by date
    const groupedResults = useMemo(() => groupPostsByDate(results), [results]);

    // Build flat list data with date headers
    const flatListData = useMemo(() => {
        const data: Array<{type: 'header'; date: string} | {type: 'post'; post: Post}> = [];
        groupedResults.forEach((group) => {
            data.push({type: 'header', date: group.date});
            group.posts.forEach((post) => {
                data.push({type: 'post', post});
            });
        });
        return data;
    }, [groupedResults]);

    const renderItem = useCallback(({item}: {item: (typeof flatListData)[0]}) => {
        if (item.type === 'header') {
            return <DateGroupHeader date={item.date} theme={theme}/>;
        }
        return (
            <SearchResultItem
                post={item.post}
                author={userMap[item.post.user_id]}
                searchTerm={searchTerm}
                onPress={handlePostPress}
            />
        );
    }, [theme, userMap, searchTerm, handlePostPress]);

    const keyExtractor = useCallback((item: (typeof flatListData)[0]) => {
        if (item.type === 'header') {
            return `header-${item.date}`;
        }
        return item.post.id;
    }, []);

    // Selected member info
    const selectedMember = selectedMemberId ? userMap[selectedMemberId] : null;

    const searchValue = activeTab === 'members' ? memberFilter : searchTerm;

    return (
        <View
            style={styles.flex}
        >
            <SafeAreaView
                edges={edges}
                style={styles.flex}
                testID={`${TEST_ID}.screen`}
            >
                {/* Search bar */}
                <View style={styles.searchBar}>
                    <Search
                        testID={`${TEST_ID}.search_bar`}
                        placeholder={formatMessage({
                            id: 'gm_settings.search_chat_placeholder',
                            defaultMessage: 'Search messages',
                        })}
                        cancelButtonTitle={formatMessage({id: 'common.cancel', defaultMessage: 'Cancel'})}
                        placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.5)}
                        onChangeText={onTextChange}
                        onCancel={clearSearch}
                        autoCapitalize='none'
                        keyboardAppearance={getKeyboardAppearanceFromTheme(theme)}
                        value={searchValue}
                    />
                </View>

                {/* Tab bar */}
                <TabBar
                    activeTab={activeTab}
                    onTabPress={handleTabPress}
                />

                {/* Selected member filter tag */}
                {selectedMember && activeTab !== 'members' && (
                    <View style={styles.memberFilterTag}>
                        <View style={s.memberFilterTagBg}>
                            <Text style={s.memberFilterName}>
                                {displayUsername(selectedMember)}
                            </Text>
                            <TouchableOpacity onPress={() => setSelectedMemberId(null)}>
                                <CompassIcon
                                    name='close-circle'
                                    size={16}
                                    style={s.memberFilterClose}
                                />
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                {/* Date picker trigger for Date tab */}
                {activeTab === 'date' && (
                    <TouchableOpacity
                        style={styles.dateTrigger}
                        onPress={() => setShowDatePicker(true)}
                    >
                        <CompassIcon
                            name='calendar-outline'
                            size={20}
                            style={s.dateTriggerIcon}
                        />
                        {selectedDate ? (
                            <Text style={s.dateTriggerText}>{selectedDate}</Text>
                        ) : (
                            <Text style={s.dateTriggerPlaceholder}>
                                {formatMessage({id: 'gm_settings.select_date', defaultMessage: 'Select date'})}
                            </Text>
                        )}
                        <CompassIcon
                            name='chevron-right'
                            size={20}
                            style={s.dateTriggerIcon}
                        />
                    </TouchableOpacity>
                )}

                {/* Content area */}
                <View style={styles.content}>
                    {activeTab === 'members' ? (
                        /* Members tab */
                        <FlatList
                            data={filteredMembers}
                            renderItem={({item}) => (
                                <MemberListItem
                                    user={item}
                                    onPress={handleMemberPress}
                                />
                            )}
                            keyExtractor={(item) => item.id}
                            ListEmptyComponent={
                                <View style={styles.empty}>
                                    <Text style={s.emptyText}>
                                        {formatMessage({id: 'gm_settings.search_no_members', defaultMessage: 'No members found'})}
                                    </Text>
                                </View>
                            }
                        />
                    ) : (
                        /* Messages/Files/Media/Date tabs */
                        <>
                            {!isLoading && results.length === 0 && (
                                <View style={styles.empty}>
                                    <Text style={s.emptyText}>
                                        {formatMessage({id: 'gm_settings.search_chat_no_results', defaultMessage: 'No messages found'})}
                                    </Text>
                                </View>
                            )}
                            <FlatList
                                ref={flatListRef}
                                data={flatListData}
                                renderItem={renderItem}
                                keyExtractor={keyExtractor}
                                onEndReached={handleLoadMore}
                                onEndReachedThreshold={0.3}
                                ListFooterComponent={
                                    isLoading ? (
                                        <View style={styles.loading}>
                                            <Loading
                                                color={theme.buttonBg}
                                                size='small'
                                            />
                                        </View>
                                    ) : null
                                }
                            />
                        </>
                    )}
                </View>

                {/* Date picker modal */}
                <DatePickerModal
                    visible={showDatePicker}
                    selectedDate={selectedDate}
                    onConfirm={handleDateConfirm}
                    onCancel={handleDateCancel}
                />
            </SafeAreaView>
        </View>
    );
};

export default SearchChatHistory;
