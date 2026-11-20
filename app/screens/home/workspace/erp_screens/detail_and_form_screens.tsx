// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

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
import ErpListScreen from './erp_list_screen';

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

export const CustomerDetailScreen = (props: any) => (
    <ErpDetailScreen
        {...props}
        fetchDetailFn={fetchCustomerDetail}
        fields={[
            {key: 'customer_name', label: '客户名称'},
            {key: 'customer_type', label: '类型'},
            {key: 'customer_group', label: '分组'},
            {key: 'territory', label: '区域'},
            {key: 'customer_primary_contact', label: '联系人'},
            {key: 'customer_primary_address', label: '地址'},
            {key: 'industry', label: '行业'},
            {key: 'modified', label: '更新时间', format: formatDate},
        ]}
        subLists={[{
            title: '历史订单',
            fetchFn: fetchCustomerOrders,
            fields: [
                {key: 'name', label: '订单号'},
                {key: 'grand_total', label: '金额', format: formatMoney},
                {key: 'transaction_date', label: '日期', format: formatDate},
                {key: 'status', label: '状态'},
                {key: 'delivery_status', label: '发货'},
            ],
        }]}
        canEdit={true}
        editScreen='ErpCustomerForm'
        canDelete={true}
        deleteFn={deleteCustomer}
    />
);

// ─── Customer Form ───

export const CustomerFormScreen = (props: any) => (
    <ErpFormScreen
        {...props}
        title='客户'
        fields={[
            {key: 'customer_name', label: '客户名称', required: true, placeholder: '输入客户名称'},
            {key: 'customer_type', label: '类型', type: 'select', required: true, defaultValue: 'Company', options: [
                {label: '公司', value: 'Company'},
                {label: '个人', value: 'Individual'},
                {label: '合伙', value: 'Partnership'},
            ]},
            {key: 'customer_group', label: '分组', placeholder: '如：Commercial, Individual, Non Profit'},
            {key: 'territory', label: '区域', placeholder: '如：China, All Territories'},
        ]}
        createFn={createCustomer}
        updateFn={updateCustomer}
    />
);

// ─── Supplier Detail ───

export const SupplierDetailScreen = (props: any) => (
    <ErpDetailScreen
        {...props}
        fetchDetailFn={fetchSupplierDetail}
        fields={[
            {key: 'supplier_name', label: '供应商名称'},
            {key: 'supplier_type', label: '类型'},
            {key: 'supplier_group', label: '分组'},
            {key: 'supplier_primary_contact', label: '联系人'},
            {key: 'modified', label: '更新时间', format: formatDate},
        ]}
        subLists={[{
            title: '采购订单',
            fetchFn: fetchSupplierOrders,
            fields: [
                {key: 'name', label: '订单号'},
                {key: 'grand_total', label: '金额', format: formatMoney},
                {key: 'transaction_date', label: '日期', format: formatDate},
                {key: 'status', label: '状态'},
            ],
        }]}
        canEdit={true}
        editScreen='ErpSupplierForm'
        canDelete={true}
        deleteFn={deleteSupplier}
    />
);

// ─── Supplier Form ───

export const SupplierFormScreen = (props: any) => (
    <ErpFormScreen
        {...props}
        title='供应商'
        fields={[
            {key: 'supplier_name', label: '供应商名称', required: true, placeholder: '输入供应商名称'},
            {key: 'supplier_type', label: '类型', type: 'select', required: true, defaultValue: 'Company', options: [
                {label: '公司', value: 'Company'},
                {label: '个人', value: 'Individual'},
                {label: '合伙', value: 'Partnership'},
            ]},
            {key: 'supplier_group', label: '分组', placeholder: '如：Raw Material, Services'},
        ]}
        createFn={createSupplier}
        updateFn={updateSupplier}
    />
);

// ─── Sales Order Detail ───

export const SalesOrderDetailScreen = (props: any) => (
    <ErpDetailScreen
        {...props}
        fetchDetailFn={fetchSalesOrderDetail}
        fields={[
            {key: 'customer_name', label: '客户'},
            {key: 'transaction_date', label: '下单日期', format: formatDate},
            {key: 'delivery_date', label: '交货日期', format: formatDate},
            {key: 'grand_total', label: '总金额', format: formatMoney},
            {key: 'status', label: '状态'},
            {key: 'delivery_status', label: '发货状态'},
            {key: 'billing_status', label: '开票状态'},
            {key: 'contact_person', label: '联系人'},
            {key: 'contact_mobile', label: '电话'},
            {key: 'customer_address', label: '地址'},
        ]}
        canEdit={true}
        editScreen='ErpSalesOrderDetailForm'
        canDelete={true}
        deleteFn={deleteSalesOrder}
    />
);

// ─── Sales Order Form ───

export const SalesOrderFormScreen = (props: any) => (
    <ErpFormScreen
        {...props}
        title='销售订单'
        fields={[
            {key: 'customer', label: '客户', required: true, placeholder: '输入客户名称'},
            {key: 'transaction_date', label: '下单日期', required: true, placeholder: 'YYYY-MM-DD'},
            {key: 'delivery_date', label: '交货日期', placeholder: 'YYYY-MM-DD'},
            {key: 'order_type', label: '类型', type: 'select', defaultValue: 'Sales', options: [
                {label: '销售', value: 'Sales'},
                {label: '维护', value: 'Maintenance'},
            ]},
        ]}
        createFn={createSalesOrder}
        updateFn={updateSalesOrder}
    />
);

// ─── Purchase Order Detail ───

export const PurchaseOrderDetailScreen = (props: any) => (
    <ErpDetailScreen
        {...props}
        fetchDetailFn={fetchPurchaseOrderDetail}
        fields={[
            {key: 'supplier_name', label: '供应商'},
            {key: 'transaction_date', label: '下单日期', format: formatDate},
            {key: 'schedule_date', label: '计划到货', format: formatDate},
            {key: 'grand_total', label: '总金额', format: formatMoney},
            {key: 'status', label: '状态'},
            {key: 'contact_person', label: '联系人'},
            {key: 'contact_mobile', label: '电话'},
        ]}
    />
);

// ─── Work Order Detail ───

export const WorkOrderDetailScreen = (props: any) => (
    <ErpDetailScreen
        {...props}
        fetchDetailFn={fetchWorkOrderDetail}
        fields={[
            {key: 'production_item', label: '产品'},
            {key: 'bom_no', label: 'BOM'},
            {key: 'qty', label: '计划数量'},
            {key: 'produced_qty', label: '已完成'},
            {key: 'status', label: '状态'},
            {key: 'planned_start_date', label: '计划开始', format: formatDate},
            {key: 'planned_end_date', label: '计划结束', format: formatDate},
            {key: 'actual_start_date', label: '实际开始', format: formatDate},
            {key: 'actual_end_date', label: '实际结束', format: formatDate},
            {key: 'sales_order', label: '销售订单'},
            {key: 'wip_warehouse', label: '在制品仓'},
            {key: 'fg_warehouse', label: '成品仓'},
        ]}
        canEdit={true}
        editScreen='ErpWorkOrderDetailForm'
    />
);

// ─── Work Order Form ───

export const WorkOrderFormScreen = (props: any) => (
    <ErpFormScreen
        {...props}
        title='生产工单'
        fields={[
            {key: 'production_item', label: '产品', required: true, placeholder: '输入物品编码'},
            {key: 'bom_no', label: 'BOM 编号', required: true, placeholder: '输入 BOM 编号'},
            {key: 'qty', label: '数量', type: 'number', required: true, placeholder: '输入生产数量'},
            {key: 'planned_start_date', label: '计划开始', required: true, placeholder: 'YYYY-MM-DD HH:MM'},
            {key: 'wip_warehouse', label: '在制品仓', placeholder: '仓库名称'},
            {key: 'fg_warehouse', label: '成品仓', placeholder: '仓库名称'},
        ]}
        createFn={createWorkOrder}
        updateFn={updateWorkOrder}
    />
);

// ─── Project Detail ───

export const ProjectDetailScreen = (props: any) => (
    <ErpDetailScreen
        {...props}
        fetchDetailFn={fetchProjectDetail}
        fields={[
            {key: 'project_name', label: '项目名称'},
            {key: 'status', label: '状态'},
            {key: 'percent_complete', label: '进度', format: (val: any) => val != null ? `${val}%` : '-'},
            {key: 'priority', label: '优先级'},
            {key: 'expected_start_date', label: '计划开始', format: formatDate},
            {key: 'expected_end_date', label: '计划结束', format: formatDate},
            {key: 'actual_start_date', label: '实际开始', format: formatDate},
            {key: 'actual_end_date', label: '实际结束', format: formatDate},
            {key: 'customer', label: '客户'},
            {key: 'department', label: '部门'},
            {key: 'estimated_costing', label: '预算'},
        ]}
        subLists={[{
            title: '任务列表',
            fetchFn: fetchProjectTasks,
            fields: [
                {key: 'subject', label: '任务'},
                {key: 'status', label: '状态'},
                {key: 'progress', label: '进度', format: (val: any) => val != null ? `${val}%` : '-'},
                {key: 'priority', label: '优先级'},
                {key: 'exp_end_date', label: '截止', format: formatDate},
            ],
        }]}
    />
);

// ─── Item Stock Detail ───

export const ItemStockScreen = (props: any) => {
    const {itemCode, itemName} = props.route.params;

    const fetchItemStock = async (serverUrl: string, _name: string) => {
        return fetchStockBalances(serverUrl, [['item_code', '=', itemCode]]);
    };

    return (
        <ErpDetailScreen
            {...props}
            route={{params: {name: itemCode}}}
            fetchDetailFn={async (serverUrl: string) => ({
                name: itemCode,
                item_name: itemName,
                item_code: itemCode,
            })}
            fields={[
                {key: 'item_name', label: '物品名称'},
                {key: 'item_code', label: '物品编码'},
            ]}
            subLists={[{
                title: '各仓库库存',
                fetchFn: fetchItemStock,
                fields: [
                    {key: 'warehouse', label: '仓库'},
                    {key: 'actual_qty', label: '实际库存', format: (val: any) => val != null ? String(Number(val).toFixed(2)) : '0'},
                    {key: 'reserved_qty', label: '预留', format: (val: any) => val != null ? String(Number(val).toFixed(2)) : '0'},
                    {key: 'projected_qty', label: '预计', format: (val: any) => val != null ? String(Number(val).toFixed(2)) : '0'},
                ],
            }]}
        />
    );
};
