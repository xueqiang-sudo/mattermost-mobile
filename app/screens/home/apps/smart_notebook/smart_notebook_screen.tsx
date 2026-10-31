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
    type SmartNoteSummary,
} from './smart_notebook_api';

// ---- Constants ----

const NOTE_LIMIT = 50;

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

    // Data
    const [notes, setNotes] = useState<SmartNoteSummary[]>([]);
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
                <TouchableOpacity onPress={onCreateNote} style={style.headerBtn}>
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

            <FlatList
                data={notes}
                renderItem={renderItem}
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
