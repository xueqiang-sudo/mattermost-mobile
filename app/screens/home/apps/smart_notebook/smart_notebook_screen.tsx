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
    getTimeline,
    type SmartNoteSummary,
    type TimelineEntry,
} from './smart_notebook_api';

// ---- Constants ----

const NOTE_LIMIT = 50;

type Scope = 'private' | 'public';

// ---- Helpers ----

function formatDate(val: string): string {
    if (!val) return '';
    const d = new Date(val);
    if (isNaN(d.getTime())) return val;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

// ---- Component ----

const SmartNotebookScreen = () => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const navigation = useNavigation();
    const style = getStyleSheet(theme);

    // User ID
    const [userId, setUserId] = useState('');

    // Scope toggle
    const [scope, setScope] = useState<Scope>('private');

    // View mode toggle
    const [viewMode, setViewMode] = useState<'list' | 'timeline'>('list');

    // Data
    const [notes, setNotes] = useState<SmartNoteSummary[]>([]);
    const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Search
    const [searchQuery, setSearchQuery] = useState('');
    const [searching, setSearching] = useState(false);
    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
            if (viewMode === 'timeline') {
                const result = await getTimeline(serverUrl, userId, NOTE_LIMIT);
                const entries = result?.entries || [];
                setTimeline(entries);
            } else {
                const result = await listNotes(serverUrl, userId, scope);
                const entries = result?.entries || [];
                setNotes(entries);
            }
        } catch {
            if (viewMode === 'timeline') {
                setTimeline([]);
            } else {
                setNotes([]);
            }
        } finally {
            setLoading(false);
        }
    }, [serverUrl, userId, scope, viewMode]);

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
            const result = await searchNotes(serverUrl, userId, query.trim(), NOTE_LIMIT, scope);
            const entries = result?.entries || [];
            setNotes(entries);
        } catch {
            // keep current list
        } finally {
            setSearching(false);
        }
    }, [serverUrl, userId, scope, loadNotes]);

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

    // ---- Create new note ----
    const onCreateNote = useCallback(() => {
        navigation.navigate(Screens.SMART_NOTE_DETAIL, {
            noteId: 'new',
            noteTitle: '新建笔记',
        });
    }, [navigation]);

    // ---- Render item ----
    const renderItem = useCallback(({item}: {item: SmartNoteSummary}) => {
        const dateStr = formatDate(item.updatedAt);
        return (
            <TouchableOpacity
                style={style.card}
                onPress={() => openDetail(item)}
                onLongPress={() => onDeleteNote(item)}
                activeOpacity={0.7}
            >
                <View style={style.cardHeader}>
                    <Text style={style.cardTitle} numberOfLines={1}>
                        {item.title || '无标题'}
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
                    {item.tags.length > 0 && (
                        <View style={style.tagContainer}>
                            {item.tags.slice(0, 3).map((tag, idx) => (
                                <View key={idx} style={style.tag}>
                                    <Text style={style.tagText}>{tag}</Text>
                                </View>
                            ))}
                        </View>
                    )}
                </View>
            </TouchableOpacity>
        );
    }, [style, theme, openDetail, onDeleteNote]);

    // ---- Render timeline item ----
    const renderTimelineItem = useCallback(({item}: {item: TimelineEntry}) => {
        const dateStr = formatDate(String(item.updatedAt));
        const createdStr = formatDate(String(item.createdAt));
        return (
            <TouchableOpacity
                style={style.timelineCard}
                onPress={() => openDetail({
                    id: item.id,
                    title: item.title,
                    preview: '',
                    tags: item.tags,
                    pinned: false,
                    createdAt: String(item.createdAt),
                    updatedAt: String(item.updatedAt),
                })}
                activeOpacity={0.7}
            >
                <View style={style.timelineDot}/>
                <View style={style.timelineContent}>
                    <Text style={style.timelineTitle} numberOfLines={1}>
                        {item.title || '无标题'}
                    </Text>
                    <View style={style.timelineMeta}>
                        <Text style={style.timelineDate}>{dateStr}</Text>
                        {item.eventCount > 0 && (
                            <Text style={style.timelineEvents}>
                                {item.eventCount} 个事件
                            </Text>
                        )}
                    </View>
                    {item.tags.length > 0 && (
                        <View style={style.tagContainer}>
                            {item.tags.slice(0, 3).map((tag, idx) => (
                                <View key={idx} style={style.tag}>
                                    <Text style={style.tagText}>{tag}</Text>
                                </View>
                            ))}
                        </View>
                    )}
                </View>
            </TouchableOpacity>
        );
    }, [style, openDetail]);

    const keyExtractor = useCallback((item: SmartNoteSummary | TimelineEntry) => item.id, []);

    // ---- Render ----
    if (loading) {
        return (
            <SafeAreaView style={[style.container, {backgroundColor: theme.centerChannelBg}]}>
                <View style={style.header}>
                    <Text style={style.headerTitle}>
                        {intl.formatMessage({id: 'smart_notebook.title', defaultMessage: '智能笔记本'})}
                    </Text>
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
                <Text style={style.headerTitle}>
                    {intl.formatMessage({id: 'smart_notebook.title', defaultMessage: '智能笔记本'})}
                </Text>
                <TouchableOpacity onPress={onCreateNote} style={style.addButton}>
                    <CompassIcon name='plus' size={24} color={theme.buttonBg}/>
                </TouchableOpacity>
            </View>

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

            <View style={style.scopeToggle}>
                <TouchableOpacity
                    style={[style.scopeButton, viewMode === 'list' && style.scopeButtonActive]}
                    onPress={() => setViewMode('list')}
                >
                    <Text style={[style.scopeText, viewMode === 'list' && style.scopeTextActive]}>
                        {intl.formatMessage({id: 'smart_notebook.view_list', defaultMessage: '列表'})}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[style.scopeButton, viewMode === 'timeline' && style.scopeButtonActive]}
                    onPress={() => setViewMode('timeline')}
                >
                    <Text style={[style.scopeText, viewMode === 'timeline' && style.scopeTextActive]}>
                        {intl.formatMessage({id: 'smart_notebook.view_timeline', defaultMessage: '时间线'})}
                    </Text>
                </TouchableOpacity>
                {viewMode === 'list' && (
                    <>
                        <TouchableOpacity
                            style={[style.scopeButton, scope === 'private' && style.scopeButtonActive]}
                            onPress={() => setScope('private')}
                        >
                            <Text style={[style.scopeText, scope === 'private' && style.scopeTextActive]}>
                                {intl.formatMessage({id: 'smart_notebook.scope_private', defaultMessage: '私有'})}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[style.scopeButton, scope === 'public' && style.scopeButtonActive]}
                            onPress={() => setScope('public')}
                        >
                            <Text style={[style.scopeText, scope === 'public' && style.scopeTextActive]}>
                                {intl.formatMessage({id: 'smart_notebook.scope_public', defaultMessage: '公开'})}
                            </Text>
                        </TouchableOpacity>
                    </>
                )}
            </View>

            <FlatList
                data={viewMode === 'timeline' ? timeline : notes}
                renderItem={viewMode === 'timeline' ? renderTimelineItem : renderItem}
                keyExtractor={keyExtractor}
                refreshing={refreshing}
                onRefresh={onRefresh}
                contentContainerStyle={style.listContent}
                ListEmptyComponent={
                    <View style={style.emptyContainer}>
                        <CompassIcon name='notebook-outline' size={64} color={changeOpacity(theme.centerChannelColor, 0.3)}/>
                        <Text style={style.emptyText}>
                            {searching
                                ? intl.formatMessage({id: 'smart_notebook.no_results', defaultMessage: '没有找到匹配的笔记'})
                                : viewMode === 'timeline'
                                    ? intl.formatMessage({id: 'smart_notebook.empty_timeline', defaultMessage: '暂无时间线事件'})
                                    : intl.formatMessage({id: 'smart_notebook.empty', defaultMessage: '暂无笔记'})}
                        </Text>
                    </View>
                }
            />
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
    headerTitle: {
        ...typography('Heading', 200, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    addButton: {
        padding: 8,
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
    scopeToggle: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingBottom: 8,
    },
    scopeButton: {
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 16,
        marginRight: 8,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.06),
    },
    scopeButtonActive: {
        backgroundColor: theme.buttonBg,
    },
    scopeText: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.7),
    },
    scopeTextActive: {
        color: theme.buttonColor,
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
    tagContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    tag: {
        backgroundColor: changeOpacity(theme.buttonBg, 0.1),
        borderRadius: 4,
        paddingHorizontal: 6,
        paddingVertical: 2,
        marginLeft: 4,
    },
    tagText: {
        ...typography('Body', 50),
        color: theme.buttonBg,
    },
    timelineCard: {
        flexDirection: 'row',
        backgroundColor: theme.centerChannelBg,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    timelineDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: theme.buttonBg,
        marginTop: 4,
        marginRight: 12,
    },
    timelineContent: {
        flex: 1,
    },
    timelineTitle: {
        ...typography('Heading', 100, 'SemiBold'),
        color: theme.centerChannelColor,
        marginBottom: 8,
    },
    timelineMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    timelineDate: {
        ...typography('Body', 50),
        color: changeOpacity(theme.centerChannelColor, 0.5),
        marginRight: 12,
    },
    timelineEvents: {
        ...typography('Body', 50),
        color: theme.buttonBg,
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
}));

export default SmartNotebookScreen;
