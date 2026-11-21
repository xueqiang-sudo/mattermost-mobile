// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useNavigation, useRoute, type RouteProp} from '@react-navigation/native';
import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    ActivityIndicator,
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
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import {fetchSupplierOrders, fetchSupplierProjects} from './api';

type SupplierDetailRouteParams = {
    teamId: string;
    teamName: string;
};

type TabType = 'orders' | 'projects';

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    tabs: {
        flexDirection: 'row',
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.16),
    },
    tab: {
        flex: 1,
        paddingVertical: 12,
        alignItems: 'center',
    },
    tabActive: {
        borderBottomWidth: 2,
        borderBottomColor: theme.buttonBg,
    },
    tabText: {
        ...typography('Body', 100, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.56),
    },
    tabTextActive: {
        color: theme.buttonBg,
    },
    scrollContent: {
        padding: 16,
    },
    card: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    cardTitle: {
        ...typography('Heading', 100, 'SemiBold'),
        color: theme.centerChannelColor,
        marginBottom: 8,
    },
    cardRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    cardLabel: {
        ...typography('Body', 75, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.56),
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
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 80,
    },
    emptyText: {
        ...typography('Body', 200, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginTop: 16,
        textAlign: 'center',
    },
}));

const SupplierDetailScreen = () => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const navigation = useNavigation();
    const route = useRoute<RouteProp<{params: SupplierDetailRouteParams}, 'params'>>();
    const styles = getStyleSheet(theme);

    const {teamId, teamName} = route.params;
    const [activeTab, setActiveTab] = useState<TabType>('orders');
    const [orders, setOrders] = useState<any[]>([]);
    const [projects, setProjects] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                const [ordersData, projectsData] = await Promise.all([
                    fetchSupplierOrders(serverUrl, teamId),
                    fetchSupplierProjects(serverUrl, teamId),
                ]);
                setOrders(ordersData);
                setProjects(projectsData);
            } catch {
                setOrders([]);
                setProjects([]);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [serverUrl, teamId]);

    const data = activeTab === 'orders' ? orders : projects;

    const formatDate = (dateStr: string) => {
        if (!dateStr) {return '-';}
        try {
            const date = new Date(dateStr);
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        } catch {
            return dateStr;
        }
    };

    const formatMoney = (val: number) => {
        if (val == null) {return '-';}
        return `¥${Number(val).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    };

    const renderItem = useCallback(({item}: {item: any}) => {
        if (activeTab === 'orders') {
            return (
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>{item.name || item.title}</Text>
                    <View style={styles.cardRow}>
                        <Text style={styles.cardLabel}>
                            {intl.formatMessage({id: 'supplier_detail.amount', defaultMessage: '金额'})}
                        </Text>
                        <Text style={styles.cardValue}>{formatMoney(item.grand_total || item.amount)}</Text>
                    </View>
                    <View style={styles.cardRow}>
                        <Text style={styles.cardLabel}>
                            {intl.formatMessage({id: 'supplier_detail.status', defaultMessage: '状态'})}
                        </Text>
                        {item.status && (
                            <View style={styles.statusBadge}>
                                <Text style={styles.statusText}>{item.status}</Text>
                            </View>
                        )}
                    </View>
                    <View style={styles.cardRow}>
                        <Text style={styles.cardLabel}>
                            {intl.formatMessage({id: 'supplier_detail.date', defaultMessage: '日期'})}
                        </Text>
                        <Text style={styles.cardValue}>{formatDate(item.transaction_date || item.date)}</Text>
                    </View>
                </View>
            );
        } else {
            return (
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>{item.name || item.project_name}</Text>
                    <View style={styles.cardRow}>
                        <Text style={styles.cardLabel}>
                            {intl.formatMessage({id: 'supplier_detail.progress', defaultMessage: '进度'})}
                        </Text>
                        <Text style={styles.cardValue}>
                            {item.percent_complete != null ? `${item.percent_complete}%` : '-'}
                        </Text>
                    </View>
                    <View style={styles.cardRow}>
                        <Text style={styles.cardLabel}>
                            {intl.formatMessage({id: 'supplier_detail.status', defaultMessage: '状态'})}
                        </Text>
                        {item.status && (
                            <View style={styles.statusBadge}>
                                <Text style={styles.statusText}>{item.status}</Text>
                            </View>
                        )}
                    </View>
                    <View style={styles.cardRow}>
                        <Text style={styles.cardLabel}>
                            {intl.formatMessage({id: 'supplier_detail.end_date', defaultMessage: '截止日期'})}
                        </Text>
                        <Text style={styles.cardValue}>{formatDate(item.expected_end_date || item.end_date)}</Text>
                    </View>
                </View>
            );
        }
    }, [activeTab, styles, intl]);

    if (loading) {
        return (
            <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size='large' color={theme.buttonBg}/>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
            <View style={styles.tabs}>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'orders' && styles.tabActive]}
                    onPress={() => setActiveTab('orders')}
                >
                    <Text style={[styles.tabText, activeTab === 'orders' && styles.tabTextActive]}>
                        {intl.formatMessage({id: 'supplier_detail.tab_orders', defaultMessage: '订单'})}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'projects' && styles.tabActive]}
                    onPress={() => setActiveTab('projects')}
                >
                    <Text style={[styles.tabText, activeTab === 'projects' && styles.tabTextActive]}>
                        {intl.formatMessage({id: 'supplier_detail.tab_projects', defaultMessage: '项目'})}
                    </Text>
                </TouchableOpacity>
            </View>
            <FlatList
                data={data}
                renderItem={renderItem}
                keyExtractor={(item, index) => item.name || item.id || String(index)}
                contentContainerStyle={data.length === 0 ? {flex: 1} : styles.scrollContent}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <CompassIcon
                            name={activeTab === 'orders' ? 'cart-outline' : 'folder-outline'}
                            size={64}
                            color={changeOpacity(theme.centerChannelColor, 0.24)}
                        />
                        <Text style={styles.emptyText}>
                            {intl.formatMessage({
                                id: activeTab === 'orders' ? 'supplier_detail.empty_orders' : 'supplier_detail.empty_projects',
                                defaultMessage: activeTab === 'orders' ? '暂无订单' : '暂无项目',
                            })}
                        </Text>
                    </View>
                }
            />
        </SafeAreaView>
    );
};

export default SupplierDetailScreen;
