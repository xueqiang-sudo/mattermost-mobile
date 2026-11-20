// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {useIntl} from 'react-intl';

import {
    fetchCustomerDetail, fetchCustomerOrders,
    createCustomer, updateCustomer, deleteCustomer,
    fetchSupplierDetail, fetchSupplierOrders,
    createSupplier, updateSupplier, deleteSupplier,
    fetchSalesOrderDetail,
    createSalesOrder, updateSalesOrder, deleteSalesOrder,
    fetchPurchaseOrderDetail,
    fetchWorkOrderDetail,
    createWorkOrder, updateWorkOrder,
    fetchProjectDetail, fetchProjectTasks,
    fetchStockBalances,
} from '../erp_api';

import ErpDetailScreen from './erp_detail_screen';
import ErpFormScreen from './erp_form_screen';

const formatDate = (val: any) => {
    if (!val) {return '-';}
    try {
        const d = new Date(val);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    } catch {return val;}
};

const formatMoney = (val: any, item?: any) => {
    if (val == null) {return '-';}
    return `${item?.currency || '¥'} ${Number(val).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
};

// ─── Customer Detail ───

export const CustomerDetailScreen = (props: any) => {
    const intl = useIntl();
    return (
        <ErpDetailScreen
            {...props}
            fetchDetailFn={fetchCustomerDetail}
            fields={[
                {key: 'customer_name', label: intl.formatMessage({id: 'erp.field.customer_name', defaultMessage: 'Customer Name'})},
                {key: 'customer_type', label: intl.formatMessage({id: 'erp.field.type', defaultMessage: 'Type'})},
                {key: 'customer_group', label: intl.formatMessage({id: 'erp.field.group', defaultMessage: 'Group'})},
                {key: 'territory', label: intl.formatMessage({id: 'erp.field.territory', defaultMessage: 'Territory'})},
                {key: 'customer_primary_contact', label: intl.formatMessage({id: 'erp.field.contact', defaultMessage: 'Contact'})},
                {key: 'customer_primary_address', label: intl.formatMessage({id: 'erp.field.address', defaultMessage: 'Address'})},
                {key: 'industry', label: intl.formatMessage({id: 'erp.field.industry', defaultMessage: 'Industry'})},
                {key: 'modified', label: intl.formatMessage({id: 'erp.field.updated', defaultMessage: 'Updated'}), format: formatDate},
            ]}
            subLists={[{
                title: intl.formatMessage({id: 'erp.sublist.order_history', defaultMessage: 'Order History'}),
                fetchFn: fetchCustomerOrders,
                fields: [
                    {key: 'name', label: intl.formatMessage({id: 'erp.field.order_no', defaultMessage: 'Order No.'})},
                    {key: 'grand_total', label: intl.formatMessage({id: 'erp.field.amount', defaultMessage: 'Amount'}), format: formatMoney},
                    {key: 'transaction_date', label: intl.formatMessage({id: 'erp.field.date', defaultMessage: 'Date'}), format: formatDate},
                    {key: 'status', label: intl.formatMessage({id: 'erp.field.status', defaultMessage: 'Status'})},
                    {key: 'delivery_status', label: intl.formatMessage({id: 'erp.field.delivery', defaultMessage: 'Delivery'})},
                ],
            }]}
            canEdit={true}
            editScreen='ErpCustomerForm'
            canDelete={true}
            deleteFn={deleteCustomer}
        />
    );
};

// ─── Customer Form ───

export const CustomerFormScreen = (props: any) => {
    const intl = useIntl();
    return (
        <ErpFormScreen
            {...props}
            title={intl.formatMessage({id: 'erp.form.customer', defaultMessage: 'Customer'})}
            fields={[
                {key: 'customer_name', label: intl.formatMessage({id: 'erp.field.customer_name', defaultMessage: 'Customer Name'}), required: true, placeholder: intl.formatMessage({id: 'erp.placeholder.customer_name', defaultMessage: 'Enter customer name'})},
                {key: 'customer_type', label: intl.formatMessage({id: 'erp.field.type', defaultMessage: 'Type'}), type: 'select', required: true, defaultValue: 'Company', options: [
                    {label: intl.formatMessage({id: 'erp.type.company', defaultMessage: 'Company'}), value: 'Company'},
                    {label: intl.formatMessage({id: 'erp.type.individual', defaultMessage: 'Individual'}), value: 'Individual'},
                    {label: intl.formatMessage({id: 'erp.type.partnership', defaultMessage: 'Partnership'}), value: 'Partnership'},
                ]},
                {key: 'customer_group', label: intl.formatMessage({id: 'erp.field.group', defaultMessage: 'Group'}), placeholder: intl.formatMessage({id: 'erp.placeholder.group', defaultMessage: 'e.g. Commercial, Individual'})},
                {key: 'territory', label: intl.formatMessage({id: 'erp.field.territory', defaultMessage: 'Territory'}), placeholder: intl.formatMessage({id: 'erp.placeholder.territory', defaultMessage: 'e.g. China, All Territories'})},
            ]}
            createFn={createCustomer}
            updateFn={updateCustomer}
        />
    );
};

// ─── Supplier Detail ───

export const SupplierDetailScreen = (props: any) => {
    const intl = useIntl();
    return (
        <ErpDetailScreen
            {...props}
            fetchDetailFn={fetchSupplierDetail}
            fields={[
                {key: 'supplier_name', label: intl.formatMessage({id: 'erp.field.supplier_name', defaultMessage: 'Supplier Name'})},
                {key: 'supplier_type', label: intl.formatMessage({id: 'erp.field.type', defaultMessage: 'Type'})},
                {key: 'supplier_group', label: intl.formatMessage({id: 'erp.field.group', defaultMessage: 'Group'})},
                {key: 'supplier_primary_contact', label: intl.formatMessage({id: 'erp.field.contact', defaultMessage: 'Contact'})},
                {key: 'modified', label: intl.formatMessage({id: 'erp.field.updated', defaultMessage: 'Updated'}), format: formatDate},
            ]}
            subLists={[{
                title: intl.formatMessage({id: 'erp.sublist.purchase_orders', defaultMessage: 'Purchase Orders'}),
                fetchFn: fetchSupplierOrders,
                fields: [
                    {key: 'name', label: intl.formatMessage({id: 'erp.field.order_no', defaultMessage: 'Order No.'})},
                    {key: 'grand_total', label: intl.formatMessage({id: 'erp.field.amount', defaultMessage: 'Amount'}), format: formatMoney},
                    {key: 'transaction_date', label: intl.formatMessage({id: 'erp.field.date', defaultMessage: 'Date'}), format: formatDate},
                    {key: 'status', label: intl.formatMessage({id: 'erp.field.status', defaultMessage: 'Status'})},
                ],
            }]}
            canEdit={true}
            editScreen='ErpSupplierForm'
            canDelete={true}
            deleteFn={deleteSupplier}
        />
    );
};

// ─── Supplier Form ───

export const SupplierFormScreen = (props: any) => {
    const intl = useIntl();
    return (
        <ErpFormScreen
            {...props}
            title={intl.formatMessage({id: 'erp.form.supplier', defaultMessage: 'Supplier'})}
            fields={[
                {key: 'supplier_name', label: intl.formatMessage({id: 'erp.field.supplier_name', defaultMessage: 'Supplier Name'}), required: true, placeholder: intl.formatMessage({id: 'erp.placeholder.supplier_name', defaultMessage: 'Enter supplier name'})},
                {key: 'supplier_type', label: intl.formatMessage({id: 'erp.field.type', defaultMessage: 'Type'}), type: 'select', required: true, defaultValue: 'Company', options: [
                    {label: intl.formatMessage({id: 'erp.type.company', defaultMessage: 'Company'}), value: 'Company'},
                    {label: intl.formatMessage({id: 'erp.type.individual', defaultMessage: 'Individual'}), value: 'Individual'},
                    {label: intl.formatMessage({id: 'erp.type.partnership', defaultMessage: 'Partnership'}), value: 'Partnership'},
                ]},
                {key: 'supplier_group', label: intl.formatMessage({id: 'erp.field.group', defaultMessage: 'Group'}), placeholder: intl.formatMessage({id: 'erp.placeholder.group', defaultMessage: 'e.g. Raw Material, Services'})},
            ]}
            createFn={createSupplier}
            updateFn={updateSupplier}
        />
    );
};

// ─── Sales Order Detail ───

export const SalesOrderDetailScreen = (props: any) => {
    const intl = useIntl();
    return (
        <ErpDetailScreen
            {...props}
            fetchDetailFn={fetchSalesOrderDetail}
            fields={[
                {key: 'customer_name', label: intl.formatMessage({id: 'erp.field.customer', defaultMessage: 'Customer'})},
                {key: 'transaction_date', label: intl.formatMessage({id: 'erp.field.order_date', defaultMessage: 'Order Date'}), format: formatDate},
                {key: 'delivery_date', label: intl.formatMessage({id: 'erp.field.delivery_date', defaultMessage: 'Delivery Date'}), format: formatDate},
                {key: 'grand_total', label: intl.formatMessage({id: 'erp.field.total', defaultMessage: 'Total'}), format: formatMoney},
                {key: 'status', label: intl.formatMessage({id: 'erp.field.status', defaultMessage: 'Status'})},
                {key: 'delivery_status', label: intl.formatMessage({id: 'erp.field.delivery_status', defaultMessage: 'Delivery Status'})},
                {key: 'billing_status', label: intl.formatMessage({id: 'erp.field.billing_status', defaultMessage: 'Billing Status'})},
                {key: 'contact_person', label: intl.formatMessage({id: 'erp.field.contact', defaultMessage: 'Contact'})},
                {key: 'contact_mobile', label: intl.formatMessage({id: 'erp.field.phone', defaultMessage: 'Phone'})},
                {key: 'customer_address', label: intl.formatMessage({id: 'erp.field.address', defaultMessage: 'Address'})},
            ]}
            canEdit={true}
            editScreen='ErpSalesOrderDetailForm'
            canDelete={true}
            deleteFn={deleteSalesOrder}
        />
    );
};

// ─── Sales Order Form ───

export const SalesOrderFormScreen = (props: any) => {
    const intl = useIntl();
    return (
        <ErpFormScreen
            {...props}
            title={intl.formatMessage({id: 'erp.form.sales_order', defaultMessage: 'Sales Order'})}
            fields={[
                {key: 'customer', label: intl.formatMessage({id: 'erp.field.customer', defaultMessage: 'Customer'}), required: true, placeholder: intl.formatMessage({id: 'erp.placeholder.customer_name', defaultMessage: 'Enter customer name'})},
                {key: 'transaction_date', label: intl.formatMessage({id: 'erp.field.order_date', defaultMessage: 'Order Date'}), required: true, placeholder: 'YYYY-MM-DD'},
                {key: 'delivery_date', label: intl.formatMessage({id: 'erp.field.delivery_date', defaultMessage: 'Delivery Date'}), placeholder: 'YYYY-MM-DD'},
                {key: 'order_type', label: intl.formatMessage({id: 'erp.field.type', defaultMessage: 'Type'}), type: 'select', defaultValue: 'Sales', options: [
                    {label: intl.formatMessage({id: 'erp.type.sales', defaultMessage: 'Sales'}), value: 'Sales'},
                    {label: intl.formatMessage({id: 'erp.type.maintenance', defaultMessage: 'Maintenance'}), value: 'Maintenance'},
                ]},
            ]}
            createFn={createSalesOrder}
            updateFn={updateSalesOrder}
        />
    );
};

// ─── Purchase Order Detail ───

export const PurchaseOrderDetailScreen = (props: any) => {
    const intl = useIntl();
    return (
        <ErpDetailScreen
            {...props}
            fetchDetailFn={fetchPurchaseOrderDetail}
            fields={[
                {key: 'supplier_name', label: intl.formatMessage({id: 'erp.field.supplier', defaultMessage: 'Supplier'})},
                {key: 'transaction_date', label: intl.formatMessage({id: 'erp.field.order_date', defaultMessage: 'Order Date'}), format: formatDate},
                {key: 'schedule_date', label: intl.formatMessage({id: 'erp.field.schedule_date', defaultMessage: 'Expected Arrival'}), format: formatDate},
                {key: 'grand_total', label: intl.formatMessage({id: 'erp.field.total', defaultMessage: 'Total'}), format: formatMoney},
                {key: 'status', label: intl.formatMessage({id: 'erp.field.status', defaultMessage: 'Status'})},
                {key: 'contact_person', label: intl.formatMessage({id: 'erp.field.contact', defaultMessage: 'Contact'})},
                {key: 'contact_mobile', label: intl.formatMessage({id: 'erp.field.phone', defaultMessage: 'Phone'})},
            ]}
        />
    );
};

// ─── Work Order Detail ───

export const WorkOrderDetailScreen = (props: any) => {
    const intl = useIntl();
    return (
        <ErpDetailScreen
            {...props}
            fetchDetailFn={fetchWorkOrderDetail}
            fields={[
                {key: 'production_item', label: intl.formatMessage({id: 'erp.field.product', defaultMessage: 'Product'})},
                {key: 'bom_no', label: intl.formatMessage({id: 'erp.field.bom', defaultMessage: 'BOM'})},
                {key: 'qty', label: intl.formatMessage({id: 'erp.field.planned_qty', defaultMessage: 'Planned Qty'})},
                {key: 'produced_qty', label: intl.formatMessage({id: 'erp.field.produced_qty', defaultMessage: 'Produced Qty'})},
                {key: 'status', label: intl.formatMessage({id: 'erp.field.status', defaultMessage: 'Status'})},
                {key: 'planned_start_date', label: intl.formatMessage({id: 'erp.field.planned_start', defaultMessage: 'Planned Start'}), format: formatDate},
                {key: 'planned_end_date', label: intl.formatMessage({id: 'erp.field.planned_end', defaultMessage: 'Planned End'}), format: formatDate},
                {key: 'actual_start_date', label: intl.formatMessage({id: 'erp.field.actual_start', defaultMessage: 'Actual Start'}), format: formatDate},
                {key: 'actual_end_date', label: intl.formatMessage({id: 'erp.field.actual_end', defaultMessage: 'Actual End'}), format: formatDate},
                {key: 'sales_order', label: intl.formatMessage({id: 'erp.field.sales_order', defaultMessage: 'Sales Order'})},
                {key: 'wip_warehouse', label: intl.formatMessage({id: 'erp.field.wip_warehouse', defaultMessage: 'WIP Warehouse'})},
                {key: 'fg_warehouse', label: intl.formatMessage({id: 'erp.field.fg_warehouse', defaultMessage: 'Finished Goods Warehouse'})},
            ]}
            canEdit={true}
            editScreen='ErpWorkOrderDetailForm'
        />
    );
};

// ─── Work Order Form ───

export const WorkOrderFormScreen = (props: any) => {
    const intl = useIntl();
    return (
        <ErpFormScreen
            {...props}
            title={intl.formatMessage({id: 'erp.form.work_order', defaultMessage: 'Work Order'})}
            fields={[
                {key: 'production_item', label: intl.formatMessage({id: 'erp.field.product', defaultMessage: 'Product'}), required: true, placeholder: intl.formatMessage({id: 'erp.placeholder.item_code', defaultMessage: 'Enter item code'})},
                {key: 'bom_no', label: intl.formatMessage({id: 'erp.field.bom', defaultMessage: 'BOM'}), required: true, placeholder: intl.formatMessage({id: 'erp.placeholder.bom_no', defaultMessage: 'Enter BOM number'})},
                {key: 'qty', label: intl.formatMessage({id: 'erp.field.quantity', defaultMessage: 'Quantity'}), type: 'number', required: true, placeholder: intl.formatMessage({id: 'erp.placeholder.qty', defaultMessage: 'Enter quantity'})},
                {key: 'planned_start_date', label: intl.formatMessage({id: 'erp.field.planned_start', defaultMessage: 'Planned Start'}), required: true, placeholder: 'YYYY-MM-DD HH:MM'},
                {key: 'wip_warehouse', label: intl.formatMessage({id: 'erp.field.wip_warehouse', defaultMessage: 'WIP Warehouse'}), placeholder: intl.formatMessage({id: 'erp.placeholder.warehouse', defaultMessage: 'Warehouse name'})},
                {key: 'fg_warehouse', label: intl.formatMessage({id: 'erp.field.fg_warehouse', defaultMessage: 'Finished Goods Warehouse'}), placeholder: intl.formatMessage({id: 'erp.placeholder.warehouse', defaultMessage: 'Warehouse name'})},
            ]}
            createFn={createWorkOrder}
            updateFn={updateWorkOrder}
        />
    );
};

// ─── Project Detail ───

export const ProjectDetailScreen = (props: any) => {
    const intl = useIntl();
    return (
        <ErpDetailScreen
            {...props}
            fetchDetailFn={fetchProjectDetail}
            fields={[
                {key: 'project_name', label: intl.formatMessage({id: 'erp.field.project_name', defaultMessage: 'Project Name'})},
                {key: 'status', label: intl.formatMessage({id: 'erp.field.status', defaultMessage: 'Status'})},
                {key: 'percent_complete', label: intl.formatMessage({id: 'erp.field.progress', defaultMessage: 'Progress'}), format: (val: any) => val != null ? `${val}%` : '-'},
                {key: 'priority', label: intl.formatMessage({id: 'erp.field.priority', defaultMessage: 'Priority'})},
                {key: 'expected_start_date', label: intl.formatMessage({id: 'erp.field.planned_start', defaultMessage: 'Planned Start'}), format: formatDate},
                {key: 'expected_end_date', label: intl.formatMessage({id: 'erp.field.planned_end', defaultMessage: 'Planned End'}), format: formatDate},
                {key: 'actual_start_date', label: intl.formatMessage({id: 'erp.field.actual_start', defaultMessage: 'Actual Start'}), format: formatDate},
                {key: 'actual_end_date', label: intl.formatMessage({id: 'erp.field.actual_end', defaultMessage: 'Actual End'}), format: formatDate},
                {key: 'customer', label: intl.formatMessage({id: 'erp.field.customer', defaultMessage: 'Customer'})},
                {key: 'department', label: intl.formatMessage({id: 'erp.field.department', defaultMessage: 'Department'})},
                {key: 'estimated_costing', label: intl.formatMessage({id: 'erp.field.budget', defaultMessage: 'Budget'})},
            ]}
            subLists={[{
                title: intl.formatMessage({id: 'erp.sublist.tasks', defaultMessage: 'Tasks'}),
                fetchFn: fetchProjectTasks,
                fields: [
                    {key: 'subject', label: intl.formatMessage({id: 'erp.field.task', defaultMessage: 'Task'})},
                    {key: 'status', label: intl.formatMessage({id: 'erp.field.status', defaultMessage: 'Status'})},
                    {key: 'progress', label: intl.formatMessage({id: 'erp.field.progress', defaultMessage: 'Progress'}), format: (val: any) => val != null ? `${val}%` : '-'},
                    {key: 'priority', label: intl.formatMessage({id: 'erp.field.priority', defaultMessage: 'Priority'})},
                    {key: 'exp_end_date', label: intl.formatMessage({id: 'erp.field.deadline', defaultMessage: 'Deadline'}), format: formatDate},
                ],
            }]}
        />
    );
};

// ─── Item Stock Detail ───

export const ItemStockScreen = (props: any) => {
    const intl = useIntl();
    const {itemCode, itemName} = props.route.params;

    const fetchItemStock = async (serverUrl: string, _name: string) => {
        return fetchStockBalances(serverUrl, [['item_code', '=', itemCode]]);
    };

    return (
        <ErpDetailScreen
            {...props}
            route={{params: {name: itemCode}}}
            fetchDetailFn={async () => ({
                name: itemCode,
                item_name: itemName,
                item_code: itemCode,
            })}
            fields={[
                {key: 'item_name', label: intl.formatMessage({id: 'erp.field.item_name', defaultMessage: 'Item Name'})},
                {key: 'item_code', label: intl.formatMessage({id: 'erp.field.item_code', defaultMessage: 'Item Code'})},
            ]}
            subLists={[{
                title: intl.formatMessage({id: 'erp.sublist.warehouse_stock', defaultMessage: 'Stock by Warehouse'}),
                fetchFn: fetchItemStock,
                fields: [
                    {key: 'warehouse', label: intl.formatMessage({id: 'erp.field.warehouse', defaultMessage: 'Warehouse'})},
                    {key: 'actual_qty', label: intl.formatMessage({id: 'erp.field.actual_qty', defaultMessage: 'Actual Qty'}), format: (val: any) => val != null ? String(Number(val).toFixed(2)) : '0'},
                    {key: 'reserved_qty', label: intl.formatMessage({id: 'erp.field.reserved_qty', defaultMessage: 'Reserved'}), format: (val: any) => val != null ? String(Number(val).toFixed(2)) : '0'},
                    {key: 'projected_qty', label: intl.formatMessage({id: 'erp.field.projected_qty', defaultMessage: 'Projected'}), format: (val: any) => val != null ? String(Number(val).toFixed(2)) : '0'},
                ],
            }]}
        />
    );
};
