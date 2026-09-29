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
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import DatabaseManager from '@database/manager';
import NetworkManager from '@managers/network_manager';
import {getCurrentTeamId} from '@queries/servers/system';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import {fetchConversations, type ConversationChannel} from '../api';
import {
    listConversations,
    getConversationDetail,
    type ConversationItem,
    type ConversationDetail,
    type ConversationMessage,
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
    const [channels, setChannels] = useState<ConversationChannel[]>([]);
    const [conversations, setConversations] = useState<ConversationItem[]>([]);
    const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [selectedConversation, setSelectedConversation] = useState<ConversationDetail | null>(null);
    const [loadingChannels, setLoadingChannels] = useState(false);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Init: load teamId
    useEffect(() => {
        const init = async () => {
            try {
                if (!serverUrl) {
                    throw new Error('Server URL is not available');
                }
                const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
                const tid = await getCurrentTeamId(database);
                if (!tid) {
                    throw new Error('Team ID not found');
                }
                setTeamId(tid);
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

    // Query conversations
    const handleQuery = useCallback(async () => {
        if (!teamId) {
            Alert.alert('Error', 'Team ID is missing');
            return;
        }
        if (!selectedMember) {
            Alert.alert('Error', 'Please select a member first');
            return;
        }

        console.log('[Conversations] Querying for teamId:', teamId, 'userId:', selectedMember.id, 'date:', selectedDate);
        setLoadingChannels(true);
        setConversations([]);
        setError(null);

        try {
            const userId = selectedMember.id;
            const items = await listConversations(serverUrl, teamId, userId, selectedDate);
            console.log('[Conversations] Fetched', items.length, 'conversations');
            setConversations(items);
            setView('dashboard');
        } catch (err) {
            console.error('Failed to fetch conversations:', err);
            const message = err instanceof Error ? err.message : 'Failed to load conversations';
            setError(message);
            setConversations([]);
            // Show Alert for debugging on real device
            Alert.alert('查询会话失败', message);
        } finally {
            setLoadingChannels(false);
        }
    }, [serverUrl, teamId, selectedMember, selectedDate]);

    // Fetch conversation detail
    const handleSelectConversation = useCallback(async (item: ConversationItem) => {
        if (!teamId) return;

        setLoadingDetail(true);
        try {
            const detail = await getConversationDetail(serverUrl, teamId, item.channel_id, selectedDate);
            setSelectedConversation(detail);
        } catch (err) {
            console.error('Failed to fetch conversation detail:', err);
            const message = err instanceof Error ? err.message : 'Failed to load conversation detail';
            Alert.alert('加载详情失败', message);
        } finally {
            setLoadingDetail(false);
        }
    }, [serverUrl, teamId, selectedDate]);

    const backToSetup = useCallback(() => {
        setChannels([]);
        setError(null);
        setView('setup');
    }, []);

    const getMemberDisplayName = useCallback((member: {username: string; first_name?: string; last_name?: string; nickname?: string}): string => {
        if (member.first_name || member.last_name) {
            return `${member.first_name || ''} ${member.last_name || ''}`.trim();
        }
        return member.nickname || member.username;
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
                onPress={() => setShowDeptModal(true)}
                disabled={loadingDepts}
            >
                <Text style={style.selectText}>
                    {loadingDepts
                        ? intl.formatMessage({id: 'workbench.loading', defaultMessage: 'Loading...'})
                        : selectedDeptId !== null
                            ? departments.find(d => d.id === selectedDeptId)?.name || ''
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
                onPress={() => selectedDeptId !== null && setShowMemberModal(true)}
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

        // Show conversation detail if selected
        if (selectedConversation) {
            return (
                <View style={style.detailContainer}>
                    <View style={style.detailHeader}>
                        <TouchableOpacity onPress={() => setSelectedConversation(null)}>
                            <CompassIcon name='arrow-left' size={24} color={theme.centerChannelColor}/>
                        </TouchableOpacity>
                        <Text style={style.detailTitle} numberOfLines={1}>
                            {selectedConversation.channel_name}
                        </Text>
                    </View>
                    <ScrollView style={style.detailContent}>
                        {/* Summary */}
                        <View style={style.summaryBox}>
                            <Text style={style.summaryLabel}>
                                {intl.formatMessage({id: 'workbench.conversations.summary', defaultMessage: 'Summary'})}
                            </Text>
                            <Text style={style.summaryText}>
                                {selectedConversation.summary || intl.formatMessage({id: 'workbench.conversations.no_summary', defaultMessage: 'No summary available'})}
                            </Text>
                        </View>

                        {/* Messages */}
                        <Text style={style.messagesLabel}>
                            {intl.formatMessage({id: 'workbench.conversations.messages', defaultMessage: 'Messages'})} ({selectedConversation.messages.length})
                        </Text>
                        {selectedConversation.messages.map((msg) => (
                            <View key={msg.id} style={style.messageItem}>
                                <View style={style.messageHeader}>
                                    <Text style={style.messageUsername}>{msg.username}</Text>
                                    <Text style={style.messageTime}>
                                        {formatTime(msg.create_at, intl.locale)}
                                    </Text>
                                </View>
                                <Text style={style.messageText}>{msg.message}</Text>
                            </View>
                        ))}
                    </ScrollView>
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
                {/* Date picker */}
                <View style={style.datePicker}>
                    <Text style={style.dateLabel}>
                        {intl.formatMessage({id: 'workbench.conversations.date', defaultMessage: 'Date'})}:
                    </Text>
                    <TouchableOpacity
                        style={style.dateBtn}
                        onPress={() => {
                            // Simple date input for now
                            const newDate = prompt('Enter date (YYYY-MM-DD):', selectedDate);
                            if (newDate && /^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
                                setSelectedDate(newDate);
                                handleQuery();
                            }
                        }}
                    >
                        <Text style={style.dateText}>{selectedDate}</Text>
                        <CompassIcon name='calendar' size={16} color={theme.centerChannelColor}/>
                    </TouchableOpacity>
                </View>

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
                </View>

                <FlatList
                    data={conversations}
                    keyExtractor={(item) => item.channel_id}
                    renderItem={({item}) => (
                        <TouchableOpacity
                            style={style.card}
                            onPress={() => handleSelectConversation(item)}
                            activeOpacity={0.7}
                        >
                            <View style={style.cardHeader}>
                                <CompassIcon name='forum-outline' size={16} color={theme.centerChannelColor}/>
                                <Text style={style.cardTitle} numberOfLines={1}>
                                    {item.channel_name}
                                </Text>
                                <Text style={style.cardBadge}>
                                    {item.message_count} {intl.formatMessage({id: 'workbench.conversations.msgs', defaultMessage: 'msgs'})}
                                </Text>
                            </View>
                            <Text style={style.cardSummary} numberOfLines={2}>
                                {item.summary || intl.formatMessage({id: 'workbench.conversations.no_summary', defaultMessage: 'No summary available'})}
                            </Text>
                        </TouchableOpacity>
                    )}
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
                                    <Text style={style.listRowText}>{item.name}</Text>
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
