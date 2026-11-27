// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import {SafeAreaView} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import {Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import DatabaseManager from '@database/manager';
import {getCurrentUserId} from '@queries/servers/system';
import {goToScreen, popTopScreen} from '@screens/navigation';
import {isSystemMessage} from '@utils/post';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import {
    getOrCreateSmartNotebookChannel,
    getChannelPosts,
    deletePost,
    getGraphEntities,
    type Post,
    type Channel,
    type GraphEntity,
} from './smart_notebook_api';

// ---- Types ----

type TopTab = 'knowledge' | 'quick_notes';
type KnowledgeSubTab = 'timeline' | 'entities';

type QuickNoteData = {
    title: string;
    content: string;
};

// ---- Helpers ----

function formatQuickNoteDate(timestamp: number, intl: {formatMessage: (desc: {id: string; defaultMessage: string}) => string}): string {
    const d = new Date(timestamp);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = today - 86400000;
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');

    if (timestamp >= today) {
        return `${hh}:${mi}`;
    }
    if (timestamp >= yesterday) {
        return `${intl.formatMessage({id: 'smart_notebook.date.yesterday', defaultMessage: '昨天'})} ${hh}:${mi}`;
    }
    const mm = d.getMonth() + 1;
    const dd = d.getDate();
    if (d.getFullYear() === now.getFullYear()) {
        return `${mm}/${dd} ${hh}:${mi}`;
    }
    return `${d.getFullYear()}/${mm}/${dd} ${hh}:${mi}`;
}

function formatTimelineDate(timestamp: number, intl: {formatMessage: (desc: {id: string; defaultMessage: string}) => string}): {dateLabel: string; timeLabel: string} {
    const d = new Date(timestamp);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = today - 86400000;
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    const timeLabel = `${hh}:${mi}`;

    if (timestamp >= today) {
        return {dateLabel: intl.formatMessage({id: 'smart_notebook.date.today', defaultMessage: '今天'}), timeLabel};
    }
    if (timestamp >= yesterday) {
        return {dateLabel: intl.formatMessage({id: 'smart_notebook.date.yesterday', defaultMessage: '昨天'}), timeLabel};
    }
    if (d.getFullYear() === now.getFullYear()) {
        return {dateLabel: `${d.getMonth() + 1}/${d.getDate()}`, timeLabel};
    }
    return {dateLabel: `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`, timeLabel};
}

function getQuickNoteData(post: Post): QuickNoteData {
    const qn = post.props?.quick_note;
    if (qn && typeof qn === 'object') {
        return {
            title: qn.title || post.message,
            content: qn.content || '',
        };
    }
    return {title: post.message, content: ''};
}

// ---- Component ----

type Props = {
    channelId?: string;
};

const SmartNotebookScreen = ({channelId: propChannelId}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const style = getStyleSheet(theme);

    // Top-level tab
    const [topTab, setTopTab] = useState<TopTab>('knowledge');

    // Knowledge sub-tab
    const [subTab, setSubTab] = useState<KnowledgeSubTab>('timeline');

    // User ID & Channel
    const [userId, setUserId] = useState('');
    const [channel, setChannel] = useState<Channel | null>(null);
    const [initializing, setInitializing] = useState(true);

    // Timeline data (posts — knowledge notes only)
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Quick notes data
    const [quickNotes, setQuickNotes] = useState<Post[]>([]);
    const [qnLoading, setQnLoading] = useState(true);
    const [qnRefreshing, setQnRefreshing] = useState(false);

    // Unified search
    const [searchActive, setSearchActive] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const searchInputRef = useRef<TextInput>(null);

    // Refresh flag
    const needsRefresh = useRef(false);

    // Entities sub-tab
    const [graphEntities, setGraphEntities] = useState<GraphEntity[]>([]);
    const [graphLoading, setGraphLoading] = useState(false);
    const [graphLoadingMore, setGraphLoadingMore] = useState(false);
    const [graphHasMore, setGraphHasMore] = useState(true);
    const graphHasMoreRef = useRef(true);
    const graphOffsetRef = useRef(0);
    const graphLoadingRef = useRef(false);
    const GRAPH_PAGE_SIZE = 30;

    // ---- Init: get userId and channel ----
    useEffect(() => {
        const init = async () => {
            try {
                const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
                const uid = await getCurrentUserId(database);
                setUserId(uid);

                if (propChannelId) {
                    // channelId passed from goToScreen (channel header menu)
                    setChannel({id: propChannelId, name: '', display_name: '', team_id: '', type: ''});
                } else {
                    const displayName = intl.formatMessage({id: 'smart_notebook.channel_display_name', defaultMessage: '智能笔记'});
                    const welcomeMessage = intl.formatMessage({
                        id: 'smart_notebook.welcome_post',
                        defaultMessage: '📒 **欢迎使用智能笔记**\n\n**随手记** — 随时发送消息，自动同步到知识图谱，帮你构建个人知识网络。\n\n**备忘录** — 结构化的标题+内容笔记，适合记录待办事项、会议纪要等，不同步到知识图谱。',
                    });
                    const ch = await getOrCreateSmartNotebookChannel(serverUrl, displayName, welcomeMessage);
                    setChannel(ch);
                }
            } catch (err) {
                // silently handle init errors
            } finally {
                setInitializing(false);
            }
        };
        init();
    }, [serverUrl, propChannelId]);

    // ---- Load all posts (then split into knowledge notes and quick notes) ----
    const loadAllPosts = useCallback(async () => {
        if (!channel?.id) return;
        setLoading(true);
        setQnLoading(true);
        try {
            const result = await getChannelPosts(serverUrl, channel.id, 100);

            // Split: timeline shows knowledge posts (no quick_note, no system posts, no welcome_post), 备忘录 shows quick_note posts
            const knowledge: Post[] = [];
            const quick: Post[] = [];
            for (const post of result) {
                if (post.props?.quick_note && post.user_id === userId) {
                    quick.push(post);
                } else if (!post.props?.quick_note && !post.props?.welcome_post && !isSystemMessage(post)) {
                    knowledge.push(post);
                }
            }
            setPosts(knowledge);
            setQuickNotes(quick);
        } catch {
            setPosts([]);
            setQuickNotes([]);
        } finally {
            setLoading(false);
            setQnLoading(false);
        }
    }, [serverUrl, channel, userId]);

    useEffect(() => {
        if (channel?.id) {
            loadAllPosts();
        }
    }, [channel, loadAllPosts]);

    // ---- Unified search results ----
    const searchResults = useMemo(() => {
        if (!searchQuery.trim()) return {notes: [], entities: [], memos: []};
        const q = searchQuery.toLowerCase();
        return {
            notes: posts.filter(p => p.message.toLowerCase().includes(q)),
            entities: graphEntities.filter(e =>
                e.name.toLowerCase().includes(q) || (e.summary || '').toLowerCase().includes(q)),
            memos: quickNotes.filter(n => {
                const data = getQuickNoteData(n);
                return data.title.toLowerCase().includes(q) || data.content.toLowerCase().includes(q);
            }),
        };
    }, [searchQuery, posts, graphEntities, quickNotes]);

    // ---- Refresh ----
    const onRefreshKnowledge = useCallback(async () => {
        setRefreshing(true);
        await loadAllPosts();
        setRefreshing(false);
    }, [loadAllPosts]);

    const onRefreshQuickNotes = useCallback(async () => {
        setQnRefreshing(true);
        await loadAllPosts();
        setQnRefreshing(false);
    }, [loadAllPosts]);


    // ---- Click timeline item → go back to channel ----
    const onTimelineItemClick = useCallback((_post: Post) => {
        // 返回频道（和 webapp RHS 面板行为一致：点击条目回到频道查看帖子）
        popTopScreen();
    }, []);


    // ---- Open quick note detail ----
    const openQuickNote = useCallback((note: Post) => {
        needsRefresh.current = true;
        const data = getQuickNoteData(note);
        const title = intl.formatMessage({id: 'quick_note.edit', defaultMessage: '编辑随手记'});
        goToScreen(Screens.QUICK_NOTE_DETAIL, title, {
            postId: note.id,
            channelId: channel?.id,
            title: data.title,
            content: data.content,
        });
    }, [channel, intl]);

    // ---- Create new quick note ----
    const onCreateQuickNote = useCallback(() => {
        needsRefresh.current = true;
        const title = intl.formatMessage({id: 'quick_note.new', defaultMessage: '新建随手记'});
        goToScreen(Screens.QUICK_NOTE_DETAIL, title, {
            postId: 'new',
            channelId: channel?.id,
        });
    }, [channel, intl]);

    // ---- Delete quick note ----
    const onDeleteQuickNote = useCallback((note: Post) => {
        Alert.alert(
            intl.formatMessage({id: 'quick_note.delete_title', defaultMessage: '删除随手记'}),
            intl.formatMessage({id: 'quick_note.delete_confirm', defaultMessage: '确定要删除这条随手记吗？'}),
            [
                {
                    text: intl.formatMessage({id: 'common.cancel', defaultMessage: '取消'}),
                    style: 'cancel',
                },
                {
                    text: intl.formatMessage({id: 'quick_note.delete', defaultMessage: '删除'}),
                    style: 'destructive',
                    onPress: async () => {
                        const success = await deletePost(serverUrl, note.id);
                        if (success) {
                            setQuickNotes(prev => prev.filter(n => n.id !== note.id));
                        } else {
                            Alert.alert(
                                intl.formatMessage({id: 'quick_note.delete_failed', defaultMessage: '删除失败'}),
                            );
                        }
                    },
                },
            ],
        );
    }, [intl, serverUrl]);

    // ---- Load graph entities (paginated) ----
    const loadGraph = useCallback(async (refresh = false) => {
        if (!userId) return;
        if (graphLoadingRef.current) return;
        if (!refresh && !graphHasMoreRef.current) return;
        graphLoadingRef.current = true;
        if (refresh) {
            setGraphLoading(true);
            graphOffsetRef.current = 0;
            graphHasMoreRef.current = true;
            setGraphHasMore(true);
        } else {
            setGraphLoadingMore(true);
        }
        try {
            const offset = refresh ? 0 : graphOffsetRef.current;
            const result = await getGraphEntities(serverUrl, userId, GRAPH_PAGE_SIZE, offset);
            const newEntities = result.entities || [];
            if (refresh) {
                setGraphEntities(newEntities);
            } else {
                setGraphEntities(prev => [...prev, ...newEntities]);
            }
            graphOffsetRef.current = offset + newEntities.length;
            // Use API total for accurate pagination; fallback to length check
            const hasMore = typeof result.total === 'number'
                ? graphOffsetRef.current < result.total
                : newEntities.length >= GRAPH_PAGE_SIZE;
            graphHasMoreRef.current = hasMore;
            setGraphHasMore(hasMore);
        } catch {
            // silently handle graph loading errors
        } finally {
            setGraphLoading(false);
            setGraphLoadingMore(false);
            graphLoadingRef.current = false;
        }
    }, [serverUrl, userId]);

    useEffect(() => {
        if (subTab === 'entities' && userId && graphEntities.length === 0) {
            loadGraph(true);
        }
    }, [subTab, userId]);

    // ---- Navigate to entity detail ----
    const openEntityDetail = useCallback((entity: GraphEntity) => {
        goToScreen(Screens.ENTITY_DETAIL, entity.name, {
            entityUuid: entity.uuid,
            entityName: entity.name,
            entitySummary: entity.summary || '',
            userId,
        });
    }, [userId]);

    // ---- Render right actions for swipe (quick notes) ----
    const renderQnRightActions = useCallback((note: Post) => {
        return (
            <View style={style.swipeActionsContainer}>
                <TouchableOpacity
                    style={[style.swipeActionBtn, style.swipeActionBtnDanger]}
                    onPress={() => onDeleteQuickNote(note)}
                >
                    <CompassIcon name='trash-can-outline' size={20} color={theme.buttonColor}/>
                    <Text style={style.swipeActionText}>
                        {intl.formatMessage({id: 'quick_note.delete', defaultMessage: '删除'})}
                    </Text>
                </TouchableOpacity>
            </View>
        );
    }, [style, theme, intl, onDeleteQuickNote]);

    // ---- Render timeline post item ----
    const renderPostItem = useCallback(({item}: {item: Post}) => {
        const {dateLabel, timeLabel} = formatTimelineDate(item.create_at, intl);
        return (
            <TouchableOpacity
                style={style.timelineItem}
                onPress={() => onTimelineItemClick(item)}
                activeOpacity={0.7}
            >
                <View style={style.timelineTime}>
                    <Text style={style.timelineDate}>{dateLabel}</Text>
                    <Text style={style.timelineClock}>{timeLabel}</Text>
                </View>
                <Text style={style.timelineContent}>
                    {item.message}
                </Text>
            </TouchableOpacity>
        );
    }, [style, onTimelineItemClick, intl]);

    // ---- Render quick note item ----
    const renderQuickNoteItem = useCallback(({item}: {item: Post}) => {
        const data = getQuickNoteData(item);
        return (
            <GestureHandlerRootView>
                <ReanimatedSwipeable
                    rightThreshold={40}
                    renderRightActions={() => renderQnRightActions(item)}
                >
                    <TouchableOpacity
                        style={style.qnCard}
                        onPress={() => openQuickNote(item)}
                        activeOpacity={0.7}
                    >
                        <View style={style.qnCardHeader}>
                            <Text style={style.qnCardTitle} numberOfLines={1}>
                                {data.title}
                            </Text>
                            <Text style={style.qnCardDate}>
                                {formatQuickNoteDate(item.create_at, intl)}
                            </Text>
                        </View>
                        {data.content ? (
                            <Text style={style.qnCardContent} numberOfLines={4}>
                                {data.content}
                            </Text>
                        ) : null}
                    </TouchableOpacity>
                </ReanimatedSwipeable>
            </GestureHandlerRootView>
        );
    }, [style, openQuickNote, renderQnRightActions]);

    const keyExtractor = useCallback((item: Post) => item.id, []);

    const entityKeyExtractor = useCallback((item: GraphEntity) => item.uuid, []);

    const renderEntityItem = useCallback(({item}: {item: GraphEntity}) => (
        <TouchableOpacity
            style={style.entityCard}
            onPress={() => openEntityDetail(item)}
            activeOpacity={0.7}
        >
            <View style={style.entityHeader}>
                <View style={style.entityContent}>
                    <Text style={style.entityName} numberOfLines={1}>
                        {item.name}
                    </Text>
                    {item.summary ? (
                        <Text style={style.entitySummary} numberOfLines={2}>
                            {item.summary}
                        </Text>
                    ) : null}
                </View>
                <CompassIcon
                    name='chevron-right'
                    size={20}
                    color={changeOpacity(theme.centerChannelColor, 0.3)}
                />
            </View>
        </TouchableOpacity>
    ), [style, openEntityDetail, theme]);

    const entityListFooter = useMemo(() => graphLoadingMore ? (
        <View style={{paddingVertical: 16, alignItems: 'center'}}>
            <ActivityIndicator size='small' color={theme.buttonBg}/>
        </View>
    ) : null, [graphLoadingMore, theme]);

    // ---- Render: loading / error ----
    if (initializing) {
        return (
            <SafeAreaView style={[style.container, {backgroundColor: theme.centerChannelBg}]}>
                <View style={style.loadingContainer}>
                    <ActivityIndicator size='large' color={theme.buttonBg}/>
                    <Text style={style.loadingText}>
                        {intl.formatMessage({id: 'smart_notebook.initializing', defaultMessage: '正在初始化智能笔记...'})}
                    </Text>
                </View>
            </SafeAreaView>
        );
    }

    if (!channel) {
        return (
            <SafeAreaView style={[style.container, {backgroundColor: theme.centerChannelBg}]}>
                <View style={style.emptyContainer}>
                    <CompassIcon name='alert-circle-outline' size={64} color={changeOpacity(theme.centerChannelColor, 0.3)}/>
                    <Text style={style.emptyText}>
                        {intl.formatMessage({id: 'smart_notebook.error', defaultMessage: '无法加载笔记频道'})}
                    </Text>
                </View>
            </SafeAreaView>
        );
    }

    // ---- Render ----
    return (
        <SafeAreaView style={[style.container, {backgroundColor: theme.centerChannelBg}]}>
            {/* Top-level Tabs: 随手记 | 备忘录 */}
            <View style={style.tabsContainer}>
                <TouchableOpacity
                    style={[style.tab, topTab === 'knowledge' && style.tabActive]}
                    onPress={() => setTopTab('knowledge')}
                >
                    <Text style={[style.tabText, topTab === 'knowledge' && style.tabTextActive]}>
                        {intl.formatMessage({id: 'smart_notebook.tab.knowledge', defaultMessage: '随手记'})}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[style.tab, topTab === 'quick_notes' && style.tabActive]}
                    onPress={() => setTopTab('quick_notes')}
                >
                    <Text style={[style.tabText, topTab === 'quick_notes' && style.tabTextActive]}>
                        {intl.formatMessage({id: 'smart_notebook.tab.quick_notes', defaultMessage: '备忘录'})}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* ========== Knowledge Notes Tab ========== */}
            {topTab === 'knowledge' && (
                <>
                    {/* Sub-tabs: 时间线 | 实体 */}
                    <View style={style.subTabsContainer}>
                        <TouchableOpacity
                            style={[style.subTab, subTab === 'timeline' && style.subTabActive]}
                            onPress={() => setSubTab('timeline')}
                        >
                            <Text style={[style.subTabText, subTab === 'timeline' && style.subTabTextActive]}>
                                {intl.formatMessage({id: 'smart_notebook.tab.timeline', defaultMessage: '时间线'})}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[style.subTab, subTab === 'entities' && style.subTabActive]}
                            onPress={() => setSubTab('entities')}
                        >
                            <Text style={[style.subTabText, subTab === 'entities' && style.subTabTextActive]}>
                                {intl.formatMessage({id: 'smart_notebook.tab.entities', defaultMessage: '实体'})}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {/* Timeline sub-tab */}
                    {subTab === 'timeline' && (
                        <>
                            {(() => {
                                const dayMap = new Map<string, Post>();
                                for (const post of posts) {
                                    const dayKey = new Date(post.create_at).toISOString().split('T')[0];
                                    const existing = dayMap.get(dayKey);
                                    if (!existing || post.create_at < existing.create_at) {
                                        dayMap.set(dayKey, post);
                                    }
                                }
                                const dailyPosts = Array.from(dayMap.values()).sort((a, b) => b.create_at - a.create_at);

                                return (
                                    <FlatList
                                        data={dailyPosts}
                                        keyExtractor={keyExtractor}
                                        refreshing={refreshing}
                                        onRefresh={onRefreshKnowledge}
                                        contentContainerStyle={style.listContent}
                                        renderItem={renderPostItem}
                                        ListEmptyComponent={
                                            <View style={style.emptyContainer}>
                                                <CompassIcon name='notebook-outline' size={64} color={changeOpacity(theme.centerChannelColor, 0.3)}/>
                                                <Text style={style.emptyText}>
                                                    {intl.formatMessage({id: 'smart_notebook.empty', defaultMessage: '在频道中写笔记，自动同步到这里'})}
                                                </Text>
                                            </View>
                                        }
                                    />
                                );
                            })()}

                        </>
                    )}

                    {/* Entities sub-tab */}
                    {subTab === 'entities' && (
                        <>
                            {graphLoading ? (
                                <View style={style.loadingContainer}>
                                    <ActivityIndicator size='large' color={theme.buttonBg}/>
                                </View>
                            ) : (
                                <FlatList
                                    data={graphEntities}
                                    keyExtractor={entityKeyExtractor}
                                    refreshing={graphLoading}
                                    onRefresh={() => loadGraph(true)}
                                    onEndReached={() => loadGraph(false)}
                                    onEndReachedThreshold={0.1}
                                    contentContainerStyle={style.listContent}
                                    renderItem={renderEntityItem}
                                    ListFooterComponent={entityListFooter}
                                    ListEmptyComponent={
                                        <View style={style.emptyContainer}>
                                            <CompassIcon name='share-variant-outline' size={64} color={changeOpacity(theme.centerChannelColor, 0.3)}/>
                                            <Text style={style.emptyText}>
                                                {intl.formatMessage({id: 'smart_notebook.graph.empty', defaultMessage: '暂无知识图谱数据，写笔记后自动同步'})}
                                            </Text>
                                        </View>
                                    }
                                />
                            )}
                        </>
                    )}
                </>
            )}

            {/* ========== Quick Notes Tab ========== */}
            {topTab === 'quick_notes' && (
                <>
                    {/* New button */}
                    <View style={style.qnToolbar}>
                        <View style={{flex: 1}}/>
                        <TouchableOpacity
                            style={style.qnNewBtn}
                            onPress={onCreateQuickNote}
                        >
                            <CompassIcon name='plus' size={18} color={theme.buttonColor}/>
                            <Text style={style.qnNewBtnText}>
                                {intl.formatMessage({id: 'quick_note.new', defaultMessage: '新建'})}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {qnLoading ? (
                        <View style={style.loadingContainer}>
                            <ActivityIndicator size='large' color={theme.buttonBg}/>
                        </View>
                    ) : (
                        <FlatList
                            data={quickNotes}
                            keyExtractor={keyExtractor}
                            refreshing={qnRefreshing}
                            onRefresh={onRefreshQuickNotes}
                            contentContainerStyle={style.listContent}
                            renderItem={renderQuickNoteItem}
                            ListEmptyComponent={null}
                        />
                    )}
                </>
            )}

            {/* Bottom search bar */}
            {!searchActive && (
                <View style={style.bottomSearchBar}>
                    <TouchableOpacity
                        style={style.bottomSearchInput}
                        onPress={() => {
                            setSearchActive(true);
                            setTimeout(() => searchInputRef.current?.focus(), 100);
                        }}
                        activeOpacity={0.7}
                    >
                        <CompassIcon name='magnify' size={18} color={changeOpacity(theme.centerChannelColor, 0.4)}/>
                        <Text style={style.bottomSearchPlaceholder}>
                            {intl.formatMessage({id: 'smart_notebook.search_all', defaultMessage: '搜索笔记、实体、备忘录...'})}
                        </Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Full-screen search overlay */}
            {searchActive && (
                <View style={style.searchOverlay}>
                    <View style={style.searchOverlayHeader}>
                        <View style={style.searchOverlayInputWrap}>
                            <CompassIcon name='magnify' size={18} color={changeOpacity(theme.centerChannelColor, 0.4)}/>
                            <TextInput
                                ref={searchInputRef}
                                style={style.searchOverlayInput}
                                placeholder={intl.formatMessage({id: 'smart_notebook.search_all', defaultMessage: '搜索笔记、实体、备忘录...'})}
                                placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.5)}
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                autoCapitalize='none'
                                autoCorrect={false}
                                autoFocus={true}
                            />
                            {searchQuery.length > 0 && (
                                <TouchableOpacity onPress={() => setSearchQuery('')}>
                                    <CompassIcon name='close-circle' size={18} color={changeOpacity(theme.centerChannelColor, 0.5)}/>
                                </TouchableOpacity>
                            )}
                        </View>
                        <TouchableOpacity
                            onPress={() => {
                                setSearchActive(false);
                                setSearchQuery('');
                            }}
                        >
                            <Text style={style.searchCancelBtn}>
                                {intl.formatMessage({id: 'smart_notebook.search_cancel', defaultMessage: '取消'})}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {searchQuery.trim() ? (
                        <FlatList
                            data={[
                                ...searchResults.notes.map(p => ({type: 'note' as const, data: p})),
                                ...searchResults.entities.map(e => ({type: 'entity' as const, data: e})),
                                ...searchResults.memos.map(m => ({type: 'memo' as const, data: m})),
                            ]}
                            keyExtractor={(item, index) => `${item.type}-${index}`}
                            contentContainerStyle={style.listContent}
                            renderItem={({item}) => {
                                if (item.type === 'note') {
                                    const post = item.data as Post;
                                    return (
                                        <TouchableOpacity
                                            style={style.searchResultItem}
                                            onPress={() => {
                                                setSearchActive(false);
                                                setSearchQuery('');
                                                popTopScreen();
                                            }}
                                            activeOpacity={0.7}
                                        >
                                            <View style={style.searchResultBadge}>
                                                <Text style={style.searchResultBadgeText}>笔记</Text>
                                            </View>
                                            <Text style={style.searchResultText} numberOfLines={2}>{post.message}</Text>
                                        </TouchableOpacity>
                                    );
                                }
                                if (item.type === 'entity') {
                                    const entity = item.data as GraphEntity;
                                    return (
                                        <TouchableOpacity
                                            style={style.searchResultItem}
                                            onPress={() => {
                                                setSearchActive(false);
                                                setSearchQuery('');
                                                openEntityDetail(entity);
                                            }}
                                            activeOpacity={0.7}
                                        >
                                            <View style={[style.searchResultBadge, {backgroundColor: changeOpacity(theme.buttonBg, 0.15)}]}>
                                                <Text style={[style.searchResultBadgeText, {color: theme.buttonBg}]}>实体</Text>
                                            </View>
                                            <View style={{flex: 1}}>
                                                <Text style={style.searchResultText} numberOfLines={1}>{entity.name}</Text>
                                                {entity.summary ? (
                                                    <Text style={style.searchResultSubtext} numberOfLines={1}>{entity.summary}</Text>
                                                ) : null}
                                            </View>
                                        </TouchableOpacity>
                                    );
                                }
                                // memo
                                const memo = item.data as Post;
                                const memoData = getQuickNoteData(memo);
                                return (
                                    <TouchableOpacity
                                        style={style.searchResultItem}
                                        onPress={() => {
                                            setSearchActive(false);
                                            setSearchQuery('');
                                            openQuickNote(memo);
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <View style={[style.searchResultBadge, {backgroundColor: changeOpacity(theme.centerChannelColor, 0.1)}]}>
                                            <Text style={style.searchResultBadgeText}>备忘录</Text>
                                        </View>
                                        <View style={{flex: 1}}>
                                            <Text style={style.searchResultText} numberOfLines={1}>{memoData.title}</Text>
                                            {memoData.content ? (
                                                <Text style={style.searchResultSubtext} numberOfLines={1}>{memoData.content}</Text>
                                            ) : null}
                                        </View>
                                    </TouchableOpacity>
                                );
                            }}
                            ListEmptyComponent={
                                <View style={style.emptyContainer}>
                                    <Text style={style.emptyText}>
                                        {intl.formatMessage({id: 'smart_notebook.search_no_results', defaultMessage: '没有找到匹配的结果'})}
                                    </Text>
                                </View>
                            }
                        />
                    ) : null}
                </View>
            )}
        </SafeAreaView>
    );
};

// ---- Styles ----

const getStyleSheet = makeStyleSheetFromTheme((theme: any) => ({
    container: {
        flex: 1,
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    loadingText: {
        ...typography('Body', 100),
        color: changeOpacity(theme.centerChannelColor, 0.6),
        marginTop: 16,
    },

    // ---- Top-level tabs ----
    tabsContainer: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    tab: {
        flex: 1,
        paddingVertical: 12,
        alignItems: 'center',
        justifyContent: 'center',
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    tabActive: {
        borderBottomColor: theme.buttonBg,
    },
    tabText: {
        ...typography('Body', 100, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.5),
    },
    tabTextActive: {
        color: theme.buttonBg,
    },

    // ---- Knowledge sub-tabs ----
    subTabsContainer: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingTop: 4,
    },
    subTab: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        marginRight: 8,
        borderRadius: 16,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.06),
    },
    subTabActive: {
        backgroundColor: changeOpacity(theme.buttonBg, 0.12),
    },
    subTabText: {
        ...typography('Body', 75, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.5),
    },
    subTabTextActive: {
        color: theme.buttonBg,
    },

    // ---- Search ----
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    searchInput: {
        flex: 1,
        height: 36,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.06),
        borderRadius: 8,
        paddingHorizontal: 12,
        ...typography('Body', 100),
        color: theme.centerChannelColor,
    },
    searchActionBtn: {
        padding: 8,
        marginLeft: 4,
    },

    // ---- List ----
    listContent: {
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 80,
    },

    // ---- Timeline item ----
    timelineItem: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    timelineTime: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 6,
    },
    timelineDate: {
        ...typography('Body', 75, 'SemiBold'),
        color: theme.buttonBg,
    },
    timelineClock: {
        ...typography('Body', 50),
        color: changeOpacity(theme.centerChannelColor, 0.5),
    },
    timelineContent: {
        ...typography('Body', 100),
        color: theme.centerChannelColor,
        lineHeight: 22,
    },

    // ---- Quick note card ----
    qnToolbar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        gap: 8,
    },
    qnSearchWrap: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
    },
    qnNewBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.buttonBg,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        gap: 4,
    },
    qnNewBtnText: {
        ...typography('Body', 75, 'SemiBold'),
        color: theme.buttonColor,
    },
    qnCard: {
        backgroundColor: theme.centerChannelBg,
        borderRadius: 8,
        padding: 14,
        marginBottom: 10,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    qnCardHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    qnCardTitle: {
        ...typography('Heading', 100, 'SemiBold'),
        color: theme.centerChannelColor,
        flex: 1,
        marginRight: 8,
    },
    qnCardDate: {
        ...typography('Body', 50),
        color: changeOpacity(theme.centerChannelColor, 0.5),
    },
    qnCardContent: {
        ...typography('Body', 100),
        color: changeOpacity(theme.centerChannelColor, 0.7),
        lineHeight: 22,
    },

    // ---- Swipe actions ----
    swipeActionsContainer: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        marginBottom: 8,
        borderRadius: 8,
        overflow: 'hidden',
    },
    swipeActionBtn: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.6),
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        height: '100%',
        minWidth: 70,
    },
    swipeActionBtnDanger: {
        backgroundColor: theme.dndIndicator,
    },
    swipeActionText: {
        ...typography('Body', 50),
        color: theme.buttonColor,
        marginTop: 4,
    },

    // ---- Empty ----
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 64,
    },
    emptyText: {
        ...typography('Body', 200),
        color: changeOpacity(theme.centerChannelColor, 0.5),
        marginTop: 16,
        textAlign: 'center',
    },

    // ---- Entity card ----
    entityCard: {
        backgroundColor: theme.centerChannelBg,
        borderRadius: 12,
        marginBottom: 12,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.1),
        overflow: 'hidden',
    },
    entityHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        padding: 16,
    },
    entityHeaderExpanded: {
        backgroundColor: changeOpacity(theme.buttonBg, 0.05),
    },
    entityIconContainer: {
        marginRight: 12,
        paddingTop: 2,
    },
    entityContent: {
        flex: 1,
    },
    entityName: {
        ...typography('Heading', 100, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    entitySummary: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.7),
        marginTop: 4,
    },
    entityDetails: {
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.1),
        padding: 16,
        paddingTop: 12,
    },
    entitySection: {
        marginBottom: 16,
    },
    entitySectionTitle: {
        ...typography('Body', 75, 'SemiBold'),
        color: theme.buttonBg,
        marginBottom: 8,
    },
    relationRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingVertical: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.05),
    },
    relationDirection: {
        marginRight: 8,
        paddingTop: 2,
    },
    relationContent: {
        flex: 1,
    },
    relationType: {
        ...typography('Body', 50, 'SemiBold'),
        color: theme.buttonBg,
        marginBottom: 2,
    },
    relationEntity: {
        ...typography('Body', 100, 'Medium'),
        color: theme.centerChannelColor,
    },
    relationSummary: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.6),
        marginTop: 4,
    },
    noRelationsContainer: {
        paddingVertical: 16,
        alignItems: 'center',
    },
    noRelationsText: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.5),
    },

    // ---- Bottom search bar ----
    bottomSearchBar: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.1),
        backgroundColor: theme.centerChannelBg,
    },
    bottomSearchInput: {
        flexDirection: 'row',
        alignItems: 'center',
        height: 36,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.06),
        borderRadius: 8,
        paddingHorizontal: 12,
        gap: 8,
    },
    bottomSearchPlaceholder: {
        ...typography('Body', 100),
        color: changeOpacity(theme.centerChannelColor, 0.4),
    },

    // ---- Full-screen search overlay ----
    searchOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: theme.centerChannelBg,
        zIndex: 10,
    },
    searchOverlayHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        gap: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    searchOverlayInputWrap: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        height: 36,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.06),
        borderRadius: 8,
        paddingHorizontal: 12,
        gap: 8,
    },
    searchOverlayInput: {
        flex: 1,
        ...typography('Body', 100),
        color: theme.centerChannelColor,
        padding: 0,
    },
    searchCancelBtn: {
        ...typography('Body', 100),
        color: theme.buttonBg,
    },

    // ---- Search results ----
    searchResultItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 4,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.06),
        gap: 10,
    },
    searchResultBadge: {
        backgroundColor: changeOpacity(theme.buttonBg, 0.1),
        borderRadius: 4,
        paddingHorizontal: 6,
        paddingVertical: 2,
    },
    searchResultBadgeText: {
        ...typography('Body', 50, 'SemiBold'),
        color: theme.buttonBg,
    },
    searchResultText: {
        flex: 1,
        ...typography('Body', 100),
        color: theme.centerChannelColor,
    },
    searchResultSubtext: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.5),
        marginTop: 2,
    },

}));

export default SmartNotebookScreen;
