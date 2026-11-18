// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';
import {useIntl} from 'react-intl';
import {ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import {Screens} from '@constants';
import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {StackNavigationProp} from '@react-navigation/stack';

type ErpModule = {
    key: string;
    icon: string;
    labelId: string;
    defaultLabel: string;
    appKey: string;
};

const ERP_MODULES: ErpModule[] = [
    {key: 'overview', icon: 'view-dashboard-outline', labelId: 'erp.module.overview', defaultLabel: '总览', appKey: 'overview'},
    {key: 'hot_products', icon: 'fire', labelId: 'erp.module.hot_products', defaultLabel: '热销榜', appKey: 'hotproducts'},
    {key: 'inventory', icon: 'package-variant-closed', labelId: 'erp.module.inventory', defaultLabel: '库存分析', appKey: 'inventory'},
    {key: 'sales', icon: 'chart-line', labelId: 'erp.module.sales', defaultLabel: '销售统计', appKey: 'sales'},
    {key: 'finance', icon: 'cash-multiple', labelId: 'erp.module.finance', defaultLabel: '往来账', appKey: 'finance'},
    {key: 'approvals', icon: 'check-decagram-outline', labelId: 'erp.module.approvals', defaultLabel: '审批清单', appKey: 'approvals'},
    {key: 'orders', icon: 'clipboard-text-outline', labelId: 'erp.module.orders', defaultLabel: '我的订单', appKey: 'orders'},
    {key: 'projects', icon: 'folder-outline', labelId: 'erp.module.projects', defaultLabel: '我的项目', appKey: 'projects'},
    {key: 'warehouse', icon: 'warehouse', labelId: 'erp.module.warehouse', defaultLabel: '出入库', appKey: 'warehouse_inout'},
    {key: 'price_list', icon: 'tag-outline', labelId: 'erp.module.price_list', defaultLabel: '价格表', appKey: 'price_list'},
];

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
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        padding: 16,
    },
    card: {
        width: '48%',
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderRadius: 12,
        padding: 20,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 110,
        borderWidth: StyleSheet.hairlineWidth,
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

const WorkspaceErpScreen = ({navigation}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const styles = getStyles(theme);

    const handleModulePress = useCallback((module: ErpModule) => {
        if (module.appKey === 'warehouse_inout') {
            // Warehouse has its own native screen
            navigation.navigate(Screens.APPS_WAREHOUSE_INOUT);
        } else {
            // All other modules load via WebView
            navigation.navigate(Screens.APPS_WEBVIEW, {
                appKey: module.appKey,
                title: intl.formatMessage({id: module.labelId, defaultMessage: module.defaultLabel}),
            });
        }
    }, [navigation, intl]);

    return (
        <SafeAreaView style={styles.container} edges={['top']} testID='workspace_erp.screen'>
            <View style={styles.header}>
                <CompassIcon name='chart-bar' size={24} color={theme.centerChannelColor}/>
                <Text style={styles.headerTitle}>
                    {intl.formatMessage({id: 'workspace.erp.title', defaultMessage: 'ERP'})}
                </Text>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.grid}>
                    {ERP_MODULES.map((module) => {
                        const label = intl.formatMessage({id: module.labelId, defaultMessage: module.defaultLabel});
                        return (
                            <TouchableOpacity
                                key={module.key}
                                style={styles.card}
                                onPress={() => handleModulePress(module)}
                                activeOpacity={0.7}
                                testID={`workspace_erp.module.${module.key}`}
                            >
                                <CompassIcon
                                    name={module.icon}
                                    size={36}
                                    color={theme.buttonBg}
                                    style={styles.cardIcon}
                                />
                                <Text style={styles.cardLabel}>{label}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

export default WorkspaceErpScreen;
