// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {ActivityIndicator, FlatList, Text, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import DatabaseManager from '@database/manager';
import {getCurrentTeamId} from '@queries/servers/system';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import {fetchOrders, type DashboardOrder} from '../apps/api';

const getStyles = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 8,
    },
    headerTitle: {
        color: theme.centerChannelColor,
        ...typography('Heading', 600, 'SemiBold'),
        marginLeft: 12,
    },
    tabs: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        gap: 8,
        marginBottom: 8,
    },
    tab: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.06),
    },
    tabActive: {
        backgroundColor: theme.buttonBg,
    },
    tabText: {
        ...typography('Body', 100, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.72),
    },
    tabTextActive: {
        color: theme.buttonColor,
    },
    card: {
        marginHorizontal: 16,
        marginBottom: 12,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderRadius: 12,
        padding: 16,
        borderWidth: 0.5,
        borderColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    cardTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    orderName: {
        color: theme.centerChannelColor,
        ...typography('Body', 200, 'SemiBold'),
    },
    stageTag: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
    },
    stageText: {
        ...typography('Body', 50, 'SemiBold'),
        color: '#fff',
    },
    cardRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 4,
    },
    cardLabel: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
        ...typography('Body', 75, 'Regular'),
    },
    cardValue: {
        color: theme.centerChannelColor,
        ...typography('Body', 75, 'Regular'),
    },
    amount: {
        color: theme.centerChannelColor,
        ...typography('Body', 200, 'SemiBold'),
    },
    empty: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 60,
    },
    emptyText: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
        ...typography('Body', 200, 'Regular'),
        marginTop: 12,
    },
    loading: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
}));

type TabKey = 'all' | 'pending' | 'producing' | 'shipped';

const STAGE_COLORS: Record<string, string> = {
    pending_production: '#E8A735',
    in_production: '#3B82F6',
    shipped: '#22C55E',
};

const STAGE_LABELS: Record<string, string> = {
    pending_production: '待生产',
    in_production: '生产中',
    shipped: '已发货',
};

const OrdersScreen = () => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const styles = getStyles(theme);

    const [orders, setOrders] = useState<DashboardOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<TabKey>('all');

    const loadOrders = useCallback(async () => {
        setLoading(true);
        try {
            const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
            const teamId = await getCurrentTeamId(database);
            const data = await fetchOrders(serverUrl, teamId);
            setOrders(data);
        } catch (e) {
            setOrders([]);
        } finally {
            setLoading(false);
        }
    }, [serverUrl]);

    useEffect(() => {
        loadOrders();
    }, [loadOrders]);

    const filteredOrders = orders.filter((o) => {
        if (activeTab === 'all') {return true;}
        if (activeTab === 'pending') {return o.production_stage === 'pending_production';}
        if (activeTab === 'producing') {return o.production_stage === 'in_production';}
        if (activeTab === 'shipped') {return o.production_stage === 'shipped';}
        return true;
    });

    const tabs: {key: TabKey; label: string}[] = [
        {key: 'all', label: '全部'},
        {key: 'pending', label: '待生产'},
        {key: 'producing', label: '生产中'},
        {key: 'shipped', label: '已发货'},
    ];

    const formatDate = (d: string) => {
        if (!d) {return '—';}
        return d.substring(0, 10);
    };

    const formatMoney = (v: number) => {
        if (!v) {return '¥0.00';}
        return `¥${Number(v).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    };

    const renderItem = ({item}: {item: DashboardOrder}) => {
        const stageColor = STAGE_COLORS[item.production_stage] || '#999';
        const stageLabel = STAGE_LABELS[item.production_stage] || item.production_stage || '—';

        return (
            <View style={styles.card}>
                <View style={styles.cardTop}>
                    <Text style={styles.orderName}>{item.name}</Text>
                    <View style={[styles.stageTag, {backgroundColor: stageColor}]}>
                        <Text style={styles.stageText}>{stageLabel}</Text>
                    </View>
                </View>
                <View style={styles.cardRow}>
                    <Text style={styles.cardLabel}>{item.customer_name || item.company || '—'}</Text>
                    <Text style={styles.amount}>{formatMoney(item.grand_total)}</Text>
                </View>
                <View style={styles.cardRow}>
                    <Text style={styles.cardLabel}>{formatDate(item.transaction_date)}</Text>
                    <Text style={styles.cardLabel}>交货: {formatDate(item.delivery_date)}</Text>
                </View>
                {item.outstanding_amount > 0 ? (
                    <View style={styles.cardRow}>
                        <Text style={styles.cardLabel}>未收款</Text>
                        <Text style={[styles.cardValue, {color: theme.errorTextColor}]}>{formatMoney(item.outstanding_amount)}</Text>
                    </View>
                ) : null}
            </View>
        );
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.container} edges={['top']}>
                <View style={styles.loading}>
                    <ActivityIndicator size='large' color={theme.buttonBg}/>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['top']} testID='orders.screen'>
            <View style={styles.header}>
                <CompassIcon name='clipboard-text-outline' size={24} color={theme.centerChannelColor}/>
                <Text style={styles.headerTitle}>
                    {intl.formatMessage({id: 'workspace.orders.title', defaultMessage: '我的订单'})}
                </Text>
            </View>
            <View style={styles.tabs}>
                {tabs.map((tab) => (
                    <TouchableOpacity
                        key={tab.key}
                        style={[styles.tab, activeTab === tab.key && styles.tabActive]}
                        onPress={() => setActiveTab(tab.key)}
                    >
                        <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                            {tab.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>
            {filteredOrders.length === 0 ? (
                <View style={styles.empty}>
                    <CompassIcon name='clipboard-text-clock-outline' size={48} color={changeOpacity(theme.centerChannelColor, 0.32)}/>
                    <Text style={styles.emptyText}>
                        {intl.formatMessage({id: 'workspace.orders.empty', defaultMessage: '暂无订单'})}
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={filteredOrders}
                    renderItem={renderItem}
                    keyExtractor={(item) => item.name}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{paddingBottom: 20}}
                />
            )}
        </SafeAreaView>
    );
};

export default OrdersScreen;
