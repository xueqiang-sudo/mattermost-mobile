// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    RefreshControl,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {StackNavigationProp} from '@react-navigation/stack';

type FieldConfig = {
    key: string;
    label?: string;
    format?: (value: any, item: any) => string;
};

type TabConfig = {
    key: string;
    label: string;
    filters: any[][];
};

type ErpListScreenProps = {
    navigation: StackNavigationProp<any>;
    title: string;
    fetchFn: (serverUrl: string, filtersOrOffset?: any, offset?: number) => Promise<any[]>;
    fields: FieldConfig[];
    tabs?: TabConfig[];
    searchPlaceholder?: string;
    onItemPress?: (item: any, navigation: any) => void;
    canCreate?: boolean;
    onCreate?: (navigation: any) => void;
    canDelete?: boolean;
    onDelete?: (item: any, refresh: () => void) => void;
};

const getStyles = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    tabs: {
        flexDirection: 'row',
        paddingHorizontal: 12,
        paddingTop: 8,
        gap: 8,
    },
    tab: {
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 16,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.06),
    },
    tabActive: {
        backgroundColor: theme.buttonBg,
    },
    tabText: {
        ...typography('Body', 75, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.64),
    },
    tabTextActive: {
        color: theme.buttonColor,
    },
    searchContainer: {
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    searchInput: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.06),
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        color: theme.centerChannelColor,
        ...typography('Body', 100, 'Regular'),
    },
    card: {
        marginHorizontal: 16,
        marginBottom: 8,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.03),
        borderRadius: 10,
        padding: 14,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.06),
    },
    cardTitle: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.centerChannelColor,
        marginBottom: 4,
    },
    cardRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 2,
    },
    cardLabel: {
        ...typography('Body', 75, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.48),
    },
    cardValue: {
        ...typography('Body', 75, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
        backgroundColor: changeOpacity(theme.buttonBg, 0.12),
    },
    statusText: {
        ...typography('Body', 50, 'SemiBold'),
        color: theme.buttonBg,
    },
    progressBar: {
        height: 4,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
        borderRadius: 2,
        marginTop: 8,
        overflow: 'hidden',
    },
    progressFill: {
        height: 4,
        borderRadius: 2,
        backgroundColor: theme.buttonBg,
    },
    loading: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    empty: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 80,
    },
    emptyText: {
        color: changeOpacity(theme.centerChannelColor, 0.4),
        ...typography('Body', 200, 'Regular'),
        marginTop: 12,
    },
    fab: {
        position: 'absolute',
        right: 20,
        bottom: 20,
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: theme.buttonBg,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.25,
        shadowRadius: 4,
    },
}));

const STATUS_COLORS: Record<string, {bg: number; key: string}> = {
    Completed: {bg: 0.12, key: 'onlineIndicator'},
    Closed: {bg: 0.12, key: 'onlineIndicator'},
    Paid: {bg: 0.12, key: 'onlineIndicator'},
    Delivered: {bg: 0.12, key: 'onlineIndicator'},
    Cancelled: {bg: 0.08, key: 'centerChannelColor'},
    Draft: {bg: 0.08, key: 'centerChannelColor'},
    'In Process': {bg: 0.12, key: 'buttonBg'},
    'Not Started': {bg: 0.08, key: 'centerChannelColor'},
    Overdue: {bg: 0.12, key: 'errorTextColor'},
    Open: {bg: 0.12, key: 'buttonBg'},
};

function getStatusColor(status: string, theme: Theme): string {
    const config = STATUS_COLORS[status];
    if (!config) {return theme.buttonBg;}
    return (theme as any)[config.key] || theme.buttonBg;
}

const ErpListScreen = ({
    fetchFn,
    fields,
    tabs,
    searchPlaceholder,
    onItemPress,
    canCreate,
    onCreate,
    canDelete,
    onDelete,
}: ErpListScreenProps) => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const styles = getStyles(theme);

    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState(0);
    const [search, setSearch] = useState('');

    const loadData = useCallback(async (tabIndex = activeTab, reset = true) => {
        try {
            const filters = tabs?.[tabIndex]?.filters || [];
            const result = await fetchFn(serverUrl, filters.length > 0 ? filters : 0, 0);
            setData(Array.isArray(result) ? result : []);
        } catch (e: any) {
            Alert.alert('Error', e?.message || String(e));
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [serverUrl, fetchFn, activeTab, tabs]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleTabChange = useCallback((index: number) => {
        setActiveTab(index);
        setLoading(true);
        loadData(index);
    }, [loadData]);

    const handleRefresh = useCallback(() => {
        setRefreshing(true);
        loadData();
    }, [loadData]);

    const filteredData = search
        ? data.filter((item) => {
            const searchStr = fields.map((f) => String(item[f.key] || '')).join(' ').toLowerCase();
            return searchStr.includes(search.toLowerCase());
        })
        : data;

    const renderItem = useCallback(({item}: {item: any}) => {
        const statusField = fields.find((f) => f.key === 'status');
        const status = statusField ? item.status : undefined;
        const statusColor = status ? getStatusColor(status, theme) : undefined;

        return (
            <TouchableOpacity
                style={styles.card}
                activeOpacity={0.7}
                onPress={() => onItemPress?.(item, {})}
                onLongPress={canDelete && onDelete ? () => {
                    Alert.alert(
                        intl.formatMessage({id: 'erp.delete_confirm_title', defaultMessage: 'Delete'}),
                        intl.formatMessage({id: 'erp.delete_confirm', defaultMessage: 'Are you sure?'}, {name: item.name || ''}),
                        [
                            {text: intl.formatMessage({id: 'cancel', defaultMessage: 'Cancel'}), style: 'cancel'},
                            {text: intl.formatMessage({id: 'delete', defaultMessage: 'Delete'}), style: 'destructive', onPress: () => onDelete(item, handleRefresh)},
                        ],
                    );
                } : undefined}
            >
                <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                        {fields[0]?.format ? fields[0].format(item[fields[0].key], item) : item[fields[0].key]}
                    </Text>
                    {status && (
                        <View style={[styles.statusBadge, {backgroundColor: changeOpacity(statusColor, 0.12)}]}>
                            <Text style={[styles.statusText, {color: statusColor}]}>{status}</Text>
                        </View>
                    )}
                </View>
                {fields.slice(1).map((field) => (
                    <View key={field.key} style={styles.cardRow}>
                        <Text style={styles.cardLabel}>{field.label || field.key}</Text>
                        <Text style={styles.cardValue}>
                            {field.format ? field.format(item[field.key], item) : String(item[field.key] || '-')}
                        </Text>
                    </View>
                ))}
                {item.qty != null && item.produced_qty != null && (
                    <View style={styles.progressBar}>
                        <View style={[styles.progressFill, {width: `${Math.min(100, Math.round((item.produced_qty / item.qty) * 100))}%`}]} />
                    </View>
                )}
                {item.percent_complete != null && (
                    <View style={styles.progressBar}>
                        <View style={[styles.progressFill, {width: `${Math.min(100, item.percent_complete)}%`}]} />
                    </View>
                )}
            </TouchableOpacity>
        );
    }, [fields, styles, theme, onItemPress, canDelete, onDelete, handleRefresh, intl]);

    if (loading) {
        return (
            <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
                <View style={styles.loading}>
                    <ActivityIndicator size='large' color={theme.buttonBg}/>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
            {tabs && tabs.length > 1 && (
                <View style={styles.tabs}>
                    {tabs.map((tab, i) => (
                        <TouchableOpacity
                            key={tab.key}
                            style={[styles.tab, i === activeTab && styles.tabActive]}
                            onPress={() => handleTabChange(i)}
                        >
                            <Text style={[styles.tabText, i === activeTab && styles.tabTextActive]}>{tab.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}
            {searchPlaceholder && (
                <View style={styles.searchContainer}>
                    <TextInput
                        style={styles.searchInput}
                        placeholder={searchPlaceholder}
                        placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.32)}
                        value={search}
                        onChangeText={setSearch}
                    />
                </View>
            )}
            <FlatList
                data={filteredData}
                renderItem={renderItem}
                keyExtractor={(item) => item.name || item.id || String(Math.random())}
                contentContainerStyle={filteredData.length === 0 ? {flex: 1} : {paddingBottom: 80}}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh}/>}
                ListEmptyComponent={
                    <View style={styles.empty}>
                        <CompassIcon name='inbox-outline' size={48} color={changeOpacity(theme.centerChannelColor, 0.24)}/>
                        <Text style={styles.emptyText}>
                            {intl.formatMessage({id: 'erp.empty', defaultMessage: 'No data'})}
                        </Text>
                    </View>
                }
            />
            {canCreate && onCreate && (
                <TouchableOpacity style={styles.fab} onPress={() => onCreate({})} activeOpacity={0.8}>
                    <CompassIcon name='plus' size={28} color={theme.buttonColor}/>
                </TouchableOpacity>
            )}
        </SafeAreaView>
    );
};

export default ErpListScreen;
