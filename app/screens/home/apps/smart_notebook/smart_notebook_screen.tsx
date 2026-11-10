// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useRef, useState} from 'react';
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
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import {
    getOrCreateSmartNotebookChannel,
    getChannelPosts,
    deletePost,
    getGraphEntities,
    getGraphRelations,
    type Post,
    type Channel,
    type GraphEntity,
    type GraphRelation,
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
        return `${intl.formatMessage({id: 'smart_notebook.date.yesterday', defaultMessage: 'Yesterday'})} ${hh}:${mi}`;
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
        return {dateLabel: intl.formatMessage({id: 'smart_notebook.date.today', defaultMessage: 'Today'}), timeLabel};
    }
    if (timestamp >= yesterday) {
        return {dateLabel: intl.formatMessage({id: 'smart_notebook.date.yesterday', defaultMessage: 'Yesterday'}), timeLabel};
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

    // Search (knowledge notes)
    const [searchQuery, setSearchQuery] = useState('');

    // Quick notes data
    const [quickNotes, setQuickNotes] = useState<Post[]>([]);
    const [qnLoading, setQnLoading] = useState(true);
    const [qnRefreshing, setQnRefreshing] = useState(false);
    const [qnSearchQuery, setQnSearchQuery] = useState('');

    // Refresh flag
    const needsRefresh = useRef(false);

    // Graph (entities sub-tab)
    const [graphEntities, setGraphEntities] = useState<GraphEntity[]>([]);
    const [graphRelations, setGraphRelations] = useState<GraphRelation[]>([]);
    const [graphLoading, setGraphLoading] = useState(false);
    const [graphSearchQuery, setGraphSearchQuery] = useState('');
    const [expandedEntity, setExpandedEntity] = useState<string | null>(null);

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
                    const ch = await getOrCreateSmartNotebookChannel(serverUrl);
                    setChannel(ch);
                }
            } catch (err) {
                console.error('Smart notebook init failed:', err);
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

            // Split: timeline shows knowledge posts (no quick_note), 备忘录 shows quick_note posts
            const knowledge: Post[] = [];
            const quick: Post[] = [];
            for (const post of result) {
                if (post.props?.quick_note && post.user_id === userId) {
                    quick.push(post);
                } else if (!post.props?.quick_note) {
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

    // ---- Filtered knowledge posts ----
    const filteredPosts = searchQuery
        ? posts.filter(p => p.message.toLowerCase().includes(searchQuery.toLowerCase()))
        : posts;

    // ---- Filtered quick notes ----
    const filteredQuickNotes = qnSearchQuery
        ? quickNotes.filter(n => {
            const data = getQuickNoteData(n);
            const q = qnSearchQuery.toLowerCase();
            return data.title.toLowerCase().includes(q) || data.content.toLowerCase().includes(q);
        })
        : quickNotes;

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

    // ---- Load graph data ----
    const loadGraph = useCallback(async () => {
        if (!userId) return;
        setGraphLoading(true);
        try {
            const [entityResult, relationResult] = await Promise.all([
                getGraphEntities(serverUrl, userId, 100),
                getGraphRelations(serverUrl, userId, 100),
            ]);
            setGraphEntities(entityResult.entities || []);
            setGraphRelations(relationResult.relations || []);
        } catch (err) {
            console.error('Failed to load graph:', err);
        } finally {
            setGraphLoading(false);
        }
    }, [serverUrl, userId]);

    useEffect(() => {
        if (subTab === 'entities' && userId) {
            loadGraph();
        }
    }, [subTab, userId, loadGraph]);

    // ---- Get relations for an entity ----
    const getEntityRelations = useCallback((entityUuid: string, entityName: string): GraphRelation[] => {
        return graphRelations.filter(rel =>
            rel.source === entityUuid || rel.source === entityName ||
            rel.target === entityUuid || rel.target === entityName,
        );
    }, [graphRelations]);

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
                            <View style={style.searchContainer}>
                                <TextInput
                                    style={style.searchInput}
                                    placeholder={intl.formatMessage({id: 'smart_notebook.search', defaultMessage: '搜索笔记...'})}
                                    placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.5)}
                                    value={searchQuery}
                                    onChangeText={setSearchQuery}
                                    autoCapitalize='none'
                                    autoCorrect={false}
                                />
                                {searchQuery.length > 0 && (
                                    <TouchableOpacity onPress={() => setSearchQuery('')} style={style.searchActionBtn}>
                                        <CompassIcon name='close-circle' size={20} color={changeOpacity(theme.centerChannelColor, 0.5)}/>
                                    </TouchableOpacity>
                                )}
                            </View>

                            {(() => {
                                const dayMap = new Map<string, Post>();
                                for (const post of filteredPosts) {
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
                                                    {searchQuery
                                                        ? intl.formatMessage({id: 'smart_notebook.no_results', defaultMessage: '没有找到匹配的笔记'})
                                                        : intl.formatMessage({id: 'smart_notebook.empty', defaultMessage: '在频道中写笔记，自动同步到这里'})}
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
                            <View style={style.searchContainer}>
                                <TextInput
                                    style={style.searchInput}
                                    placeholder={intl.formatMessage({id: 'smart_notebook.search_entity', defaultMessage: '搜索实体...'})}
                                    placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.5)}
                                    value={graphSearchQuery}
                                    onChangeText={setGraphSearchQuery}
                                    autoCapitalize='none'
                                    autoCorrect={false}
                                />
                                {graphSearchQuery.length > 0 && (
                                    <TouchableOpacity onPress={() => setGraphSearchQuery('')}>
                                        <CompassIcon name='close-circle' size={20} color={changeOpacity(theme.centerChannelColor, 0.5)}/>
                                    </TouchableOpacity>
                                )}
                            </View>

                            {graphLoading ? (
                                <View style={style.loadingContainer}>
                                    <ActivityIndicator size='large' color={theme.buttonBg}/>
                                </View>
                            ) : (
                                <FlatList
                                    data={(() => {
                                        const filter = graphSearchQuery.toLowerCase();
                                        return [...graphEntities]
                                            .filter(e => {
                                                if (!filter) return true;
                                                return e.name.toLowerCase().includes(filter) ||
                                                       (e.summary || '').toLowerCase().includes(filter);
                                            });
                                    })()}
                                    keyExtractor={(item) => item.uuid}
                                    extraData={expandedEntity}
                                    refreshing={false}
                                    onRefresh={loadGraph}
                                    contentContainerStyle={style.listContent}
                                    renderItem={({item}) => {
                                        const relations = getEntityRelations(item.uuid, item.name);
                                        const isSelected = expandedEntity === item.uuid;

                                        return (
                                            <View style={style.entityCard}>
                                                <TouchableOpacity
                                                    style={[style.entityHeader, isSelected && style.entityHeaderExpanded]}
                                                    onPress={() => setExpandedEntity(isSelected ? null : item.uuid)}
                                                    activeOpacity={0.7}
                                                >
                                                    <View style={style.entityIconContainer}>
                                                        <CompassIcon
                                                            name={isSelected ? 'chevron-down' : 'chevron-right'}
                                                            size={20}
                                                            color={theme.buttonBg}
                                                        />
                                                    </View>
                                                    <View style={style.entityContent}>
                                                        <Text style={style.entityName} numberOfLines={1}>
                                                            {item.name}
                                                        </Text>
                                                        {item.summary ? (
                                                            <Text style={style.entitySummary} numberOfLines={isSelected ? 10 : 2}>
                                                                {item.summary}
                                                            </Text>
                                                        ) : null}
                                                    </View>
                                                </TouchableOpacity>

                                                {isSelected && (
                                                    <View style={style.entityDetails}>
                                                        {relations.length > 0 ? (
                                                            <View style={style.entitySection}>
                                                                <Text style={style.entitySectionTitle}>
                                                                    {intl.formatMessage(
                                                                        {id: 'smart_notebook.entity.relations', defaultMessage: '关联关系 ({count})'},
                                                                        {count: relations.length},
                                                                    )}
                                                                </Text>
                                                                {relations.map((rel, idx) => {
                                                                    const isSource = rel.source === item.uuid || rel.source === item.name;
                                                                    const otherEntityName = isSource
                                                                        ? (graphEntities.find(e => e.uuid === rel.target || e.name === rel.target)?.name || rel.target)
                                                                        : (graphEntities.find(e => e.uuid === rel.source || e.name === rel.source)?.name || rel.source);

                                                                    return (
                                                                        <View key={idx} style={style.relationRow}>
                                                                            <View style={style.relationDirection}>
                                                                                <CompassIcon
                                                                                    name={isSource ? 'arrow-right' : 'arrow-left'}
                                                                                    size={16}
                                                                                    color={theme.buttonBg}
                                                                                />
                                                                            </View>
                                                                            <View style={style.relationContent}>
                                                                                <Text style={style.relationType}>{rel.relation_type}</Text>
                                                                                <Text style={style.relationEntity} numberOfLines={1}>
                                                                                    {isSource ? '→' : '←'} {otherEntityName}
                                                                                </Text>
                                                                                {rel.summary && (
                                                                                    <Text style={style.relationSummary} numberOfLines={2}>
                                                                                        {rel.summary}
                                                                                    </Text>
                                                                                )}
                                                                            </View>
                                                                        </View>
                                                                    );
                                                                })}
                                                            </View>
                                                        ) : (
                                                            <View style={style.noRelationsContainer}>
                                                                <Text style={style.noRelationsText}>
                                                                    {intl.formatMessage({id: 'smart_notebook.entity.no_relations', defaultMessage: '暂无关联关系'})}
                                                                </Text>
                                                            </View>
                                                        )}
                                                    </View>
                                                )}
                                            </View>
                                        );
                                    }}
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
                    {/* Search + New button */}
                    <View style={style.qnToolbar}>
                        <View style={style.qnSearchWrap}>
                            <TextInput
                                style={style.searchInput}
                                placeholder={intl.formatMessage({id: 'quick_note.search', defaultMessage: '搜索随手记...'})}
                                placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.5)}
                                value={qnSearchQuery}
                                onChangeText={setQnSearchQuery}
                                autoCapitalize='none'
                                autoCorrect={false}
                            />
                            {qnSearchQuery.length > 0 && (
                                <TouchableOpacity onPress={() => setQnSearchQuery('')} style={style.searchActionBtn}>
                                    <CompassIcon name='close-circle' size={20} color={changeOpacity(theme.centerChannelColor, 0.5)}/>
                                </TouchableOpacity>
                            )}
                        </View>
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
                            data={filteredQuickNotes}
                            keyExtractor={keyExtractor}
                            refreshing={qnRefreshing}
                            onRefresh={onRefreshQuickNotes}
                            contentContainerStyle={style.listContent}
                            renderItem={renderQuickNoteItem}
                            ListEmptyComponent={
                                qnSearchQuery ? (
                                    <View style={style.emptyContainer}>
                                        <CompassIcon name='note-outline' size={64} color={changeOpacity(theme.centerChannelColor, 0.3)}/>
                                        <Text style={style.emptyText}>
                                            {intl.formatMessage({id: 'quick_note.no_results', defaultMessage: '没有找到匹配的随手记'})}
                                        </Text>
                                    </View>
                                ) : null
                            }
                        />
                    )}
                </>
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

}));

export default SmartNotebookScreen;
