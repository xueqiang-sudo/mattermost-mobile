// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useNavigation} from '@react-navigation/native';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import DatabaseManager from '@database/manager';
import {getCurrentTeamId} from '@queries/servers/system';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import {
    listKBDocs,
    searchKBDocs,
    getKBDoc,
    createKBDocText,
    createKBDocURL,
    deleteKBDoc,
    askKB,
    type KBDoc,
    type KBSearchResult,
    type KBAskSource,
} from '../workbench_api';

// ---- Constants ----

const CATEGORIES = [
    {key: '', labelId: 'workbench.kb.filter_all', defaultMessage: 'All'},
    {key: 'file', labelId: 'workbench.kb.filter_file', defaultMessage: 'File'},
    {key: 'text', labelId: 'workbench.kb.filter_text', defaultMessage: 'Text'},
    {key: 'url', labelId: 'workbench.kb.filter_url', defaultMessage: 'URL'},
];

type AddDocType = 'text' | 'url';

/** Unified display item for both document list and search results. */
type DisplayItem = {
    docId: string;
    title: string;
    category: string;
    tags: string[];
    createdAt: string;
    snippet?: string;
    score?: number;
};

// ---- Helpers ----

function formatDate(val: string): string {
    if (!val) return '';
    const d = new Date(val);
    if (isNaN(d.getTime())) return val;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function categoryIcon(category: string): string {
    switch (category) {
        case 'file':
            return 'file-document-outline';
        case 'text':
            return 'text-box-outline';
        case 'url':
            return 'link-variant';
        default:
            return 'book-open-outline';
    }
}

// ---- Styles ----

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
        backgroundColor: theme.sidebarBg,
    },
    backBtn: {
        padding: 8,
        marginRight: 8,
    },
    headerTitle: {
        ...typography('Heading', 200, 'SemiBold'),
        color: theme.sidebarText,
        flex: 1,
    },
    headerAction: {
        padding: 8,
        marginLeft: 4,
    },

    // Category chips
    chipRow: {
        flexDirection: 'row',
        paddingHorizontal: 12,
        paddingVertical: 8,
        gap: 8,
        backgroundColor: theme.centerChannelBg,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    chip: {
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 16,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.06),
    },
    chipActive: {
        backgroundColor: theme.buttonBg,
    },
    chipText: {
        ...typography('Body', 75, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.64),
    },
    chipTextActive: {
        color: theme.buttonColor,
    },

    // Search bar
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 12,
        marginVertical: 8,
        paddingHorizontal: 12,
        height: 40,
        borderRadius: 8,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.06),
    },
    searchInput: {
        flex: 1,
        marginLeft: 8,
        paddingVertical: 0,
        ...typography('Body', 100, 'Regular'),
        color: theme.centerChannelColor,
    },
    searchClear: {
        padding: 4,
    },

    // Document list
    listContent: {
        paddingBottom: 80,
    },
    docCard: {
        marginHorizontal: 12,
        marginTop: 8,
        padding: 14,
        borderRadius: 10,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.03),
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    docHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
    },
    docIcon: {
        marginRight: 8,
    },
    docTitle: {
        ...typography('Heading', 100, 'SemiBold'),
        color: theme.centerChannelColor,
        flex: 1,
    },
    docMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
        gap: 8,
    },
    docCategory: {
        ...typography('Body', 50, 'SemiBold'),
        color: theme.buttonBg,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    docDate: {
        ...typography('Body', 50, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.48),
    },
    docTags: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 4,
        marginTop: 8,
    },
    tagChip: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    tagText: {
        ...typography('Body', 25, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.64),
    },
    docSnippet: {
        ...typography('Body', 75, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.72),
        marginTop: 6,
    },
    docScore: {
        ...typography('Body', 50, 'SemiBold'),
        color: theme.onlineIndicator,
        marginLeft: 'auto',
    },

    // Empty state
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
    },
    emptyText: {
        ...typography('Body', 200, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.48),
        marginTop: 12,
    },

    // Bottom bar
    bottomBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: theme.centerChannelBg,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.1),
        flexDirection: 'row',
        gap: 10,
    },
    askBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        borderRadius: 10,
        backgroundColor: theme.buttonBg,
        gap: 8,
    },
    askBtnText: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.buttonColor,
    },
    addBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 10,
        backgroundColor: changeOpacity(theme.buttonBg, 0.12),
        gap: 6,
    },
    addBtnText: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.buttonBg,
    },

    // Modal common
    modalOverlay: {
        flex: 1,
        backgroundColor: changeOpacity('#000', 0.5),
        justifyContent: 'flex-end',
    },
    modalSheet: {
        backgroundColor: theme.centerChannelBg,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        maxHeight: '90%',
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    modalTitle: {
        ...typography('Heading', 200, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    modalClose: {
        padding: 4,
    },
    modalBody: {
        padding: 16,
    },

    // Detail modal
    detailCategory: {
        ...typography('Body', 75, 'SemiBold'),
        color: theme.buttonBg,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 4,
    },
    detailDate: {
        ...typography('Body', 50, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.48),
        marginBottom: 12,
    },
    detailContent: {
        ...typography('Body', 100, 'Regular'),
        color: theme.centerChannelColor,
        lineHeight: 22,
    },
    detailSourceUrl: {
        ...typography('Body', 75, 'Regular'),
        color: theme.linkColor,
        marginTop: 8,
        textDecorationLine: 'underline',
    },
    detailDeleteBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        marginTop: 20,
        borderRadius: 8,
        backgroundColor: changeOpacity(theme.errorTextColor, 0.1),
        gap: 6,
    },
    detailDeleteText: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.errorTextColor,
    },

    // Add modal
    addTypeRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 16,
    },
    addTypeBtn: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 12,
        borderRadius: 8,
        borderWidth: 1.5,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        gap: 6,
    },
    addTypeBtnActive: {
        borderColor: theme.buttonBg,
        backgroundColor: changeOpacity(theme.buttonBg, 0.06),
    },
    addTypeLabel: {
        ...typography('Body', 75, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.64),
    },
    addTypeLabelActive: {
        color: theme.buttonBg,
    },
    formLabel: {
        ...typography('Body', 75, 'SemiBold'),
        color: theme.centerChannelColor,
        marginBottom: 6,
    },
    formInput: {
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        ...typography('Body', 100, 'Regular'),
        color: theme.centerChannelColor,
        marginBottom: 14,
    },
    formTextArea: {
        minHeight: 120,
        textAlignVertical: 'top',
    },
    formSubmit: {
        alignItems: 'center',
        paddingVertical: 14,
        borderRadius: 10,
        backgroundColor: theme.buttonBg,
        marginTop: 4,
    },
    formSubmitDisabled: {
        opacity: 0.5,
    },
    formSubmitText: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.buttonColor,
    },

    // Ask AI modal
    askInput: {
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        ...typography('Body', 100, 'Regular'),
        color: theme.centerChannelColor,
        marginBottom: 12,
    },
    askSubmit: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        borderRadius: 10,
        backgroundColor: theme.buttonBg,
        gap: 8,
        marginBottom: 16,
    },
    askSubmitDisabled: {
        opacity: 0.5,
    },
    askSubmitText: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.buttonColor,
    },
    askAnswerBox: {
        padding: 14,
        borderRadius: 10,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        marginBottom: 12,
    },
    askAnswerLabel: {
        ...typography('Body', 50, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.48),
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 6,
    },
    askAnswerText: {
        ...typography('Body', 100, 'Regular'),
        color: theme.centerChannelColor,
        lineHeight: 22,
    },
    askSourceItem: {
        paddingVertical: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    askSourceTitle: {
        ...typography('Body', 75, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    askSourceSnippet: {
        ...typography('Body', 50, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginTop: 2,
    },
    askSourceScore: {
        ...typography('Body', 25, 'SemiBold'),
        color: theme.onlineIndicator,
        marginTop: 2,
    },
}));

// ---- Main Component ----

const KnowledgeBaseScreen = () => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const navigation = useNavigation();
    const style = getStyleSheet(theme);

    const [teamId, setTeamId] = useState('');
    const [loading, setLoading] = useState(true);
    const [documents, setDocuments] = useState<KBDoc[]>([]);
    const [searchResults, setSearchResults] = useState<KBSearchResult[] | null>(null);
    const [activeCategory, setActiveCategory] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Detail modal
    const [detailDoc, setDetailDoc] = useState<KBDoc | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);

    // Add modal
    const [showAddModal, setShowAddModal] = useState(false);
    const [addType, setAddType] = useState<AddDocType>('text');
    const [addTitle, setAddTitle] = useState('');
    const [addContent, setAddContent] = useState('');
    const [addUrl, setAddUrl] = useState('');
    const [addLoading, setAddLoading] = useState(false);

    // Ask AI modal
    const [showAskModal, setShowAskModal] = useState(false);
    const [askQuery, setAskQuery] = useState('');
    const [askLoading, setAskLoading] = useState(false);
    const [askAnswer, setAskAnswer] = useState('');
    const [askSources, setAskSources] = useState<KBAskSource[]>([]);

    // Init: load teamId
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

    // Load documents when teamId or category changes
    const loadDocuments = useCallback(async () => {
        if (!teamId) return;
        setLoading(true);
        setSearchResults(null);
        try {
            const resp = await listKBDocs(serverUrl, teamId, {category: activeCategory, limit: 100});
            const docs = resp?.data?.documents || [];
            setDocuments(docs);
        } catch {
            setDocuments([]);
        } finally {
            setLoading(false);
        }
    }, [serverUrl, teamId, activeCategory]);

    useEffect(() => {
        loadDocuments();
    }, [loadDocuments]);

    // Debounced search
    const performSearch = useCallback(async (query: string) => {
        if (!teamId || !query.trim()) {
            setSearchResults(null);
            return;
        }
        try {
            const resp = await searchKBDocs(serverUrl, teamId, query.trim(), {category: activeCategory});
            const results = resp?.data?.results || [];
            setSearchResults(results);
        } catch {
            setSearchResults([]);
        }
    }, [serverUrl, teamId, activeCategory]);

    const onSearchChange = useCallback((text: string) => {
        setSearchQuery(text);
        if (searchTimerRef.current) {
            clearTimeout(searchTimerRef.current);
        }
        if (!text.trim()) {
            setSearchResults(null);
            return;
        }
        searchTimerRef.current = setTimeout(() => {
            performSearch(text);
        }, 400);
    }, [performSearch]);

    const clearSearch = useCallback(() => {
        setSearchQuery('');
        setSearchResults(null);
        if (searchTimerRef.current) {
            clearTimeout(searchTimerRef.current);
        }
    }, []);

    // View document detail
    const openDetail = useCallback(async (docId: string) => {
        setDetailLoading(true);
        setDetailDoc({docId, title: '...', content: '', category: '', tags: [], createdAt: '', updatedAt: ''});
        try {
            const resp = await getKBDoc(serverUrl, teamId, docId);
            setDetailDoc(resp?.data || null);
        } catch {
            setDetailDoc(null);
            Alert.alert(
                intl.formatMessage({id: 'workbench.kb.error', defaultMessage: 'Error'}),
                intl.formatMessage({id: 'workbench.kb.detail_error', defaultMessage: 'Failed to load document.'}),
            );
        } finally {
            setDetailLoading(false);
        }
    }, [serverUrl, teamId, intl]);

    const closeDetail = useCallback(() => {
        setDetailDoc(null);
    }, []);

    // Delete document
    const handleDelete = useCallback((docId: string) => {
        Alert.alert(
            intl.formatMessage({id: 'workbench.kb.delete_title', defaultMessage: 'Delete Document'}),
            intl.formatMessage({id: 'workbench.kb.delete_confirm', defaultMessage: 'Are you sure you want to delete this document?'}),
            [
                {text: intl.formatMessage({id: 'mobile.post.cancel', defaultMessage: 'Cancel'}), style: 'cancel'},
                {
                    text: intl.formatMessage({id: 'mobile.post.delete', defaultMessage: 'Delete'}),
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await deleteKBDoc(serverUrl, teamId, docId);
                            setDetailDoc(null);
                            loadDocuments();
                        } catch {
                            Alert.alert(
                                intl.formatMessage({id: 'workbench.kb.error', defaultMessage: 'Error'}),
                                intl.formatMessage({id: 'workbench.kb.delete_error', defaultMessage: 'Failed to delete document.'}),
                            );
                        }
                    },
                },
            ],
        );
    }, [serverUrl, teamId, intl, loadDocuments]);

    // Add document
    const openAddModal = useCallback(() => {
        setAddType('text');
        setAddTitle('');
        setAddContent('');
        setAddUrl('');
        setShowAddModal(true);
    }, []);

    const closeAddModal = useCallback(() => {
        setShowAddModal(false);
    }, []);

    const handleAddSubmit = useCallback(async () => {
        if (!addTitle.trim()) return;
        if (addType === 'text' && !addContent.trim()) return;
        if (addType === 'url' && !addUrl.trim()) return;

        setAddLoading(true);
        try {
            if (addType === 'text') {
                await createKBDocText(serverUrl, teamId, addTitle.trim(), addContent.trim());
            } else {
                await createKBDocURL(serverUrl, teamId, addTitle.trim(), addUrl.trim());
            }
            setShowAddModal(false);
            loadDocuments();
        } catch {
            Alert.alert(
                intl.formatMessage({id: 'workbench.kb.error', defaultMessage: 'Error'}),
                intl.formatMessage({id: 'workbench.kb.add_error', defaultMessage: 'Failed to add document.'}),
            );
        } finally {
            setAddLoading(false);
        }
    }, [serverUrl, teamId, addType, addTitle, addContent, addUrl, intl, loadDocuments]);

    // Ask AI
    const openAskModal = useCallback(() => {
        setAskQuery('');
        setAskAnswer('');
        setAskSources([]);
        setShowAskModal(true);
    }, []);

    const closeAskModal = useCallback(() => {
        setShowAskModal(false);
    }, []);

    const handleAskSubmit = useCallback(async () => {
        if (!askQuery.trim()) return;
        setAskLoading(true);
        setAskAnswer('');
        setAskSources([]);
        try {
            const resp = await askKB(serverUrl, teamId, askQuery.trim());
            setAskAnswer(resp?.data?.answer || '');
            setAskSources(resp?.data?.sources || []);
        } catch {
            setAskAnswer(intl.formatMessage({id: 'workbench.kb.ask_error', defaultMessage: 'Failed to get an answer. Please try again.'}));
        } finally {
            setAskLoading(false);
        }
    }, [serverUrl, teamId, askQuery, intl]);

    // ---- Render helpers ----

    const renderCategoryChips = useMemo(() => (
        <View style={style.chipRow}>
            {CATEGORIES.map((cat) => {
                const isActive = activeCategory === cat.key;
                return (
                    <TouchableOpacity
                        key={cat.key}
                        style={[style.chip, isActive && style.chipActive]}
                        onPress={() => setActiveCategory(cat.key)}
                    >
                        <Text style={[style.chipText, isActive && style.chipTextActive]}>
                            {intl.formatMessage({id: cat.labelId, defaultMessage: cat.defaultMessage})}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    ), [activeCategory, style, intl]);

    const renderSearchBar = useMemo(() => (
        <View style={style.searchBar}>
            <CompassIcon name='magnify' size={18} color={changeOpacity(theme.centerChannelColor, 0.48)}/>
            <TextInput
                style={style.searchInput}
                placeholder={intl.formatMessage({id: 'workbench.kb.search_placeholder', defaultMessage: 'Search documents...'})}
                placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.4)}
                value={searchQuery}
                onChangeText={onSearchChange}
                returnKeyType='search'
                autoCapitalize='none'
                autoCorrect={false}
                onSubmitEditing={() => performSearch(searchQuery)}
            />
            {searchQuery.length > 0 && (
                <TouchableOpacity style={style.searchClear} onPress={clearSearch}>
                    <CompassIcon name='close-circle' size={18} color={changeOpacity(theme.centerChannelColor, 0.4)}/>
                </TouchableOpacity>
            )}
        </View>
    ), [style, theme, searchQuery, onSearchChange, clearSearch, performSearch, intl]);

    // Render a single document card
    const renderItemCard = useCallback((item: DisplayItem) => (
        <TouchableOpacity
            style={style.docCard}
            onPress={() => openDetail(item.docId)}
            activeOpacity={0.7}
        >
            <View style={style.docHeader}>
                <CompassIcon
                    name={categoryIcon(item.category)}
                    size={20}
                    color={theme.buttonBg}
                />
                <Text style={style.docTitle} numberOfLines={2}>{item.title}</Text>
            </View>
            <View style={style.docMeta}>
                <Text style={style.docCategory}>{item.category || 'unknown'}</Text>
                {item.createdAt ? <Text style={style.docDate}>{formatDate(item.createdAt)}</Text> : null}
                {item.score !== undefined && (
                    <Text style={style.docScore}>{(item.score * 100).toFixed(0)}%</Text>
                )}
            </View>
            {item.tags && item.tags.length > 0 && (
                <View style={style.docTags}>
                    {item.tags.map((tag, i) => (
                        <View key={`${tag}-${i}`} style={style.tagChip}>
                            <Text style={style.tagText}>{tag}</Text>
                        </View>
                    ))}
                </View>
            )}
            {item.snippet ? (
                <Text style={style.docSnippet} numberOfLines={3}>{item.snippet}</Text>
            ) : null}
        </TouchableOpacity>
    ), [style, theme, openDetail]);

    const renderFlatListItem = useCallback(({item}: {item: DisplayItem}) => renderItemCard(item), [renderItemCard]);

    const keyExtractor = useCallback((item: DisplayItem) => item.docId, []);

    const renderEmpty = useCallback(() => {
        if (loading) return null;
        return (
            <View style={style.emptyContainer}>
                <CompassIcon name='book-open-outline' size={48} color={changeOpacity(theme.centerChannelColor, 0.24)}/>
                <Text style={style.emptyText}>
                    {searchResults !== null
                        ? intl.formatMessage({id: 'workbench.kb.no_search_results', defaultMessage: 'No matching documents found.'})
                        : intl.formatMessage({id: 'workbench.kb.no_documents', defaultMessage: 'No documents yet.'})
                    }
                </Text>
            </View>
        );
    }, [loading, searchResults, style, theme, intl]);

    // ---- Loading state ----

    if (!teamId) {
        return (
            <SafeAreaView edges={['top', 'bottom']} style={style.container}>
                <View style={style.header}>
                    <TouchableOpacity style={style.backBtn} onPress={() => navigation.goBack()}>
                        <CompassIcon name='arrow-left' size={20} color={theme.sidebarText}/>
                    </TouchableOpacity>
                    <Text style={style.headerTitle}>
                        {intl.formatMessage({id: 'workbench.kb.title', defaultMessage: 'Knowledge Base'})}
                    </Text>
                </View>
                <View style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}>
                    <ActivityIndicator size='large' color={theme.centerChannelColor}/>
                </View>
            </SafeAreaView>
        );
    }

    // Determine which list to show
    const isSearchMode = searchResults !== null;

    // Unified display list for FlatList
    const displayItems = useMemo<DisplayItem[]>(() => {
        if (isSearchMode) {
            return (searchResults || []).map((r) => ({
                docId: r.docId,
                title: r.title,
                category: r.category,
                tags: [],
                createdAt: '',
                snippet: r.snippet,
                score: r.score,
            }));
        }
        return documents.map((d) => ({
            docId: d.docId,
            title: d.title,
            category: d.category,
            tags: d.tags,
            createdAt: d.createdAt,
        }));
    }, [isSearchMode, searchResults, documents]);

    // ---- Main render ----

    return (
        <SafeAreaView edges={['top', 'bottom']} style={style.container}>
            {/* Header */}
            <View style={style.header}>
                <TouchableOpacity style={style.backBtn} onPress={() => navigation.goBack()}>
                    <CompassIcon name='arrow-left' size={20} color={theme.sidebarText}/>
                </TouchableOpacity>
                <Text style={style.headerTitle}>
                    {intl.formatMessage({id: 'workbench.kb.title', defaultMessage: 'Knowledge Base'})}
                </Text>
                <TouchableOpacity style={style.headerAction} onPress={openAddModal}>
                    <CompassIcon name='plus' size={22} color={theme.sidebarText}/>
                </TouchableOpacity>
            </View>

            {/* Category chips */}
            {renderCategoryChips}

            {/* Search bar */}
            {renderSearchBar}

            {/* Document list */}
            <View style={{flex: 1}}>
                {loading ? (
                    <View style={style.emptyContainer}>
                        <ActivityIndicator size='large' color={theme.centerChannelColor}/>
                    </View>
                ) : (
                    <FlatList
                        data={displayItems}
                        renderItem={renderFlatListItem}
                        keyExtractor={keyExtractor}
                        contentContainerStyle={style.listContent}
                        ListEmptyComponent={renderEmpty}
                        refreshing={false}
                        onRefresh={loadDocuments}
                    />
                )}
            </View>

            {/* Bottom action bar */}
            <View style={style.bottomBar}>
                <TouchableOpacity style={style.addBtn} onPress={openAddModal}>
                    <CompassIcon name='plus' size={18} color={theme.buttonBg}/>
                    <Text style={style.addBtnText}>
                        {intl.formatMessage({id: 'workbench.kb.add_doc', defaultMessage: 'Add'})}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity style={style.askBtn} onPress={openAskModal}>
                    <CompassIcon name='robot' size={18} color={theme.buttonColor}/>
                    <Text style={style.askBtnText}>
                        {intl.formatMessage({id: 'workbench.kb.ask_ai', defaultMessage: 'Ask AI'})}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* ---- Detail Modal ---- */}
            <Modal
                visible={detailDoc !== null}
                animationType='slide'
                presentationStyle='pageSheet'
                onRequestClose={closeDetail}
            >
                <SafeAreaView edges={['top', 'bottom']} style={style.container}>
                    <View style={style.modalHeader}>
                        <Text style={style.modalTitle} numberOfLines={1}>
                            {detailDoc?.title || ''}
                        </Text>
                        <TouchableOpacity style={style.modalClose} onPress={closeDetail}>
                            <CompassIcon name='close' size={24} color={theme.centerChannelColor}/>
                        </TouchableOpacity>
                    </View>
                    {detailLoading ? (
                        <View style={style.emptyContainer}>
                            <ActivityIndicator size='large' color={theme.centerChannelColor}/>
                        </View>
                    ) : (
                        <ScrollView style={style.modalBody} showsVerticalScrollIndicator={true}>
                            {detailDoc && (
                                <>
                                    <Text style={style.detailCategory}>{detailDoc.category}</Text>
                                    <Text style={style.detailDate}>{formatDate(detailDoc.createdAt)}</Text>
                                    {detailDoc.tags && detailDoc.tags.length > 0 && (
                                        <View style={{...style.docTags, marginBottom: 12}}>
                                            {detailDoc.tags.map((tag, i) => (
                                                <View key={`${tag}-${i}`} style={style.tagChip}>
                                                    <Text style={style.tagText}>{tag}</Text>
                                                </View>
                                            ))}
                                        </View>
                                    )}
                                    {detailDoc.sourceUrl ? (
                                        <Text style={style.detailSourceUrl}>{detailDoc.sourceUrl}</Text>
                                    ) : null}
                                    <View style={{marginTop: 12}}>
                                        <Text style={style.detailContent} selectable={true}>
                                            {detailDoc.content || intl.formatMessage({id: 'workbench.kb.no_content', defaultMessage: 'No content available.'})}
                                        </Text>
                                    </View>
                                    <TouchableOpacity
                                        style={style.detailDeleteBtn}
                                        onPress={() => handleDelete(detailDoc.docId)}
                                    >
                                        <CompassIcon name='trash-can-outline' size={18} color={theme.errorTextColor}/>
                                        <Text style={style.detailDeleteText}>
                                            {intl.formatMessage({id: 'workbench.kb.delete', defaultMessage: 'Delete Document'})}
                                        </Text>
                                    </TouchableOpacity>
                                </>
                            )}
                        </ScrollView>
                    )}
                </SafeAreaView>
            </Modal>

            {/* ---- Add Document Modal ---- */}
            <Modal
                visible={showAddModal}
                animationType='slide'
                presentationStyle='pageSheet'
                onRequestClose={closeAddModal}
            >
                <SafeAreaView edges={['top', 'bottom']} style={style.container}>
                    <View style={style.modalHeader}>
                        <Text style={style.modalTitle}>
                            {intl.formatMessage({id: 'workbench.kb.add_document', defaultMessage: 'Add Document'})}
                        </Text>
                        <TouchableOpacity style={style.modalClose} onPress={closeAddModal}>
                            <CompassIcon name='close' size={24} color={theme.centerChannelColor}/>
                        </TouchableOpacity>
                    </View>
                    <ScrollView style={style.modalBody} keyboardShouldPersistTaps='handled'>
                        {/* Type selector */}
                        <View style={style.addTypeRow}>
                            <TouchableOpacity
                                style={[style.addTypeBtn, addType === 'text' && style.addTypeBtnActive]}
                                onPress={() => setAddType('text')}
                            >
                                <CompassIcon name='text-box-outline' size={22} color={addType === 'text' ? theme.buttonBg : changeOpacity(theme.centerChannelColor, 0.48)}/>
                                <Text style={[style.addTypeLabel, addType === 'text' && style.addTypeLabelActive]}>
                                    {intl.formatMessage({id: 'workbench.kb.type_text', defaultMessage: 'Text'})}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[style.addTypeBtn, addType === 'url' && style.addTypeBtnActive]}
                                onPress={() => setAddType('url')}
                            >
                                <CompassIcon name='link-variant' size={22} color={addType === 'url' ? theme.buttonBg : changeOpacity(theme.centerChannelColor, 0.48)}/>
                                <Text style={[style.addTypeLabel, addType === 'url' && style.addTypeLabelActive]}>
                                    {intl.formatMessage({id: 'workbench.kb.type_url', defaultMessage: 'URL'})}
                                </Text>
                            </TouchableOpacity>
                        </View>

                        {/* Title */}
                        <Text style={style.formLabel}>
                            {intl.formatMessage({id: 'workbench.kb.form_title', defaultMessage: 'Title'})}
                        </Text>
                        <TextInput
                            style={style.formInput}
                            placeholder={intl.formatMessage({id: 'workbench.kb.title_placeholder', defaultMessage: 'Enter document title'})}
                            placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.4)}
                            value={addTitle}
                            onChangeText={setAddTitle}
                            autoCapitalize='sentences'
                        />

                        {/* Content or URL */}
                        {addType === 'text' ? (
                            <>
                                <Text style={style.formLabel}>
                                    {intl.formatMessage({id: 'workbench.kb.form_content', defaultMessage: 'Content (Markdown)'})}
                                </Text>
                                <TextInput
                                    style={[style.formInput, style.formTextArea]}
                                    placeholder={intl.formatMessage({id: 'workbench.kb.content_placeholder', defaultMessage: 'Enter document content...'})}
                                    placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.4)}
                                    value={addContent}
                                    onChangeText={setAddContent}
                                    multiline={true}
                                    textAlignVertical='top'
                                    autoCapitalize='sentences'
                                />
                            </>
                        ) : (
                            <>
                                <Text style={style.formLabel}>
                                    {intl.formatMessage({id: 'workbench.kb.form_url', defaultMessage: 'Source URL'})}
                                </Text>
                                <TextInput
                                    style={style.formInput}
                                    placeholder={intl.formatMessage({id: 'workbench.kb.url_placeholder', defaultMessage: 'https://example.com/article'})}
                                    placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.4)}
                                    value={addUrl}
                                    onChangeText={setAddUrl}
                                    keyboardType='url'
                                    autoCapitalize='none'
                                    autoCorrect={false}
                                />
                            </>
                        )}

                        {/* Submit */}
                        <TouchableOpacity
                            style={[
                                style.formSubmit,
                                (!addTitle.trim() || addLoading) && style.formSubmitDisabled,
                            ]}
                            onPress={handleAddSubmit}
                            disabled={!addTitle.trim() || addLoading}
                        >
                            {addLoading ? (
                                <ActivityIndicator size='small' color={theme.buttonColor}/>
                            ) : (
                                <Text style={style.formSubmitText}>
                                    {intl.formatMessage({id: 'workbench.kb.add_submit', defaultMessage: 'Add Document'})}
                                </Text>
                            )}
                        </TouchableOpacity>
                    </ScrollView>
                </SafeAreaView>
            </Modal>

            {/* ---- Ask AI Modal ---- */}
            <Modal
                visible={showAskModal}
                animationType='slide'
                presentationStyle='pageSheet'
                onRequestClose={closeAskModal}
            >
                <SafeAreaView edges={['top', 'bottom']} style={style.container}>
                    <View style={style.modalHeader}>
                        <Text style={style.modalTitle}>
                            {intl.formatMessage({id: 'workbench.kb.ask_title', defaultMessage: 'Ask AI'})}
                        </Text>
                        <TouchableOpacity style={style.modalClose} onPress={closeAskModal}>
                            <CompassIcon name='close' size={24} color={theme.centerChannelColor}/>
                        </TouchableOpacity>
                    </View>
                    <ScrollView style={style.modalBody} keyboardShouldPersistTaps='handled'>
                        <TextInput
                            style={style.askInput}
                            placeholder={intl.formatMessage({id: 'workbench.kb.ask_placeholder', defaultMessage: 'Ask a question about your knowledge base...'})}
                            placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.4)}
                            value={askQuery}
                            onChangeText={setAskQuery}
                            multiline={true}
                            returnKeyType='send'
                            autoCapitalize='sentences'
                            onSubmitEditing={handleAskSubmit}
                        />
                        <TouchableOpacity
                            style={[style.askSubmit, (!askQuery.trim() || askLoading) && style.askSubmitDisabled]}
                            onPress={handleAskSubmit}
                            disabled={!askQuery.trim() || askLoading}
                        >
                            {askLoading ? (
                                <ActivityIndicator size='small' color={theme.buttonColor}/>
                            ) : (
                                <>
                                    <CompassIcon name='robot' size={18} color={theme.buttonColor}/>
                                    <Text style={style.askSubmitText}>
                                        {intl.formatMessage({id: 'workbench.kb.ask_submit', defaultMessage: 'Ask'})}
                                    </Text>
                                </>
                            )}
                        </TouchableOpacity>

                        {/* Answer display */}
                        {askAnswer.length > 0 && (
                            <View style={style.askAnswerBox}>
                                <Text style={style.askAnswerLabel}>
                                    {intl.formatMessage({id: 'workbench.kb.answer_label', defaultMessage: 'Answer'})}
                                </Text>
                                <Text style={style.askAnswerText} selectable={true}>{askAnswer}</Text>
                            </View>
                        )}

                        {/* Sources */}
                        {askSources.length > 0 && (
                            <View>
                                <Text style={style.askAnswerLabel}>
                                    {intl.formatMessage({id: 'workbench.kb.sources_label', defaultMessage: 'Sources'})}
                                </Text>
                                {askSources.map((source, i) => (
                                    <View key={`source-${i}`} style={style.askSourceItem}>
                                        <Text style={style.askSourceTitle}>{source.title}</Text>
                                        {source.snippet ? (
                                            <Text style={style.askSourceSnippet} numberOfLines={2}>{source.snippet}</Text>
                                        ) : null}
                                        <Text style={style.askSourceScore}>
                                            {intl.formatMessage(
                                                {id: 'workbench.kb.source_score', defaultMessage: 'Relevance: {score}%'},
                                                {score: (source.score * 100).toFixed(0)},
                                            )}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        )}
                    </ScrollView>
                </SafeAreaView>
            </Modal>
        </SafeAreaView>
    );
};

export default KnowledgeBaseScreen;
