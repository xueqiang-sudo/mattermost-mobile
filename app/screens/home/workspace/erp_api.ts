// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * ERP Proxy API — calls ERP REST API through frappe-sync proxy
 */

import NetworkManager from '@managers/network_manager';
import DatabaseManager from '@database/manager';
import {getCurrentTeamId} from '@queries/servers/system';

const PROXY_BASE = '/plugins/com.mattermost.frappe-sync/api/erp/proxy';

async function getTeamId(serverUrl: string): Promise<string> {
    const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
    return (await getCurrentTeamId(database)) || '';
}

async function erpFetch(serverUrl: string, path: string, options: RequestInit = {}): Promise<any> {
    const client = NetworkManager.getClient(serverUrl);
    const teamId = await getTeamId(serverUrl);
    const separator = path.includes('?') ? '&' : '?';
    const url = `${PROXY_BASE}${path}${separator}team_id=${teamId}`;
    try {
        return await client.doFetch(url, options);
    } catch (error: any) {
        const status = error?.status_code || error?.statusCode || error?.response?.status;
        if (status === 401 || status === 403) {
            throw new Error('ERP_ACCESS_DENIED');
        }
        throw error;
    }
}

// ─── Generic CRUD ───

export async function erpList(serverUrl: string, doctype: string, fields: string[], filters: any[][] = [], limit = 50, offset = 0): Promise<any[]> {
    const fieldsJson = JSON.stringify(fields);
    const filtersJson = JSON.stringify(filters);
    const path = `/api/resource/${doctype}?fields=${fieldsJson}&filters=${filtersJson}&limit_start=${offset}&limit_page_length=${limit}&order_by=modified desc`;
    const data = await erpFetch(serverUrl, path, {method: 'get'});
    return data?.data || [];
}

export async function erpGet(serverUrl: string, doctype: string, name: string): Promise<any> {
    const path = `/api/resource/${doctype}/${encodeURIComponent(name)}`;
    const data = await erpFetch(serverUrl, path, {method: 'get'});
    return data?.data || data;
}

export async function erpCreate(serverUrl: string, doctype: string, body: Record<string, any>): Promise<any> {
    const path = `/api/resource/${doctype}`;
    const data = await erpFetch(serverUrl, path, {
        method: 'post',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body),
    });
    return data?.data || data;
}

export async function erpUpdate(serverUrl: string, doctype: string, name: string, body: Record<string, any>): Promise<any> {
    const path = `/api/resource/${doctype}/${encodeURIComponent(name)}`;
    const data = await erpFetch(serverUrl, path, {
        method: 'put',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body),
    });
    return data?.data || data;
}

export async function erpDelete(serverUrl: string, doctype: string, name: string): Promise<any> {
    const path = `/api/resource/${doctype}/${encodeURIComponent(name)}`;
    return erpFetch(serverUrl, path, {method: 'delete'});
}

export async function erpCount(serverUrl: string, doctype: string, filters: any[][] = []): Promise<number> {
    const filtersJson = JSON.stringify(filters);
    const path = `/api/resource/${doctype}?fields=["count(*) as count"]&filters=${filtersJson}`;
    const data = await erpFetch(serverUrl, path, {method: 'get'});
    return data?.data?.[0]?.count || 0;
}

// ─── Customers ───

export async function fetchCustomers(serverUrl: string, filtersOrOffset?: any, offset = 0): Promise<any[]> {
    const filters = Array.isArray(filtersOrOffset) ? filtersOrOffset : [];
    const start = Array.isArray(filtersOrOffset) ? offset : (filtersOrOffset || 0);
    return erpList(serverUrl, 'Customer',
        ['name', 'customer_name', 'customer_group', 'territory', 'customer_primary_contact', 'mobile_no', 'modified'],
        filters, 50, start,
    );
}

export async function fetchCustomerDetail(serverUrl: string, name: string): Promise<any> {
    return erpGet(serverUrl, 'Customer', name);
}

export async function fetchCustomerOrders(serverUrl: string, customerName: string): Promise<any[]> {
    return erpList(serverUrl, 'Sales Order',
        ['name', 'customer_name', 'transaction_date', 'grand_total', 'status', 'delivery_status', 'currency'],
        [['customer', '=', customerName]],
    );
}

export async function createCustomer(serverUrl: string, data: {customer_name: string; customer_type: string; customer_group?: string; territory?: string}): Promise<any> {
    return erpCreate(serverUrl, 'Customer', data);
}

export async function updateCustomer(serverUrl: string, name: string, data: Record<string, any>): Promise<any> {
    return erpUpdate(serverUrl, 'Customer', name, data);
}

export async function deleteCustomer(serverUrl: string, name: string): Promise<any> {
    return erpDelete(serverUrl, 'Customer', name);
}

// ─── Suppliers ───

export async function fetchSuppliers(serverUrl: string, filtersOrOffset?: any, offset = 0): Promise<any[]> {
    const filters = Array.isArray(filtersOrOffset) ? filtersOrOffset : [];
    const start = Array.isArray(filtersOrOffset) ? offset : (filtersOrOffset || 0);
    return erpList(serverUrl, 'Supplier',
        ['name', 'supplier_name', 'supplier_type', 'supplier_group', 'supplier_primary_contact', 'modified'],
        filters, 50, start,
    );
}

export async function fetchSupplierDetail(serverUrl: string, name: string): Promise<any> {
    return erpGet(serverUrl, 'Supplier', name);
}

export async function fetchSupplierOrders(serverUrl: string, supplierName: string): Promise<any[]> {
    return erpList(serverUrl, 'Purchase Order',
        ['name', 'supplier_name', 'transaction_date', 'grand_total', 'status', 'currency'],
        [['supplier', '=', supplierName]],
    );
}

export async function createSupplier(serverUrl: string, data: {supplier_name: string; supplier_type: string; supplier_group?: string}): Promise<any> {
    return erpCreate(serverUrl, 'Supplier', data);
}

export async function updateSupplier(serverUrl: string, name: string, data: Record<string, any>): Promise<any> {
    return erpUpdate(serverUrl, 'Supplier', name, data);
}

export async function deleteSupplier(serverUrl: string, name: string): Promise<any> {
    return erpDelete(serverUrl, 'Supplier', name);
}

// ─── Sales Orders ───

export async function fetchSalesOrders(serverUrl: string, filters: any[][] = [], offset = 0): Promise<any[]> {
    return erpList(serverUrl, 'Sales Order',
        ['name', 'customer_name', 'customer', 'transaction_date', 'delivery_date', 'grand_total', 'status', 'delivery_status', 'billing_status', 'currency'],
        filters, 50, offset,
    );
}

export async function fetchSalesOrderDetail(serverUrl: string, name: string): Promise<any> {
    return erpGet(serverUrl, 'Sales Order', name);
}

export async function createSalesOrder(serverUrl: string, data: Record<string, any>): Promise<any> {
    return erpCreate(serverUrl, 'Sales Order', data);
}

export async function updateSalesOrder(serverUrl: string, name: string, data: Record<string, any>): Promise<any> {
    return erpUpdate(serverUrl, 'Sales Order', name, data);
}

export async function deleteSalesOrder(serverUrl: string, name: string): Promise<any> {
    return erpDelete(serverUrl, 'Sales Order', name);
}

// ─── Purchase Orders ───

export async function fetchPurchaseOrders(serverUrl: string, filters: any[][] = [], offset = 0): Promise<any[]> {
    return erpList(serverUrl, 'Purchase Order',
        ['name', 'supplier_name', 'supplier', 'transaction_date', 'schedule_date', 'grand_total', 'status', 'currency'],
        filters, 50, offset,
    );
}

export async function fetchPurchaseOrderDetail(serverUrl: string, name: string): Promise<any> {
    return erpGet(serverUrl, 'Purchase Order', name);
}

// ─── Work Orders (Manufacturing) ───

export async function fetchWorkOrders(serverUrl: string, filters: any[][] = [], offset = 0): Promise<any[]> {
    return erpList(serverUrl, 'Work Order',
        ['name', 'production_item', 'qty', 'produced_qty', 'status', 'planned_start_date', 'planned_end_date', 'actual_end_date', 'sales_order', 'modified'],
        filters, 50, offset,
    );
}

export async function fetchWorkOrderDetail(serverUrl: string, name: string): Promise<any> {
    return erpGet(serverUrl, 'Work Order', name);
}

export async function createWorkOrder(serverUrl: string, data: Record<string, any>): Promise<any> {
    return erpCreate(serverUrl, 'Work Order', data);
}

export async function updateWorkOrder(serverUrl: string, name: string, data: Record<string, any>): Promise<any> {
    return erpUpdate(serverUrl, 'Work Order', name, data);
}

export async function stopWorkOrder(serverUrl: string, name: string, status: string): Promise<any> {
    const path = `/api/method/erpnext.manufacturing.doctype.work_order.work_order.stop_unstop`;
    return erpFetch(serverUrl, path, {
        method: 'post',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({work_order: name, status}),
    });
}

// ─── Projects ───

export async function fetchProjects(serverUrl: string, filtersOrOffset?: any, offset = 0): Promise<any[]> {
    const filters = Array.isArray(filtersOrOffset) ? filtersOrOffset : [];
    const start = Array.isArray(filtersOrOffset) ? offset : (filtersOrOffset || 0);
    return erpList(serverUrl, 'Project',
        ['name', 'project_name', 'status', 'percent_complete', 'expected_start_date', 'expected_end_date', 'priority', 'customer', 'modified'],
        filters, 50, start,
    );
}

export async function fetchProjectDetail(serverUrl: string, name: string): Promise<any> {
    return erpGet(serverUrl, 'Project', name);
}

export async function fetchProjectTasks(serverUrl: string, projectName: string): Promise<any[]> {
    return erpList(serverUrl, 'Task',
        ['name', 'subject', 'status', 'progress', 'priority', 'exp_start_date', 'exp_end_date', 'completed_by'],
        [['project', '=', projectName]],
    );
}

// ─── Stock / Inventory ───

export async function fetchStockBalances(serverUrl: string, filters: any[][] = [], offset = 0): Promise<any[]> {
    return erpList(serverUrl, 'Bin',
        ['item_code', 'warehouse', 'actual_qty', 'reserved_qty', 'projected_qty', 'valuation_rate', 'stock_uom'],
        filters, 100, offset,
    );
}

export async function fetchItems(serverUrl: string, filtersOrOffset?: any, offset = 0): Promise<any[]> {
    const extraFilters = Array.isArray(filtersOrOffset) ? filtersOrOffset : [];
    const start = Array.isArray(filtersOrOffset) ? offset : (filtersOrOffset || 0);
    const filters: any[][] = [['is_stock_item', '=', 1], ...extraFilters];
    return erpList(serverUrl, 'Item',
        ['item_code', 'item_name', 'item_group', 'stock_uom', 'modified'],
        filters, 50, start,
    );
}

export async function fetchWarehouses(serverUrl: string): Promise<any[]> {
    return erpList(serverUrl, 'Warehouse',
        ['name', 'warehouse_name', 'company', 'warehouse_type'],
        [['disabled', '=', 0]], 200,
    );
}

// ─── Quality Inspection ───

export async function fetchQualityInspections(serverUrl: string, filtersOrOffset?: any, offset = 0): Promise<any[]> {
    const filters = Array.isArray(filtersOrOffset) ? filtersOrOffset : [];
    const start = Array.isArray(filtersOrOffset) ? offset : (filtersOrOffset || 0);
    return erpList(serverUrl, 'Quality Inspection',
        ['name', 'report_date', 'inspection_type', 'status', 'item_code', 'item_name', 'inspected_by', 'reference_type', 'reference_name', 'modified'],
        filters, 50, start,
    );
}

export async function fetchQualityInspectionDetail(serverUrl: string, name: string): Promise<any> {
    return erpGet(serverUrl, 'Quality Inspection', name);
}

// ─── Subcontracting ───

export async function fetchSubcontractingOrders(serverUrl: string, filtersOrOffset?: any, offset = 0): Promise<any[]> {
    const filters = Array.isArray(filtersOrOffset) ? filtersOrOffset : [];
    const start = Array.isArray(filtersOrOffset) ? offset : (filtersOrOffset || 0);
    return erpList(serverUrl, 'Subcontracting Order',
        ['name', 'supplier', 'supplier_name', 'transaction_date', 'schedule_date', 'status', 'total_qty', 'total', 'per_received', 'modified'],
        filters, 50, start,
    );
}

export async function fetchSubcontractingOrderDetail(serverUrl: string, name: string): Promise<any> {
    return erpGet(serverUrl, 'Subcontracting Order', name);
}
