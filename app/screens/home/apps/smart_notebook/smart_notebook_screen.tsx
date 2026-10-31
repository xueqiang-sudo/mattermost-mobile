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
            noteTitle: '新建笔记',
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
                                <CompassIcon name='pin' size={16} color={theme.buttonBg}/>
                            )}
                        </View>
                        <Text style={style.cardPreview} numberOfLines={2}>
                            {item.preview || ''}
                        </Text>
                        <View style={style.cardFooter}>
                            <Text style={style.cardDate}>{dateStr}</Text>
                        </View>
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
                        <CompassIcon name='arrow-left' size={24} color={theme.centerChannelColor}/>
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
            <View style={style.header}>
                <TouchableOpacity onPress={goBack} style={style.headerBtn}>
                    <CompassIcon name='arrow-left' size={24} color={theme.centerChannelColor}/>
                </TouchableOpacity>
                <Text style={style.headerTitle}>
                    {intl.formatMessage({id: 'smart_notebook.title', defaultMessage: '智能笔记本'})}
                </Text>
                {viewMode === 'notes' ? (
                    <TouchableOpacity onPress={onCreateNote} style={style.headerBtn}>
                        <CompassIcon name='plus' size={24} color={theme.buttonBg}/>
                    </TouchableOpacity>
                ) : (
                    <View style={style.headerBtn}/>
                )}
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

            {/* Search - Notes Tab */}
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
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => onSearchChange('')}>
                            <CompassIcon name='close-circle' size={20} color={changeOpacity(theme.centerChannelColor, 0.5)}/>
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

            {/* List Tab Content - Graph Entities */}
            {viewMode === 'list' && (
                graphLoading ? (
                    <View style={style.loadingContainer}>
                        <ActivityIndicator size='large' color={theme.buttonBg}/>
                    </View>
                ) : (
                    <FlatList
                        data={graphEntities.filter(e =>
                            !graphSearchQuery ||
                            e.name.toLowerCase().includes(graphSearchQuery.toLowerCase()) ||
                            (e.summary || '').toLowerCase().includes(graphSearchQuery.toLowerCase())
                        )}
                        keyExtractor={(item) => item.uuid}
                        refreshing={false}
                        onRefresh={loadGraph}
                        contentContainerStyle={style.listContent}
                        renderItem={({item}) => {
                            const relCount = graphRelations.filter(r =>
                                r.source === item.uuid || r.source === item.name ||
                                r.target === item.uuid || r.target === item.name
                            ).length;
                            return (
                                <View style={style.entityCard}>
                                    <View style={style.entityHeader}>
                                        <Text style={style.entityName} numberOfLines={1}>
                                            {item.name}
                                        </Text>
                                        <View style={style.entityBadge}>
                                            <Text style={style.entityBadgeText}>{relCount}</Text>
                                        </View>
                                    </View>
                                    {item.summary ? (
                                        <Text style={style.entitySummary} numberOfLines={2}>
                                            {item.summary}
                                        </Text>
                                    ) : null}
                                </View>
                            );
                        }}
                        ListEmptyComponent={
                            <View style={style.emptyContainer}>
                                <CompassIcon name='share-variant-outline' size={64} color={changeOpacity(theme.centerChannelColor, 0.3)}/>
                                <Text style={style.emptyText}>
                                    {intl.formatMessage({id: 'smart_notebook.graph.empty', defaultMessage: '暂无知识图谱数据，请先推送笔记到图谱'})}
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
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    headerBtn: {
        padding: 8,
        minWidth: 40,
    },
    headerTitle: {
        ...typography('Heading', 200, 'SemiBold'),
        color: theme.centerChannelColor,
        flex: 1,
        textAlign: 'center',
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
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    cardTitle: {
        ...typography('Heading', 100, 'SemiBold'),
        color: theme.centerChannelColor,
        flex: 1,
    },
    cardPreview: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.7),
        marginBottom: 12,
    },
    cardFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    cardDate: {
        ...typography('Body', 50),
        color: changeOpacity(theme.centerChannelColor, 0.5),
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
        padding: 16,
        marginBottom: 12,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    entityHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    entityName: {
        ...typography('Heading', 100, 'SemiBold'),
        color: theme.centerChannelColor,
        flex: 1,
    },
    entityBadge: {
        backgroundColor: theme.buttonBg,
        borderRadius: 10,
        minWidth: 20,
        height: 20,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 6,
    },
    entityBadgeText: {
        ...typography('Body', 50, 'SemiBold'),
        color: theme.buttonColor,
    },
    entitySummary: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.7),
    },
}));

export default SmartNotebookScreen;
