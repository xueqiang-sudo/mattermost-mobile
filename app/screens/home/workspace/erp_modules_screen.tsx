// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useMemo} from 'react';
import {useIntl} from 'react-intl';
import {ScrollView, Text, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import {Screens} from '@constants';
import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {StackNavigationProp} from '@react-navigation/stack';

type Module = {
    key: string;
    icon: string;
    labelId: string;
    defaultLabel: string;
    screen: string;
};

const MODULES: Module[] = [
    {key: 'customers', icon: 'account-multiple-outline', labelId: 'erp.module.customers', defaultLabel: 'Customers', screen: Screens.ERP_CUSTOMERS},
    {key: 'suppliers', icon: 'truck-delivery-outline', labelId: 'erp.module.suppliers', defaultLabel: 'Suppliers', screen: Screens.ERP_SUPPLIERS},
    {key: 'sales_orders', icon: 'cart-outline', labelId: 'erp.module.sales_orders', defaultLabel: 'Sales Orders', screen: Screens.ERP_SALES_ORDERS},
    {key: 'purchase_orders', icon: 'clipboard-text-outline', labelId: 'erp.module.purchase_orders', defaultLabel: 'Purchase Orders', screen: Screens.ERP_PURCHASE_ORDERS},
    {key: 'work_orders', icon: 'cog-outline', labelId: 'erp.module.work_orders', defaultLabel: 'Manufacturing', screen: Screens.ERP_WORK_ORDERS},
    {key: 'projects', icon: 'folder-outline', labelId: 'erp.module.projects', defaultLabel: 'Projects', screen: Screens.ERP_PROJECTS},
    {key: 'stock', icon: 'package-variant-closed', labelId: 'erp.module.stock', defaultLabel: 'Stock', screen: Screens.ERP_STOCK},
    {key: 'warehouse_inout', icon: 'warehouse', labelId: 'erp.module.warehouse_inout', defaultLabel: 'Stock In/Out', screen: Screens.APPS_WAREHOUSE_INOUT},
    {key: 'hot_products', icon: 'fire', labelId: 'erp.module.hot_products', defaultLabel: 'Hot Products', screen: Screens.APPS_HOT_PRODUCTS},
    {key: 'finance', icon: 'currency-usd', labelId: 'erp.module.finance', defaultLabel: 'Finance', screen: Screens.APPS_FINANCE},
    {key: 'sales', icon: 'chart-line', labelId: 'erp.module.sales', defaultLabel: 'Sales Statistics', screen: Screens.APPS_SALES},
    {key: 'inventory', icon: 'products', labelId: 'erp.module.inventory', defaultLabel: 'Inventory', screen: Screens.APPS_INVENTORY},
];

const getStyles = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    scrollContent: {
        padding: 16,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    card: {
        width: '48%',
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderRadius: 12,
        padding: 20,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 110,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    cardIcon: {
        marginBottom: 10,
    },
    cardLabel: {
        color: theme.centerChannelColor,
        ...typography('Body', 200, 'SemiBold'),
        textAlign: 'center',
    },
}));

type Props = {
    navigation: StackNavigationProp<any>;
};

const ErpModulesScreen = ({navigation}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const styles = getStyles(theme);

    const modules = useMemo(() => MODULES.map((m) => ({
        ...m,
        label: intl.formatMessage({id: m.labelId, defaultMessage: m.defaultLabel}),
    })), [intl]);

    const handleModulePress = useCallback((module: Module) => {
        navigation.navigate(module.screen);
    }, [navigation]);

    return (
        <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
            <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <View style={styles.grid}>
                    {modules.map((module) => (
                        <TouchableOpacity
                            key={module.key}
                            style={styles.card}
                            onPress={() => handleModulePress(module)}
                            activeOpacity={0.7}
                        >
                            <CompassIcon
                                name={module.icon}
                                size={36}
                                color={theme.buttonBg}
                                style={styles.cardIcon}
                            />
                            <Text style={styles.cardLabel}>{module.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

export default ErpModulesScreen;
