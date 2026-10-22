// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

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

import {useNavigation} from '@react-navigation/native';
import CompassIcon from '@components/compass_icon';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import DatabaseManager from '@database/manager';
import {getCurrentTeamId} from '@queries/servers/system';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import {
    fetchHotProducts,
    type HotProductsData,
    type HotProduct,
} from '../../api';

// ---- Constants ----

type TabType = 'amount' | 'quantity' | 'comprehensive';

const NOW = new Date();

// ---- Helpers ----

function formatMoney(value: number): string {
    const num = Number(value || 0);
    const absNum = Math.abs(num);
    const sign = num < 0 ? '-' : '';

    if (absNum >= 100000000) {
        return `${sign}¥${(absNum / 100000000).toFixed(2)}亿`;
    } else if (absNum >= 10000) {
        return `${sign}¥${(absNum / 10000).toFixed(2)}万`;
    } else if (absNum >= 1000) {
        return `${sign}¥${absNum.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    } else {
        return `${sign}¥${absNum.toFixed(2)}`;
    }
}

function formatQty(value: number): string {
    const num = Number(value || 0);
    const absNum = Math.abs(num);
    const sign = num < 0 ? '-' : '';

    if (absNum >= 100000000) {
        return `${sign}${(absNum / 100000000).toFixed(2)}亿`;
    } else if (absNum >= 10000) {
        return `${sign}${(absNum / 10000).toFixed(2)}万`;
    } else if (absNum >= 1000) {
        return `${sign}${absNum.toLocaleString()}`;
    } else {
        return `${sign}${absNum}`;
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
    content: {
        flex: 1,
    },

    // Filters
    filterRow: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 12,
        backgroundColor: theme.centerChannelBg,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    filterSelect: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.06),
        minWidth: 80,
    },
    filterSelectText: {
        ...typography('Body', 100),
        color: theme.centerChannelColor,
        flex: 1,
    },

    // Summary cards
    summaryRow: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 8,
    },
    summaryCard: {
        flex: 1,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderRadius: 8,
        padding: 12,
        alignItems: 'center',
    },
    summaryIcon: {
        fontSize: 20,
        marginBottom: 4,
    },
    summaryLabel: {
        ...typography('Body', 50),
        color: changeOpacity(theme.centerChannelColor, 0.64),
        marginBottom: 2,
    },
    summaryValue: {
        ...typography('Heading', 200, 'Bold'),
        color: theme.buttonBg,
    },

    // Tabs
    tabRow: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 8,
        gap: 8,
        backgroundColor: theme.centerChannelBg,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        paddingHorizontal: 8,
        borderRadius: 8,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        gap: 4,
    },
    tabActive: {
        backgroundColor: theme.buttonBg,
    },
    tabIcon: {
        fontSize: 16,
    },
    tabLabel: {
        ...typography('Body', 75, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    tabLabelActive: {
        color: theme.buttonColor,
    },

    // Formula note
    formulaNote: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: changeOpacity(theme.buttonBg, 0.08),
        gap: 8,
    },
    formulaIcon: {
        fontSize: 14,
    },
    formulaText: {
        ...typography('Body', 50),
        color: changeOpacity(theme.centerChannelColor, 0.72),
        flex: 1,
    },

    // Product list
    productList: {
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    productCard: {
        flexDirection: 'row',
        marginBottom: 12,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.02),
        borderRadius: 8,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.08),
        padding: 12,
    },
    rankBadge: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    rankBadgeTop1: {
        backgroundColor: '#FFD700',
    },
    rankBadgeTop2: {
        backgroundColor: '#C0C0C0',
    },
    rankBadgeTop3: {
        backgroundColor: '#CD7F32',
    },
    rankBadgeText: {
        ...typography('Body', 100, 'Bold'),
        color: changeOpacity(theme.centerChannelColor, 0.64),
    },
    rankBadgeEmoji: {
        fontSize: 20,
    },
    productMain: {
        flex: 1,
    },
    productHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    productName: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.centerChannelColor,
        flex: 1,
        marginRight: 8,
    },
    productValue: {
        ...typography('Body', 100, 'Bold'),
        color: theme.buttonBg,
    },

    // Progress bar
    progressBar: {
        height: 6,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
        borderRadius: 3,
        marginBottom: 8,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: theme.buttonBg,
        borderRadius: 3,
    },

    // Meta row
    metaRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    metaItem: {
        flexDirection: 'row',
        gap: 4,
    },
    metaLabel: {
        ...typography('Body', 50),
        color: changeOpacity(theme.centerChannelColor, 0.56),
    },
    metaValue: {
        ...typography('Body', 50, 'SemiBold'),
        color: theme.centerChannelColor,
    },

    // Empty and error states
    emptyText: {
        ...typography('Body', 200),
        color: changeOpacity(theme.centerChannelColor, 0.4),
        textAlign: 'center',
        paddingVertical: 48,
        paddingHorizontal: 24,
    },
    errorText: {
        ...typography('Body', 200),
        color: '#d29922',
        textAlign: 'center',
        paddingVertical: 48,
        paddingHorizontal: 24,
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
}));

// ---- Component ----

const HotProductsScreen = () => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const navigation = useNavigation();
    const style = getStyleSheet(theme);

    const [teamId, setTeamId] = useState('');
    const [data, setData] = useState<HotProductsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [year, setYear] = useState(NOW.getFullYear());
    const [month, setMonth] = useState(NOW.getMonth() + 1);
    const [activeTab, setActiveTab] = useState<TabType>('amount');
    const [showYearPicker, setShowYearPicker] = useState(false);
    const [showMonthPicker, setShowMonthPicker] = useState(false);

    // Initialize team ID
    useEffect(() => {
        const init = async () => {
            try {
                const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
                const currentTeamId = await getCurrentTeamId(database);
                setTeamId(currentTeamId);
            } catch {
                // ignore
            }
        };
        init();
    }, [serverUrl]);

    // Load data
    const load = useCallback(async () => {
        if (!teamId) return;
        setLoading(true);
        setError('');
        try {
            const lastDay = new Date(year, month, 0).getDate();
            const from = `${year}-${String(month).padStart(2, '0')}-01`;
            const to = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
            const result = await fetchHotProducts(serverUrl, teamId, from, to);
            setData(result);
        } catch (e: any) {
            setError(String(e?.message || e));
        } finally {
            setLoading(false);
        }
    }, [serverUrl, teamId, year, month]);

    useEffect(() => {
        load();
    }, [load]);

    // Calculate comprehensive scores
    const productsWithScore = useMemo(() => {
        if (!data) return [];

        const totalAmount = data.total_money;
        const totalQty = data.total_qty;

        return data.products.map((p) => {
            const amountRatio = totalAmount > 0 ? (p.total_amount / totalAmount) * 100 : 0;
            const qtyRatio = totalQty > 0 ? (p.total_qty / totalQty) * 100 : 0;
            const comprehensiveScore = (amountRatio * 0.6) + (qtyRatio * 0.4);

            return {
                ...p,
                amountRatio,
                qtyRatio,
                comprehensiveScore,
            };
        });
    }, [data]);

    // Sort by active tab
    const ranked = useMemo(() => {
        const sorted = [...productsWithScore];
        switch (activeTab) {
            case 'amount':
                sorted.sort((a, b) => b.total_amount - a.total_amount);
                break;
            case 'quantity':
                sorted.sort((a, b) => b.total_qty - a.total_qty);
                break;
            case 'comprehensive':
                sorted.sort((a, b) => b.comprehensiveScore - a.comprehensiveScore);
                break;
        }
        return sorted;
    }, [productsWithScore, activeTab]);

    // Year options
    const yearOptions = useMemo(() => {
        const options = [];
        for (let y = 2020; y <= 2030; y++) {
            options.push(y);
        }
        return options;
    }, []);

    // Month options
    const monthOptions = useMemo(() => {
        return Array.from({length: 12}, (_, i) => i + 1);
    }, []);

    // Tab definitions
    const tabs: Array<{key: TabType; label: string; icon: string}> = [
        {
            key: 'amount',
            label: intl.formatMessage({id: 'boss_dashboard.hot.tab_amount', defaultMessage: '销售金额'}),
            icon: '💰',
        },
        {
            key: 'quantity',
            label: intl.formatMessage({id: 'boss_dashboard.hot.tab_quantity', defaultMessage: '销售数量'}),
            icon: '📦',
        },
        {
            key: 'comprehensive',
            label: intl.formatMessage({id: 'boss_dashboard.hot.tab_comprehensive', defaultMessage: '综合评估'}),
            icon: '⭐',
        },
    ];

    // Render rank badge
    const renderRankBadge = (index: number) => {
        const isTop3 = index < 3;
        const badges = ['🥇', '🥈', '🥉'];
        const badgeStyles = [style.rankBadgeTop1, style.rankBadgeTop2, style.rankBadgeTop3];

        return (
            <View style={[style.rankBadge, isTop3 && badgeStyles[index]]}>
                {isTop3 ? (
                    <Text style={style.rankBadgeEmoji}>{badges[index]}</Text>
                ) : (
                    <Text style={style.rankBadgeText}>{index + 1}</Text>
                )}
            </View>
        );
    };

    // Render product card
    const renderProduct = (product: HotProduct & {
        amountRatio: number;
        qtyRatio: number;
        comprehensiveScore: number;
    }, index: number) => {
        const maxAmount = ranked[0]?.total_amount || 1;
        const maxQty = ranked[0]?.total_qty || 1;
        const maxScore = ranked[0]?.comprehensiveScore || 1;

        let progressWidth = 0;
        let displayValue = '';

        switch (activeTab) {
            case 'amount':
                progressWidth = (product.total_amount / maxAmount) * 100;
                displayValue = formatMoney(product.total_amount);
                break;
            case 'quantity':
                progressWidth = (product.total_qty / maxQty) * 100;
                displayValue = `${formatQty(product.total_qty)} ${product.uom}`;
                break;
            case 'comprehensive':
                progressWidth = (product.comprehensiveScore / maxScore) * 100;
                displayValue = `${product.comprehensiveScore.toFixed(1)}分`;
                break;
        }

        return (
            <View key={product.item_code} style={style.productCard}>
                {renderRankBadge(index)}
                <View style={style.productMain}>
                    <View style={style.productHeader}>
                        <Text style={style.productName} numberOfLines={2}>
                            {product.item_name || product.item_code}
                        </Text>
                        <Text style={style.productValue}>{displayValue}</Text>
                    </View>

                    <View style={style.progressBar}>
                        <View style={[style.progressFill, {width: `${progressWidth}%`}]}/>
                    </View>

                    <View style={style.metaRow}>
                        <View style={style.metaItem}>
                            <Text style={style.metaLabel}>
                                {intl.formatMessage({id: 'boss_dashboard.hot.meta_qty', defaultMessage: '销量'})}
                            </Text>
                            <Text style={style.metaValue}>
                                {formatQty(product.total_qty)} {product.uom}
                            </Text>
                        </View>
                        <View style={style.metaItem}>
                            <Text style={style.metaLabel}>
                                {intl.formatMessage({id: 'boss_dashboard.hot.meta_amount', defaultMessage: '金额'})}
                            </Text>
                            <Text style={style.metaValue}>{formatMoney(product.total_amount)}</Text>
                        </View>
                        <View style={style.metaItem}>
                            <Text style={style.metaLabel}>
                                {intl.formatMessage({id: 'boss_dashboard.hot.meta_orders', defaultMessage: '订单'})}
                            </Text>
                            <Text style={style.metaValue}>
                                {product.order_count}
                                {intl.formatMessage({id: 'boss_dashboard.hot.meta_orders_unit', defaultMessage: '单'})}
                            </Text>
                        </View>
                        {activeTab === 'comprehensive' && (
                            <>
                                <View style={style.metaItem}>
                                    <Text style={style.metaLabel}>
                                        {intl.formatMessage({id: 'boss_dashboard.hot.meta_amount_ratio', defaultMessage: '金额占比'})}
                                    </Text>
                                    <Text style={style.metaValue}>{product.amountRatio.toFixed(1)}%</Text>
                                </View>
                                <View style={style.metaItem}>
                                    <Text style={style.metaLabel}>
                                        {intl.formatMessage({id: 'boss_dashboard.hot.meta_qty_ratio', defaultMessage: '数量占比'})}
                                    </Text>
                                    <Text style={style.metaValue}>{product.qtyRatio.toFixed(1)}%</Text>
                                </View>
                            </>
                        )}
                    </View>
                </View>
            </View>
        );
    };

    // Loading state
    if (loading) {
        return (
            <SafeAreaView edges={['top', 'bottom']} style={style.container}>
                <View style={style.header}>
                    <TouchableOpacity style={style.backBtn} onPress={() => navigation.goBack()}>
                        <CompassIcon name='arrow-left' size={20} color={theme.sidebarText}/>
                    </TouchableOpacity>
                    <Text style={style.headerTitle}>
                        {intl.formatMessage({id: 'workbench.tab.hot_products', defaultMessage: '热销榜'})}
                    </Text>
                </View>
                <View style={style.loadingContainer}>
                    <ActivityIndicator size='large' color={theme.centerChannelColor}/>
                </View>
            </SafeAreaView>
        );
    }

    // Error state
    if (error) {
        return (
            <SafeAreaView edges={['top', 'bottom']} style={style.container}>
                <View style={style.header}>
                    <TouchableOpacity style={style.backBtn} onPress={() => navigation.goBack()}>
                        <CompassIcon name='arrow-left' size={20} color={theme.sidebarText}/>
                    </TouchableOpacity>
                    <Text style={style.headerTitle}>
                        {intl.formatMessage({id: 'workbench.tab.hot_products', defaultMessage: '热销榜'})}
                    </Text>
                </View>
                <View style={style.loadingContainer}>
                    <Text style={style.errorText}>
                        {intl.formatMessage({id: 'boss_dashboard.load_error', defaultMessage: 'Failed to load data'})}
                        {': '}
                        {error}
                    </Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView edges={['top', 'bottom']} style={style.container}>
            {/* Header */}
            <View style={style.header}>
                <TouchableOpacity style={style.backBtn} onPress={() => navigation.goBack()}>
                    <CompassIcon name='arrow-left' size={20} color={theme.sidebarText}/>
                </TouchableOpacity>
                <Text style={style.headerTitle}>
                    {intl.formatMessage({id: 'workbench.tab.hot_products', defaultMessage: '热销榜'})}
                </Text>
            </View>

            <ScrollView style={style.content}>
                {/* Time filters */}
                <View style={style.filterRow}>
                    <TouchableOpacity
                        style={style.filterSelect}
                        onPress={() => {
                            setShowYearPicker(!showYearPicker);
                            setShowMonthPicker(false);
                        }}
                    >
                        <Text style={style.filterSelectText}>
                            {year}
                            {intl.formatMessage({id: 'boss_dashboard.filter_year', defaultMessage: '年'})}
                        </Text>
                        <CompassIcon
                            name='chevron-down'
                            size={16}
                            color={theme.centerChannelColor}
                        />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={style.filterSelect}
                        onPress={() => {
                            setShowMonthPicker(!showMonthPicker);
                            setShowYearPicker(false);
                        }}
                    >
                        <Text style={style.filterSelectText}>
                            {month}
                            {intl.formatMessage({id: 'boss_dashboard.filter_month', defaultMessage: '月'})}
                        </Text>
                        <CompassIcon
                            name='chevron-down'
                            size={16}
                            color={theme.centerChannelColor}
                        />
                    </TouchableOpacity>
                </View>

                {/* Year picker dropdown */}
                {showYearPicker && (
                    <View style={style.filterRow}>
                        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, flex: 1}}>
                            {yearOptions.map((y) => (
                                <TouchableOpacity
                                    key={y}
                                    style={[
                                        style.filterSelect,
                                        y === year && {backgroundColor: theme.buttonBg},
                                    ]}
                                    onPress={() => {
                                        setYear(y);
                                        setShowYearPicker(false);
                                    }}
                                >
                                    <Text
                                        style={[
                                            style.filterSelectText,
                                            y === year && {color: theme.buttonColor},
                                        ]}
                                    >
                                        {y}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                )}

                {/* Month picker dropdown */}
                {showMonthPicker && (
                    <View style={style.filterRow}>
                        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, flex: 1}}>
                            {monthOptions.map((m) => (
                                <TouchableOpacity
                                    key={m}
                                    style={[
                                        style.filterSelect,
                                        m === month && {backgroundColor: theme.buttonBg},
                                    ]}
                                    onPress={() => {
                                        setMonth(m);
                                        setShowMonthPicker(false);
                                    }}
                                >
                                    <Text
                                        style={[
                                            style.filterSelectText,
                                            m === month && {color: theme.buttonColor},
                                        ]}
                                    >
                                        {m}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                )}

                {/* Summary cards */}
                {data && (
                    <View style={style.summaryRow}>
                        <View style={style.summaryCard}>
                            <Text style={style.summaryIcon}>📊</Text>
                            <Text style={style.summaryLabel}>
                                {intl.formatMessage({id: 'boss_dashboard.hot.total_qty', defaultMessage: '总销量'})}
                                {data.uom && ` (${data.uom})`}
                            </Text>
                            <Text style={style.summaryValue}>{formatQty(data.total_qty)}</Text>
                        </View>
                        <View style={style.summaryCard}>
                            <Text style={style.summaryIcon}>💵</Text>
                            <Text style={style.summaryLabel}>
                                {intl.formatMessage({id: 'boss_dashboard.hot.total_money', defaultMessage: '总金额'})}
                            </Text>
                            <Text style={style.summaryValue}>{formatMoney(data.total_money)}</Text>
                        </View>
                        <View style={style.summaryCard}>
                            <Text style={style.summaryIcon}>📋</Text>
                            <Text style={style.summaryLabel}>
                                {intl.formatMessage({id: 'boss_dashboard.hot.orders', defaultMessage: '订单数'})}
                            </Text>
                            <Text style={style.summaryValue}>{String(data.orders)}</Text>
                        </View>
                    </View>
                )}

                {/* Tab navigation */}
                <View style={style.tabRow}>
                    {tabs.map((tab) => (
                        <TouchableOpacity
                            key={tab.key}
                            style={[style.tab, activeTab === tab.key && style.tabActive]}
                            onPress={() => setActiveTab(tab.key)}
                        >
                            <Text style={style.tabIcon}>{tab.icon}</Text>
                            <Text style={[style.tabLabel, activeTab === tab.key && style.tabLabelActive]}>
                                {tab.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Formula note for comprehensive tab */}
                {activeTab === 'comprehensive' && (
                    <View style={style.formulaNote}>
                        <Text style={style.formulaIcon}>ℹ️</Text>
                        <Text style={style.formulaText}>
                            {intl.formatMessage({
                                id: 'boss_dashboard.hot.formula_note',
                                defaultMessage: '综合热销指数 = (销售金额占比 × 0.6) + (销售数量占比 × 0.4)',
                            })}
                        </Text>
                    </View>
                )}

                {/* Product list */}
                {!data || ranked.length === 0 ? (
                    <Text style={style.emptyText}>
                        {intl.formatMessage({id: 'boss_dashboard.hot.empty', defaultMessage: '暂无产品销售数据'})}
                    </Text>
                ) : (
                    <View style={style.productList}>
                        {ranked.map((product, index) => renderProduct(product, index))}
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
};

export default HotProductsScreen;
