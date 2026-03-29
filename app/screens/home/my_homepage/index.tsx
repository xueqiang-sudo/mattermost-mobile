// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * 我的主页页面
 * 显示供应商、客户两类列表，支持增删改查
 */

import React, {useCallback, useEffect, useState} from 'react';
import {Freeze} from 'react-freeze';
import {useIntl} from 'react-intl';
import {Alert, ScrollView, Text, TouchableOpacity, View} from 'react-native';
import {type Edge, SafeAreaView} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import Loading from '@components/loading';
import {useIsFocused} from '@react-navigation/native';
import {useTheme} from '@context/theme';
import {usePreventDoubleTap} from '@hooks/utils';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {SupplierCustomer, SupplierCustomerType} from '@client/rest/supplier_customer';

const edges: Edge[] = ['left', 'right'];

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    flex: {
        flex: 1,
    },
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: theme.sidebarBg,
    },
    headerTitle: {
        ...typography('Heading', 600, 'SemiBold'),
        color: theme.sidebarText,
        textAlign: 'center',
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        marginLeft: 'auto',
        zIndex: 1,
        gap: 12,
    },
    section: {
        marginTop: 16,
        marginHorizontal: 16,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: theme.centerChannelBg,
        borderRadius: 12,
        marginBottom: 8,
    },
    sectionTitle: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    addButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    addButtonSupplier: {
        backgroundColor: changeOpacity('#007AFF', 0.12),
    },
    addButtonCustomer: {
        backgroundColor: changeOpacity('#34C759', 0.15),
    },
    listContainer: {
        backgroundColor: theme.centerChannelBg,
        borderRadius: 12,
        overflow: 'hidden',
    },
    listItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
    },
    listItemIcon: {
        width: 40,
        height: 40,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    listItemIconSupplier: {
        backgroundColor: changeOpacity('#007AFF', 0.12),
    },
    listItemIconCustomer: {
        backgroundColor: changeOpacity('#34C759', 0.15),
    },
    listItemContent: {
        flex: 1,
    },
    listItemName: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    listItemDescription: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.64),
        marginTop: 2,
    },
    listItemActions: {
        flexDirection: 'row',
        gap: 8,
    },
    actionButton: {
        padding: 4,
    },
    divider: {
        height: 1,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
        marginLeft: 68,
    },
    emptyMessage: {
        ...typography('Body', 100),
        color: changeOpacity(theme.centerChannelColor, 0.64),
        paddingVertical: 24,
        paddingHorizontal: 20,
        textAlign: 'center',
    },
    loadingContainer: {
        paddingVertical: 24,
        alignItems: 'center',
    },
    scrollContent: {
        flexGrow: 1,
        paddingBottom: 32,
    },
}));

const MyHomepage = () => {
    const theme = useTheme();
    const intl = useIntl();
    const isFocused = useIsFocused();
    const styles = getStyleSheet(theme);

    const [suppliers, setSuppliers] = useState<SupplierCustomer[]>([]);
    const [customers, setCustomers] = useState<SupplierCustomer[]>([]);
    const [loading, setLoading] = useState(true);

    /**
     * 加载供应商和客户数据
     */
    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            // TODO: 实际调用 API 加载数据
            // const supplierRes = await SupplierCustomerService.getSuppliers();
            // const customerRes = await SupplierCustomerService.getCustomers();
            // if (!supplierRes.error) setSuppliers(supplierRes.data || []);
            // if (!customerRes.error) setCustomers(customerRes.data || []);
            
            // 模拟数据
            setSuppliers([
                {id: '1', name: '供应商A', type: 'supplier', owner_id: 'owner1', description: '优质供应商'},
                {id: '2', name: '供应商B', type: 'supplier', owner_id: 'owner1'},
            ]);
            setCustomers([
                {id: '3', name: '客户X', type: 'customer', owner_id: 'owner1', description: '重要客户'},
                {id: '4', name: '客户Y', type: 'customer', owner_id: 'owner1'},
            ]);
        } catch (error) {
            console.error('Failed to load data:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isFocused) {
            loadData();
        }
    }, [isFocused, loadData]);

    /**
     * 处理添加供应商
     */
    const handleAddSupplier = usePreventDoubleTap(useCallback(() => {
        Alert.alert(
            intl.formatMessage({id: 'my_homepage.add_supplier', defaultMessage: 'Add Supplier'}),
            intl.formatMessage({id: 'my_homepage.feature_coming', defaultMessage: 'Feature coming soon'}),
        );
    }, [intl]));

    /**
     * 处理添加客户
     */
    const handleAddCustomer = usePreventDoubleTap(useCallback(() => {
        Alert.alert(
            intl.formatMessage({id: 'my_homepage.add_customer', defaultMessage: 'Add Customer'}),
            intl.formatMessage({id: 'my_homepage.feature_coming', defaultMessage: 'Feature coming soon'}),
        );
    }, [intl]));

    /**
     * 处理编辑项
     */
    const handleEdit = usePreventDoubleTap(useCallback((item: SupplierCustomer) => {
        Alert.alert(
            intl.formatMessage({id: 'my_homepage.edit', defaultMessage: 'Edit'}),
            intl.formatMessage({id: 'my_homepage.feature_coming', defaultMessage: 'Feature coming soon'}),
        );
    }, [intl]));

    /**
     * 处理删除项
     */
    const handleDelete = usePreventDoubleTap(useCallback((item: SupplierCustomer) => {
        const typeLabel = item.type === 'supplier' 
            ? intl.formatMessage({id: 'my_homepage.supplier', defaultMessage: 'Supplier'})
            : intl.formatMessage({id: 'my_homepage.customer', defaultMessage: 'Customer'});
        
        Alert.alert(
            intl.formatMessage({id: 'my_homepage.delete_confirm', defaultMessage: 'Delete {type}?'}, {type: typeLabel}),
            intl.formatMessage({id: 'my_homepage.delete_confirm_msg', defaultMessage: 'Are you sure you want to delete {name}?'}, {name: item.name}),
            [
                {text: intl.formatMessage({id: 'common.cancel', defaultMessage: 'Cancel'}), style: 'cancel'},
                {
                    text: intl.formatMessage({id: 'common.delete', defaultMessage: 'Delete'}),
                    style: 'destructive',
                    onPress: () => {
                        // TODO: 实际调用 API 删除
                        if (item.type === 'supplier') {
                            setSuppliers(prev => prev.filter(s => s.id !== item.id));
                        } else {
                            setCustomers(prev => prev.filter(c => c.id !== item.id));
                        }
                    },
                },
            ],
        );
    }, [intl]));

    /**
     * 渲染列表项
     */
    const renderListItem = (item: SupplierCustomer, index: number, total: number) => {
        const isSupplier = item.type === 'supplier';
        const iconColor = isSupplier ? '#007AFF' : '#34C759';
        const iconStyle = isSupplier ? styles.listItemIconSupplier : styles.listItemIconCustomer;

        return (
            <React.Fragment key={item.id}>
                <View style={styles.listItem}>
                    <View style={[styles.listItemIcon, iconStyle]}>
                        <CompassIcon
                            name='account-multiple-outline'
                            size={22}
                            color={iconColor}
                        />
                    </View>
                    <View style={styles.listItemContent}>
                        <Text style={styles.listItemName} numberOfLines={1}>
                            {item.name}
                        </Text>
                        {item.description && (
                            <Text style={styles.listItemDescription} numberOfLines={1}>
                                {item.description}
                            </Text>
                        )}
                    </View>
                    <View style={styles.listItemActions}>
                        <TouchableOpacity
                            style={styles.actionButton}
                            onPress={() => handleEdit(item)}
                            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                        >
                            <CompassIcon
                                name='pencil-outline'
                                size={20}
                                color={changeOpacity(theme.centerChannelColor, 0.64)}
                            />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.actionButton}
                            onPress={() => handleDelete(item)}
                            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                        >
                            <CompassIcon
                                name='trash-can-outline'
                                size={20}
                                color={theme.errorTextColor}
                            />
                        </TouchableOpacity>
                    </View>
                </View>
                {index < total - 1 && <View style={styles.divider}/>}
            </React.Fragment>
        );
    };

    /**
     * 渲染列表部分
     */
    const renderSection = (
        title: string,
        data: SupplierCustomer[],
        type: SupplierCustomerType,
        onAdd: () => void,
        addButtonStyle: any,
        iconColor: string,
    ) => {
        return (
            <View style={styles.section}>
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>{title}</Text>
                    <TouchableOpacity
                        style={[styles.addButton, addButtonStyle]}
                        onPress={onAdd}
                        hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                    >
                        <CompassIcon
                            name='plus'
                            size={18}
                            color={iconColor}
                        />
                    </TouchableOpacity>
                </View>
                <View style={styles.listContainer}>
                    {loading ? (
                        <View style={styles.loadingContainer}>
                            <Loading color={theme.centerChannelColor} size='small'/>
                        </View>
                    ) : data.length === 0 ? (
                        <Text style={styles.emptyMessage}>
                            {intl.formatMessage({id: 'my_homepage.no_items', defaultMessage: 'No items'})}
                        </Text>
                    ) : (
                        data.map((item, index) => renderListItem(item, index, data.length))
                    )}
                </View>
            </View>
        );
    };

    return (
        <Freeze freeze={!isFocused}>
            <SafeAreaView edges={edges} style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>
                        {intl.formatMessage({id: 'tab_bar.my_homepage.label', defaultMessage: 'My Homepage'})}
                    </Text>
                </View>
                <ScrollView
                    style={styles.flex}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    {renderSection(
                        intl.formatMessage({id: 'my_homepage.my_suppliers', defaultMessage: 'My Suppliers'}),
                        suppliers,
                        'supplier',
                        handleAddSupplier,
                        styles.addButtonSupplier,
                        '#007AFF',
                    )}
                    {renderSection(
                        intl.formatMessage({id: 'my_homepage.my_customers', defaultMessage: 'My Customers'}),
                        customers,
                        'customer',
                        handleAddCustomer,
                        styles.addButtonCustomer,
                        '#34C759',
                    )}
                </ScrollView>
            </SafeAreaView>
        </Freeze>
    );
};

export default MyHomepage;
