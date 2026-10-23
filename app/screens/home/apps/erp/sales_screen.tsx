// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useNavigation} from '@react-navigation/native';
import React, {useCallback, useEffect, useState} from 'react';
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

import {fetchSales, type SalesData, type Salesperson, type SalesCustomer} from '../api';

// ---- Helpers ----

const NOW = new Date();
type PeriodType = 'year' | 'half' | 'quarter' | 'month';

function formatMoney(v: number): string {
    const num = Number(v || 0);
    const absNum = Math.abs(num);
    const sign = num < 0 ? '-' : '';

    if (absNum >= 100000000) {
        return `${sign}¥${(absNum / 100000000).toFixed(2)}亿`;
    } else if (absNum >= 10000) {
        return `${sign}¥${(absNum / 10000).toFixed(2)}万`;
    } else if (absNum >= 1000) {
        return `${sign}¥${absNum.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    }
    return `${sign}¥${absNum.toFixed(2)}`;
}

function getRankIcon(rank: number): string {
    switch (rank) {
    case 1:
        return '🥇';
    case 2:
        return '🥈';
    case 3:
        return '🥉';
    default:
        return `${rank}`;
    }
}

function getDateRange(periodType: PeriodType, year: number, month: number, quarter: number, halfYear: number): {from: string; to: string} {
    switch (periodType) {
    case 'year':
        return {from: `${year}-01-01`, to: `${year}-12-31`};
    case 'half':
        if (halfYear === 1) {
            return {from: `${year}-01-01`, to: `${year}-06-30`};
        }
        return {from: `${year}-07-01`, to: `${year}-12-31`};
    case 'quarter': {
        const qStartMonth = (quarter - 1) * 3 + 1;
        const qEndMonth = quarter * 3;
        const qEndDay = new Date(year, qEndMonth, 0).getDate();
        return {
            from: `${year}-${String(qStartMonth).padStart(2, '0')}-01`,
            to: `${year}-${String(qEndMonth).padStart(2, '0')}-${qEndDay}`,
        };
    }
    case 'month':
    default: {
        const lastDay = new Date(year, month, 0).getDate();
        return {
            from: `${year}-${String(month).padStart(2, '0')}-01`,
            to: `${year}-${String(month).padStart(2, '0')}-${lastDay}`,
        };
    }
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
    headerTitle: {
        ...typography('Heading', 200, 'SemiBold'),
        color: theme.sidebarText,
        flex: 1,
    },
    headerBtn: {
        padding: 8,
    },
    filterBar: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
        gap: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    filterSelect: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 6,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
    },
    filterSelectText: {
        ...typography('Body', 75),
        color: theme.centerChannelColor,
    },
    summaryCard: {
        marginHorizontal: 12,
        marginVertical: 10,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.03),
        borderRadius: 10,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.08),
        padding: 14,
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    summaryItem: {
        flex: 1,
        alignItems: 'center',
        paddingHorizontal: 4,
    },
    summaryLabel: {
        ...typography('Body', 50),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginBottom: 4,
    },
    summaryValue: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    textGreen: {
        color: '#2ea043',
    },
    textRed: {
        color: theme.errorTextColor,
    },
    content: {
        flex: 1,
    },
    sectionTitle: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.centerChannelColor,
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 8,
    },
    salespersonCard: {
        marginHorizontal: 12,
        marginVertical: 4,
        backgroundColor: theme.centerChannelBg,
        borderRadius: 8,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.1),
        overflow: 'hidden',
    },
    salespersonRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 12,
    },
    salespersonRowClickable: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.02),
    },
    rankCol: {
        width: 40,
        alignItems: 'center',
    },
    rankText: {
        ...typography('Heading', 200, 'Bold'),
        color: theme.centerChannelColor,
    },
    nameCol: {
        flex: 1,
        ...typography('Body', 100, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    amountCols: {
        flexDirection: 'row',
        gap: 12,
    },
    amountCol: {
        alignItems: 'flex-end',
        minWidth: 60,
    },
    amountLabel: {
        ...typography('Body', 25),
        color: changeOpacity(theme.centerChannelColor, 0.4),
        marginBottom: 2,
    },
    amountValue: {
        ...typography('Body', 75, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    expandIcon: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.4),
        marginLeft: 4,
    },
    customerSection: {
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.08),
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.02),
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    customerHeader: {
        flexDirection: 'row',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    customerRow: {
        flexDirection: 'row',
        paddingHorizontal: 8,
        paddingVertical: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.04),
    },
    customerNameCol: {
        flex: 1.5,
        ...typography('Body', 75),
        color: theme.centerChannelColor,
    },
    customerCol: {
        flex: 1,
        alignItems: 'flex-end',
        ...typography('Body', 75),
        color: theme.centerChannelColor,
    },
    customerHeaderCol: {
        ...typography('Body', 50, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.56),
    },
    colHeaderName: {
        flex: 1.5,
    },
    colHeader: {
        flex: 1,
        alignItems: 'flex-end',
    },
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
        paddingHorizontal: 24,
    },
    emptyIcon: {
        marginBottom: 16,
    },
    emptyText: {
        ...typography('Body', 200),
        color: changeOpacity(theme.centerChannelColor, 0.4),
        textAlign: 'center',
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    errorBanner: {
        ...typography('Body', 75),
        color: theme.errorTextColor,
        padding: 12,
        backgroundColor: changeOpacity(theme.errorTextColor, 0.08),
    },
}));

// ---- Salesperson Row Component ----

type SalespersonRowProps = {
    sp: Salesperson;
    rank: number;
    isExpanded: boolean;
    onToggle: () => void;
    style: ReturnType<typeof getStyleSheet>;
};

const SalespersonRow = ({sp, rank, isExpanded, onToggle, style}: SalespersonRowProps) => {
    const intl = useIntl();
    const hasCustomers = sp.customers && sp.customers.length > 0;

    return (
        <View style={style.salespersonCard}>
            <TouchableOpacity
                style={[style.salespersonRow, hasCustomers && style.salespersonRowClickable]}
                onPress={hasCustomers ? onToggle : undefined}
                activeOpacity={hasCustomers ? 0.7 : 1}
            >
                <View style={style.rankCol}>
                    <Text style={style.rankText}>{getRankIcon(rank)}</Text>
                </View>
                <Text style={style.nameCol} numberOfLines={1}>
                    {sp.display_name || sp.name}
                </Text>
                <View style={style.amountCols}>
                    <View style={style.amountCol}>
                        <Text style={style.amountLabel}>{intl.formatMessage({id: 'workbench.sales.order_count', defaultMessage: '订单'})}</Text>
                        <Text style={style.amountValue}>{sp.order_count}</Text>
                    </View>
                    <View style={style.amountCol}>
                        <Text style={style.amountLabel}>{intl.formatMessage({id: 'workbench.sales.total_amount', defaultMessage: '金额'})}</Text>
                        <Text style={style.amountValue}>{formatMoney(sp.order_amount)}</Text>
                    </View>
                    <View style={style.amountCol}>
                        <Text style={style.amountLabel}>{intl.formatMessage({id: 'workbench.sales.paid_amount', defaultMessage: '已收款'})}</Text>
                        <Text style={[style.amountValue, style.textGreen]}>{formatMoney(sp.paid_amount)}</Text>
                    </View>
                    <View style={style.amountCol}>
                        <Text style={style.amountLabel}>{intl.formatMessage({id: 'workbench.sales.outstanding', defaultMessage: '未收款'})}</Text>
                        <View style={{flexDirection: 'row', alignItems: 'center'}}>
                            <Text style={[style.amountValue, style.textRed]}>{formatMoney(sp.outstanding_amount)}</Text>
                            {hasCustomers && (
                                <Text style={style.expandIcon}>{isExpanded ? '▼' : '▶'}</Text>
                            )}
                        </View>
                    </View>
                </View>
            </TouchableOpacity>

            {isExpanded && hasCustomers && (
                <View style={style.customerSection}>
                    <View style={style.customerHeader}>
                        <Text style={[style.customerHeaderCol, style.colHeaderName]}>{intl.formatMessage({id: 'workbench.sales.customer', defaultMessage: '客户'})}</Text>
                        <Text style={[style.customerHeaderCol, style.colHeader]}>{intl.formatMessage({id: 'workbench.sales.order_count', defaultMessage: '订单'})}</Text>
                        <Text style={[style.customerHeaderCol, style.colHeader]}>{intl.formatMessage({id: 'workbench.sales.total_amount', defaultMessage: '金额'})}</Text>
                        <Text style={[style.customerHeaderCol, style.colHeader]}>{intl.formatMessage({id: 'workbench.sales.paid_amount', defaultMessage: '已收款'})}</Text>
                        <Text style={[style.customerHeaderCol, style.colHeader]}>{intl.formatMessage({id: 'workbench.sales.outstanding', defaultMessage: '未收款'})}</Text>
                    </View>
                    {sp.customers.map((c: SalesCustomer) => (
                        <View key={c.customer} style={style.customerRow}>
                            <Text style={style.customerNameCol} numberOfLines={1}>
                                {c.customer_name || c.customer}
                            </Text>
                            <Text style={style.customerCol}>{c.order_count}</Text>
                            <Text style={style.customerCol}>{formatMoney(c.order_amount)}</Text>
                            <Text style={[style.customerCol, style.textGreen]}>{formatMoney(c.paid_amount)}</Text>
                            <Text style={[style.customerCol, style.textRed]}>{formatMoney(c.outstanding_amount)}</Text>
                        </View>
                    ))}
                </View>
            )}
        </View>
    );
};

// ---- Main Screen ----

const SalesScreen = () => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const navigation = useNavigation();
    const style = getStyleSheet(theme);

    const [teamId, setTeamId] = useState('');
    const [periodType, setPeriodType] = useState<PeriodType>('month');
    const [year, setYear] = useState(NOW.getFullYear());
    const [month, setMonth] = useState(NOW.getMonth() + 1);
    const [quarter, setQuarter] = useState(Math.floor(NOW.getMonth() / 3) + 1);
    const [halfYear, setHalfYear] = useState(NOW.getMonth() < 6 ? 1 : 2);
    const [data, setData] = useState<SalesData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [expandedPerson, setExpandedPerson] = useState<string | null>(null);

    // Init: load team ID
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

    // Load data
    const loadData = useCallback(async () => {
        if (!teamId) return;
        setLoading(true);
        setError('');
        try {
            const {from, to} = getDateRange(periodType, year, month, quarter, halfYear);
            const result = await fetchSales(serverUrl, teamId, undefined, from, to);
            setData(result);
        } catch (e: any) {
            setError(String(e?.message || e));
        } finally {
            setLoading(false);
        }
    }, [serverUrl, teamId, periodType, year, month, quarter, halfYear]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleBack = useCallback(() => {
        navigation.goBack();
    }, [navigation]);

    const togglePerson = useCallback((name: string) => {
        setExpandedPerson((prev) => (prev === name ? null : name));
    }, []);

    // Period type options
    const periodOptions: {value: PeriodType; label: string}[] = [
        {value: 'year', label: intl.formatMessage({id: 'workbench.filter.year', defaultMessage: '年'})},
        {value: 'half', label: intl.formatMessage({id: 'workbench.filter.half_year', defaultMessage: '半年'})},
        {value: 'quarter', label: intl.formatMessage({id: 'workbench.filter.quarter', defaultMessage: '季度'})},
        {value: 'month', label: intl.formatMessage({id: 'workbench.filter.month', defaultMessage: '月'})},
    ];

    // Year options
    const yearOptions = [];
    for (let y = 2024; y <= 2030; y++) {
        yearOptions.push(y);
    }

    // Loading state
    if (loading && !data) {
        return (
            <SafeAreaView edges={['top', 'bottom']} style={style.container}>
                <View style={style.header}>
                    <TouchableOpacity style={style.headerBtn} onPress={handleBack}>
                        <CompassIcon name='arrow-left' size={20} color={theme.sidebarText}/>
                    </TouchableOpacity>
                    <Text style={style.headerTitle}>
                        {intl.formatMessage({id: 'workbench.sales.title', defaultMessage: '销售统计'})}
                    </Text>
                    <View style={style.headerBtn}/>
                </View>
                <View style={style.loadingContainer}>
                    <ActivityIndicator size='large' color={theme.centerChannelColor}/>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView edges={['top', 'bottom']} style={style.container}>
            {/* Header */}
            <View style={style.header}>
                <TouchableOpacity style={style.headerBtn} onPress={handleBack}>
                    <CompassIcon name='arrow-left' size={20} color={theme.sidebarText}/>
                </TouchableOpacity>
                <Text style={style.headerTitle}>
                    {intl.formatMessage({id: 'workbench.sales.title', defaultMessage: '销售统计'})}
                </Text>
                <TouchableOpacity style={style.headerBtn} onPress={loadData}>
                    <CompassIcon name='refresh' size={20} color={theme.sidebarText}/>
                </TouchableOpacity>
            </View>

            {/* Filter bar */}
            <View style={style.filterBar}>
                {/* Year selector */}
                <ScrollView horizontal={true} showsHorizontalScrollIndicator={false} style={{maxHeight: 36}}>
                    <View style={{flexDirection: 'row', gap: 6}}>
                        {yearOptions.map((y) => (
                            <TouchableOpacity
                                key={y}
                                style={[
                                    style.filterSelect,
                                    year === y && {backgroundColor: theme.buttonBg, borderColor: theme.buttonBg},
                                ]}
                                onPress={() => setYear(y)}
                            >
                                <Text style={[
                                    style.filterSelectText,
                                    year === y && {color: theme.buttonColor},
                                ]}>
                                    {y}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </ScrollView>

                {/* Period type selector */}
                <View style={{flexDirection: 'row', gap: 6, flexWrap: 'wrap'}}>
                    {periodOptions.map((opt) => (
                        <TouchableOpacity
                            key={opt.value}
                            style={[
                                style.filterSelect,
                                periodType === opt.value && {backgroundColor: theme.buttonBg, borderColor: theme.buttonBg},
                            ]}
                            onPress={() => setPeriodType(opt.value)}
                        >
                            <Text style={[
                                style.filterSelectText,
                                periodType === opt.value && {color: theme.buttonColor},
                            ]}>
                                {opt.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Half year selector */}
                {periodType === 'half' && (
                    <View style={{flexDirection: 'row', gap: 6}}>
                        {[
                            {value: 1, label: intl.formatMessage({id: 'workbench.filter.half_year_first', defaultMessage: '上半年'})},
                            {value: 2, label: intl.formatMessage({id: 'workbench.filter.half_year_second', defaultMessage: '下半年'})}
                        ].map((opt) => (
                            <TouchableOpacity
                                key={opt.value}
                                style={[
                                    style.filterSelect,
                                    halfYear === opt.value && {backgroundColor: theme.buttonBg, borderColor: theme.buttonBg},
                                ]}
                                onPress={() => setHalfYear(opt.value)}
                            >
                                <Text style={[
                                    style.filterSelectText,
                                    halfYear === opt.value && {color: theme.buttonColor},
                                ]}>
                                    {opt.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}

                {/* Quarter selector */}
                {periodType === 'quarter' && (
                    <View style={{flexDirection: 'row', gap: 6}}>
                        {[1, 2, 3, 4].map((q) => (
                            <TouchableOpacity
                                key={q}
                                style={[
                                    style.filterSelect,
                                    quarter === q && {backgroundColor: theme.buttonBg, borderColor: theme.buttonBg},
                                ]}
                                onPress={() => setQuarter(q)}
                            >
                                <Text style={[
                                    style.filterSelectText,
                                    quarter === q && {color: theme.buttonColor},
                                ]}>
                                    Q{q}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}

                {/* Month selector */}
                {periodType === 'month' && (
                    <ScrollView horizontal={true} showsHorizontalScrollIndicator={false} style={{maxHeight: 36}}>
                        <View style={{flexDirection: 'row', gap: 6}}>
                            {Array.from({length: 12}, (_, i) => i + 1).map((m) => (
                                <TouchableOpacity
                                    key={m}
                                    style={[
                                        style.filterSelect,
                                        month === m && {backgroundColor: theme.buttonBg, borderColor: theme.buttonBg},
                                    ]}
                                    onPress={() => setMonth(m)}
                                >
                                    <Text style={[
                                        style.filterSelectText,
                                        month === m && {color: theme.buttonColor},
                                    ]}>
                                        {m}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </ScrollView>
                )}
            </View>

            {/* Content */}
            <ScrollView style={style.content}>
                {error ? <Text style={style.errorBanner}>{error}</Text> : null}

                {data && (
                    <>
                        {/* Summary KPIs */}
                        <View style={style.summaryCard}>
                            <View style={style.summaryRow}>
                                <View style={style.summaryItem}>
                                    <Text style={style.summaryLabel}>
                                        {intl.formatMessage({id: 'workbench.sales.order_count', defaultMessage: '订单数'})}
                                    </Text>
                                    <Text style={style.summaryValue}>{data.totals.order_count}</Text>
                                </View>
                                <View style={style.summaryItem}>
                                    <Text style={style.summaryLabel}>
                                        {intl.formatMessage({id: 'workbench.sales.total_amount', defaultMessage: '总金额'})}
                                    </Text>
                                    <Text style={style.summaryValue}>{formatMoney(data.totals.order_amount)}</Text>
                                </View>
                                <View style={style.summaryItem}>
                                    <Text style={style.summaryLabel}>
                                        {intl.formatMessage({id: 'workbench.sales.paid_amount', defaultMessage: '已收款'})}
                                    </Text>
                                    <Text style={[style.summaryValue, style.textGreen]}>
                                        {formatMoney(data.totals.paid_amount)}
                                    </Text>
                                </View>
                                <View style={style.summaryItem}>
                                    <Text style={style.summaryLabel}>
                                        {intl.formatMessage({id: 'workbench.sales.outstanding', defaultMessage: '未收款'})}
                                    </Text>
                                    <Text style={[style.summaryValue, style.textRed]}>
                                        {formatMoney(data.totals.outstanding_amount)}
                                    </Text>
                                </View>
                            </View>
                        </View>

                        {/* Salesperson ranking */}
                        <Text style={style.sectionTitle}>
                            {intl.formatMessage({id: 'workbench.sales.ranking', defaultMessage: '销售员排行'})}
                        </Text>

                        {data.salespeople.length === 0 ? (
                            <View style={style.emptyContainer}>
                                <CompassIcon
                                    name='chart-line'
                                    size={64}
                                    color={changeOpacity(theme.centerChannelColor, 0.2)}
                                    style={style.emptyIcon}
                                />
                                <Text style={style.emptyText}>
                                    {intl.formatMessage({id: 'workbench.sales.empty', defaultMessage: '暂无销售数据'})}
                                </Text>
                            </View>
                        ) : (
                            data.salespeople.map((sp, index) => (
                                <SalespersonRow
                                    key={sp.name}
                                    sp={sp}
                                    rank={index + 1}
                                    isExpanded={expandedPerson === sp.name}
                                    onToggle={() => togglePerson(sp.name)}
                                    style={style}
                                />
                            ))
                        )}
                    </>
                )}

                {/* Bottom padding */}
                <View style={{height: 20}}/>
            </ScrollView>
        </SafeAreaView>
    );
};

export default SalesScreen;
