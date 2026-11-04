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
import Reanimated, {useAnimatedStyle, useSharedValue} from 'react-native-reanimated';
import {SafeAreaView} from 'react-native-safe-area-context';

import {useNavigation} from '@react-navigation/native';
import CompassIcon from '@components/compass_icon';
import {Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import DatabaseManager from '@database/manager';
import {getCurrentUserId} from '@queries/servers/system';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import {
    listNotes,
    deleteNote,
    searchNotes,
    updateNote,
    pushToGraphiti,
    getGraphEntities,
    getGraphRelations,
    type SmartNoteSummary,
    type GraphEntity,
    type GraphRelation,
} from './smart_notebook_api';
import KnowledgeGraph from './knowledge_graph';

// ---- Constants ----

const NOTE_LIMIT = 50;

// Date group keys for i18n
const DATE_GROUP_KEYS = ['pinned', 'today', 'yesterday', '7_days', '30_days', 'older'] as const;

// ---- Helpers ----

function formatDate(val: string | number): string {
    if (!val) return '';
    // Handle Unix timestamp (seconds) or string
    const ms = typeof val === 'number' && val < 1e12 ? val * 1000 : typeof val === 'string' ? new Date(val).getTime() : val;
    const d = new Date(ms);
    if (isNaN(d.getTime())) return String(val);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${mm}-${dd} ${hh}:${mi}`;
}

function getDateGroupKey(val: string | number): string {
    if (!val) return 'older';
    const ms = typeof val === 'number' && val < 1e12 ? val * 1000 : typeof val === 'string' ? new Date(val).getTime() : val;
    const ts = isNaN(ms) ? 0 : ms;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = today - 86400000;
    const weekAgo = today - 7 * 86400000;
    const monthAgo = today - 30 * 86400000;

    if (ts >= today) return 'today';
    if (ts >= yesterday) return 'yesterday';
    if (ts >= weekAgo) return '7_days';
    if (ts >= monthAgo) return '30_days';
    return 'older';
}

function groupNotesByDate(entries: SmartNoteSummary[]): {pinned: SmartNoteSummary[]; groups: Map<string, SmartNoteSummary[]>} {
    const pinned = entries.filter(n => n.pinned);
    const unpinned = entries.filter(n => !n.pinned);
    const groups = new Map<string, SmartNoteSummary[]>();

    for (const entry of unpinned) {
        const key = getDateGroupKey(entry.updatedAt);
        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key)!.push(entry);
    }

    return {pinned, groups};
}

// ---- Component ----

const SmartNotebookScreen = () => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const navigation = useNavigation();
    const style = getStyleSheet(theme);

    // View mode (tabs)
    const [viewMode, setViewMode] = useState<'notes' | 'list'>('notes');

    // User ID
    const [userId, setUserId] = useState('');

    // Data
    const [notes, setNotes] = useState<SmartNoteSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Search
    const [searchQuery, setSearchQuery] = useState('');
    const [searching, setSearching] = useState(false);
    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Graph (list tab)
    const [graphEntities, setGraphEntities] = useState<GraphEntity[]>([]);
    const [graphRelations, setGraphRelations] = useState<GraphRelation[]>([]);
    const [graphLoading, setGraphLoading] = useState(false);
    const [graphSearchQuery, setGraphSearchQuery] = useState('');
    const [expandedEntity, setExpandedEntity] = useState<string | null>(null);

    // ---- Init: get userId ----
    useEffect(() => {
        const init = async () => {
            try {
                const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
                const uid = await getCurrentUserId(database);
                setUserId(uid);
            } catch {
                // ignore
            }
        };
        init();
    }, [serverUrl]);

    // ---- Load notes ----
    const loadNotes = useCallback(async () => {
        if (!userId) return;
        setLoading(true);
        try {
            const result = await listNotes(serverUrl, userId, 'private');
            const entries = result?.entries || [];
            setNotes(entries);
        } catch {
            setNotes([]);
        } finally {
            setLoading(false);
        }
    }, [serverUrl, userId]);

    useEffect(() => {
        loadNotes();
    }, [loadNotes]);

    // ---- Search (debounced) ----
    const doSearch = useCallback(async (query: string) => {
        if (!userId) return;
        if (!query.trim()) {
            setSearching(false);
            loadNotes();
            return;
        }
        setSearching(true);
        try {
            const result = await searchNotes(serverUrl, userId, query.trim(), NOTE_LIMIT, 'private');
            const entries = result?.entries || [];
            setNotes(entries);
        } catch {
            // keep current list
        } finally {
            setSearching(false);
        }
    }, [serverUrl, userId, loadNotes]);

    const onSearchChange = useCallback((text: string) => {
        setSearchQuery(text);
        if (searchTimer.current) {
            clearTimeout(searchTimer.current);
        }
        searchTimer.current = setTimeout(() => {
            doSearch(text);
        }, 400);
    }, [doSearch]);

    // ---- Refresh ----
    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        if (searchQuery.trim()) {
            await doSearch(searchQuery);
        } else {
            await loadNotes();
        }
        setRefreshing(false);
    }, [searchQuery, doSearch, loadNotes]);

    // ---- Open detail ----
    const openDetail = useCallback((item: SmartNoteSummary) => {
        navigation.navigate(Screens.SMART_NOTE_DETAIL, {
            noteId: item.id,
            noteTitle: item.title || '笔记详情',
        });
    }, [navigation]);

    // ---- Pin/Unpin note ----
    const onTogglePin = useCallback(async (item: SmartNoteSummary) => {
        try {
            await updateNote(serverUrl, userId, item.id, {pinned: !item.pinned});
            if (searchQuery.trim()) {
                doSearch(searchQuery);
            } else {
                loadNotes();
            }
        } catch {
            Alert.alert(
                intl.formatMessage({id: 'smart_notebook.pin_failed', defaultMessage: '操作失败'}),
            );
        }
    }, [serverUrl, userId, searchQuery, doSearch, loadNotes, intl]);

    // ---- Push note to Graphiti ----
    const onPushNote = useCallback(async (item: SmartNoteSummary) => {
        try {
            const result = await pushToGraphiti(serverUrl, userId, item.id);
            if (result.pushed) {
                Alert.alert(
                    intl.formatMessage({id: 'smart_notebook.push_success', defaultMessage: '推送成功'}),
                    intl.formatMessage({id: 'smart_notebook.push_success_message', defaultMessage: '笔记已推送到知识图谱'}),
                    [{text: intl.formatMessage({id: 'common.ok', defaultMessage: '确定'})}],
                );
                // Refresh graph data if in list tab
                if (viewMode === 'list') {
                    loadGraph();
                }
            } else {
                Alert.alert(
                    intl.formatMessage({id: 'smart_notebook.push_failed', defaultMessage: '推送失败'}),
                    result.message || intl.formatMessage({id: 'smart_notebook.push_failed_message', defaultMessage: '无法推送笔记到知识图谱'}),
                    [{text: intl.formatMessage({id: 'common.ok', defaultMessage: '确定'})}],
                );
            }
        } catch {
            Alert.alert(
                intl.formatMessage({id: 'smart_notebook.push_failed', defaultMessage: '推送失败'}),
                intl.formatMessage({id: 'smart_notebook.push_error_message', defaultMessage: '推送过程中发生错误'}),
                [{text: intl.formatMessage({id: 'common.ok', defaultMessage: '确定'})}],
            );
        }
    }, [serverUrl, userId, viewMode, intl]);

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

    // Load graph when switching to list tab
    useEffect(() => {
        if (viewMode === 'list' && userId) {
            loadGraph();
        }
    }, [viewMode, userId, loadGraph]);

    // ---- Get relations for an entity ----
    const getEntityRelations = useCallback((entityUuid: string, entityName: string): GraphRelation[] => {
        return graphRelations.filter(rel =>
            rel.source === entityUuid || rel.source === entityName ||
            rel.target === entityUuid || rel.target === entityName
        );
    }, [graphRelations]);

    // ---- Delete note ----
    const onDeleteNote = useCallback((item: SmartNoteSummary) => {
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
                        try {
                            await deleteNote(serverUrl, userId, item.id);
                            if (searchQuery.trim()) {
                                doSearch(searchQuery);
                            } else {
                                loadNotes();
                            }
                        } catch {
                            Alert.alert(
                                intl.formatMessage({id: 'smart_notebook.delete_failed', defaultMessage: '删除失败'}),
                            );
                        }
                    },
                },
            ],
        );
    }, [intl, serverUrl, userId, searchQuery, doSearch, loadNotes]);

    // ---- Go back ----
    const goBack = useCallback(() => {
        navigation.goBack();
    }, [navigation]);

    // ---- Create new note ----
    const onCreateNote = useCallback(() => {
        navigation.navigate(Screens.SMART_NOTE_DETAIL, {
            noteId: 'new',
            noteTitle: '',
        });
    }, [navigation]);

    // ---- Render right actions for swipe ----
    const renderRightActions = useCallback((item: SmartNoteSummary, drag: any) => {
        return (
            <View style={style.swipeActionsContainer}>
                <TouchableOpacity
                    style={[style.swipeActionBtn, item.pinned ? style.swipeActionBtnActive : null]}
                    onPress={() => onTogglePin(item)}
                >
                    <CompassIcon
                        name={item.pinned ? 'pin' : 'pin-outline'}
                        size={20}
                        color={theme.buttonColor}
                    />
                    <Text style={style.swipeActionText}>
                        {item.pinned
                            ? intl.formatMessage({id: 'smart_notebook.unpin', defaultMessage: '取消置顶'})
                            : intl.formatMessage({id: 'smart_notebook.pin', defaultMessage: '置顶'})}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={style.swipeActionBtn}
                    onPress={() => onPushNote(item)}
                >
                    <CompassIcon name='send-outline' size={20} color={theme.buttonColor}/>
                    <Text style={style.swipeActionText}>
                        {intl.formatMessage({id: 'smart_notebook.push', defaultMessage: '推送'})}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[style.swipeActionBtn, style.swipeActionBtnDanger]}
                    onPress={() => onDeleteNote(item)}
                >
                    <CompassIcon name='trash-can-outline' size={20} color={theme.buttonColor}/>
                    <Text style={style.swipeActionText}>
                        {intl.formatMessage({id: 'smart_notebook.delete', defaultMessage: '删除'})}
                    </Text>
                </TouchableOpacity>
            </View>
        );
    }, [style, theme, intl, onTogglePin, onPushNote, onDeleteNote]);

    // ---- Render item ----
    const renderItem = useCallback(({item}: {item: SmartNoteSummary}) => {
        const dateStr = formatDate(item.updatedAt);
        return (
            <GestureHandlerRootView>
                <ReanimatedSwipeable
                    rightThreshold={40}
                    renderRightActions={(_, drag) => renderRightActions(item, drag)}
                >
                    <TouchableOpacity
                        style={style.card}
                        onPress={() => openDetail(item)}
                        activeOpacity={0.7}
                    >
                        <View style={style.cardHeader}>
                            <Text style={style.cardTitle} numberOfLines={1}>
                                {item.title || intl.formatMessage({id: 'smart_notebook.untitled', defaultMessage: '无标题'})}
                            </Text>
                            {item.pinned && (
                                <CompassIcon name='pin' size={14} color={theme.buttonBg}/>
                            )}
                        </View>
                        <Text style={style.cardDate}>{dateStr}</Text>
                    </TouchableOpacity>
                </ReanimatedSwipeable>
            </GestureHandlerRootView>
        );
    }, [style, theme, intl, openDetail, renderRightActions]);

    const keyExtractor = useCallback((item: SmartNoteSummary) => item.id, []);

    // ---- Render ----
    if (loading) {
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
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[style.container, {backgroundColor: theme.centerChannelBg}]}>
            {/* Header - 对齐云盘样式 */}
            <View style={style.header}>
                <TouchableOpacity onPress={goBack} style={style.headerBtn}>
                    <CompassIcon name='arrow-left' size={20} color={theme.sidebarText}/>
                </TouchableOpacity>
                <Text style={style.headerTitle}>
                    {intl.formatMessage({id: 'smart_notebook.title', defaultMessage: '智能笔记本'})}
                </Text>
                <TouchableOpacity onPress={loadNotes} style={style.headerBtn}>
                    <CompassIcon name='refresh' size={20} color={theme.sidebarText}/>
                </TouchableOpacity>
            </View>

            {/* Tabs */}
            <View style={style.tabsContainer}>
                <TouchableOpacity
                    style={[style.tab, viewMode === 'notes' && style.tabActive]}
                    onPress={() => setViewMode('notes')}
                >
                    <Text style={[style.tabText, viewMode === 'notes' && style.tabTextActive]}>
                        {intl.formatMessage({id: 'smart_notebook.tab.notes', defaultMessage: '笔记'})}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[style.tab, viewMode === 'list' && style.tabActive]}
                    onPress={() => setViewMode('list')}
                >
                    <Text style={[style.tabText, viewMode === 'list' && style.tabTextActive]}>
                        {intl.formatMessage({id: 'smart_notebook.tab.list', defaultMessage: '列表'})}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Search - Notes Tab (with New button) */}
            {viewMode === 'notes' && (
                <View style={style.searchContainer}>
                    <TextInput
                        style={style.searchInput}
                        placeholder={intl.formatMessage({id: 'smart_notebook.search', defaultMessage: '搜索笔记...'})}
                        placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.5)}
                        value={searchQuery}
                        onChangeText={onSearchChange}
                        autoCapitalize='none'
                        autoCorrect={false}
                    />
                    {searchQuery.length > 0 ? (
                        <TouchableOpacity onPress={() => onSearchChange('')} style={style.searchActionBtn}>
                            <CompassIcon name='close-circle' size={20} color={changeOpacity(theme.centerChannelColor, 0.5)}/>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity onPress={onCreateNote} style={style.newNoteBtn}>
                            <Text style={style.newNoteBtnText}>
                                {intl.formatMessage({id: 'smart_notebook.new', defaultMessage: '新建'})}
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}

            {/* Search - List Tab */}
            {viewMode === 'list' && (
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
            )}

            {/* Notes Tab Content - Grouped by date */}
            {viewMode === 'notes' && (() => {
                const {pinned, groups} = searching ? {pinned: [], groups: new Map()} : groupNotesByDate(notes);
                const searchNotes = searching ? notes : [];

                // Build flat list data with section headers
                type ListItem = {type: 'header'; key: string; title: string; icon?: string} | {type: 'note'; item: SmartNoteSummary};
                const listData: ListItem[] = [];

                if (searching) {
                    searchNotes.forEach(n => listData.push({type: 'note', item: n}));
                } else {
                    // Pinned section
                    if (pinned.length > 0) {
                        listData.push({type: 'header', key: 'pinned', title: intl.formatMessage({id: 'smart_notebook.pinned', defaultMessage: '置顶'}), icon: 'pin'});
                        pinned.forEach(n => listData.push({type: 'note', item: n}));
                    }
                    // Date groups
                    DATE_GROUP_KEYS.filter(k => k !== 'pinned').forEach(key => {
                        const items = groups.get(key);
                        if (items && items.length > 0) {
                            listData.push({type: 'header', key, title: intl.formatMessage({id: `smart_notebook.date_group.${key}`, defaultMessage: key})});
                            items.forEach(n => listData.push({type: 'note', item: n}));
                        }
                    });
                }

                return (
                    <FlatList
                        data={listData}
                        keyExtractor={(item, index) => item.type === 'header' ? `header_${item.key}` : item.item.id}
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        contentContainerStyle={style.listContent}
                        renderItem={({item}) => {
                            if (item.type === 'header') {
                                return (
                                    <View style={style.dateGroupHeader}>
                                        {item.icon && <CompassIcon name={item.icon as any} size={14} color={theme.buttonBg}/>}
                                        <Text style={style.dateGroupTitle}>{item.title}</Text>
                                    </View>
                                );
                            }
                            return renderItem({item: item.item});
                        }}
                        ListEmptyComponent={
                            <View style={style.emptyContainer}>
                                <CompassIcon name='notebook-outline' size={64} color={changeOpacity(theme.centerChannelColor, 0.3)}/>
                                <Text style={style.emptyText}>
                                    {searching
                                        ? intl.formatMessage({id: 'smart_notebook.no_results', defaultMessage: '没有找到匹配的笔记'})
                                        : intl.formatMessage({id: 'smart_notebook.empty', defaultMessage: '暂无笔记'})}
                                </Text>
                            </View>
                        }
                    />
                );
            })()}

            {/* List Tab Content - Entities and Relations */}
            {viewMode === 'list' && (
                graphLoading ? (
                    <View style={style.loadingContainer}>
                        <ActivityIndicator size='large' color={theme.buttonBg}/>
                    </View>
                ) : (
                    <FlatList
                        data={(() => {
                            // Build relation count map
                            const relCountMap = new Map<string, number>();
                            graphEntities.forEach(e => relCountMap.set(e.uuid, 0));
                            graphRelations.forEach(rel => {
                                const src = graphEntities.find(e => e.uuid === rel.source || e.name === rel.source);
                                const tgt = graphEntities.find(e => e.uuid === rel.target || e.name === rel.target);
                                if (src) relCountMap.set(src.uuid, (relCountMap.get(src.uuid) || 0) + 1);
                                if (tgt) relCountMap.set(tgt.uuid, (relCountMap.get(tgt.uuid) || 0) + 1);
                            });

                            // Filter and sort by relation count (descending)
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
                                    {/* Entity Header - Clickable */}
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

                                    {/* Entity Details - When Expanded */}
                                    {isSelected && (
                                        <View style={style.entityDetails}>
                                            {/* Attributes */}
                                            {item.attributes && Object.keys(item.attributes).length > 0 && (
                                                <View style={style.entitySection}>
                                                    <Text style={style.entitySectionTitle}>
                                                        {intl.formatMessage({id: 'smart_notebook.entity.attributes', defaultMessage: '属性'})}
                                                    </Text>
                                                    {Object.entries(item.attributes).map(([key, value]) => (
                                                        <View key={key} style={style.attributeRow}>
                                                            <Text style={style.attributeKey}>{key}:</Text>
                                                            <Text style={style.attributeValue}>{String(value)}</Text>
                                                        </View>
                                                    ))}
                                                </View>
                                            )}

                                            {/* Relations */}
                                            {relations.length > 0 && (
                                                <View style={style.entitySection}>
                                                    <Text style={style.entitySectionTitle}>
                                                        {intl.formatMessage(
                                                            {id: 'smart_notebook.entity.relations', defaultMessage: '关联关系 ({count})'},
                                                            {count: relations.length}
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
                                            )}

                                            {/* No Relations */}
                                            {relations.length === 0 && (
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
                                    {intl.formatMessage({id: 'smart_notebook.graph.empty', defaultMessage: '暂无实体数据，请先推送笔记到图谱'})}
                                </Text>
                            </View>
                        }
                    />
                )
            )}
        </SafeAreaView>
    );
};

// ---- Styles ----

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
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
    listContent: {
        paddingHorizontal: 16,
        paddingTop: 8,
    },
    card: {
        backgroundColor: theme.centerChannelBg,
        borderRadius: 8,
        padding: 12,
        marginBottom: 8,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    cardTitle: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.centerChannelColor,
        flex: 1,
    },
    cardDate: {
        ...typography('Body', 50),
        color: changeOpacity(theme.centerChannelColor, 0.5),
    },
    searchActionBtn: {
        padding: 8,
        marginLeft: 4,
    },
    newNoteBtn: {
        backgroundColor: theme.buttonBg,
        borderRadius: 6,
        paddingHorizontal: 14,
        paddingVertical: 6,
        marginLeft: 8,
    },
    newNoteBtnText: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.buttonColor,
    },
    swipeActionsContainer: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        marginBottom: 12,
        borderRadius: 12,
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
    swipeActionBtnActive: {
        backgroundColor: theme.buttonBg,
    },
    swipeActionBtnDanger: {
        backgroundColor: theme.dndIndicator,
    },
    swipeActionText: {
        ...typography('Body', 50),
        color: theme.buttonColor,
        marginTop: 4,
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
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
    dateGroup: {
        marginTop: 8,
    },
    dateGroupHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: 16,
        paddingBottom: 8,
        paddingHorizontal: 4,
    },
    dateGroupTitle: {
        ...typography('Body', 75, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.7),
        marginLeft: 4,
    },
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
    entityCardExpanded: {
        borderColor: theme.buttonBg,
        borderWidth: 1.5,
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
    attributeRow: {
        flexDirection: 'row',
        paddingVertical: 4,
    },
    attributeKey: {
        ...typography('Body', 75, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.7),
        minWidth: 80,
    },
    attributeValue: {
        ...typography('Body', 75),
        color: theme.centerChannelColor,
        flex: 1,
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
    entityRelations: {
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    relationItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
    },
    relationName: {
        ...typography('Body', 75),
        color: theme.centerChannelColor,
        flex: 1,
    },
}));

export default SmartNotebookScreen;
