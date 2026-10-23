// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

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
    fetchCashJournal,
    type CashJournalData,
    type CashJournalEntry,
} from '../api';

// ---- Helpers ----

function formatMoney(v: number): string {
    return `¥${Number(v || 0).toLocaleString()}`;
}

function pad(n: number): string {
    return String(n).padStart(2, '0');
}

function dirLabel(dir: string, intl: ReturnType<typeof useIntl>): string {
    if (dir === 'in') {
        return intl.formatMessage({id: 'workbench.journal.badge_in', defaultMessage: '收'});
    }
    if (dir === 'out') {
        return intl.formatMessage({id: 'workbench.journal.badge_out', defaultMessage: '付'});
    }
    return intl.formatMessage({id: 'workbench.journal.badge_transfer', defaultMessage: '转'});
}

function dirColor(dir: string, theme: Theme): string {
    if (dir === 'in') {
        return '#2ea043';
    }
    if (dir === 'out') {
        return theme.errorTextColor || '#d24d57';
    }
    return theme.buttonBg;
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
        padding: 4,
        marginRight: 12,
    },
    headerTitle: {
        ...typography('Heading', 200, 'SemiBold'),
        color: theme.sidebarText,
        flex: 1,
    },
    refreshBtn: {
        padding: 8,
    },
    filterBar: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: 12,
        paddingVertical: 10,
        gap: 8,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.02),
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    filterBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 6,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        gap: 4,
    },
    filterBtnText: {
        ...typography('Body', 75),
        color: theme.centerChannelColor,
    },
    summaryBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
        paddingHorizontal: 12,
        paddingVertical: 12,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.03),
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    summaryItem: {
        alignItems: 'center',
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
    summaryValueIn: {
        color: '#2ea043',
    },
    summaryValueOut: {
        color: theme.errorTextColor || '#d24d57',
    },
    separator: {
        width: 1,
        height: 24,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.16),
    },
    dateGroup: {
        marginTop: 8,
        marginHorizontal: 12,
    },
    dateGroupHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 4,
    },
    dateGroupLabel: {
        ...typography('Body', 75, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.72),
    },
    dateGroupCount: {
        ...typography('Body', 50),
        color: changeOpacity(theme.centerChannelColor, 0.48),
        marginLeft: 8,
    },
    entryCard: {
        marginVertical: 4,
        padding: 12,
        borderRadius: 8,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.03),
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    entryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    entryLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flex: 1,
    },
    dirBadge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 4,
        minWidth: 28,
        alignItems: 'center',
    },
    dirBadgeText: {
        ...typography('Body', 50, 'SemiBold'),
        color: '#fff',
    },
    partyText: {
        ...typography('Body', 100),
        color: theme.centerChannelColor,
        flex: 1,
    },
    amountText: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    amountIn: {
        color: '#2ea043',
    },
    amountOut: {
        color: theme.errorTextColor || '#d24d57',
    },
    paymentMethod: {
        ...typography('Body', 50),
        color: changeOpacity(theme.centerChannelColor, 0.48),
        marginTop: 4,
    },
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
    },
    emptyText: {
        ...typography('Body', 200),
        color: changeOpacity(theme.centerChannelColor, 0.4),
        textAlign: 'center',
        paddingHorizontal: 24,
    },
    errorText: {
        ...typography('Body', 100),
        color: theme.errorTextColor,
        textAlign: 'center',
        padding: 16,
    },
    retryBtn: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 8,
        backgroundColor: theme.buttonBg,
        marginTop: 12,
    },
    retryBtnText: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.buttonColor,
    },
    dropdown: {
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        borderRadius: 8,
        marginTop: 4,
        maxHeight: 200,
        backgroundColor: theme.centerChannelBg,
        position: 'absolute',
        left: 12,
        right: 12,
        zIndex: 1000,
    },
    dropdownItem: {
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.06),
    },
    dropdownItemText: {
        ...typography('Body', 100),
        color: theme.centerChannelColor,
    },
    dropdownItemSelected: {
        backgroundColor: changeOpacity(theme.buttonBg, 0.08),
    },
}));

// ---- Filter Dropdown Component ----

type DropdownProps = {
    visible: boolean;
    options: Array<{value: string | number; label: string}>;
    selected: string | number;
    onSelect: (value: string | number) => void;
    onClose: () => void;
    style: ReturnType<typeof getStyleSheet>;
};

const FilterDropdown = ({visible, options, selected, onSelect, onClose, style}: DropdownProps) => {
    if (!visible) return null;
    return (
        <>
            <TouchableOpacity
                style={StyleSheet.absoluteFill}
                activeOpacity={1}
                onPress={onClose}
            />
            <ScrollView style={style.dropdown}>
                {options.map((opt) => (
                    <TouchableOpacity
                        key={String(opt.value)}
                        style={[style.dropdownItem, selected === opt.value && style.dropdownItemSelected]}
                        onPress={() => {
                            onSelect(opt.value);
                            onClose();
                        }}
                    >
                        <Text style={style.dropdownItemText}>{opt.label}</Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>
        </>
    );
};

// ---- Main Screen ----

const FinanceScreen = () => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const navigation = useNavigation();
    const style = getStyleSheet(theme);

    const [teamId, setTeamId] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [data, setData] = useState<CashJournalData | null>(null);

    // Date filter
    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [day, setDay] = useState(0); // 0 = whole month

    // Direction filter
    const [directionFilter, setDirectionFilter] = useState('');

    // Dropdown states
    const [yearDropdownOpen, setYearDropdownOpen] = useState(false);
    const [monthDropdownOpen, setMonthDropdownOpen] = useState(false);
    const [dayDropdownOpen, setDayDropdownOpen] = useState(false);
    const [dirDropdownOpen, setDirDropdownOpen] = useState(false);

    // Calculate date range
    const [from, to] = useMemo(() => {
        const lastDay = new Date(year, month, 0).getDate();
        if (day > 0) {
            const d = `${year}-${pad(month)}-${pad(day)}`;
            return [d, d];
        }
        const f = `${year}-${pad(month)}-01`;
        const t = `${year}-${pad(month)}-${pad(lastDay)}`;
        return [f, t];
    }, [year, month, day]);

    // Load data
    const loadData = useCallback(async () => {
        if (!teamId) return;
        setLoading(true);
        setError('');
        try {
            const result = await fetchCashJournal(serverUrl, teamId, from, to, directionFilter);
            setData(result);
        } catch (err: any) {
            setError(err?.message || String(err));
        } finally {
            setLoading(false);
        }
    }, [serverUrl, teamId, from, to, directionFilter]);

    // Init: load team ID
    useEffect(() => {
        const init = async () => {
            try {
                const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
                const tid = await getCurrentTeamId(database);
                setTeamId(tid);
            } catch (e) {
                console.error('[Finance] Init error:', e);
            }
        };
        init();
    }, [serverUrl]);

    // Load data when filters change
    useEffect(() => {
        loadData();
    }, [loadData]);

    // Days in current month
    const daysInMonth = useMemo(() => new Date(year, month, 0).getDate(), [year, month]);

    // Year options
    const yearOptions = useMemo(() => {
        const opts: Array<{value: number; label: string}> = [];
        for (let y = now.getFullYear() - 2; y <= now.getFullYear() + 1; y++) {
            opts.push({value: y, label: `${y}${intl.formatMessage({id: 'workbench.journal.year', defaultMessage: '年'})}`});
        }
        return opts;
    }, [intl]);

    // Month options
    const monthOptions = useMemo(() => {
        return Array.from({length: 12}, (_, i) => ({
            value: i + 1,
            label: `${i + 1}${intl.formatMessage({id: 'workbench.journal.month', defaultMessage: '月'})}`,
        }));
    }, [intl]);

    // Day options
    const dayOptions = useMemo(() => {
        const opts: Array<{value: number; label: string}> = [
            {value: 0, label: intl.formatMessage({id: 'workbench.journal.all_days', defaultMessage: '全部日期'})},
        ];
        for (let d = 1; d <= daysInMonth; d++) {
            opts.push({value: d, label: `${d}${intl.formatMessage({id: 'workbench.journal.day', defaultMessage: '日'})}`});
        }
        return opts;
    }, [daysInMonth, intl]);

    // Direction options
    const dirOptions = useMemo(() => [
        {value: '', label: intl.formatMessage({id: 'workbench.journal.all', defaultMessage: '全部'})},
        {value: 'in', label: intl.formatMessage({id: 'workbench.journal.receipts_only', defaultMessage: '收入'})},
        {value: 'out', label: intl.formatMessage({id: 'workbench.journal.payments_only', defaultMessage: '支出'})},
    ], [intl]);

    // Close all dropdowns
    const closeAllDropdowns = useCallback(() => {
        setYearDropdownOpen(false);
        setMonthDropdownOpen(false);
        setDayDropdownOpen(false);
        setDirDropdownOpen(false);
    }, []);

    // Toggle dropdown
    const toggleDropdown = useCallback((target: 'year' | 'month' | 'day' | 'dir') => {
        const isOpen = target === 'year' ? yearDropdownOpen :
            target === 'month' ? monthDropdownOpen :
            target === 'day' ? dayDropdownOpen : dirDropdownOpen;
        closeAllDropdowns();
        if (!isOpen) {
            if (target === 'year') {
                setYearDropdownOpen(true);
            } else if (target === 'month') {
                setMonthDropdownOpen(true);
            } else if (target === 'day') {
                setDayDropdownOpen(true);
            } else {
                setDirDropdownOpen(true);
            }
        }
    }, [closeAllDropdowns, yearDropdownOpen, monthDropdownOpen, dayDropdownOpen, dirDropdownOpen]);

    // Render entry
    const renderEntry = (entry: CashJournalEntry, idx: number) => {
        const badgeColor = dirColor(entry.direction, theme);
        return (
            <View key={`${entry.name}-${idx}`} style={style.entryCard}>
                <View style={style.entryRow}>
                    <View style={style.entryLeft}>
                        <View style={[style.dirBadge, {backgroundColor: badgeColor}]}>
                            <Text style={style.dirBadgeText}>{dirLabel(entry.direction, intl)}</Text>
                        </View>
                        <Text style={style.partyText} numberOfLines={1}>
                            {entry.party || '-'}
                        </Text>
                    </View>
                    <Text style={[
                        style.amountText,
                        entry.direction === 'in' && style.amountIn,
                        entry.direction === 'out' && style.amountOut,
                    ]}>
                        {formatMoney(entry.amount)}
                    </Text>
                </View>
                {(entry.mode_of_payment || entry.account) && (
                    <Text style={style.paymentMethod}>
                        {entry.mode_of_payment || entry.account}
                    </Text>
                )}
            </View>
        );
    };

    // Render date group
    const renderDateGroup = (group: {date: string; date_label: string; entries: CashJournalEntry[]}) => (
        <View key={group.date} style={style.dateGroup}>
            <View style={style.dateGroupHeader}>
                <Text style={style.dateGroupLabel}>{group.date_label}</Text>
                <Text style={style.dateGroupCount}>({group.entries.length})</Text>
            </View>
            {group.entries.map((entry, idx) => renderEntry(entry, idx))}
        </View>
    );

    // Loading state
    if (loading) {
        return (
            <SafeAreaView edges={['top', 'bottom']} style={style.container}>
                <View style={style.header}>
                    <TouchableOpacity style={style.backBtn} onPress={() => navigation.goBack()}>
                        <CompassIcon name='arrow-left' size={20} color={theme.sidebarText}/>
                    </TouchableOpacity>
                    <Text style={style.headerTitle}>
                        {intl.formatMessage({id: 'workbench.tab.finance', defaultMessage: '流水账'})}
                    </Text>
                    <View style={style.refreshBtn}/>
                </View>
                <View style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}>
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
                        {intl.formatMessage({id: 'workbench.tab.finance', defaultMessage: '流水账'})}
                    </Text>
                    <TouchableOpacity style={style.refreshBtn} onPress={loadData}>
                        <CompassIcon name='refresh' size={20} color={theme.sidebarText}/>
                    </TouchableOpacity>
                </View>
                <View style={style.emptyContainer}>
                    <CompassIcon name='alert-circle-outline' size={48} color={theme.errorTextColor}/>
                    <Text style={style.errorText}>{error}</Text>
                    <TouchableOpacity style={style.retryBtn} onPress={loadData}>
                        <Text style={style.retryBtnText}>
                            {intl.formatMessage({id: 'mobile.retry', defaultMessage: '重试'})}
                        </Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    // Main render
    return (
        <SafeAreaView edges={['top', 'bottom']} style={style.container}>
            {/* Header */}
            <View style={style.header}>
                <TouchableOpacity style={style.backBtn} onPress={() => navigation.goBack()}>
                    <CompassIcon name='arrow-left' size={20} color={theme.sidebarText}/>
                </TouchableOpacity>
                <Text style={style.headerTitle}>
                    {intl.formatMessage({id: 'workbench.tab.finance', defaultMessage: '流水账'})}
                </Text>
                <TouchableOpacity style={style.refreshBtn} onPress={loadData}>
                    <CompassIcon name='refresh' size={20} color={theme.sidebarText}/>
                </TouchableOpacity>
            </View>

            {/* Filter bar */}
            <View style={style.filterBar}>
                <TouchableOpacity style={style.filterBtn} onPress={() => toggleDropdown('year')}>
                    <Text style={style.filterBtnText}>{year}{intl.formatMessage({id: 'workbench.journal.year', defaultMessage: '年'})}</Text>
                    <CompassIcon name={yearDropdownOpen ? 'menu-up' : 'menu-down'} size={16} color={changeOpacity(theme.centerChannelColor, 0.56)}/>
                </TouchableOpacity>
                <TouchableOpacity style={style.filterBtn} onPress={() => toggleDropdown('month')}>
                    <Text style={style.filterBtnText}>{month}{intl.formatMessage({id: 'workbench.journal.month', defaultMessage: '月'})}</Text>
                    <CompassIcon name={monthDropdownOpen ? 'menu-up' : 'menu-down'} size={16} color={changeOpacity(theme.centerChannelColor, 0.56)}/>
                </TouchableOpacity>
                <TouchableOpacity style={style.filterBtn} onPress={() => toggleDropdown('day')}>
                    <Text style={style.filterBtnText}>
                        {day === 0
                            ? intl.formatMessage({id: 'workbench.journal.all_days', defaultMessage: '全部日期'})
                            : `${day}${intl.formatMessage({id: 'workbench.journal.day', defaultMessage: '日'})}`}
                    </Text>
                    <CompassIcon name={dayDropdownOpen ? 'menu-up' : 'menu-down'} size={16} color={changeOpacity(theme.centerChannelColor, 0.56)}/>
                </TouchableOpacity>
                <TouchableOpacity style={style.filterBtn} onPress={() => toggleDropdown('dir')}>
                    <Text style={style.filterBtnText}>
                        {directionFilter === ''
                            ? intl.formatMessage({id: 'workbench.journal.all', defaultMessage: '全部'})
                            : directionFilter === 'in'
                                ? intl.formatMessage({id: 'workbench.journal.receipts_only', defaultMessage: '收入'})
                                : intl.formatMessage({id: 'workbench.journal.payments_only', defaultMessage: '支出'})}
                    </Text>
                    <CompassIcon name={dirDropdownOpen ? 'menu-up' : 'menu-down'} size={16} color={changeOpacity(theme.centerChannelColor, 0.56)}/>
                </TouchableOpacity>
            </View>

            {/* Dropdowns */}
            <FilterDropdown
                visible={yearDropdownOpen}
                options={yearOptions}
                selected={year}
                onSelect={(v) => setYear(Number(v))}
                onClose={() => setYearDropdownOpen(false)}
                style={style}
            />
            <FilterDropdown
                visible={monthDropdownOpen}
                options={monthOptions}
                selected={month}
                onSelect={(v) => setMonth(Number(v))}
                onClose={() => setMonthDropdownOpen(false)}
                style={style}
            />
            <FilterDropdown
                visible={dayDropdownOpen}
                options={dayOptions}
                selected={day}
                onSelect={(v) => setDay(Number(v))}
                onClose={() => setDayDropdownOpen(false)}
                style={style}
            />
            <FilterDropdown
                visible={dirDropdownOpen}
                options={dirOptions}
                selected={directionFilter}
                onSelect={(v) => setDirectionFilter(String(v))}
                onClose={() => setDirDropdownOpen(false)}
                style={style}
            />

            {/* Summary */}
            {data && (
                <View style={style.summaryBar}>
                    <View style={style.summaryItem}>
                        <Text style={style.summaryLabel}>
                            {intl.formatMessage({id: 'workbench.journal.summary_in', defaultMessage: '收入'})}
                        </Text>
                        <Text style={[style.summaryValue, style.summaryValueIn]}>
                            {formatMoney(data.summary.in_month)}
                        </Text>
                    </View>
                    <View style={style.separator}/>
                    <View style={style.summaryItem}>
                        <Text style={style.summaryLabel}>
                            {intl.formatMessage({id: 'workbench.journal.summary_out', defaultMessage: '支出'})}
                        </Text>
                        <Text style={[style.summaryValue, style.summaryValueOut]}>
                            {formatMoney(data.summary.out_month)}
                        </Text>
                    </View>
                    <View style={style.separator}/>
                    <View style={style.summaryItem}>
                        <Text style={style.summaryLabel}>
                            {intl.formatMessage({id: 'workbench.journal.summary_net', defaultMessage: '净额'})}
                        </Text>
                        <Text style={style.summaryValue}>
                            {formatMoney(data.summary.net_month)}
                        </Text>
                    </View>
                </View>
            )}

            {/* Content */}
            {data && data.groups.length === 0 ? (
                <View style={style.emptyContainer}>
                    <CompassIcon name='credit-card-outline' size={48} color={changeOpacity(theme.centerChannelColor, 0.32)}/>
                    <Text style={style.emptyText}>
                        {intl.formatMessage({id: 'workbench.journal.empty', defaultMessage: '暂无记录'})}
                    </Text>
                </View>
            ) : data && (
                <ScrollView>
                    {data.groups.map(renderDateGroup)}
                    <View style={{height: 20}}/>
                </ScrollView>
            )}
        </SafeAreaView>
    );
};

export default FinanceScreen;
