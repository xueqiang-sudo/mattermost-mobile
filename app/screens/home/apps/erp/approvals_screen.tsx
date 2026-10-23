// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useNavigation} from '@react-navigation/native';
import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    ActivityIndicator,
    Alert,
    RefreshControl,
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
import {getCurrentTeamId} from '@queries/servers/system';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import {
    fetchApprovals,
    postApprovalAction,
    type Approval,
} from '../api';

// ---- Document Type Labels ----

const getDoctypeLabels = (intl: ReturnType<typeof useIntl>) => ({
    'Sales Order': intl.formatMessage({id: 'workbench.approval.sales_order', defaultMessage: '销售订单'}),
    'Sales Invoice': intl.formatMessage({id: 'workbench.approval.sales_invoice', defaultMessage: '销售发票'}),
    'Purchase Order': intl.formatMessage({id: 'workbench.approval.purchase_order', defaultMessage: '采购订单'}),
    'Purchase Invoice': intl.formatMessage({id: 'workbench.approval.purchase_invoice', defaultMessage: '采购发票'}),
});

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
    headerTitle: {
        ...typography('Heading', 200, 'SemiBold'),
        color: theme.sidebarText,
        flex: 1,
    },
    backBtn: {
        padding: 8,
        marginRight: 8,
    },
    refreshBtn: {
        padding: 8,
    },
    content: {
        flex: 1,
        padding: 12,
    },
    card: {
        backgroundColor: theme.centerChannelBg,
        borderRadius: 8,
        padding: 16,
        marginBottom: 12,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 1},
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 2,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    docType: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.buttonBg,
        fontSize: 12,
        textTransform: 'uppercase',
    },
    workflowState: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        fontSize: 11,
        paddingHorizontal: 8,
        paddingVertical: 2,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
        borderRadius: 4,
        overflow: 'hidden',
    },
    cardName: {
        ...typography('Heading', 100, 'SemiBold'),
        color: theme.centerChannelColor,
        fontSize: 16,
        marginBottom: 8,
    },
    metaRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginBottom: 12,
    },
    metaItem: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.72),
        fontSize: 13,
        marginRight: 16,
        marginBottom: 4,
    },
    amount: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.centerChannelColor,
        fontSize: 14,
    },
    actions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 8,
    },
    btnApprove: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: '#4CAF50',
        borderRadius: 6,
    },
    btnReject: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: '#F44336',
        borderRadius: 6,
    },
    btnDisabled: {
        opacity: 0.5,
    },
    btnText: {
        ...typography('Body', 75, 'SemiBold'),
        color: '#FFFFFF',
        fontSize: 13,
        marginLeft: 4,
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
        paddingHorizontal: 32,
        paddingTop: 64,
    },
    emptyText: {
        ...typography('Body', 200),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        textAlign: 'center',
        marginTop: 16,
    },
    errorContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
    },
    errorText: {
        ...typography('Body', 200),
        color: '#F44336',
        textAlign: 'center',
        marginTop: 16,
    },
    retryBtn: {
        marginTop: 16,
        paddingHorizontal: 24,
        paddingVertical: 10,
        backgroundColor: theme.buttonBg,
        borderRadius: 6,
    },
    retryBtnText: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.buttonColor,
    },
}));

// ---- Component ----

const ApprovalsScreen = () => {
    const theme = useTheme();
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const navigation = useNavigation();

    const [approvals, setApprovals] = useState<Approval[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');
    const [actingKey, setActingKey] = useState('');

    const styles = getStyleSheet(theme);
    const DOCTYPE_LABELS = getDoctypeLabels(intl);

    const loadApprovals = useCallback(async () => {
        if (!serverUrl) {
            return;
        }

        try {
            const database = DatabaseManager.serverDatabases[serverUrl];
            if (!database) {
                setError(intl.formatMessage({id: 'approvals.error.database', defaultMessage: 'Database not available'}));
                return;
            }

            const teamId = await getCurrentTeamId(database);
            const data = await fetchApprovals(serverUrl, teamId);
            setApprovals(data);
            setError('');
        } catch (e: any) {
            setError(String(e?.message || e));
        }
    }, [serverUrl, intl]);

    useEffect(() => {
        const init = async () => {
            setLoading(true);
            await loadApprovals();
            setLoading(false);
        };
        init();
    }, [loadApprovals]);

    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadApprovals();
        setRefreshing(false);
    }, [loadApprovals]);

    const handleAction = useCallback(async (approval: Approval, action: 'Approve' | 'Reject') => {
        // Confirmation dialog for Reject
        if (action === 'Reject') {
            const confirmed = await new Promise<boolean>((resolve) => {
                Alert.alert(
                    intl.formatMessage({id: 'approvals.confirm.reject.title', defaultMessage: '拒绝审批'}),
                    intl.formatMessage({id: 'approvals.confirm.reject.message', defaultMessage: '确定要拒绝此单据吗？'}),
                    [
                        {
                            text: intl.formatMessage({id: 'mobile.components.select_channel_view.cancel', defaultMessage: '取消'}),
                            style: 'cancel',
                            onPress: () => resolve(false),
                        },
                        {
                            text: intl.formatMessage({id: 'approvals.confirm.reject.confirm', defaultMessage: '拒绝'}),
                            style: 'destructive',
                            onPress: () => resolve(true),
                        },
                    ],
                );
            });

            if (!confirmed) {
                return;
            }
        }

        const key = `${approval.doctype}/${approval.name}`;
        setActingKey(key);

        try {
            const database = DatabaseManager.serverDatabases[serverUrl];
            const teamId = database ? await getCurrentTeamId(database) : undefined;
            const success = await postApprovalAction(serverUrl, approval.doctype, approval.name, action, teamId);

            if (success) {
                // Optimistic UI update: remove the approval from the list
                setApprovals((prev) => prev.filter((a) => !(a.doctype === approval.doctype && a.name === approval.name)));
            } else {
                Alert.alert(
                    intl.formatMessage({id: 'approvals.action.failed', defaultMessage: '操作失败'}),
                    intl.formatMessage({id: 'approvals.action.failed.message', defaultMessage: '审批操作未能完成，请重试。'}),
                );
            }
        } catch (e: any) {
            Alert.alert(
                intl.formatMessage({id: 'approvals.action.error', defaultMessage: '错误'}),
                String(e?.message || e),
            );
        } finally {
            setActingKey('');
        }
    }, [serverUrl, intl]);

    // Loading state
    if (loading) {
        return (
            <SafeAreaView
                edges={['top', 'bottom']}
                style={styles.container}
                testID='approvals.screen'
            >
                <View style={styles.header}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                        <CompassIcon name='arrow-left' size={20} color={theme.sidebarText}/>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>
                        {intl.formatMessage({id: 'workbench.tab.approvals', defaultMessage: '审批清单'})}
                    </Text>
                </View>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator
                        color={theme.centerChannelColor}
                        size='large'
                    />
                </View>
            </SafeAreaView>
        );
    }

    // Error state
    if (error) {
        return (
            <SafeAreaView
                edges={['top', 'bottom']}
                style={styles.container}
                testID='approvals.screen'
            >
                <View style={styles.header}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                        <CompassIcon name='arrow-left' size={20} color={theme.sidebarText}/>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>
                        {intl.formatMessage({id: 'workbench.tab.approvals', defaultMessage: '审批清单'})}
                    </Text>
                </View>
                <View style={styles.errorContainer}>
                    <CompassIcon
                        name='alert-circle-outline'
                        size={64}
                        color='#F44336'
                    />
                    <Text style={styles.errorText}>{error}</Text>
                    <TouchableOpacity
                        style={styles.retryBtn}
                        onPress={handleRefresh}
                    >
                        <Text style={styles.retryBtnText}>
                            {intl.formatMessage({id: 'mobile.error.retry', defaultMessage: '重试'})}
                        </Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    // Empty state
    if (approvals.length === 0) {
        return (
            <SafeAreaView
                edges={['top', 'bottom']}
                style={styles.container}
                testID='approvals.screen'
            >
                <View style={styles.header}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                        <CompassIcon name='arrow-left' size={20} color={theme.sidebarText}/>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>
                        {intl.formatMessage({id: 'workbench.tab.approvals', defaultMessage: '审批清单'})}
                    </Text>
                    <TouchableOpacity
                        style={styles.refreshBtn}
                        onPress={handleRefresh}
                    >
                        <CompassIcon
                            name='refresh'
                            size={24}
                            color={theme.sidebarText}
                        />
                    </TouchableOpacity>
                </View>
                <ScrollView
                    contentContainerStyle={styles.emptyContainer}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={handleRefresh}
                            tintColor={theme.centerChannelColor}
                        />
                    }
                >
                    <CompassIcon
                        name='check-circle-outline'
                        size={64}
                        color={changeOpacity(theme.centerChannelColor, 0.32)}
                    />
                    <Text style={styles.emptyText}>
                        {intl.formatMessage({id: 'approvals.empty', defaultMessage: '暂无待审批事项'})}
                    </Text>
                </ScrollView>
            </SafeAreaView>
        );
    }

    // Main list view
    return (
        <SafeAreaView
            edges={['top', 'bottom']}
            style={styles.container}
            testID='approvals.screen'
        >
            <View style={styles.header}>
                <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                    <CompassIcon name='arrow-left' size={20} color={theme.sidebarText}/>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>
                    {intl.formatMessage({id: 'workbench.tab.approvals', defaultMessage: '审批清单'})}
                </Text>
                <TouchableOpacity
                    style={styles.refreshBtn}
                    onPress={handleRefresh}
                >
                    <CompassIcon
                        name='refresh'
                        size={24}
                        color={theme.sidebarText}
                    />
                </TouchableOpacity>
            </View>
            <ScrollView
                style={styles.content}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={handleRefresh}
                        tintColor={theme.centerChannelColor}
                    />
                }
                showsVerticalScrollIndicator={false}
            >
                {approvals.map((approval) => {
                    const key = `${approval.doctype}/${approval.name}`;
                    const busy = actingKey === key;
                    const docTypeLabel = DOCTYPE_LABELS[approval.doctype] || approval.doctype;

                    return (
                        <View
                            key={key}
                            style={styles.card}
                            testID={`approval.${key}`}
                        >
                            <View style={styles.cardHeader}>
                                <Text style={styles.docType}>{docTypeLabel}</Text>
                                {approval.workflow_state ? (
                                    <View style={styles.workflowState}>
                                        <Text style={styles.workflowState}>{approval.workflow_state}</Text>
                                    </View>
                                ) : null}
                            </View>

                            <Text style={styles.cardName}>{approval.name}</Text>

                            <View style={styles.metaRow}>
                                {approval.party ? (
                                    <Text style={styles.metaItem}>{approval.party}</Text>
                                ) : null}
                                <Text style={[styles.metaItem, styles.amount]}>
                                    {`¥${Number(approval.grand_total || 0).toLocaleString()}`}
                                </Text>
                                {approval.date ? (
                                    <Text style={styles.metaItem}>{approval.date}</Text>
                                ) : null}
                            </View>

                            <View style={styles.actions}>
                                <TouchableOpacity
                                    style={[styles.btnReject, busy && styles.btnDisabled]}
                                    onPress={() => handleAction(approval, 'Reject')}
                                    disabled={busy}
                                >
                                    <CompassIcon
                                        name='close-circle-outline'
                                        size={16}
                                        color='#FFFFFF'
                                    />
                                    <Text style={styles.btnText}>
                                        {intl.formatMessage({id: 'approvals.reject', defaultMessage: '拒绝'})}
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.btnApprove, busy && styles.btnDisabled]}
                                    onPress={() => handleAction(approval, 'Approve')}
                                    disabled={busy}
                                >
                                    <CompassIcon
                                        name='check-circle-outline'
                                        size={16}
                                        color='#FFFFFF'
                                    />
                                    <Text style={styles.btnText}>
                                        {intl.formatMessage({id: 'approvals.approve', defaultMessage: '批准'})}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    );
                })}
            </ScrollView>
        </SafeAreaView>
    );
};

export default ApprovalsScreen;
