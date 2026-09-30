// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useNavigation} from '@react-navigation/native';
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import Markdown from '@components/markdown';
import {Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import DatabaseManager from '@database/manager';
import NetworkManager from '@managers/network_manager';
import {getCurrentTeamId, getCurrentUserId} from '@queries/servers/system';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import {
    listConversations,
    fetchFactQuery,
    graduateMemory,
    type ConversationChannel,
    type FactQueryResult,
} from '../workbench_api';

// ---- Types ----

type Department = {
    id: number;
    team_id: string;
    name: string;
    parent_id: number | null;
    delete_at?: number;
};

type ViewMode = 'setup' | 'dashboard';

type RawMessage = {user: string; text: string; time: string};

type DaySummary = {
    date: string;
    summary: string;
    rawMessages: RawMessage[];
    rawAvailable: boolean;
    rawTruncated: boolean;
    hasData: boolean;
    loading: boolean;
    error: string | null;
};

function pad(n: number): string {
    return String(n).padStart(2, '0');
}

function localDayKey(d: Date): string {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getMonthDays(year: number, month: number): string[] {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return Array.from({length: daysInMonth}, (_, i) =>
        `${year}-${pad(month + 1)}-${pad(i + 1)}`,
    );
}

function getUserDisplayName(u: {first_name?: string; last_name?: string; nickname?: string; username: string}): string {
    if (u.first_name || u.last_name) {
        return `${u.first_name || ''} ${u.last_name || ''}`.trim();
    }
    return u.nickname || u.username;
}

function truncateText(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    return text.substring(0, maxLen) + '...';
}

function detectLocale(intl: ReturnType<typeof useIntl>): string {
    const loc = intl.locale || '';
    if (loc.startsWith('zh-TW') || loc.startsWith('zh-Hant')) return 'zh-TW';
    if (loc.startsWith('zh')) return 'zh';
    return 'en';
}

function getDepartmentDisplayName(dept: Department, intl: ReturnType<typeof useIntl>): string {
    if (dept.name === 'FORCE_TEAM_DEFAULT_DEPARTMENT') {
        return intl.formatMessage({
            id: 'workbench.conversations.default_department',
            defaultMessage: 'Default Department',
        });
    }
    return dept.name;
}

const DEFAULT_DAY_SUMMARY: DaySummary = {
    date: '', summary: '', rawMessages: [], rawAvailable: false,
    rawTruncated: false, hasData: false, loading: false, error: null,
};

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
        padding: 4,
        marginRight: 12,
    },
    headerTitle: {
        ...typography('Heading', 200, 'SemiBold'),
        color: theme.sidebarText,
        flex: 1,
    },
    content: {
        flex: 1,
    },
    // Setup view
    setupContainer: {
        flex: 1,
        padding: 16,
    },
    label: {
        ...typography('Body', 75, 'SemiBold'),
        color: theme.centerChannelColor,
        marginBottom: 8,
        marginTop: 16,
    },
    selectBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.02),
    },
    selectText: {
        ...typography('Body', 100, 'Regular'),
        color: theme.centerChannelColor,
    },
    queryBtn: {
        marginTop: 24,
        paddingVertical: 14,
        borderRadius: 10,
        backgroundColor: theme.buttonBg,
        alignItems: 'center',
    },
    queryBtnDisabled: {
        opacity: 0.5,
    },
    queryBtnText: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.buttonColor,
    },
    // Dashboard view
    dashboardContainer: {
        flex: 1,
    },
    statsBar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.02),
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
        gap: 16,
    },
    statItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    statText: {
        ...typography('Body', 75, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.64),
    },
    // Channel card
    card: {
        marginHorizontal: 12,
        marginTop: 8,
        padding: 14,
        borderRadius: 10,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.03),
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
    },
    cardTitle: {
        ...typography('Heading', 100, 'SemiBold'),
        color: theme.centerChannelColor,
        flex: 1,
        marginLeft: 8,
    },
    cardTime: {
        ...typography('Body', 50, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.48),
    },
    cardMembers: {
        ...typography('Body', 50, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginTop: 2,
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
    // Error state
    errorContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
    },
    errorText: {
        ...typography('Body', 100, 'Regular'),
        color: theme.errorTextColor,
        textAlign: 'center',
        marginTop: 12,
        marginBottom: 16,
    },
    retryBtn: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 8,
        backgroundColor: theme.buttonBg,
    },
    retryBtnText: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.buttonColor,
    },
    // Date picker
    datePicker: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    dateLabel: {
        ...typography('Body', 75, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.64),
        marginRight: 8,
    },
    dateBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 6,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
        gap: 6,
    },
    dateText: {
        ...typography('Body', 75, 'Regular'),
        color: theme.centerChannelColor,
    },
    // Conversation detail
    detailContainer: {
        flex: 1,
    },
    detailHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
        gap: 12,
    },
    detailTitle: {
        ...typography('Heading', 200, 'SemiBold'),
        color: theme.centerChannelColor,
        flex: 1,
    },
    detailContent: {
        flex: 1,
        paddingHorizontal: 16,
        paddingTop: 12,
    },
    summaryBox: {
        padding: 12,
        borderRadius: 8,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        marginBottom: 16,
    },
    summaryLabel: {
        ...typography('Body', 50, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.48),
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 6,
    },
    summaryText: {
        ...typography('Body', 100, 'Regular'),
        color: theme.centerChannelColor,
        lineHeight: 20,
    },
    messagesLabel: {
        ...typography('Body', 75, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.64),
        marginBottom: 8,
    },
    messageItem: {
        paddingVertical: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    messageHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    messageUsername: {
        ...typography('Body', 75, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    messageTime: {
        ...typography('Body', 25, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.48),
    },
    messageText: {
        ...typography('Body', 100, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.88),
        lineHeight: 20,
    },
    cardSummary: {
        ...typography('Body', 75, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.64),
        lineHeight: 18,
        marginTop: 6,
    },
    cardBadge: {
        ...typography('Body', 25, 'SemiBold'),
        color: theme.buttonBg,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
        backgroundColor: changeOpacity(theme.buttonBg, 0.1),
    },
    // Modal overlay for dropdowns
    modalOverlay: {
        flex: 1,
        backgroundColor: changeOpacity('#000', 0.5),
        justifyContent: 'flex-end',
    },
    modalSheet: {
        backgroundColor: theme.centerChannelBg,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        paddingHorizontal: 16,
        paddingBottom: 32,
        maxHeight: '70%',
    },
    modalHandle: {
        alignSelf: 'center',
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.2),
        marginTop: 10,
        marginBottom: 16,
    },
    modalTitle: {
        ...typography('Heading', 200, 'SemiBold'),
        color: theme.centerChannelColor,
        marginBottom: 16,
    },
    listRow: {
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    listRowText: {
        ...typography('Body', 100, 'Regular'),
        color: theme.centerChannelColor,
    },
    // Month navigation
    monthNav: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        gap: 16,
    },
    monthBtn: {padding: 8},
    monthLabel: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    // Day pills
    dayPillRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 4,
        marginTop: 8,
    },
    dayPill: {
        alignItems: 'center',
        justifyContent: 'center',
        width: 36,
        height: 32,
        borderRadius: 6,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
    },
    dayPillActive: {
        backgroundColor: changeOpacity(theme.buttonBg, 0.15),
    },
    dayLabel: {
        fontSize: 12,
        color: theme.centerChannelColor,
    },
    dayDot: {
        width: 5,
        height: 5,
        borderRadius: 3,
        marginTop: 2,
    },
    dayDotEmpty: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.16),
    },
    dayDotFilled: {
        backgroundColor: theme.buttonBg,
    },
    dayDotLoading: {
        backgroundColor: changeOpacity(theme.buttonBg, 0.4),
    },
    // Graduate button
    graduateBtn: {
        marginTop: 8,
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 6,
        backgroundColor: changeOpacity(theme.buttonBg, 0.08),
        alignSelf: 'flex-start',
    },
    graduateText: {
        ...typography('Body', 50, 'SemiBold'),
        color: theme.buttonBg,
    },
    graduateMsg: {
        ...typography('Body', 25, 'Regular'),
        color: theme.centerChannelColor,
        marginTop: 4,
    },
    // Raw messages
    rawToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingVertical: 8,
    },
    rawToggleText: {
        ...typography('Body', 75, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.64),
    },
    rawMessage: {
        paddingVertical: 6,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.06),
    },
    rawTime: {
        ...typography('Body', 25, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.4),
    },
    rawUser: {
        ...typography('Body', 50, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    rawText: {
        ...typography('Body', 75, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.8),
        marginTop: 2,
    },
}));

// ---- Helpers ----

function formatTime(ts: number, locale: string): string {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (dayKey === today) {
        return time;
    }
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    if (dayKey === yesterdayKey) {
        const labels: Record<string, string> = {zh: '昨天', 'zh-TW': '昨天', en: 'Yesterday'};
        return `${labels[locale] || labels.en} ${time}`;
    }
    return `${d.getMonth() + 1}/${d.getDate()} ${time}`;
}

// ---- Main Component ----

const ConversationsScreen = () => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const navigation = useNavigation();
    const style = getStyleSheet(theme);

    const [teamId, setTeamId] = useState('');
    const [view, setView] = useState<ViewMode>('setup');

    // Setup state
    const [departments, setDepartments] = useState<Department[]>([]);
    const [selectedDeptId, setSelectedDeptId] = useState<number | null>(null);
    const [members, setMembers] = useState<Array<{id: string; username: string; first_name?: string; last_name?: string; nickname?: string}>>([]);
    const [selectedMember, setSelectedMember] = useState<{id: string; username: string; first_name?: string; last_name?: string; nickname?: string} | null>(null);
    const [loadingDepts, setLoadingDepts] = useState(true);
    const [loadingMembers, setLoadingMembers] = useState(false);

    // Modal state
    const [showDeptModal, setShowDeptModal] = useState(false);
    const [showMemberModal, setShowMemberModal] = useState(false);

    // Dashboard state
    const [conversations, setConversations] = useState<ConversationChannel[]>([]);
    const [currentUserId, setCurrentUserId] = useState('');
    const locale = detectLocale(intl);
    const [userMap, setUserMap] = useState<Map<string, {id: string; username: string; first_name?: string; last_name?: string; nickname?: string}>>(new Map());
    const [summaries, setSummaries] = useState<Map<string, Map<string, DaySummary>>>(new Map());
    const [activeDay, setActiveDay] = useState<Map<string, string>>(new Map());
    const [expandedRaw, setExpandedRaw] = useState<Set<string>>(new Set());
    const now = new Date();
    const [viewYear, setViewYear] = useState(now.getFullYear());
    const [viewMonth, setViewMonth] = useState(now.getMonth());
    const [graduatingPath, setGraduatingPath] = useState<string | null>(null);
    const [graduateMsg, setGraduateMsg] = useState<{path: string; text: string; isError: boolean} | null>(null);
    const [loadingChannels, setLoadingChannels] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const monthDays = useMemo(() => getMonthDays(viewYear, viewMonth), [viewYear, viewMonth]);

    // Init: load teamId
    useEffect(() => {
        const init = async () => {
            try {
                if (!serverUrl) {
                    throw new Error('Server URL is not available');
                }
                const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
                const [tid, uid] = await Promise.all([
                    getCurrentTeamId(database),
                    getCurrentUserId(database),
                ]);
                if (!tid) {
                    throw new Error('Team ID not found');
                }
                setTeamId(tid);
                setCurrentUserId(uid || '');
            } catch (err) {
                console.error('Failed to initialize conversations:', err);
                setError(err instanceof Error ? err.message : 'Failed to initialize');
            }
        };
        init();
    }, [serverUrl]);

    // Load departments
    useEffect(() => {
        if (!teamId || !serverUrl) return;
        setLoadingDepts(true);
        const loadDepartments = async () => {
            try {
                const client = NetworkManager.getClient(serverUrl);
                const result = await client.getDepartments(teamId, {page: 0, perPage: 100});
                setDepartments(result.departments || []);
            } catch (err) {
                console.error('Failed to load departments:', err);
                setDepartments([]);
            } finally {
                setLoadingDepts(false);
            }
        };
        loadDepartments();
    }, [teamId, serverUrl]);

    // Load members when department changes
    useEffect(() => {
        if (!teamId || selectedDeptId === null || !serverUrl) {
            setMembers([]);
            return;
        }
        setLoadingMembers(true);
        const loadMembers = async () => {
            try {
                const client = NetworkManager.getClient(serverUrl);
                const result = await client.getDepartmentMembers(teamId, selectedDeptId, {page: 0, perPage: 100});
                setMembers(result.members || []);
            } catch (err) {
                console.error('Failed to load department members:', err);
                setMembers([]);
            } finally {
                setLoadingMembers(false);
            }
        };
        loadMembers();
    }, [teamId, selectedDeptId, serverUrl]);

    // ---- Update summary for one channel+date ----
    const updateSummary = useCallback((channelId: string, date: string, update: Partial<DaySummary>) => {
        setSummaries((prev) => {
            const next = new Map(prev);
            let chMap = next.get(channelId);
            if (!chMap) {
                chMap = new Map();
                next.set(channelId, chMap);
            } else {
                chMap = new Map(chMap);
                next.set(channelId, chMap);
            }
            const existing = chMap.get(date) || {...DEFAULT_DAY_SUMMARY, date};
            chMap.set(date, {...existing, ...update});
            return next;
        });
    }, []);

    // ---- Fetch one day's summary for one channel ----
    const fetchDaySummary = useCallback(async (channelId: string, date: string) => {
        updateSummary(channelId, date, {loading: true});
        try {
            const data = await fetchFactQuery(serverUrl, teamId, channelId, 'channel_history', {date});
            const result = data.results?.[0];
            updateSummary(channelId, date, {
                summary: result?.memory || '',
                rawMessages: result?.raw_messages || [],
                rawAvailable: result?.raw_messages_available || false,
                rawTruncated: result?.raw_messages_truncated || false,
                hasData: Boolean(result?.memory || result?.raw_messages_available),
                loading: false,
                error: null,
            });
        } catch (err: any) {
            updateSummary(channelId, date, {
                loading: false,
                error: err?.message || 'Failed',
                hasData: false,
            });
        }
    }, [serverUrl, teamId, updateSummary]);

    // ---- Month navigation ----
    const prevMonth = useCallback(() => {
        setViewMonth((m) => {
            if (m === 0) {
                setViewYear((y) => y - 1);
                return 11;
            }
            return m - 1;
        });
    }, []);

    const nextMonth = useCallback(() => {
        setViewMonth((m) => {
            if (m === 11) {
                setViewYear((y) => y + 1);
                return 0;
            }
            return m + 1;
        });
    }, []);

    // ---- Switch active day for a card ----
    const switchDay = useCallback((channelId: string, date: string) => {
        setActiveDay((prev) => {
            const next = new Map(prev);
            next.set(channelId, date);
            return next;
        });
    }, []);

    // ---- Toggle raw messages ----
    const toggleRaw = useCallback((key: string) => {
        setExpandedRaw((prev) => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    }, []);

    // ---- Graduate memory to KB ----
    const handleGraduate = useCallback(async (memoryPath: string) => {
        setGraduatingPath(memoryPath);
        setGraduateMsg(null);
        try {
            await graduateMemory(serverUrl, teamId, memoryPath);
            setGraduateMsg({
                path: memoryPath,
                text: intl.formatMessage({id: 'workbench.conversations.graduate_success', defaultMessage: '已归档到知识库'}),
                isError: false,
            });
        } catch (err: any) {
            setGraduateMsg({
                path: memoryPath,
                text: intl.formatMessage(
                    {id: 'workbench.conversations.graduate_failed', defaultMessage: '归档失败: {error}'},
                    {error: err?.message || '未知错误'},
                ),
                isError: true,
            });
        } finally {
            setGraduatingPath(null);
            setTimeout(() => setGraduateMsg(null), 3000);
        }
    }, [serverUrl, teamId, intl]);

    // ---- Load summaries when month changes ----
    useEffect(() => {
        if (view !== 'dashboard' || conversations.length === 0) return;
        for (const ch of conversations) {
            for (const day of monthDays) {
                const chMap = summaries.get(ch.id);
                if (!chMap?.get(day)) {
                    fetchDaySummary(ch.id, day);
                }
            }
        }
    }, [viewYear, viewMonth]); // eslint-disable-line react-hooks/exhaustive-deps

    // ---- Resolve channel display name ----
    const resolveChannelName = useCallback((ch: ConversationChannel): string => {
        if (ch.type === 'G' && ch.display_name) return ch.display_name;
        const otherIds = (ch.member_ids || []).filter((id) => id !== currentUserId);
        if (otherIds.length === 1) {
            const u = userMap.get(otherIds[0]);
            return u ? getUserDisplayName(u) : ch.display_name || ch.id;
        }
        if (ch.display_name) return ch.display_name;
        return (ch.member_ids || []).map((id) => {
            const u = userMap.get(id);
            return u ? getUserDisplayName(u) : id;
        }).join(', ');
    }, [currentUserId, userMap]);

    // ---- Member names subtitle ----
    const memberNames = useCallback((ch: ConversationChannel): string => {
        return (ch.member_ids || []).map((id) => {
            const u = userMap.get(id);
            return u ? getUserDisplayName(u) : '';
        }).filter(Boolean).join(', ');
    }, [userMap]);

    // ---- Total raw messages count ----
    const totalRawMessages = useMemo(() => {
        let count = 0;
        for (const chMap of summaries.values()) {
            for (const ds of chMap.values()) {
                count += ds.rawMessages.length;
            }
        }
        return count;
    }, [summaries]);

    // ---- Check if any loading in progress ----
    const anyLoading = useMemo(() => {
        for (const chMap of summaries.values()) {
            for (const ds of chMap.values()) {
                if (ds.loading) return true;
            }
        }
        return false;
    }, [summaries]);

    // ---- Day pill label ----
    const dayPillLabel = useCallback((dateStr: string): string => {
        const today = localDayKey(new Date());
        if (dateStr === today) {
            const labels: Record<string, string> = {zh: '今天', 'zh-TW': '今天', en: 'Today'};
            return labels[locale] || labels.en;
        }
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        if (dateStr === localDayKey(yesterday)) {
            const labels: Record<string, string> = {zh: '昨天', 'zh-TW': '昨天', en: 'Yest.'};
            return labels[locale] || labels.en;
        }
        const d = new Date(dateStr + 'T00:00:00');
        return String(d.getDate());
    }, [locale]);

    // ---- Month label ----
    const monthLabel = useMemo(() => {
        if (locale === 'zh' || locale === 'zh-TW') {
            return `${viewYear}年${viewMonth + 1}月`;
        }
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${monthNames[viewMonth]} ${viewYear}`;
    }, [viewYear, viewMonth, locale]);

    // ---- Query conversations ----
    const handleQuery = useCallback(async () => {
        if (!teamId) {
            Alert.alert('Error', 'Team ID is missing');
            return;
        }
        if (!selectedMember) {
            Alert.alert('Error', 'Please select a member first');
            return;
        }

        setLoadingChannels(true);
        setConversations([]);
        setSummaries(new Map());
        setExpandedRaw(new Set());
        setActiveDay(new Map());
        setError(null);

        const n = new Date();
        setViewYear(n.getFullYear());
        setViewMonth(n.getMonth());
        const days = getMonthDays(n.getFullYear(), n.getMonth());
        const today = localDayKey(n);

        try {
            const userId = selectedMember.id;

            // ① Fetch conversation channels
            const chs = await listConversations(serverUrl, teamId, userId);
            chs.sort((a, b) => (b.last_post_at || 0) - (a.last_post_at || 0));
            setConversations(chs);

            // ② Batch fetch user profiles
            const allUserIds = new Set<string>();
            for (const ch of chs) {
                for (const uid of (ch.member_ids || [])) {
                    allUserIds.add(uid);
                }
            }
            if (allUserIds.size > 0) {
                try {
                    const client = NetworkManager.getClient(serverUrl);
                    const ids = Array.from(allUserIds);
                    const batchSize = 200;
                    const allUsers: Array<{id: string; username: string; first_name?: string; last_name?: string; nickname?: string}> = [];
                    for (let i = 0; i < ids.length; i += batchSize) {
                        const batch = ids.slice(i, i + batchSize);
                        const users = await client.getProfilesByIds(batch);
                        allUsers.push(...users);
                    }
                    const map = new Map<string, {id: string; username: string; first_name?: string; last_name?: string; nickname?: string}>();
                    for (const u of allUsers) {
                        map.set(u.id, u);
                    }
                    setUserMap(map);
                } catch {
                    // Non-critical: continue without user names
                }
            }

            setLoadingChannels(false);

            // Set default active day to today
            const defaultActive = new Map<string, string>();
            for (const ch of chs) {
                defaultActive.set(ch.id, today);
            }
            setActiveDay(defaultActive);

            // ③ Phase 1: fetch today for all channels (fast feedback)
            for (const ch of chs) {
                fetchDaySummary(ch.id, today);
            }

            // ④ Phase 2: fetch other days in background
            const otherDays = days.filter((d) => d !== today);
            for (const ch of chs) {
                for (const day of otherDays) {
                    fetchDaySummary(ch.id, day);
                }
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to load conversations';
            setError(message);
            setConversations([]);
            setLoadingChannels(false);
        }

        setView('dashboard');
    }, [serverUrl, teamId, selectedMember, fetchDaySummary]);

    const backToSetup = useCallback(() => {
        setConversations([]);
        setSummaries(new Map());
        setExpandedRaw(new Set());
        setActiveDay(new Map());
        setError(null);
        setView('setup');
    }, []);

    const getMemberDisplayName = useCallback((member: {username: string; first_name?: string; last_name?: string; nickname?: string}): string => {
        return getUserDisplayName(member);
    }, []);

    // Render setup view
    const renderSetup = () => (
        <ScrollView style={style.setupContainer}>
            {/* Department Selection */}
            <Text style={style.label}>
                {intl.formatMessage({id: 'workbench.conversations.select_department', defaultMessage: 'Select Department'})}
            </Text>
            <TouchableOpacity
                style={style.selectBtn}
                onPress={() => {
                    setShowMemberModal(false); // Close member modal if open
                    setShowDeptModal(true);
                }}
                disabled={loadingDepts}
            >
                <Text style={style.selectText}>
                    {loadingDepts
                        ? intl.formatMessage({id: 'workbench.loading', defaultMessage: 'Loading...'})
                        : selectedDeptId !== null
                            ? (() => {
                                const dept = departments.find(d => d.id === selectedDeptId);
                                return dept ? getDepartmentDisplayName(dept, intl) : '';
                            })()
                            : intl.formatMessage({id: 'workbench.conversations.choose_department', defaultMessage: 'Choose a department...'})
                    }
                </Text>
                <CompassIcon name='chevron-down' size={20} color={changeOpacity(theme.centerChannelColor, 0.48)}/>
            </TouchableOpacity>

            {/* Member Selection */}
            <Text style={style.label}>
                {intl.formatMessage({id: 'workbench.conversations.select_member', defaultMessage: 'Select Member'})}
            </Text>
            <TouchableOpacity
                style={[style.selectBtn, selectedDeptId === null && {opacity: 0.5}]}
                onPress={() => {
                    if (selectedDeptId !== null) {
                        setShowDeptModal(false); // Close dept modal if open
                        setShowMemberModal(true);
                    }
                }}
                disabled={selectedDeptId === null || loadingMembers}
            >
                <Text style={style.selectText}>
                    {loadingMembers
                        ? intl.formatMessage({id: 'workbench.loading', defaultMessage: 'Loading...'})
                        : selectedDeptId === null
                            ? intl.formatMessage({id: 'workbench.conversations.select_department_first', defaultMessage: 'Select a department first'})
                            : selectedMember
                                ? getMemberDisplayName(selectedMember)
                                : intl.formatMessage({id: 'workbench.conversations.choose_member', defaultMessage: 'Choose a member...'})
                    }
                </Text>
                <CompassIcon name='chevron-down' size={20} color={changeOpacity(theme.centerChannelColor, 0.48)}/>
            </TouchableOpacity>

            <TouchableOpacity
                style={[style.queryBtn, !selectedMember && style.queryBtnDisabled]}
                onPress={handleQuery}
                disabled={!selectedMember}
            >
                <Text style={style.queryBtnText}>
                    {intl.formatMessage({id: 'workbench.conversations.query', defaultMessage: 'Query Conversations'})}
                </Text>
            </TouchableOpacity>
        </ScrollView>
    );

    // Render dashboard view
    const renderDashboard = () => {
        if (error) {
            return (
                <View style={style.errorContainer}>
                    <CompassIcon name='alert-circle-outline' size={48} color={theme.errorTextColor}/>
                    <Text style={style.errorText}>{error}</Text>
                    <TouchableOpacity style={style.retryBtn} onPress={handleQuery}>
                        <Text style={style.retryBtnText}>
                            {intl.formatMessage({id: 'mobile.retry', defaultMessage: 'Retry'})}
                        </Text>
                    </TouchableOpacity>
                </View>
            );
        }

        if (loadingChannels) {
            return (
                <View style={style.emptyContainer}>
                    <ActivityIndicator size='large' color={theme.centerChannelColor}/>
                    <Text style={style.emptyText}>
                        {intl.formatMessage({id: 'workbench.loading', defaultMessage: 'Loading...'})}
                    </Text>
                </View>
            );
        }

        if (conversations.length === 0) {
            return (
                <View style={style.emptyContainer}>
                    <CompassIcon name='forum-outline' size={48} color={changeOpacity(theme.centerChannelColor, 0.32)}/>
                    <Text style={style.emptyText}>
                        {intl.formatMessage({id: 'workbench.conversations.empty', defaultMessage: 'No conversations found'})}
                    </Text>
                </View>
            );
        }

        return (
            <View style={style.dashboardContainer}>
                {/* Stats bar */}
                <View style={style.statsBar}>
                    <View style={style.statItem}>
                        <CompassIcon name='forum-outline' size={14} color={changeOpacity(theme.centerChannelColor, 0.64)}/>
                        <Text style={style.statText}>
                            {intl.formatMessage(
                                {id: 'workbench.conversations.stats_groups', defaultMessage: '{count} groups'},
                                {count: conversations.length},
                            )}
                        </Text>
                    </View>
                    <View style={style.statItem}>
                        <CompassIcon name='message-outline' size={14} color={changeOpacity(theme.centerChannelColor, 0.64)}/>
                        <Text style={style.statText}>
                            {intl.formatMessage(
                                {id: 'workbench.conversations.stats_messages', defaultMessage: '{count} messages'},
                                {count: totalRawMessages},
                            )}
                        </Text>
                    </View>
                    {anyLoading && (
                        <ActivityIndicator size='small' color={theme.centerChannelColor} style={{marginLeft: 8}}/>
                    )}
                </View>

                {/* Month navigation */}
                <View style={style.monthNav}>
                    <TouchableOpacity style={style.monthBtn} onPress={prevMonth}>
                        <CompassIcon name='chevron-left' size={16} color={theme.centerChannelColor}/>
                    </TouchableOpacity>
                    <Text style={style.monthLabel}>{monthLabel}</Text>
                    <TouchableOpacity style={style.monthBtn} onPress={nextMonth}>
                        <CompassIcon name='chevron-right' size={16} color={theme.centerChannelColor}/>
                    </TouchableOpacity>
                </View>

                {/* Channel cards */}
                <FlatList
                    data={conversations}
                    keyExtractor={(item: ConversationChannel) => item.id}
                    renderItem={({item: ch}: {item: ConversationChannel}) => {
                        const chName = resolveChannelName(ch);
                        const chDayMap = summaries.get(ch.id) || new Map();
                        const currentDay = activeDay.get(ch.id) || localDayKey(new Date());
                        const activeDs = chDayMap.get(currentDay);
                        const rawKey = `${ch.id}|${currentDay}`;
                        const isRawExpanded = expandedRaw.has(rawKey);
                        const memoryPath = `memory/${teamId}/${currentDay}-${ch.id}.md`;

                        return (
                            <View key={ch.id} style={style.card}>
                                {/* Card header */}
                                <View style={style.cardHeader}>
                                    <CompassIcon name='forum-outline' size={16} color={theme.centerChannelColor}/>
                                    <Text style={style.cardTitle} numberOfLines={1}>
                                        {chName}
                                    </Text>
                                    {ch.last_post_at > 0 && (
                                        <Text style={style.cardTime}>
                                            {formatTime(ch.last_post_at, intl.locale)}
                                        </Text>
                                    )}
                                </View>

                                {/* Members subtitle */}
                                <Text style={style.cardMembers} numberOfLines={1}>
                                    {memberNames(ch)}
                                </Text>

                                {/* Day pills */}
                                <View style={style.dayPillRow}>
                                    {monthDays.map((day) => {
                                        const ds = chDayMap.get(day);
                                        const isActive = day === currentDay;
                                        const hasData = ds?.hasData || false;
                                        const isLoading = ds?.loading || false;

                                        let dotStyle = style.dayDotEmpty;
                                        if (isLoading) {
                                            dotStyle = style.dayDotLoading;
                                        } else if (hasData) {
                                            dotStyle = style.dayDotFilled;
                                        }

                                        return (
                                            <TouchableOpacity
                                                key={day}
                                                style={[style.dayPill, isActive && style.dayPillActive]}
                                                onPress={() => switchDay(ch.id, day)}
                                            >
                                                <Text style={style.dayLabel}>{dayPillLabel(day)}</Text>
                                                <View style={[style.dayDot, dotStyle]}/>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>

                                {/* Summary content for active day */}
                                <View style={{marginTop: 8}}>
                                    {activeDs?.loading ? (
                                        <ActivityIndicator size='small' color={theme.centerChannelColor}/>
                                    ) : activeDs?.error ? (
                                        <Text style={{color: theme.errorTextColor, ...typography('Body', 75, 'Regular')}}>
                                            {activeDs.error}
                                        </Text>
                                    ) : activeDs?.summary ? (
                                        <View>
                                            <Markdown
                                                value={truncateText(activeDs.summary, 300)}
                                                baseTextStyle={style.summaryText}
                                                location={Screens.APPS_CONVERSATIONS}
                                                theme={theme}
                                                disableAtMentions={true}
                                            />
                                            {/* Graduate to KB */}
                                            <TouchableOpacity
                                                style={style.graduateBtn}
                                                onPress={() => handleGraduate(memoryPath)}
                                                disabled={graduatingPath === memoryPath}
                                            >
                                                <Text style={style.graduateText}>
                                                    {graduatingPath === memoryPath
                                                        ? intl.formatMessage({id: 'workbench.conversations.graduating', defaultMessage: '归档中...'})
                                                        : intl.formatMessage({id: 'workbench.conversations.graduate_btn', defaultMessage: '📚 归档到知识库'})}
                                                </Text>
                                            </TouchableOpacity>
                                            {graduateMsg && graduateMsg.path === memoryPath && (
                                                <Text style={[style.graduateMsg, graduateMsg.isError && {color: theme.errorTextColor}]}>
                                                    {graduateMsg.text}
                                                </Text>
                                            )}
                                        </View>
                                    ) : (
                                        <Text style={style.cardSummary}>
                                            {intl.formatMessage({id: 'workbench.conversations.no_summary', defaultMessage: 'No summary available'})}
                                        </Text>
                                    )}
                                </View>

                                {/* Raw messages toggle */}
                                {activeDs && activeDs.rawAvailable && activeDs.rawMessages.length > 0 && (
                                    <TouchableOpacity
                                        style={style.rawToggle}
                                        onPress={() => toggleRaw(rawKey)}
                                    >
                                        <CompassIcon
                                            name={isRawExpanded ? 'chevron-down' : 'chevron-right'}
                                            size={14}
                                            color={changeOpacity(theme.centerChannelColor, 0.64)}
                                        />
                                        <Text style={style.rawToggleText}>
                                            {intl.formatMessage(
                                                {id: 'workbench.conversations.raw_messages', defaultMessage: 'Chat messages ({count})'},
                                                {count: activeDs.rawMessages.length},
                                            )}
                                            {activeDs.rawTruncated && (
                                                ` ${intl.formatMessage({id: 'workbench.conversations.truncated', defaultMessage: '(truncated)'})}`
                                            )}
                                        </Text>
                                    </TouchableOpacity>
                                )}

                                {/* Raw messages expanded */}
                                {isRawExpanded && activeDs && activeDs.rawMessages.length > 0 && (
                                    <View>
                                        {activeDs.rawMessages.map((msg: RawMessage, i: number) => (
                                            <View key={i} style={style.rawMessage}>
                                                <View style={{flexDirection: 'row', gap: 8}}>
                                                    <Text style={style.rawTime}>{msg.time}</Text>
                                                    <Text style={style.rawUser}>{msg.user}</Text>
                                                </View>
                                                <Text style={style.rawText}>{msg.text}</Text>
                                            </View>
                                        ))}
                                    </View>
                                )}
                            </View>
                        );
                    }}
                    contentContainerStyle={{paddingBottom: 20}}
                />
            </View>
        );
    };

    return (
        <SafeAreaView edges={['top', 'bottom']} style={style.container}>
            <View style={style.header}>
                <TouchableOpacity
                    style={style.backBtn}
                    onPress={view === 'dashboard' ? backToSetup : () => navigation.goBack()}
                >
                    <CompassIcon name='arrow-left' size={20} color={theme.sidebarText}/>
                </TouchableOpacity>
                <Text style={style.headerTitle}>
                    {view === 'setup'
                        ? intl.formatMessage({id: 'workbench.conversations.title', defaultMessage: 'Conversations'})
                        : selectedMember
                            ? `${getMemberDisplayName(selectedMember)} — ${intl.formatMessage({id: 'workbench.conversations.dashboard', defaultMessage: 'Activity Dashboard'})}`
                            : intl.formatMessage({id: 'workbench.conversations.title', defaultMessage: 'Conversations'})
                    }
                </Text>
            </View>

            {view === 'setup' ? renderSetup() : renderDashboard()}

            {/* Department selector modal */}
            {showDeptModal && (
                <View style={style.modalOverlay}>
                    <View style={style.modalSheet}>
                        <View style={style.modalHandle}/>
                        <Text style={style.modalTitle}>
                            {intl.formatMessage({id: 'workbench.conversations.select_department', defaultMessage: 'Select Department'})}
                        </Text>
                        <FlatList
                            data={departments}
                            keyExtractor={(item) => String(item.id)}
                            renderItem={({item}) => (
                                <TouchableOpacity
                                    style={style.listRow}
                                    onPress={() => {
                                        setSelectedDeptId(item.id);
                                        setSelectedMember(null);
                                        setShowDeptModal(false);
                                    }}
                                >
                                    <Text style={style.listRowText}>{getDepartmentDisplayName(item, intl)}</Text>
                                </TouchableOpacity>
                            )}
                            ListEmptyComponent={
                                <View style={style.emptyContainer}>
                                    <Text style={style.emptyText}>
                                        {intl.formatMessage({id: 'workbench.conversations.no_departments', defaultMessage: 'No departments available'})}
                                    </Text>
                                </View>
                            }
                        />
                    </View>
                </View>
            )}

            {/* Member selector modal */}
            {showMemberModal && (
                <View style={style.modalOverlay}>
                    <View style={style.modalSheet}>
                        <View style={style.modalHandle}/>
                        <Text style={style.modalTitle}>
                            {intl.formatMessage({id: 'workbench.conversations.select_member', defaultMessage: 'Select Member'})}
                        </Text>
                        <FlatList
                            data={members}
                            keyExtractor={(item) => item.id}
                            renderItem={({item}) => (
                                <TouchableOpacity
                                    style={style.listRow}
                                    onPress={() => {
                                        setSelectedMember(item);
                                        setShowMemberModal(false);
                                    }}
                                >
                                    <Text style={style.listRowText}>{getMemberDisplayName(item)}</Text>
                                </TouchableOpacity>
                            )}
                            ListEmptyComponent={
                                <View style={style.emptyContainer}>
                                    <Text style={style.emptyText}>
                                        {intl.formatMessage({id: 'workbench.conversations.no_members', defaultMessage: 'No members available'})}
                                    </Text>
                                </View>
                            }
                        />
                    </View>
                </View>
            )}
        </SafeAreaView>
    );
};

export default ConversationsScreen;
