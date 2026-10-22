// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * 库存分析 Screen - Mobile implementation
 * Three-tab layout: Overview (总览), Turnover (周转), Alerts (预警)
 */

import {useNavigation} from '@react-navigation/native';
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    ActivityIndicator,
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
    fetchInventory,
    fetchWarehouseList,
    type InventoryData,
    type WarehouseItem,
} from '../api';

// ---- Constants ----

const DAYS_OPTIONS = ['7', '15', '30', '60', '90'];
const DEAD_DAYS_OPTIONS = ['60', '90', '180'];
const AGING_DAYS_OPTIONS = ['60', '90', '180', '365'];

type SubTab = 'overview' | 'turnover' | 'alerts';

// ---- Helper Functions ----

function formatMoney(value: number): string {
    const num = Number(value || 0);
    const absNum = Math.abs(num);
    const sign = num < 0 ? '-' : '';

    if (absNum >= 100000000) {
        return `${sign}¥${(absNum / 100000000).toFixed(2)}亿`;
    } else if (absNum >= 10000) {
        return `${sign}¥${(absNum / 10000).toFixed(2)}万`;
    } else {
        return `${sign}¥${absNum.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    }
}

function formatQty(value: number): string {
    const num = Number(value || 0);
    if (num >= 10000) {
        return `${(num / 10000).toFixed(1)}万`;
    }
    return num.toLocaleString();
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
    backButton: {
        padding: 4,
        marginRight: 8,
    },
    headerTitle: {
        ...typography('Heading', 200, 'SemiBold'),
        color: theme.sidebarText,
        flex: 1,
    },
    tabBar: {
        flexDirection: 'row',
        backgroundColor: theme.centerChannelBg,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    tab: {
        flex: 1,
        paddingVertical: 12,
        alignItems: 'center',
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    tabActive: {
        borderBottomColor: theme.buttonBg,
    },
    tabText: {
        ...typography('Body', 75, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.56),
    },
    tabTextActive: {
        color: theme.buttonBg,
    },
    filters: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        padding: 12,
        gap: 8,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.02),
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    filterButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 4,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    filterText: {
        ...typography('Body', 50),
        color: theme.centerChannelColor,
    },
    content: {
        flex: 1,
    },
    section: {
        padding: 16,
    },
    sectionTitle: {
        ...typography('Heading', 100, 'SemiBold'),
        color: theme.centerChannelColor,
        marginBottom: 12,
    },
    kpiGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 16,
    },
    kpiCard: {
        flex: 1,
        minWidth: 140,
        padding: 12,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderRadius: 8,
    },
    kpiLabel: {
        ...typography('Body', 50),
        color: changeOpacity(theme.centerChannelColor, 0.64),
        marginBottom: 4,
    },
    kpiValue: {
        ...typography('Heading', 200, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    kpiValueGood: {
        color: theme.onlineIndicator,
    },
    kpiValueWarn: {
        color: theme.errorTextColor,
    },
    warehouseCard: {
        marginBottom: 12,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderRadius: 8,
        overflow: 'hidden',
    },
    warehouseHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    warehouseExpand: {
        marginRight: 8,
    },
    warehouseName: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.centerChannelColor,
        flex: 1,
    },
    warehouseStat: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.72),
        marginLeft: 12,
    },
    itemRow: {
        flexDirection: 'row',
        padding: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    itemName: {
        ...typography('Body', 75),
        color: theme.centerChannelColor,
        flex: 2,
    },
    itemStat: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.72),
        flex: 1,
        textAlign: 'right',
    },
    trendRow: {
        flexDirection: 'row',
        padding: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    trendMonth: {
        ...typography('Body', 75),
        color: theme.centerChannelColor,
        flex: 1,
    },
    trendStat: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.72),
        flex: 1,
        textAlign: 'right',
    },
    alertCard: {
        padding: 12,
        marginBottom: 8,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderRadius: 8,
    },
    alertTitle: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.centerChannelColor,
        marginBottom: 4,
    },
    alertMeta: {
        ...typography('Body', 50),
        color: changeOpacity(theme.centerChannelColor, 0.64),
    },
    alertBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    badgeDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 8,
    },
    badgeDotRed: {
        backgroundColor: theme.errorTextColor,
    },
    badgeDotOrange: {
        backgroundColor: theme.awayIndicator,
    },
    loading: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    error: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
    },
    errorText: {
        ...typography('Body', 100),
        color: theme.errorTextColor,
        textAlign: 'center',
    },
    empty: {
        ...typography('Body', 100),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        textAlign: 'center',
        padding: 32,
    },
}));

// ---- Component ----

const InventoryScreen = () => {
    const intl = useIntl();
    const theme = useTheme();
    const navigation = useNavigation();
    const serverUrl = useServerUrl();
    const styles = getStyleSheet(theme);

    const [data, setData] = useState<InventoryData | null>(null);
    const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [days, setDays] = useState('30');
    const [deadDays, setDeadDays] = useState('90');
    const [agingDays, setAgingDays] = useState('90');
    const [warehouse, setWarehouse] = useState('');
    const [activeTab, setActiveTab] = useState<SubTab>('overview');
    const [expandedWh, setExpandedWh] = useState<string | null>(null);

    // Load warehouse list
    useEffect(() => {
        fetchWarehouseList(serverUrl).then(setWarehouses).catch(() => setWarehouses([]));
    }, [serverUrl]);

    // Load inventory data
    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const database = DatabaseManager.serverDatabases[serverUrl];
            if (!database) {
                throw new Error('Database not found');
            }
            const teamId = await getCurrentTeamId(database);

            const result = await fetchInventory(
                serverUrl,
                teamId,
                days,
                deadDays,
                agingDays,
                warehouse,
            );
            setData(result);
        } catch (e: any) {
            setError(String(e?.message || e));
        } finally {
            setLoading(false);
        }
    }, [serverUrl, days, deadDays, agingDays, warehouse]);

    useEffect(() => {
        load();
    }, [load]);

    // Calculate alert counts
    const alertCounts = useMemo(() => {
        if (!data) {
            return {dead: 0, lowStock: 0};
        }
        return {
            dead: data.dead_stock.length,
            lowStock: data.low_stock.length,
        };
    }, [data]);

    const handleBack = useCallback(() => {
        navigation.goBack();
    }, [navigation]);

    const cycleDays = useCallback(() => {
        const currentIndex = DAYS_OPTIONS.indexOf(days);
        const nextIndex = (currentIndex + 1) % DAYS_OPTIONS.length;
        setDays(DAYS_OPTIONS[nextIndex]);
    }, [days]);

    const cycleDeadDays = useCallback(() => {
        const currentIndex = DEAD_DAYS_OPTIONS.indexOf(deadDays);
        const nextIndex = (currentIndex + 1) % DEAD_DAYS_OPTIONS.length;
        setDeadDays(DEAD_DAYS_OPTIONS[nextIndex]);
    }, [deadDays]);

    const cycleAgingDays = useCallback(() => {
        const currentIndex = AGING_DAYS_OPTIONS.indexOf(agingDays);
        const nextIndex = (currentIndex + 1) % AGING_DAYS_OPTIONS.length;
        setAgingDays(AGING_DAYS_OPTIONS[nextIndex]);
    }, [agingDays]);

    const cycleWarehouse = useCallback(() => {
        if (warehouses.length === 0) {
            return;
        }
        const currentIndex = warehouse ? warehouses.findIndex((w) => w.name === warehouse) : -1;
        const nextIndex = (currentIndex + 1) % (warehouses.length + 1);
        setWarehouse(nextIndex === 0 ? '' : warehouses[nextIndex - 1].name);
    }, [warehouse, warehouses]);

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.loading}>
                    <ActivityIndicator size='large' color={theme.buttonBg}/>
                </View>
            </SafeAreaView>
        );
    }

    if (error) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity style={styles.backButton} onPress={handleBack}>
                        <CompassIcon name='arrow-left' size={24} color={theme.sidebarText}/>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>
                        {intl.formatMessage({id: 'workbench.tab.inventory', defaultMessage: '库存分析'})}
                    </Text>
                </View>
                <View style={styles.error}>
                    <Text style={styles.errorText}>{error}</Text>
                </View>
            </SafeAreaView>
        );
    }

    if (!data) {
        return null;
    }

    const {summary} = data;

    const tabs: Array<{key: SubTab; label: string; icon: string}> = [
        {key: 'overview', label: intl.formatMessage({id: 'workbench.inv.tab_overview', defaultMessage: '总览'}), icon: '📊'},
        {key: 'turnover', label: intl.formatMessage({id: 'workbench.inv.tab_turnover', defaultMessage: '周转'}), icon: '⚡'},
        {key: 'alerts', label: intl.formatMessage({id: 'workbench.inv.tab_alerts', defaultMessage: '预警'}), icon: '⚠️'},
    ];

    // Overview Tab
    const renderOverview = () => (
        <ScrollView style={styles.content}>
            <View style={styles.section}>
                <View style={styles.kpiGrid}>
                    <View style={styles.kpiCard}>
                        <Text style={styles.kpiLabel}>
                            {intl.formatMessage({id: 'boss_dashboard.inv.total_value', defaultMessage: '库存总值'})}
                        </Text>
                        <Text style={styles.kpiValue}>{formatMoney(summary.total_stock_value)}</Text>
                    </View>
                    <View style={styles.kpiCard}>
                        <Text style={styles.kpiLabel}>
                            {intl.formatMessage({id: 'boss_dashboard.inv.overall_turnover', defaultMessage: '整体周转'})}
                        </Text>
                        <Text style={styles.kpiValue}>
                            {summary.overall_turnover_days === null
                                ? '—'
                                : intl.formatMessage({id: 'boss_dashboard.inv.days_value', defaultMessage: '{days}天'}, {days: summary.overall_turnover_days.toFixed(1)})}
                        </Text>
                    </View>
                    <View style={styles.kpiCard}>
                        <Text style={styles.kpiLabel}>
                            {intl.formatMessage({id: 'boss_dashboard.inv.health', defaultMessage: '健康度'})}
                        </Text>
                        <Text style={[styles.kpiValue, summary.healthy_pct >= 70 ? styles.kpiValueGood : styles.kpiValueWarn]}>
                            {`${summary.healthy_pct.toFixed(1)}%`}
                        </Text>
                    </View>
                    <View style={styles.kpiCard}>
                        <Text style={styles.kpiLabel}>
                            {intl.formatMessage({id: 'boss_dashboard.inv.dead_value', defaultMessage: '呆滞价值'})}
                        </Text>
                        <Text style={[styles.kpiValue, summary.dead_value > 0 && styles.kpiValueWarn]}>
                            {formatMoney(summary.dead_value)}
                        </Text>
                    </View>
                </View>

                <Text style={styles.sectionTitle}>
                    {intl.formatMessage({id: 'workbench.inv.warehouses', defaultMessage: '仓库库存'})}
                </Text>
                {data.warehouses.map((w) => (
                    <View key={w.warehouse} style={styles.warehouseCard}>
                        <TouchableOpacity
                            style={styles.warehouseHeader}
                            onPress={() => setExpandedWh(expandedWh === w.warehouse ? null : w.warehouse)}
                        >
                            <CompassIcon
                                name={expandedWh === w.warehouse ? 'chevron-down' : 'chevron-right'}
                                size={20}
                                color={theme.centerChannelColor}
                                style={styles.warehouseExpand}
                            />
                            <Text style={styles.warehouseName}>{w.warehouse}</Text>
                            <Text style={styles.warehouseStat}>{formatMoney(w.stock_value)}</Text>
                            <Text style={styles.warehouseStat}>{intl.formatMessage({id: 'workbench.inventory.item_count', defaultMessage: '{count}品'}, {count: w.item_count})}</Text>
                            <Text style={styles.warehouseStat}>
                                {w.turnover_days === null ? '—' : intl.formatMessage({id: 'workbench.inventory.days', defaultMessage: '{days}天'}, {days: w.turnover_days})}
                            </Text>
                        </TouchableOpacity>
                        {expandedWh === w.warehouse && w.items.length > 0 && (
                            <View>
                                {w.items.slice(0, 10).map((item) => (
                                    <View key={item.item_code} style={styles.itemRow}>
                                        <Text style={styles.itemName} numberOfLines={1}>
                                            {item.item_name || item.item_code}
                                        </Text>
                                        <Text style={styles.itemStat}>{formatQty(item.qty)}</Text>
                                        <Text style={styles.itemStat}>{formatMoney(item.stock_value)}</Text>
                                        <Text style={styles.itemStat}>
                                            {item.turnover_days === null ? '—' : intl.formatMessage({id: 'workbench.inventory.days', defaultMessage: '{days}天'}, {days: item.turnover_days})}
                                        </Text>
                                    </View>
                                ))}
                                {w.items.length > 10 && (
                                    <Text style={styles.empty}>
                                        {intl.formatMessage({id: 'workbench.inv.and_more', defaultMessage: '还有 {count} 个...'}, {count: w.items.length - 10})}
                                    </Text>
                                )}
                            </View>
                        )}
                    </View>
                ))}
            </View>
        </ScrollView>
    );

    // Turnover Tab
    const renderTurnover = () => (
        <ScrollView style={styles.content}>
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>{intl.formatMessage({id: 'workbench.inventory.monthly_trend', defaultMessage: '月度周转趋势'})}</Text>
                {data.trend.length > 0 ? (
                    <View>
                        {data.trend.filter((t) => t.out_value > 0).map((t) => (
                            <View key={t.month} style={styles.trendRow}>
                                <Text style={styles.trendMonth}>{t.month}</Text>
                                <Text style={styles.trendStat}>{formatMoney(t.stock_value)}</Text>
                                <Text style={styles.trendStat}>{formatMoney(t.out_value)}</Text>
                                <Text style={styles.trendStat}>
                                    {t.turnover_days === null ? '—' : `${t.turnover_days}天`}
                                </Text>
                            </View>
                        ))}
                    </View>
                ) : (
                    <Text style={styles.empty}>{intl.formatMessage({id: 'workbench.inventory.empty', defaultMessage: '暂无数据'})}</Text>
                )}

                <Text style={[styles.sectionTitle, {marginTop: 24}]}>{intl.formatMessage({id: 'workbench.inventory.all_items_turnover', defaultMessage: '全部物料周转'})}</Text>
                {data.items.length === 0 ? (
                    <Text style={styles.empty}>{intl.formatMessage({id: 'workbench.inventory.empty', defaultMessage: '暂无数据'})}</Text>
                ) : (
                    <View>
                        {data.items.slice(0, 20).map((item) => (
                            <View key={item.item_code} style={styles.itemRow}>
                                <Text style={styles.itemName} numberOfLines={1}>
                                    {item.item_name || item.item_code}
                                </Text>
                                <Text style={styles.itemStat}>{formatQty(item.qty)}</Text>
                                <Text style={styles.itemStat}>{formatMoney(item.stock_value)}</Text>
                                <Text style={styles.itemStat}>
                                    {item.turnover_days === null ? '—' : intl.formatMessage({id: 'workbench.inventory.days', defaultMessage: '{days}天'}, {days: item.turnover_days})}
                                </Text>
                            </View>
                        ))}
                        {data.items.length > 20 && (
                            <Text style={styles.empty}>
                                {intl.formatMessage({id: 'workbench.inv.and_more', defaultMessage: '还有 {count} 个...'}, {count: data.items.length - 20})}
                            </Text>
                        )}
                    </View>
                )}
            </View>
        </ScrollView>
    );

    // Alerts Tab
    const renderAlerts = () => (
        <ScrollView style={styles.content}>
            <View style={styles.section}>
                <View style={styles.alertBadge}>
                    <View style={[styles.badgeDot, styles.badgeDotRed]}/>
                    <Text style={styles.alertTitle}>
                        {intl.formatMessage({id: 'boss_dashboard.inv.dead_stock', defaultMessage: '呆滞库存'})}
                        {intl.formatMessage({id: 'workbench.inventory.dead_stock_count', defaultMessage: ' ({count}品 · {value})'}, {count: data.dead_stock.length, value: formatMoney(summary.dead_value)})}
                    </Text>
                </View>
                {data.dead_stock.length === 0 ? (
                    <Text style={styles.empty}>
                        {intl.formatMessage({id: 'boss_dashboard.inv.dead_empty', defaultMessage: '无呆滞库存'})}
                    </Text>
                ) : (
                    data.dead_stock.slice(0, 10).map((d) => (
                        <View key={`${d.item_code}-${d.warehouse}`} style={styles.alertCard}>
                            <Text style={styles.alertTitle}>
                                {d.item_name || d.item_code}
                            </Text>
                            <Text style={styles.alertMeta}>
                                {d.warehouse}
                                {` · ${d.never_out
                                    ? intl.formatMessage({id: 'boss_dashboard.inv.never_out', defaultMessage: '从未出库'})
                                    : intl.formatMessage({id: 'boss_dashboard.inv.days_no_out', defaultMessage: '{days}天无出库'}, {days: String(d.days_since_out)})}`}
                                {` · ${formatQty(d.qty)} · ${formatMoney(d.stock_value)}`}
                            </Text>
                        </View>
                    ))
                )}
                {data.dead_stock.length > 10 && (
                    <Text style={styles.empty}>
                        {intl.formatMessage({id: 'workbench.inv.and_more', defaultMessage: '还有 {count} 个...'}, {count: data.dead_stock.length - 10})}
                    </Text>
                )}

                <View style={[styles.alertBadge, {marginTop: 24}]}>
                    <View style={[styles.badgeDot, styles.badgeDotOrange]}/>
                    <Text style={styles.alertTitle}>
                        {intl.formatMessage({id: 'boss_dashboard.inv.low_stock', defaultMessage: '低于安全库存'})}
                        {intl.formatMessage({id: 'workbench.inventory.low_stock_count', defaultMessage: ' ({count}品)'}, {count: data.low_stock.length})}
                    </Text>
                </View>
                {data.low_stock.length === 0 ? (
                    <Text style={styles.empty}>
                        {intl.formatMessage({id: 'boss_dashboard.inv.low_empty', defaultMessage: '所有物料均高于安全库存'})}
                    </Text>
                ) : (
                    data.low_stock.map((l) => (
                        <View key={`${l.item_code}-${l.warehouse}`} style={styles.alertCard}>
                            <Text style={styles.alertTitle}>
                                {l.item_name || l.item_code}
                            </Text>
                            <Text style={styles.alertMeta}>
                                {l.warehouse}
                                {` · ${intl.formatMessage({id: 'boss_dashboard.inv.actual', defaultMessage: '实际'})} ${formatQty(l.actual)} / ${intl.formatMessage({id: 'boss_dashboard.inv.safety', defaultMessage: '安全'})} ${formatQty(l.safety)}`}
                                {` · ${intl.formatMessage({id: 'boss_dashboard.inv.shortage', defaultMessage: '缺口'})} ${formatQty(l.shortage)}`}
                            </Text>
                        </View>
                    ))
                )}
            </View>
        </ScrollView>
    );

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={handleBack}>
                    <CompassIcon name='arrow-left' size={24} color={theme.sidebarText}/>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>
                    {intl.formatMessage({id: 'workbench.tab.inventory', defaultMessage: '库存分析'})}
                </Text>
            </View>

            <View style={styles.tabBar}>
                {tabs.map((tab) => (
                    <TouchableOpacity
                        key={tab.key}
                        style={[styles.tab, activeTab === tab.key && styles.tabActive]}
                        onPress={() => setActiveTab(tab.key)}
                    >
                        <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                            {`${tab.icon} ${tab.label}`}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            <View style={styles.filters}>
                {warehouses.length > 0 && (
                    <TouchableOpacity style={styles.filterButton} onPress={cycleWarehouse}>
                        <Text style={styles.filterText}>
                            {warehouse ? warehouses.find((w) => w.name === warehouse)?.warehouse_name || intl.formatMessage({id: 'workbench.inventory.all_warehouses', defaultMessage: '全部仓库'}) : intl.formatMessage({id: 'workbench.inventory.all_warehouses', defaultMessage: '全部仓库'})}
                        </Text>
                    </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.filterButton} onPress={cycleDays}>
                    <Text style={styles.filterText}>{intl.formatMessage({id: 'workbench.inventory.turnover_days', defaultMessage: '周转 {days}天'}, {days})}</Text>
                </TouchableOpacity>
                {activeTab !== 'turnover' && (
                    <>
                        <TouchableOpacity style={styles.filterButton} onPress={cycleDeadDays}>
                            <Text style={styles.filterText}>{intl.formatMessage({id: 'workbench.inventory.dead_days', defaultMessage: '呆滞 ≥{days}天'}, {days: deadDays})}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.filterButton} onPress={cycleAgingDays}>
                            <Text style={styles.filterText}>{intl.formatMessage({id: 'workbench.inventory.aging_days', defaultMessage: '库龄 >{days}天'}, {days: agingDays})}</Text>
                        </TouchableOpacity>
                    </>
                )}
            </View>

            {activeTab === 'overview' && renderOverview()}
            {activeTab === 'turnover' && renderTurnover()}
            {activeTab === 'alerts' && renderAlerts()}
        </SafeAreaView>
    );
};

export default InventoryScreen;
