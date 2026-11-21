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
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import {fetchMySuppliers, type SupplierInfo} from './api';

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
    scrollContent: {
        padding: 16,
    },
    title: {
        ...typography('Heading', 300, 'SemiBold'),
        color: theme.centerChannelColor,
        marginBottom: 16,
    },
    card: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    teamName: {
        ...typography('Heading', 200, 'SemiBold'),
        color: theme.centerChannelColor,
        marginLeft: 8,
        flex: 1,
    },
    contact: {
        ...typography('Body', 100, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.72),
        marginBottom: 12,
    },
    stats: {
        flexDirection: 'row',
        gap: 16,
    },
    statItem: {
        ...typography('Body', 75, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.56),
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

const MySuppliersScreen = () => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const navigation = useNavigation();
    const styles = getStyleSheet(theme);

    const [suppliers, setSuppliers] = useState<SupplierInfo[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadSuppliers = async () => {
            try {
                const data = await fetchMySuppliers(serverUrl);
                setSuppliers(data);
            } catch {
                setSuppliers([]);
            } finally {
                setLoading(false);
            }
        };
        loadSuppliers();
    }, [serverUrl]);

    const handleSupplierPress = useCallback((supplier: SupplierInfo) => {
        navigation.navigate('SupplierDetail' as never, {
            teamId: supplier.team_id,
            teamName: supplier.team_name,
        } as never);
    }, [navigation]);

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
            <ScrollView
                style={styles.container}
                contentContainerStyle={suppliers.length === 0 ? {flex: 1} : styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {suppliers.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <CompassIcon
                            name='truck-delivery-outline'
                            size={64}
                            color={changeOpacity(theme.centerChannelColor, 0.24)}
                        />
                        <Text style={styles.emptyText}>
                            {intl.formatMessage({
                                id: 'apps.my_suppliers.empty',
                                defaultMessage: '暂无供应商',
                            })}
                        </Text>
                    </View>
                ) : (
                    <>
                        <Text style={styles.title}>
                            {intl.formatMessage({
                                id: 'apps.my_suppliers.title',
                                defaultMessage: '您的供应商 ({count})',
                            }, {count: suppliers.length})}
                        </Text>
                        {suppliers.map((supplier) => (
                            <TouchableOpacity
                                key={supplier.team_id}
                                style={styles.card}
                                onPress={() => handleSupplierPress(supplier)}
                                activeOpacity={0.7}
                            >
                                <View style={styles.cardHeader}>
                                    <CompassIcon
                                        name='office-building'
                                        size={24}
                                        color={theme.buttonBg}
                                    />
                                    <Text style={styles.teamName}>{supplier.team_name}</Text>
                                </View>
                                <Text style={styles.contact}>
                                    {intl.formatMessage({
                                        id: 'apps.my_suppliers.contact',
                                        defaultMessage: '联系人：{name}',
                                    }, {name: supplier.contact_name})}
                                </Text>
                                <View style={styles.stats}>
                                    <Text style={styles.statItem}>
                                        📦 {supplier.order_count} {intl.formatMessage({
                                            id: 'apps.my_suppliers.orders',
                                            defaultMessage: '个订单',
                                        })}
                                    </Text>
                                    <Text style={styles.statItem}>
                                        📁 {supplier.project_count} {intl.formatMessage({
                                            id: 'apps.my_suppliers.projects',
                                            defaultMessage: '个项目',
                                        })}
                                    </Text>
                                </View>
                            </TouchableOpacity>
                        ))}
                    </>
                )}
            </ScrollView>
        </SafeAreaView>
    );
};

export default MySuppliersScreen;
