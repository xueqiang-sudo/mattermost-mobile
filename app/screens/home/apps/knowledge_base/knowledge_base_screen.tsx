// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

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
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';

import {useNavigation} from '@react-navigation/native';
import CompassIcon from '@components/compass_icon';
import {Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import DatabaseManager from '@database/manager';
import {downloadFile} from '@actions/remote/file';
import {getCurrentTeamId} from '@queries/servers/system';
import {goToScreen} from '@screens/navigation';
import {isImage, isVideo, isAudio, getLocalFilePathFromFile} from '@utils/file';
import {showMediaViewer} from '@utils/gallery';
import {openUnifiedFileViewer} from '@utils/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';
import {debugLog} from '@store/debug_log';

import {
    listKBDocs,
    searchKBDocs,
    getKBDoc,
    createKBDocText,
    createKBDocURL,
    createKBDocFile,
    updateKBDoc,
    deleteKBDoc,
    askKB,
    getKBDownloadUrl,
    getKBFileInfo,
    KB_SUPPORTED_LABEL,
    type KBDoc,
    type KBSearchResult,
    type KBAskSource,
} from '../workbench_api';

// ---- Constants ----

const CATEGORIES = [
    {key: 'file', labelId: 'workbench.kb.filter_file', defaultMessage: 'File'},
    {key: 'text', labelId: 'workbench.kb.filter_text', defaultMessage: 'Text'},
    {key: 'url', labelId: 'workbench.kb.filter_url', defaultMessage: 'URL'},
    {key: 'ask', labelId: 'workbench.kb.filter_ask', defaultMessage: '提问'},
];

type AddDocType = 'text' | 'url' | 'file';

/** Unified display item for both document list and search results. */
type DisplayItem = {
    docId: string;
    title: string;
    category: string;
    tags: string[];
    createdAt: string;
    snippet?: string;
    score?: number;
    fileName?: string;
    fileSize?: number;
};

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

function getExtension(fileName?: string): string {
    if (!fileName) return '';
    const idx = fileName.lastIndexOf('.');
    if (idx < 0 || idx === fileName.length - 1) return '';
    return fileName.slice(idx + 1).toLowerCase();
}

const KB_ICON_BLUE = '#338AFF';
const KB_ICON_RED = '#ED522A';
const KB_ICON_GREEN = '#1CA660';
const KB_ICON_GRAY = '#999999';

function categoryIconInfo(category: string, ext?: string): {name: string; color: string} {
    if (category === 'file' && ext) {
        const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp', 'ico', 'tiff'];
        const videoExts = ['mp4', 'avi', 'mov', 'mkv', 'webm', 'flv', 'wmv'];
        const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma'];
        const pdfExts = ['pdf'];
        const sheetExts = ['xls', 'xlsx', 'csv', 'ods', 'numbers'];
        const presentationExts = ['ppt', 'pptx', 'key', 'odp'];
        const archiveExts = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'tgz', 'dmg', 'iso'];
        const wordExts = ['doc', 'docx', 'odt', 'rtf', 'pages'];
        const textExts = ['txt', 'md', 'log', 'epub'];
        const codeExts = [
            'js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'hpp',
            'cs', 'go', 'rs', 'rb', 'php', 'swift', 'kt', 'scala', 'lua',
            'html', 'htm', 'css', 'scss', 'sass', 'less',
            'json', 'xml', 'yaml', 'yml', 'toml', 'sql',
        ];

        if (imageExts.includes(ext)) return {name: 'file-image-outline-large', color: KB_ICON_BLUE};
        if (videoExts.includes(ext)) return {name: 'file-video-outline-large', color: KB_ICON_BLUE};
        if (audioExts.includes(ext)) return {name: 'file-audio-outline-large', color: KB_ICON_BLUE};
        if (pdfExts.includes(ext)) return {name: 'file-pdf-outline-large', color: KB_ICON_RED};
        if (wordExts.includes(ext)) return {name: 'file-word-outline-large', color: KB_ICON_BLUE};
        if (textExts.includes(ext)) return {name: 'file-text-outline-large', color: KB_ICON_GRAY};
        if (sheetExts.includes(ext)) return {name: 'file-excel-outline-large', color: KB_ICON_GREEN};
        if (presentationExts.includes(ext)) return {name: 'file-powerpoint-outline-large', color: KB_ICON_RED};
        if (codeExts.includes(ext)) return {name: 'file-code-outline-large', color: KB_ICON_BLUE};
        if (archiveExts.includes(ext)) return {name: 'file-zip-outline-large', color: KB_ICON_BLUE};
        return {name: 'file-generic-outline-large', color: KB_ICON_BLUE};
    }
    if (category === 'url') return {name: 'link-variant', color: KB_ICON_BLUE};
    return {name: 'file-text-outline-large', color: KB_ICON_GRAY};
}

function formatFileSize(bytes: number): string {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
    docExtBadge: {
        paddingHorizontal: 6,
        paddingVertical: 1,
        borderRadius: 4,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    docExtText: {
        ...typography('Body', 25, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.6),
        textTransform: 'uppercase',
    },
    docSize: {
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

    // File picker
    filePickerBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        gap: 8,
        marginBottom: 8,
    },
    filePickerText: {
        ...typography('Body', 100, 'Regular'),
        color: theme.centerChannelColor,
        flex: 1,
    },
    fileHint: {
        ...typography('Body', 25, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.48),
        marginBottom: 14,
    },

    // Detail actions
    detailEditBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        marginTop: 12,
        borderRadius: 8,
        backgroundColor: changeOpacity(theme.buttonBg, 0.1),
        gap: 6,
    },
    detailEditText: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.buttonBg,
    },
    detailDownloadBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        marginTop: 8,
        borderRadius: 8,
        backgroundColor: changeOpacity(theme.buttonBg, 0.1),
        gap: 6,
    },
    detailDownloadText: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.buttonBg,
    },
}));

// ---- Main Component ----

type Props = {
    kbWrite?: boolean;
};

const KnowledgeBaseScreen = ({kbWrite = false}: Props) => {
    debugLog('[KB] Component rendering, kbWrite:', kbWrite);
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const navigation = useNavigation();
    const style = getStyleSheet(theme);
    const insets = useSafeAreaInsets();

    const [teamId, setTeamId] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [documents, setDocuments] = useState<KBDoc[]>([]);
    const [searchResults, setSearchResults] = useState<KBSearchResult[] | null>(null);
    const [activeCategory, setActiveCategory] = useState('file');
    const [searchQuery, setSearchQuery] = useState('');
    const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Ask AI modal (保留 Modal 模式)
    const [showAskModal, setShowAskModal] = useState(false);
    const [askQuery, setAskQuery] = useState('');
    const [askLoading, setAskLoading] = useState(false);
    const [askAnswer, setAskAnswer] = useState('');
    const [askSources, setAskSources] = useState<KBAskSource[]>([]);

    // Retry key - increment to trigger re-init
    const [initRetryKey, setInitRetryKey] = useState(0);

    // Init: load teamId
    useEffect(() => {
        debugLog('[KB] Init useEffect running, serverUrl:', serverUrl, 'retryKey:', initRetryKey);
        let mounted = true;
        const init = async () => {
            try {
                if (!serverUrl) {
                    throw new Error('Server URL is not available');
                }

                debugLog('[KB] Getting database and teamId...');
                const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
                const tid = await getCurrentTeamId(database);
                debugLog('[KB] Got teamId:', tid);

                if (!tid) {
                    throw new Error('Team ID not found');
                }

                if (mounted) {
                    debugLog('[KB] Setting teamId state');
                    setTeamId(tid);
                    setError(null);
                }
            } catch (err) {
                debugLog('[KB] Init error:', err);
                const message = err instanceof Error ? err.message : 'Failed to initialize';
                if (mounted) {
                    setError(message);
                    setLoading(false);
                }
            }
        };
        init();
        return () => {
            mounted = false;
        };
    }, [serverUrl, initRetryKey]);

    // Load documents when teamId or category changes
    const loadDocuments = useCallback(async () => {
        debugLog('[KB] loadDocuments called, teamId:', teamId, 'serverUrl:', serverUrl);
        if (!teamId || !serverUrl) {
            debugLog('[KB] Missing teamId or serverUrl, setting loading false');
            setLoading(false);
            return;
        }
        debugLog('[KB] Setting loading true, fetching documents...');
        setLoading(true);
        setSearchResults(null);
        setError(null);
        try {
            const resp = await listKBDocs(serverUrl, teamId, {category: activeCategory, limit: 100});
            debugLog('[KB] Got response:', resp);
            const docs = resp?.data?.documents || resp?.docs || resp?.documents || [];
            debugLog('[KB] Parsed docs:', docs.length, 'documents');
            setDocuments(docs);
        } catch (err) {
            debugLog('[KB] loadDocuments error:', err);
            const message = err instanceof Error ? err.message : 'Failed to load documents';
            setError(message);
            setDocuments([]);
        } finally {
            debugLog('[KB] Setting loading false');
            setLoading(false);
        }
    }, [serverUrl, teamId, activeCategory]);

    useEffect(() => {
        // Only load documents if teamId is set
        if (teamId) {
            loadDocuments();
        }
    }, [teamId, loadDocuments]);

    // Debounced search
    const performSearch = useCallback(async (query: string) => {
        if (!teamId || !query.trim()) {
            setSearchResults(null);
            return;
        }
        try {
            const resp = await searchKBDocs(serverUrl, teamId, query.trim(), {category: activeCategory});
            const results = resp?.data?.results || resp?.results || [];
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

    // View document detail (Navigation mode)
    const openDetail = useCallback((docId: string, title?: string) => {
        const screenTitle = title || intl.formatMessage({
            id: 'workbench.kb.detail_title',
            defaultMessage: 'Document Detail',
        });
        goToScreen(Screens.KB_DETAIL, screenTitle, {
            docId,
            docTitle: title,
            onDocUpdated: () => {
                // Refresh list after returning from detail
                if (searchQuery.trim()) {
                    performSearch(searchQuery);
                } else {
                    loadDocuments();
                }
            },
        });
    }, [intl, searchQuery, performSearch, loadDocuments]);

    // Preview file directly (like webapp)
    const openFilePreview = useCallback(async (item: DisplayItem) => {
        try {
            const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
            const tid = await getCurrentTeamId(database);
            if (!tid) throw new Error('team_id missing');

            const url = getKBDownloadUrl(serverUrl, item.docId, tid);
            if (!url) throw new Error('No download URL');

            const ext = getExtension(item.fileName);

            // Office documents need a real Mattermost file ID for the in-app
            // PDF conversion pipeline. Bridge KB docId → mm_file_id first.
            const officeExtensions = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp'];
            let mmFileId = '';
            if (officeExtensions.includes(ext.toLowerCase())) {
                try {
                    const info = await getKBFileInfo(serverUrl, item.docId, tid);
                    mmFileId = info.mm_file_id || '';
                } catch (err) {
                    debugLog('[KB] getKBFileInfo failed', err);
                }
            }

            const fileInfo: FileInfo = {
                id: mmFileId || item.docId,
                user_id: '',
                create_at: 0,
                name: item.fileName || item.title,
                extension: ext,
                size: item.fileSize || 0,
                mime_type: '',
                uri: url,
                localPath: '',  // Will be set after download
            } as FileInfo;

            // For media files, can use remote URL directly
            if (isImage(fileInfo) || isVideo(fileInfo) || isAudio(fileInfo)) {
                fileInfo.localPath = url;
                showMediaViewer(fileInfo, serverUrl);
            } else {
                // For other files, download first then open
                // Use the mm_file_id when available so the unified viewer's
                // PDF conversion endpoint works; fall back to KB download URL.
                const downloadId = mmFileId || item.docId;
                const localPath = getLocalFilePathFromFile(serverUrl, fileInfo);
                const downloadTask = downloadFile(serverUrl, downloadId, localPath);

                // Show loading indicator (optional)
                Alert.alert(
                    intl.formatMessage({id: 'file.downloading', defaultMessage: 'Downloading...'}),
                    intl.formatMessage({id: 'workbench.kb.downloading_message', defaultMessage: 'Please wait while the file is being downloaded.'}),
                );

                await downloadTask;

                // Update fileInfo with local path
                fileInfo.localPath = localPath;
                fileInfo.uri = localPath;

                openUnifiedFileViewer(fileInfo, theme);
            }
        } catch (error) {
            debugLog('[KB] Preview error:', error);
            Alert.alert(
                intl.formatMessage({id: 'workbench.kb.error', defaultMessage: 'Error'}),
                intl.formatMessage({id: 'workbench.kb.preview_error', defaultMessage: 'Unable to open this file.'}),
            );
        }
    }, [serverUrl, theme, intl]);

    // Edit document (Navigation mode)
    const openEditScreen = useCallback((doc: KBDoc) => {
        const title = intl.formatMessage({
            id: 'workbench.kb.edit_title',
            defaultMessage: 'Edit Document',
        });
        goToScreen(Screens.KB_EDIT, title, {
            doc,
            onDocUpdated: () => {
                // Refresh list after returning from edit
                if (searchQuery.trim()) {
                    performSearch(searchQuery);
                } else {
                    loadDocuments();
                }
            },
        });
    }, [intl, searchQuery, performSearch, loadDocuments]);

    // Add document (Navigation mode)
    const openAddScreen = useCallback(() => {
        const title = intl.formatMessage({
            id: 'workbench.kb.add_title',
            defaultMessage: 'Add Document',
        });
        goToScreen(Screens.KB_ADD, title, {
            teamId,
            onDocAdded: () => {
                // Refresh list after returning from add
                if (searchQuery.trim()) {
                    performSearch(searchQuery);
                } else {
                    loadDocuments();
                }
            },
        });
    }, [intl, teamId, searchQuery, performSearch, loadDocuments]);

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
            setAskAnswer(resp?.data?.answer || resp?.answer || '');
            setAskSources(resp?.data?.sources || resp?.sources || []);
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
    const renderItemCard = useCallback((item: DisplayItem) => {
        const ext = getExtension(item.fileName);
        const isFile = item.category === 'file';
        const iconInfo = categoryIconInfo(item.category, ext);

        return (
            <TouchableOpacity
                style={style.docCard}
                onPress={() => isFile ? openFilePreview(item) : openDetail(item.docId, item.title)}
                activeOpacity={0.7}
            >
                <View style={style.docHeader}>
                    <CompassIcon
                        name={iconInfo.name}
                        size={20}
                        color={iconInfo.color}
                    />
                    <Text style={style.docTitle} numberOfLines={2}>{item.title}</Text>
                    {isFile && ext ? (
                        <View style={style.docExtBadge}>
                            <Text style={style.docExtText}>{ext}</Text>
                        </View>
                    ) : null}
                </View>
                <View style={style.docMeta}>
                    {isFile ? (
                        <>
                            <Text style={style.docSize}>
                                {item.fileSize ? formatFileSize(item.fileSize) : '-'}
                            </Text>
                            {item.createdAt ? (
                                <Text style={style.docDate}>· {formatDate(item.createdAt)}</Text>
                            ) : null}
                        </>
                    ) : (
                        <>
                            <Text style={style.docCategory}>
                                {item.category || intl.formatMessage({id: 'workbench.kb.category_unknown', defaultMessage: 'unknown'})}
                            </Text>
                            {item.createdAt ? <Text style={style.docDate}>{formatDate(item.createdAt)}</Text> : null}
                        </>
                    )}
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
        );
    }, [style, theme, openDetail, openFilePreview, intl]);

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

    // Determine which list to show (must be before early returns for hooks rules)
    const isSearchMode = searchResults !== null;

    // Unified display list for FlatList (must be before early returns for hooks rules)
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
            fileName: d.fileName,
            fileSize: d.fileSize,
        }));
    }, [isSearchMode, searchResults, documents]);

    // ---- Loading state ----

    // Show loading only when teamId is not set AND there's no error
    if (!teamId && !error) {
        debugLog('[KB] Rendering loading state (no teamId)');
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

    // Show error state if teamId failed to load
    if (!teamId && error) {
        debugLog('[KB] Rendering error state (no teamId):', error);
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
                <View style={style.emptyContainer}>
                    <CompassIcon name='alert-circle-outline' size={48} color={theme.errorTextColor}/>
                    <Text style={style.emptyText}>{error}</Text>
                    <TouchableOpacity
                        style={{marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, backgroundColor: theme.buttonBg}}
                        onPress={() => {
                            setError(null);
                            setTeamId('');
                            // Increment retry key to trigger re-init
                            setInitRetryKey(prev => prev + 1);
                        }}
                    >
                        <Text style={{color: theme.buttonColor, ...typography('Body', 100, 'SemiBold')}}>
                            {intl.formatMessage({id: 'mobile.retry', defaultMessage: 'Retry'})}
                        </Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    debugLog('[KB] Rendering main content, teamId:', teamId, 'loading:', loading, 'error:', error);

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
                {kbWrite && (
                    <TouchableOpacity style={style.headerAction} onPress={openAddScreen}>
                        <CompassIcon name='plus' size={22} color={theme.sidebarText}/>
                    </TouchableOpacity>
                )}
            </View>

            {/* Category chips */}
            {renderCategoryChips}

            {/* Search bar */}
            {renderSearchBar}

            {/* Document list or Ask AI tab */}
            <View style={{flex: 1}}>
                {activeCategory === 'ask' ? (
                    <ScrollView style={{flex: 1, paddingHorizontal: 16}} keyboardShouldPersistTaps='handled'>
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
                        {askAnswer.length > 0 && (
                            <View style={style.askAnswerBox}>
                                <Text style={style.askAnswerLabel}>
                                    {intl.formatMessage({id: 'workbench.kb.answer_label', defaultMessage: 'Answer'})}
                                </Text>
                                <Text style={style.askAnswerText} selectable={true}>{askAnswer}</Text>
                            </View>
                        )}
                    </ScrollView>
                ) : error ? (
                    <View style={style.emptyContainer}>
                        <CompassIcon name='alert-circle-outline' size={48} color={theme.errorTextColor}/>
                        <Text style={style.emptyText}>{error}</Text>
                        <TouchableOpacity
                            style={{marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, backgroundColor: theme.buttonBg}}
                            onPress={loadDocuments}
                        >
                            <Text style={{color: theme.buttonColor, ...typography('Body', 100, 'SemiBold')}}>
                                {intl.formatMessage({id: 'mobile.retry', defaultMessage: 'Retry'})}
                            </Text>
                        </TouchableOpacity>
                    </View>
                ) : loading ? (
                    <View style={style.emptyContainer}>
                        <ActivityIndicator size='large' color={theme.centerChannelColor}/>
                    </View>
                ) : (
                    <FlatList
                        data={displayItems}
                        renderItem={renderFlatListItem}
                        keyExtractor={keyExtractor}
                        contentContainerStyle={[style.listContent, {paddingBottom: 80 + insets.bottom}]}
                        ListEmptyComponent={renderEmpty}
                        refreshing={false}
                        onRefresh={loadDocuments}
                    />
                )}
            </View>

            {/* Bottom action bar */}
            <View style={[style.bottomBar, {paddingBottom: 10 + insets.bottom}]}>
                {kbWrite && (
                    <TouchableOpacity style={style.addBtn} onPress={openAddScreen}>
                        <CompassIcon name='plus' size={18} color={theme.buttonBg}/>
                        <Text style={style.addBtnText}>
                            {intl.formatMessage({id: 'workbench.kb.add_doc', defaultMessage: 'Add'})}
                        </Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* ---- Ask AI Modal ---- */}
            <Modal
                visible={showAskModal}
                animationType='slide'
                presentationStyle='pageSheet'
                gestureEnabled={false}
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
