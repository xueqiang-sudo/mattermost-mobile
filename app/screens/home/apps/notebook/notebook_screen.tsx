// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    ScrollView,
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
import {getCurrentTeamId} from '@queries/servers/system';
import {goToScreen} from '@screens/navigation';
import {debugLog} from '@store/debug_log';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import {
    listNoteEntries,
    getNoteEntry,
    addNoteEntry,
    deleteNoteEntry,
    searchNoteEntries,
    type NoteListItem,
    type NoteDetail,
} from '../workbench_api';

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

const NotebookScreen = () => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const navigation = useNavigation();
    const style = getStyleSheet(theme);

    // Team
    const [teamId, setTeamId] = useState('');

    // Scope toggle
    const [scope, setScope] = useState<Scope>('private');

    // Data
    const [notes, setNotes] = useState<NoteListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Search
    const [searchQuery, setSearchQuery] = useState('');
    const [searching, setSearching] = useState(false);
    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ---- Init: get teamId ----
    useEffect(() => {
        const init = async () => {
            try {
                const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
                const tid = await getCurrentTeamId(database);
                setTeamId(tid);
            } catch {
                // ignore
            }
        };
        init();
    }, [serverUrl]);

    // ---- Load notes ----
    const loadNotes = useCallback(async () => {
        if (!teamId) return;
        setLoading(true);
        try {
            const result = await listNoteEntries(serverUrl, teamId, scope, NOTE_LIMIT);
            if (result?.ok !== false) {
                const entries = result?.data?.entries || result?.entries || [];
                setNotes(entries);
            } else {
                setNotes([]);
            }
        } catch {
            setNotes([]);
        } finally {
            setLoading(false);
        }
    }, [serverUrl, teamId, scope]);

    useEffect(() => {
        loadNotes();
    }, [loadNotes]);

    // ---- Search (debounced) ----
    const doSearch = useCallback(async (query: string) => {
        if (!teamId) return;
        if (!query.trim()) {
            // Reset to full list
            setSearching(false);
            loadNotes();
            return;
        }
        setSearching(true);
        try {
            const result = await searchNoteEntries(serverUrl, teamId, scope, query.trim(), NOTE_LIMIT);
            const entries = result?.data?.entries || result?.entries || [];
            setNotes(entries);
        } catch {
            // keep current list
        } finally {
            setSearching(false);
        }
    }, [serverUrl, teamId, scope, loadNotes]);

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

    // ---- Open detail (using goToScreen) ----
    const openDetail = useCallback((item: NoteListItem) => {
        // 使用导航方式打开笔记详情，避免 iOS Modal 手势冲突
        const title = item.title || item.preview || intl.formatMessage({
            id: 'workbench.notebook.detail_title',
            defaultMessage: 'Note Detail',
        });
        goToScreen(Screens.NOTE_DETAIL, title, {
            noteId: item.noteId,
            noteTitle: item.title || item.preview || '',
            teamId,
            scope,
        });
    }, [intl, teamId, scope]);

    // ---- Delete note ----
    const onDeleteNote = useCallback((item: NoteListItem) => {
        Alert.alert(
            intl.formatMessage({id: 'workbench.notebook.delete_title', defaultMessage: 'Delete Note'}),
            intl.formatMessage({id: 'workbench.notebook.delete_confirm', defaultMessage: 'Are you sure you want to delete this note?'}),
            [
                {
                    text: intl.formatMessage({id: 'common.cancel', defaultMessage: 'Cancel'}),
                    style: 'cancel',
                },
                {
                    text: intl.formatMessage({id: 'workbench.notebook.delete', defaultMessage: 'Delete'}),
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await deleteNoteEntry(serverUrl, teamId, item.noteId, scope);
                            if (searchQuery.trim()) {
                                doSearch(searchQuery);
                            } else {
                                loadNotes();
                            }
                        } catch {
                            Alert.alert(
                                intl.formatMessage({id: 'workbench.notebook.error', defaultMessage: 'Error'}),
                                intl.formatMessage({id: 'workbench.notebook.delete_failed', defaultMessage: 'Failed to delete note.'}),
                            );
                        }
                    },
                },
            ],
        );
    }, [intl, serverUrl, teamId, scope, searchQuery, doSearch, loadNotes]);

    // ---- Add note (using goToScreen) ----
    const onNavigateToAddNote = useCallback(() => {
        const title = intl.formatMessage({
            id: 'workbench.notebook.add_title',
            defaultMessage: 'New Note',
        });
        goToScreen(Screens.NOTE_ADD, title, {
            teamId,
            scope,
            onNoteAdded: () => {
                // 添加成功后刷新列表
                if (searchQuery.trim()) {
                    doSearch(searchQuery);
                } else {
                    loadNotes();
                }
            },
        });
    }, [intl, teamId, scope, searchQuery, doSearch, loadNotes]);

    // ---- Toggle scope ----
    const toggleScope = useCallback(() => {
        setScope((prev) => (prev === 'private' ? 'public' : 'private'));
        setSearchQuery('');
    }, []);

    // ---- Render note item ----
    const renderNote = useCallback(({item}: {item: NoteListItem}) => (
        <TouchableOpacity
            style={style.noteCard}
            onPress={() => openDetail(item)}
            onLongPress={() => onDeleteNote(item)}
            activeOpacity={0.7}
        >
            <View style={style.noteHeader}>
                <Text style={style.noteTitle} numberOfLines={1}>
                    {item.title || intl.formatMessage({id: 'workbench.notebook.untitled', defaultMessage: 'Untitled'})}
                </Text>
                <Text style={style.noteDate}>{formatDate(item.createdAt)}</Text>
            </View>
            {item.preview ? (
                <Text style={style.notePreview} numberOfLines={2}>
                    {item.preview}
                </Text>
            ) : null}
            {item.tags && item.tags.length > 0 ? (
                <View style={style.tagsRow}>
                    {item.tags.map((tag) => (
                        <View key={tag} style={style.tagBadge}>
                            <Text style={style.tagText}>{tag}</Text>
                        </View>
                    ))}
                </View>
            ) : null}
        </TouchableOpacity>
    ), [style, openDetail, onDeleteNote, intl]);

    const keyExtractor = useCallback((item: NoteListItem) => item.noteId, []);

    // ---- Empty state ----
    const renderEmpty = useCallback(() => {
        if (loading || searching) return null;
        return (
            <View style={style.emptyContainer}>
                <CompassIcon name='notebook-outline' size={48} color={changeOpacity(theme.centerChannelColor, 0.3)}/>
                <Text style={style.emptyText}>
                    {searchQuery.trim()
                        ? intl.formatMessage({id: 'workbench.notebook.no_results', defaultMessage: 'No notes found.'})
                        : intl.formatMessage({id: 'workbench.notebook.no_notes', defaultMessage: 'No notes yet.'})
                    }
                </Text>
            </View>
        );
    }, [loading, searching, searchQuery, style, theme, intl]);

    // ---- List header (scope toggle + search) ----
    const renderListHeader = useCallback(() => (
        <View>
            {/* Scope toggle */}
            <View style={style.scopeRow}>
                <TouchableOpacity
                    style={[style.scopeBtn, scope === 'private' && style.scopeBtnActive]}
                    onPress={toggleScope}
                >
                    <CompassIcon
                        name='lock-outline'
                        size={16}
                        color={scope === 'private' ? theme.buttonBg : changeOpacity(theme.centerChannelColor, 0.56)}
                    />
                    <Text style={[style.scopeText, scope === 'private' && style.scopeTextActive]}>
                        {intl.formatMessage({id: 'workbench.notebook.private', defaultMessage: 'Private'})}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[style.scopeBtn, scope === 'public' && style.scopeBtnActive]}
                    onPress={toggleScope}
                >
                    <CompassIcon
                        name='globe'
                        size={16}
                        color={scope === 'public' ? theme.buttonBg : changeOpacity(theme.centerChannelColor, 0.56)}
                    />
                    <Text style={[style.scopeText, scope === 'public' && style.scopeTextActive]}>
                        {intl.formatMessage({id: 'workbench.notebook.public', defaultMessage: 'Public'})}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Search bar */}
            <View style={style.searchRow}>
                <View style={style.searchInputWrapper}>
                    <CompassIcon
                        name='magnify'
                        size={18}
                        color={changeOpacity(theme.centerChannelColor, 0.44)}
                    />
                    <TextInput
                        style={style.searchInput}
                        value={searchQuery}
                        onChangeText={onSearchChange}
                        placeholder={intl.formatMessage({id: 'workbench.notebook.search_placeholder', defaultMessage: 'Search notes...'})}
                        placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.44)}
                        returnKeyType='search'
                        autoCapitalize='none'
                        autoCorrect={false}
                        clearButtonMode='while-editing'
                    />
                </View>
            </View>
        </View>
    ), [style, scope, toggleScope, searchQuery, onSearchChange, theme, intl]);

    // ---- Main render ----
    return (
        <SafeAreaView edges={['top', 'bottom']} style={style.container}>
            {/* Header */}
            <View style={style.header}>
                <TouchableOpacity
                    style={style.backBtn}
                    onPress={() => navigation.goBack()}
                >
                    <CompassIcon name='arrow-left' size={24} color={theme.sidebarText}/>
                </TouchableOpacity>
                <Text style={style.headerTitle}>
                    {intl.formatMessage({id: 'workbench.notebook.title', defaultMessage: 'Notebook'})}
                </Text>
                <TouchableOpacity
                    style={style.addBtn}
                    onPress={onNavigateToAddNote}
                >
                    <CompassIcon name='plus' size={24} color={theme.sidebarText}/>
                </TouchableOpacity>
            </View>

            {/* Content */}
            {loading && notes.length === 0 ? (
                <View style={style.loadingContainer}>
                    <ActivityIndicator size='large' color={theme.buttonBg}/>
                </View>
            ) : (
                <FlatList
                    data={notes}
                    renderItem={renderNote}
                    keyExtractor={keyExtractor}
                    ListHeaderComponent={renderListHeader}
                    ListEmptyComponent={renderEmpty}
                    contentContainerStyle={style.listContent}
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    showsVerticalScrollIndicator={false}
                />
            )}

            {/* Modals - removed, using navigation instead */}
        </SafeAreaView>
    );
};

// ---- Styles ----

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: theme.sidebarBg,
    },
    backBtn: {
        padding: 4,
        marginRight: 8,
    },
    headerTitle: {
        ...typography('Heading', 200, 'SemiBold'),
        color: theme.sidebarText,
        flex: 1,
    },
    addBtn: {
        padding: 4,
        marginLeft: 8,
    },

    // Loading
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },

    // List
    listContent: {
        paddingBottom: 20,
    },

    // Scope toggle
    scopeRow: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 4,
        gap: 12,
    },
    scopeBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
        gap: 6,
    },
    scopeBtnActive: {
        backgroundColor: changeOpacity(theme.buttonBg, 0.12),
    },
    scopeText: {
        ...typography('Body', 100, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.56),
    },
    scopeTextActive: {
        color: theme.buttonBg,
        fontWeight: '600',
    },

    // Search
    searchRow: {
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 8,
    },
    searchInputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.06),
        borderRadius: 8,
        paddingHorizontal: 10,
        height: 36,
        gap: 6,
    },
    searchInput: {
        flex: 1,
        ...typography('Body', 100, 'Regular'),
        color: theme.centerChannelColor,
        padding: 0,
        height: 36,
    },

    // Note card
    noteCard: {
        marginHorizontal: 16,
        marginTop: 8,
        padding: 12,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderRadius: 8,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    noteHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    noteTitle: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.centerChannelColor,
        flex: 1,
        marginRight: 8,
    },
    noteDate: {
        ...typography('Body', 75, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.48),
    },
    notePreview: {
        ...typography('Body', 100, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.64),
        lineHeight: 18,
        marginTop: 2,
    },
    tagsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginTop: 8,
        gap: 6,
    },
    tagBadge: {
        backgroundColor: changeOpacity(theme.buttonBg, 0.1),
        borderRadius: 4,
        paddingHorizontal: 6,
        paddingVertical: 2,
    },
    tagText: {
        ...typography('Body', 75, 'Regular'),
        color: theme.buttonBg,
    },

    // Empty state
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 48,
        paddingBottom: 24,
    },
    emptyText: {
        ...typography('Body', 200, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.48),
        marginTop: 12,
    },

    // Modal
    modalContainer: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    modalCloseBtn: {
        width: 32,
        height: 32,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalTitle: {
        ...typography('Heading', 200, 'SemiBold'),
        color: theme.centerChannelColor,
        flex: 1,
        textAlign: 'center',
    },
    modalSaveBtn: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.buttonBg,
    },
    modalSaveBtnDisabled: {
        color: changeOpacity(theme.centerChannelColor, 0.32),
    },
    modalBody: {
        flex: 1,
        paddingHorizontal: 16,
    },
    modalBodyContent: {
        paddingTop: 12,
        paddingBottom: 20,
    },
    modalLoading: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },

    // Detail
    detailContent: {
        ...typography('Body', 200, 'Regular'),
        color: theme.centerChannelColor,
        lineHeight: 24,
    },

    // Add note
    addTextInput: {
        ...typography('Body', 200, 'Regular'),
        color: theme.centerChannelColor,
        flex: 1,
        lineHeight: 24,
        paddingTop: 0,
    },
}));

export default NotebookScreen;
