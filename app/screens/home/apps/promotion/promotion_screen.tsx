// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import Clipboard from '@react-native-clipboard/clipboard';
import React, {useCallback, useEffect, useState} from 'react';
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
import {getCurrentUserId} from '@queries/servers/system';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import {
    fetchInvitationStats,
    fetchInvitations,
    type InvitationStats,
    type InvitationRecord,
} from '../api';

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
    content: {
        flex: 1,
    },
    section: {
        padding: 16,
    },
    sectionTitle: {
        ...typography('Heading', 300, 'SemiBold'),
        color: theme.centerChannelColor,
        marginBottom: 12,
    },
    // Stats grid
    statsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    statCard: {
        width: '47%',
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderRadius: 8,
        padding: 16,
        alignItems: 'center',
    },
    statValue: {
        ...typography('Heading', 500, 'Bold'),
        color: theme.buttonBg,
        marginBottom: 4,
    },
    statLabel: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.64),
    },
    // Invite link
    linkBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderRadius: 8,
        padding: 12,
        gap: 8,
    },
    linkText: {
        ...typography('Body', 75),
        color: theme.centerChannelColor,
        flex: 1,
    },
    copyBtn: {
        backgroundColor: theme.buttonBg,
        borderRadius: 4,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    copyBtnText: {
        color: theme.buttonColor,
        ...typography('Body', 75, 'SemiBold'),
    },
    // Records list
    recordCard: {
        marginHorizontal: 16,
        marginVertical: 4,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.02),
        borderRadius: 8,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.08),
        padding: 12,
    },
    recordRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 2,
    },
    recordLabel: {
        ...typography('Body', 50),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        width: 70,
    },
    recordValue: {
        ...typography('Body', 75),
        color: theme.centerChannelColor,
        flex: 1,
    },
    recordName: {
        ...typography('Heading', 400, 'Bold'),
        color: theme.buttonBg,
    },
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 12,
        ...typography('Body', 50, 'SemiBold'),
    },
    statusRegistered: {
        backgroundColor: '#2ea04320',
        color: '#2ea043',
    },
    statusPending: {
        backgroundColor: '#d2992220',
        color: '#d29922',
    },
    emptyText: {
        ...typography('Body', 200),
        color: changeOpacity(theme.centerChannelColor, 0.4),
        textAlign: 'center',
        paddingVertical: 48,
        paddingHorizontal: 24,
    },
    drillDownHint: {
        ...typography('Body', 50),
        color: changeOpacity(theme.centerChannelColor, 0.4),
        textAlign: 'center',
        paddingVertical: 8,
    },
}));

const PromotionScreen = () => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const style = getStyleSheet(theme);

    const [currentUserId, setCurrentUserId] = useState('');
    const [loading, setLoading] = useState(true);

    // Stats
    const [stats, setStats] = useState<InvitationStats>({
        total_invited: 0,
        total_accepted: 0,
        total_chain: 0,
        total_chain_accepted: 0,
    });

    // Drill-down stack: each entry is {userId, userName}
    const [drillStack, setDrillStack] = useState<Array<{userId: string; userName: string}>>([]);
    const [records, setRecords] = useState<InvitationRecord[]>([]);

    // Current user being viewed (top of stack or self)
    const currentViewUser = drillStack.length > 0 ? drillStack[drillStack.length - 1] : null;

    // Init
    useEffect(() => {
        const init = async () => {
            try {
                const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
                const uid = await getCurrentUserId(database);
                setCurrentUserId(uid);
            } catch {
                // ignore
            }
        };
        init();
    }, [serverUrl]);

    // Load stats
    const loadStats = useCallback(async () => {
        if (!currentUserId) return;
        try {
            const data = await fetchInvitationStats(serverUrl, currentUserId);
            setStats(data);
        } catch {
            // ignore
        }
    }, [serverUrl, currentUserId]);

    // Load records for current view
    const loadRecords = useCallback(async (userId: string) => {
        setLoading(true);
        try {
            const data = await fetchInvitations(serverUrl, userId);
            setRecords(data);
        } catch {
            setRecords([]);
        } finally {
            setLoading(false);
        }
    }, [serverUrl]);

    useEffect(() => {
        if (!currentUserId) return;
        loadStats();
        loadRecords(currentUserId);
    }, [currentUserId, loadStats, loadRecords]);

    // Drill-down handlers
    const handleDrillDown = useCallback((record: InvitationRecord) => {
        if (!record.invitee_id || drillStack.length >= 3) {
            if (drillStack.length >= 3) {
                Alert.alert('', intl.formatMessage({id: 'promotion.max_depth', defaultMessage: 'Maximum depth reached'}));
            }
            return;
        }
        setDrillStack((prev) => [...prev, {userId: record.invitee_id, userName: record.invitee_name}]);
        loadRecords(record.invitee_id);
    }, [drillStack.length, loadRecords, intl]);

    const handleBack = useCallback(() => {
        setDrillStack((prev) => {
            const next = prev.slice(0, -1);
            const nextUserId = next.length > 0 ? next[next.length - 1].userId : currentUserId;
            loadRecords(nextUserId);
            return next;
        });
    }, [currentUserId, loadRecords]);

    // Copy link
    const inviteLink = `${serverUrl}/invite?invited_by=${currentUserId}`;
    const handleCopyLink = useCallback(() => {
        Clipboard.setString(inviteLink);
        Alert.alert('', intl.formatMessage({id: 'promotion.copied', defaultMessage: 'Copied!'}));
    }, [inviteLink, intl]);

    // Format date
    const formatDate = (ts: number) => {
        if (!ts) return '-';
        const d = new Date(ts * 1000);
        if (isNaN(d.getTime())) return '-';
        return d.toLocaleDateString();
    };

    // Status badge
    const renderStatus = (status: string) => {
        const isRegistered = status === 'registered' || status === 'accepted';
        return (
            <View style={[style.statusBadge, isRegistered ? style.statusRegistered : style.statusPending]}>
                <Text style={{color: isRegistered ? '#2ea043' : '#d29922', ...typography('Body', 50, 'SemiBold')}}>
                    {isRegistered
                        ? intl.formatMessage({id: 'promotion.status.registered', defaultMessage: 'Registered'})
                        : intl.formatMessage({id: 'promotion.status.pending', defaultMessage: 'Pending'})}
                </Text>
            </View>
        );
    };

    // Render record card
    const renderRecord = ({item}: {item: InvitationRecord}) => (
        <TouchableOpacity
            style={style.recordCard}
            onPress={() => handleDrillDown(item)}
            disabled={!item.invitee_id || drillStack.length >= 3}
        >
            <View style={style.recordRow}>
                <Text style={style.recordName}>{item.invitee_name || '-'}</Text>
                {renderStatus(item.status)}
            </View>
            <View style={style.recordRow}>
                <Text style={style.recordLabel}>{intl.formatMessage({id: 'promotion.col_phone', defaultMessage: 'Phone'})}</Text>
                <Text style={style.recordValue}>{item.invitee_phone || item.phone || '-'}</Text>
            </View>
            {item.invitee_company ? (
                <View style={style.recordRow}>
                    <Text style={style.recordLabel}>{intl.formatMessage({id: 'promotion.col_company', defaultMessage: 'Company'})}</Text>
                    <Text style={style.recordValue}>{item.invitee_company}</Text>
                </View>
            ) : null}
            <View style={style.recordRow}>
                <Text style={style.recordLabel}>{intl.formatMessage({id: 'promotion.col_date', defaultMessage: 'Date'})}</Text>
                <Text style={style.recordValue}>{formatDate(item.create_at)}</Text>
            </View>
            {item.invitee_invite_count > 0 && (
                <View style={style.recordRow}>
                    <Text style={style.recordLabel}>{intl.formatMessage({id: 'promotion.invited_count', defaultMessage: 'Invited'})}</Text>
                    <Text style={style.recordValue}>{item.invitee_invite_count}</Text>
                </View>
            )}
        </TouchableOpacity>
    );

    if (!currentUserId) {
        return (
            <SafeAreaView edges={['top', 'bottom']} style={style.container}>
                <View style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}>
                    <ActivityIndicator size='large' color={theme.centerChannelColor}/>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView edges={['top', 'bottom']} style={style.container}>
            {/* Header */}
            <View style={style.header}>
                {drillStack.length > 0 && (
                    <TouchableOpacity style={style.backBtn} onPress={handleBack}>
                        <CompassIcon name='arrow-left' size={20} color={theme.sidebarText}/>
                    </TouchableOpacity>
                )}
                <Text style={style.headerTitle}>
                    {currentViewUser
                        ? `${currentViewUser.userName} ${intl.formatMessage({id: 'promotion.invited_people', defaultMessage: "'s Invitations"})}`
                        : intl.formatMessage({id: 'sidebar.tab.promotion', defaultMessage: 'Promotion'})}
                </Text>
            </View>

            {/* Content */}
            <ScrollView style={style.content}>
                {/* Stats (only show on root level) */}
                {drillStack.length === 0 && (
                    <View style={style.section}>
                        <Text style={style.sectionTitle}>{intl.formatMessage({id: 'promotion.stats', defaultMessage: 'Statistics'})}</Text>
                        <View style={style.statsGrid}>
                            <View style={style.statCard}>
                                <Text style={style.statValue}>{stats.total_invited}</Text>
                                <Text style={style.statLabel}>{intl.formatMessage({id: 'promotion.stats.invited', defaultMessage: 'Invited'})}</Text>
                            </View>
                            <View style={style.statCard}>
                                <Text style={style.statValue}>{stats.total_accepted}</Text>
                                <Text style={style.statLabel}>{intl.formatMessage({id: 'promotion.stats.accepted', defaultMessage: 'Registered'})}</Text>
                            </View>
                            <View style={style.statCard}>
                                <Text style={style.statValue}>{stats.total_chain}</Text>
                                <Text style={style.statLabel}>{intl.formatMessage({id: 'promotion.stats.chain_total', defaultMessage: 'Chain Total'})}</Text>
                            </View>
                            <View style={style.statCard}>
                                <Text style={style.statValue}>{stats.total_chain_accepted}</Text>
                                <Text style={style.statLabel}>{intl.formatMessage({id: 'promotion.stats.chain_accepted', defaultMessage: 'Chain Registered'})}</Text>
                            </View>
                        </View>
                    </View>
                )}

                {/* Invite link (only show on root level) */}
                {drillStack.length === 0 && (
                    <View style={style.section}>
                        <Text style={style.sectionTitle}>{intl.formatMessage({id: 'promotion.my_link', defaultMessage: 'My Invite Link'})}</Text>
                        <View style={style.linkBox}>
                            <Text style={style.linkText} numberOfLines={1}>{inviteLink}</Text>
                            <TouchableOpacity style={style.copyBtn} onPress={handleCopyLink}>
                                <Text style={style.copyBtnText}>{intl.formatMessage({id: 'promotion.copy_invite_link', defaultMessage: 'Copy Link'})}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                {/* Records */}
                <View style={style.section}>
                    <Text style={style.sectionTitle}>{intl.formatMessage({id: 'promotion.records', defaultMessage: 'My Invitations'})}</Text>
                    {loading ? (
                        <ActivityIndicator size='large' color={theme.centerChannelColor}/>
                    ) : records.length === 0 ? (
                        <Text style={style.emptyText}>
                            {intl.formatMessage({id: 'promotion.no_records', defaultMessage: 'No invitation records yet'})}
                        </Text>
                    ) : (
                        <FlatList
                            data={records}
                            renderItem={renderRecord}
                            keyExtractor={(item) => item.id}
                            scrollEnabled={false}
                            contentContainerStyle={{paddingHorizontal: 0}}
                        />
                    )}
                    {drillStack.length >= 3 && (
                        <Text style={style.drillDownHint}>
                            {intl.formatMessage({id: 'promotion.max_depth_hint', defaultMessage: 'Maximum depth (3 levels) reached'})}
                        </Text>
                    )}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

export default PromotionScreen;
