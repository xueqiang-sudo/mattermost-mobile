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

import {useFocusEffect, useNavigation} from '@react-navigation/native';
import CompassIcon from '@components/compass_icon';
import {Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import DatabaseManager from '@database/manager';
import {getCurrentUserId} from '@queries/servers/system';
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

function formatDate(timestamp: number): string {
    const d = new Date(timestamp);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${mm}-${dd} ${hh}:${mi}`;
}

function formatQuickNoteDate(timestamp: number): string {
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
        return `昨天 ${hh}:${mi}`;
    }
    const mm = d.getMonth() + 1;
    const dd = d.getDate();
    if (d.getFullYear() === now.getFullYear()) {
        return `${mm}/${dd} ${hh}:${mi}`;
    }
    return `${d.getFullYear()}/${mm}/${dd} ${hh}:${mi}`;
}

function extractTitle(message: string): string {
    const firstLine = message.split('\n')[0].trim();
    if (firstLine.length > 50) {
        return firstLine.substring(0, 50) + '...';
    }
    return firstLine || '无标题';
}

function extractPreview(message: string): string {
    const lines = message.split('\n').filter(l => l.trim()).slice(0, 3);
    const preview = lines.join('\n');
    return preview.length > 150 ? preview.substring(0, 150) + '...' : preview;
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

const SmartNotebookScreen = () => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const navigation = useNavigation();
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

                const ch = await getOrCreateSmartNotebookChannel(serverUrl);
                setChannel(ch);
            } catch (err) {
                console.error('Smart notebook init failed:', err);
            } finally {
                setInitializing(false);
            }
        };
        init();
    }, [serverUrl]);

    // ---- Load all posts (then split into knowledge notes and quick notes) ----
    const loadAllPosts = useCallback(async () => {
        if (!channel?.id) return;
        setLoading(true);
        setQnLoading(true);
        try {
            const result = await getChannelPosts(serverUrl, channel.id, 100);

            // Split by props.quick_note
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

    // ---- Refresh on focus ----
    useFocusEffect(
        useCallback(() => {
            if (needsRefresh.current && channel?.id) {
                needsRefresh.current = false;
                loadAllPosts();
            }
        }, [channel, loadAllPosts]),
    );

    // ---- Open knowledge note detail ----
    const openDetail = useCallback((post: Post) => {
        needsRefresh.current = true;
        navigation.navigate(Screens.SMART_NOTE_DETAIL, {
            postId: post.id,
            channelId: channel?.id,
            postTitle: extractTitle(post.message),
        });
    }, [navigation, channel]);

    // ---- Create new knowledge note ----
    const onCreateNote = useCallback(() => {
        needsRefresh.current = true;
        navigation.navigate(Screens.SMART_NOTE_DETAIL, {
            postId: 'new',
            channelId: channel?.id,
            postTitle: '',
        });
    }, [navigation, channel]);

    // ---- Delete knowledge post ----
    const onDeletePost = useCallback((post: Post) => {
        Alert.alert(
            intl.formatMessage({id: 'smart_notebook.delete_title', defaultMessage: '删除笔记'}),
            intl.formatMessage({id: 'smart_notebook.delete_confirm', defaultMessage: '确定要删除这条笔记吗？'}),
            [
                {
                    text: intl.formatMessage({id: 'common.cancel', defaultMessage: '取消'}),
                    style: 'cancel',
                },
                {
                    text: intl.formatMessage({id: 'smart_notebook.delete', defaultMessage: '删除'}),
                    style: 'destructive',
                    onPress: async () => {
                        const success = await deletePost(serverUrl, post.id);
                        if (success) {
                            loadAllPosts();
                        } else {
                            Alert.alert(
                                intl.formatMessage({id: 'smart_notebook.delete_failed', defaultMessage: '删除失败'}),
                            );
                        }
                    },
                },
            ],
        );
    }, [intl, serverUrl, loadAllPosts]);

    // ---- Open quick note detail ----
    const openQuickNote = useCallback((note: Post) => {
        needsRefresh.current = true;
        const data = getQuickNoteData(note);
        navigation.navigate(Screens.QUICK_NOTE_DETAIL, {
            postId: note.id,
            channelId: channel?.id,
            title: data.title,
            content: data.content,
        });
    }, [navigation, channel]);

    // ---- Create new quick note ----
    const onCreateQuickNote = useCallback(() => {
        needsRefresh.current = true;
        navigation.navigate(Screens.QUICK_NOTE_DETAIL, {
            postId: 'new',
            channelId: channel?.id,
        });
    }, [navigation, channel]);

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

    // ---- Go back ----
    const goBack = useCallback(() => {
        setTimeout(() => {
            if (navigation.canGoBack()) {
                navigation.goBack();
            }
        }, 50);
    }, [navigation]);

    // ---- Render right actions for swipe (knowledge notes) ----
    const renderRightActions = useCallback((post: Post) => {
        return (
            <View style={style.swipeActionsContainer}>
                <TouchableOpacity
                    style={[style.swipeActionBtn, style.swipeActionBtnDanger]}
                    onPress={() => onDeletePost(post)}
                >
                    <CompassIcon name='trash-can-outline' size={20} color={theme.buttonColor}/>
                    <Text style={style.swipeActionText}>
                        {intl.formatMessage({id: 'smart_notebook.delete', defaultMessage: '删除'})}
                    </Text>
                </TouchableOpacity>
            </View>
        );
    }, [style, theme, intl, onDeletePost]);

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

    // ---- Render knowledge post item ----
    const renderPostItem = useCallback(({item}: {item: Post}) => {
        return (
            <GestureHandlerRootView>
                <ReanimatedSwipeable
                    rightThreshold={40}
                    renderRightActions={() => renderRightActions(item)}
                >
                    <TouchableOpacity
                        style={style.card}
                        onPress={() => openDetail(item)}
                        activeOpacity={0.7}
                    >
                        <Text style={style.cardDate}>{formatDate(item.create_at)}</Text>
                        <Text style={style.cardTitle} numberOfLines={2}>
                            {extractPreview(item.message)}
                        </Text>
                    </TouchableOpacity>
                </ReanimatedSwipeable>
            </GestureHandlerRootView>
        );
    }, [style, openDetail, renderRightActions]);

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
                                {formatQuickNoteDate(item.create_at)}
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
                <View style={style.header}>
                    <TouchableOpacity onPress={goBack} style={style.headerBtn}>
                        <CompassIcon name='arrow-left' size={20} color={theme.sidebarText}/>
                    </TouchableOpacity>
                    <Text style={style.headerTitle}>
                        {intl.formatMessage({id: 'smart_notebook.title', defaultMessage: '智能笔记本'})}
                    </Text>
                    <View style={style.headerBtn}/>
                </View>
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
                <View style={style.header}>
                    <TouchableOpacity onPress={goBack} style={style.headerBtn}>
                        <CompassIcon name='arrow-left' size={20} color={theme.sidebarText}/>
                    </TouchableOpacity>
                    <Text style={style.headerTitle}>
                        {intl.formatMessage({id: 'smart_notebook.title', defaultMessage: '智能笔记本'})}
                    </Text>
                    <View style={style.headerBtn}/>
                </View>
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
            {/* Header */}
            <View style={style.header}>
                <TouchableOpacity onPress={goBack} style={style.headerBtn}>
                    <CompassIcon name='arrow-left' size={20} color={theme.sidebarText}/>
                </TouchableOpacity>
                <Text style={style.headerTitle}>
                    {intl.formatMessage({id: 'smart_notebook.title', defaultMessage: '智能笔记本'})}
                </Text>
                <TouchableOpacity onPress={loadAllPosts} style={style.headerBtn}>
                    <CompassIcon name='refresh' size={20} color={theme.sidebarText}/>
                </TouchableOpacity>
            </View>

            {/* Top-level Tabs: 知识笔记 | 随手记 */}
            <View style={style.tabsContainer}>
                <TouchableOpacity
                    style={[style.tab, topTab === 'knowledge' && style.tabActive]}
                    onPress={() => setTopTab('knowledge')}
                >
                    <Text style={[style.tabText, topTab === 'knowledge' && style.tabTextActive]}>
                        {intl.formatMessage({id: 'smart_notebook.tab.knowledge', defaultMessage: '知识笔记'})}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[style.tab, topTab === 'quick_notes' && style.tabActive]}
                    onPress={() => setTopTab('quick_notes')}
                >
                    <Text style={[style.tabText, topTab === 'quick_notes' && style.tabTextActive]}>
                        {intl.formatMessage({id: 'smart_notebook.tab.quick_notes', defaultMessage: '随手记'})}
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
                                    if (!existing || post.create_at > existing.create_at) {
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

                            {/* FAB */}
                            <TouchableOpacity
                                style={style.fab}
                                onPress={onCreateNote}
                                activeOpacity={0.8}
                            >
                                <CompassIcon name='plus' size={28} color={theme.buttonColor}/>
                            </TouchableOpacity>
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
                                        const relCountMap = new Map<string, number>();
                                        graphEntities.forEach(e => relCountMap.set(e.uuid, 0));
                                        graphRelations.forEach(rel => {
                                            const src = graphEntities.find(e => e.uuid === rel.source || e.name === rel.source);
                                            const tgt = graphEntities.find(e => e.uuid === rel.target || e.name === rel.target);
                                            if (src) relCountMap.set(src.uuid, (relCountMap.get(src.uuid) || 0) + 1);
                                            if (tgt) relCountMap.set(tgt.uuid, (relCountMap.get(tgt.uuid) || 0) + 1);
                                        });

                                        const filter = graphSearchQuery.toLowerCase();
                                        return [...graphEntities]
                                            .filter(e => {
                                                if (!filter) return true;
                                                return e.name.toLowerCase().includes(filter) ||
                                                       (e.summary || '').toLowerCase().includes(filter);
                                            })
                                            .sort((a, b) => (relCountMap.get(b.uuid) || 0) - (relCountMap.get(a.uuid) || 0));
                                    })()}
                                    keyExtractor={(item) => item.uuid}
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
                                                    <View style={style.entityBadge}>
                                                        <Text style={style.entityBadgeText}>{relations.length}</Text>
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
                                <View style={style.emptyContainer}>
                                    <CompassIcon name='note-outline' size={64} color={changeOpacity(theme.centerChannelColor, 0.3)}/>
                                    <Text style={style.emptyText}>
                                        {qnSearchQuery
                                            ? intl.formatMessage({id: 'quick_note.no_results', defaultMessage: '没有找到匹配的随手记'})
                                            : intl.formatMessage({id: 'quick_note.empty', defaultMessage: '还没有随手记，点击「新建」开始记录'})}
                                    </Text>
                                </View>
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
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: theme.sidebarBg,
    },
    headerBtn: {
        padding: 8,
    },
    headerTitle: {
        ...typography('Heading', 200, 'SemiBold'),
        color: theme.sidebarText,
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

    // ---- Knowledge note card ----
    card: {
        backgroundColor: theme.centerChannelBg,
        borderRadius: 8,
        padding: 12,
        marginBottom: 8,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    cardDate: {
        ...typography('Body', 50),
        color: changeOpacity(theme.centerChannelColor, 0.5),
        marginBottom: 4,
    },
    cardTitle: {
        ...typography('Body', 100),
        color: theme.centerChannelColor,
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
    entityBadge: {
        backgroundColor: theme.buttonBg,
        borderRadius: 10,
        minWidth: 20,
        height: 20,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 6,
        marginLeft: 8,
    },
    entityBadgeText: {
        ...typography('Body', 50, 'SemiBold'),
        color: theme.buttonColor,
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

    // ---- FAB ----
    fab: {
        position: 'absolute',
        right: 20,
        bottom: 20,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: theme.buttonBg,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.25,
        shadowRadius: 4,
    },
}));

export default SmartNotebookScreen;
