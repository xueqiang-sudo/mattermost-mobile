// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';
import {useIntl} from 'react-intl';
import {Alert, View, Text} from 'react-native';

import {useServerUrl} from '@context/server';

import {
    fetchCustomers, fetchCustomerDetail, fetchCustomerOrders,
    createCustomer, deleteCustomer,
    fetchSuppliers, fetchSupplierOrders,
    createSupplier, deleteSupplier,
    fetchSalesOrders, createSalesOrder, deleteSalesOrder,
    fetchPurchaseOrders,
    fetchWorkOrders, createWorkOrder, stopWorkOrder,
    fetchProjects, fetchProjectTasks,
    fetchStockBalances, fetchItems,
} from '../erp_api';

import ErpListScreen from './erp_list_screen';

import type {StackNavigationProp} from '@react-navigation/stack';

type Props = {navigation: StackNavigationProp<any>};

const formatDate = (val: any) => {
    if (!val) {return '-';}
    try {
        const d = new Date(val);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    } catch {return val;}
};

const formatMoney = (val: any, item?: any) => {
    if (val == null) {return '-';}
    const currency = item?.currency || '¥';
    return `${currency} ${Number(val).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
};

const formatProgress = (val: any, item?: any) => {
    if (item?.qty && item?.produced_qty != null) {
        return `${item.produced_qty} / ${item.qty}`;
    }
    if (val != null) {return `${val}%`;}
    return '-';
};

// ─── Customers ───

export const CustomersScreen = ({navigation}: Props) => {
    const intl = useIntl();
    const serverUrl = useServerUrl();

    const handlePress = useCallback(async (item: any) => {
        navigation.navigate('ErpCustomerDetail', {name: item.name});
    }, [navigation]);

    const handleCreate = useCallback(() => {
        navigation.navigate('ErpCustomerForm', {mode: 'create'});
    }, [navigation]);

    const handleDelete = useCallback(async (item: any, refresh: () => void) => {
        try {
            await deleteCustomer(serverUrl, item.name);
            refresh();
        } catch (e: any) {
            Alert.alert('Error', e?.message || String(e));
        }
    }, [serverUrl]);

    return (
        <ErpListScreen
            navigation={navigation}
            title={intl.formatMessage({id: 'erp.customers', defaultMessage: 'Customers'})}
            fetchFn={fetchCustomers}
            fields={[
                {key: 'customer_name', label: 'Name'},
                {key: 'customer_type', label: 'Type'},
                {key: 'customer_group', label: 'Group'},
                {key: 'territory', label: 'Territory'},
            ]}
            searchPlaceholder='Search customers...'
            onItemPress={handlePress}
            canCreate={true}
            onCreate={handleCreate}
            canDelete={true}
            onDelete={handleDelete}
        />
    );
};

// ─── Suppliers ───

export const SuppliersScreen = ({navigation}: Props) => {
    const intl = useIntl();
    const serverUrl = useServerUrl();

    const handlePress = useCallback(async (item: any) => {
        navigation.navigate('ErpSupplierDetail', {name: item.name});
    }, [navigation]);

    const handleCreate = useCallback(() => {
        navigation.navigate('ErpSupplierForm', {mode: 'create'});
    }, [navigation]);

    const handleDelete = useCallback(async (item: any, refresh: () => void) => {
        try {
            await deleteSupplier(serverUrl, item.name);
            refresh();
        } catch (e: any) {
            Alert.alert('Error', e?.message || String(e));
        }
    }, [serverUrl]);

    return (
        <ErpListScreen
            navigation={navigation}
            title={intl.formatMessage({id: 'erp.suppliers', defaultMessage: 'Suppliers'})}
            fetchFn={fetchSuppliers}
            fields={[
                {key: 'supplier_name', label: 'Name'},
                {key: 'supplier_type', label: 'Type'},
                {key: 'supplier_group', label: 'Group'},
            ]}
            searchPlaceholder='Search suppliers...'
            onItemPress={handlePress}
            canCreate={true}
            onCreate={handleCreate}
            canDelete={true}
            onDelete={handleDelete}
        />
    );
};

// ─── Sales Orders ───

export const SalesOrdersScreen = ({navigation}: Props) => {
    const intl = useIntl();
    const serverUrl = useServerUrl();

    const tabs = [
        {key: 'all', label: intl.formatMessage({id: 'erp.all', defaultMessage: 'All'}), filters: []},
        {key: 'pending', label: intl.formatMessage({id: 'erp.pending', defaultMessage: 'Pending'}), filters: [['status', 'in', ['To Deliver and Bill', 'To Deliver', 'To Bill']]]},
        {key: 'completed', label: intl.formatMessage({id: 'erp.completed', defaultMessage: 'Completed'}), filters: [['status', '=', 'Completed']]},
    ];

    const handlePress = useCallback(async (item: any) => {
        navigation.navigate('ErpSalesOrderDetail', {name: item.name});
    }, [navigation]);

    return (
        <ErpListScreen
            navigation={navigation}
            title={intl.formatMessage({id: 'erp.sales_orders', defaultMessage: 'Sales Orders'})}
            fetchFn={fetchSalesOrders}
            tabs={tabs}
            fields={[
                {key: 'customer_name', label: 'Customer'},
                {key: 'grand_total', label: 'Amount', format: formatMoney},
                {key: 'transaction_date', label: 'Date', format: formatDate},
                {key: 'delivery_status', label: 'Delivery'},
            ]}
            searchPlaceholder='Search orders...'
            onItemPress={handlePress}
        />
    );
};

// ─── Purchase Orders ───

export const PurchaseOrdersScreen = ({navigation}: Props) => {
    const intl = useIntl();

    const tabs = [
        {key: 'all', label: intl.formatMessage({id: 'erp.all', defaultMessage: 'All'}), filters: []},
        {key: 'pending', label: intl.formatMessage({id: 'erp.pending', defaultMessage: 'Pending'}), filters: [['status', 'in', ['To Receive and Bill', 'To Receive', 'To Bill']]]},
        {key: 'completed', label: intl.formatMessage({id: 'erp.completed', defaultMessage: 'Completed'}), filters: [['status', '=', 'Completed']]},
    ];

    const handlePress = useCallback(async (item: any) => {
        navigation.navigate('ErpPurchaseOrderDetail', {name: item.name});
    }, [navigation]);

    return (
        <ErpListScreen
            navigation={navigation}
            title={intl.formatMessage({id: 'erp.purchase_orders', defaultMessage: 'Purchase Orders'})}
            fetchFn={fetchPurchaseOrders}
            tabs={tabs}
            fields={[
                {key: 'supplier_name', label: 'Supplier'},
                {key: 'grand_total', label: 'Amount', format: formatMoney},
                {key: 'transaction_date', label: 'Date', format: formatDate},
                {key: 'status', label: 'Status'},
            ]}
            searchPlaceholder='Search orders...'
            onItemPress={handlePress}
        />
    );
};

// ─── Work Orders (Manufacturing) ───

export const WorkOrdersScreen = ({navigation}: Props) => {
    const intl = useIntl();

    const tabs = [
        {key: 'all', label: intl.formatMessage({id: 'erp.all', defaultMessage: 'All'}), filters: [['status', 'not in', ['Cancelled', 'Draft']]]},
        {key: 'in_process', label: intl.formatMessage({id: 'erp.in_process', defaultMessage: 'In Process'}), filters: [['status', '=', 'In Process']]},
        {key: 'completed', label: intl.formatMessage({id: 'erp.completed', defaultMessage: 'Completed'}), filters: [['status', '=', 'Completed']]},
        {key: 'not_started', label: intl.formatMessage({id: 'erp.not_started', defaultMessage: 'Not Started'}), filters: [['status', '=', 'Not Started']]},
    ];

    const handlePress = useCallback(async (item: any) => {
        navigation.navigate('ErpWorkOrderDetail', {name: item.name});
    }, [navigation]);

    return (
        <ErpListScreen
            navigation={navigation}
            title={intl.formatMessage({id: 'erp.work_orders', defaultMessage: 'Work Orders'})}
            fetchFn={fetchWorkOrders}
            tabs={tabs}
            fields={[
                {key: 'production_item', label: 'Product'},
                {key: 'produced_qty', label: 'Progress', format: formatProgress},
                {key: 'planned_start_date', label: 'Start', format: formatDate},
                {key: 'planned_end_date', label: 'End', format: formatDate},
            ]}
            searchPlaceholder='Search work orders...'
            onItemPress={handlePress}
        />
    );
};

// ─── Projects ───

export const ProjectsScreen = ({navigation}: Props) => {
    const intl = useIntl();

    const tabs = [
        {key: 'all', label: intl.formatMessage({id: 'erp.all', defaultMessage: 'All'}), filters: []},
        {key: 'open', label: intl.formatMessage({id: 'erp.open', defaultMessage: 'Open'}), filters: [['status', '=', 'Open']]},
        {key: 'completed', label: intl.formatMessage({id: 'erp.completed', defaultMessage: 'Completed'}), filters: [['status', '=', 'Completed']]},
    ];

    const handlePress = useCallback(async (item: any) => {
        navigation.navigate('ErpProjectDetail', {name: item.name});
    }, [navigation]);

    return (
        <ErpListScreen
            navigation={navigation}
            title={intl.formatMessage({id: 'erp.projects', defaultMessage: 'Projects'})}
            fetchFn={fetchProjects}
            tabs={tabs}
            fields={[
                {key: 'project_name', label: 'Name'},
                {key: 'percent_complete', label: 'Progress', format: (val: any) => val != null ? `${val}%` : '-'},
                {key: 'expected_start_date', label: 'Start', format: formatDate},
                {key: 'expected_end_date', label: 'End', format: formatDate},
                {key: 'priority', label: 'Priority'},
            ]}
            searchPlaceholder='Search projects...'
            onItemPress={handlePress}
        />
    );
};

// ─── Stock / Inventory ───

export const StockScreen = ({navigation}: Props) => {
    const intl = useIntl();

    return (
        <ErpListScreen
            navigation={navigation}
            title={intl.formatMessage({id: 'erp.stock', defaultMessage: 'Stock'})}
            fetchFn={fetchItems}
            fields={[
                {key: 'item_name', label: 'Name'},
                {key: 'item_code', label: 'Code'},
                {key: 'item_group', label: 'Group'},
                {key: 'stock_uom', label: 'UOM'},
            ]}
            searchPlaceholder='Search items...'
            onItemPress={(item) => navigation.navigate('ErpItemStock', {itemCode: item.item_code, itemName: item.item_name})}
        />
    );
};
