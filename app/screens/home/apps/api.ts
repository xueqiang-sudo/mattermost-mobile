// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * 应用 Tab API — 对标 webapp workbench_panel/api.ts
 */

import NetworkManager from '@managers/network_manager';

const FRAPPE_SYNC_BASE = '/plugins/com.mattermost.frappe-sync';

export type DashboardAccess = {
    tabs: string[];
    is_admin: boolean;
    configurable: boolean;
    user_phone?: string;
    user_type?: string;
    is_supplier?: boolean;
    is_distributor?: boolean;
    customer_company?: string;
    distributor_company?: string;
    erp_connected?: boolean;
    user_erp_username?: string;
    has_erp_relationship?: boolean;
    mes_enabled?: boolean;
    mes_create_plan?: boolean;
    mes_view_plan?: boolean;
    mes_create_line_info?: boolean;
    drive_write?: boolean;
    kb_write?: boolean;
    warehouse_stock_in?: boolean;
    warehouse_stock_out?: boolean;
    contact_edit?: boolean;
    contact_scope?: string;
    allowed_contact_types?: string[];
    erp_address?: string;
    conversations_enabled?: boolean;
    team_mes_enabled?: boolean;
    sidebar_admin_enabled?: boolean;
};

export type AppDef = {
    key: string;
    labelId: string;
    defaultLabel: string;
    iconName: string;
    erpOnly: boolean;
    noPermission: boolean;
};

export const APPS: AppDef[] = [
    // Common apps (available for all teams)
    {key: 'role_management', labelId: 'sidebar.tab.role_management', defaultLabel: '角色管理', iconName: 'account-multiple-outline', erpOnly: false, noPermission: false},
    {key: 'cloud_drive', labelId: 'workbench.tab.cloud_drive', defaultLabel: '云盘', iconName: 'folder-outline', erpOnly: false, noPermission: false},
    {key: 'knowledge_base', labelId: 'workbench.tab.knowledge_base', defaultLabel: '知识库', iconName: 'book-outline', erpOnly: false, noPermission: false},
    {key: 'smart_notebook', labelId: 'workbench.tab.smart_notebook', defaultLabel: '智能笔记本', iconName: 'notebook-outline', erpOnly: false, noPermission: true},
    {key: 'notebook', labelId: 'workbench.tab.notebook', defaultLabel: '记事本', iconName: 'notebook-outline', erpOnly: false, noPermission: true},
    {key: 'todos', labelId: 'workspace.card.todos', defaultLabel: '待办事项', iconName: 'format-list-bulleted', erpOnly: false, noPermission: true},
    {key: 'schedules', labelId: 'workspace.card.schedules', defaultLabel: '日程安排', iconName: 'calendar-outline', erpOnly: false, noPermission: true},
    {key: 'conversations', labelId: 'workbench.tab.conversations', defaultLabel: '会话查询', iconName: 'forum-outline', erpOnly: false, noPermission: false},
    {key: 'promotion', labelId: 'sidebar.tab.promotion', defaultLabel: '邀请统计', iconName: 'share-variant-outline', erpOnly: false, noPermission: true},
    {key: 'my_suppliers', labelId: 'apps.my_suppliers', defaultLabel: '我的供应商', iconName: 'truck-delivery-outline', erpOnly: false, noPermission: true},
    // ERP-only apps
    {key: 'stock_out', labelId: 'warehouse_inout.outbound', defaultLabel: '出库', iconName: 'export-variant', erpOnly: true, noPermission: false},
    {key: 'mes', labelId: 'sidebar.tab.mes', defaultLabel: '生产管理', iconName: 'monitor', erpOnly: true, noPermission: false},
    // Debug
    {key: 'debug', labelId: 'workbench.tab.debug', defaultLabel: '调试日志', iconName: 'bug-outline', erpOnly: false, noPermission: true},
];

// ---- MES Types ----

export type ProductionLine = {
    id: string;
    group_name: string;
    positions: number;
    spindles: number;
    cake_weight: number;
    drop_interval: number;
    daily_output: number;
    daily_waste: number;
    sort_order: number;
};

export type MESPlan = {
    id: number;
    team_id: string;
    line_id: string;
    positions: string;
    current_product: string;
    spec: string;
    start_time: string;
    planned_end_time: string;
    schedule: string;
    remarks: string;
    create_at: number;
    update_at: number;
    delete_at: number;
};

export type MESPlanInput = {
    line_id: string;
    positions: string;
    current_product: string;
    spec: string;
    start_time: string;
    planned_end_time: string;
    schedule: string;
    remarks: string;
};

export type MESRecord = {
    id: number;
    team_id: string;
    channel_id: string;
    post_id: string;
    plan_id: number;
    line_id: string;
    product: string;
    spec: string;
    operator: string;
    positions: string;
    allocated_kg: number;
    daily_output_kg: number;
    duration_days: number;
    start_time: string;
    end_time: string;
    reported_output_kg: number;
    waste_kg: number;
    roll_count: number;
    qc_result: string;
    qc_waste_kg: number;
    qc_transition_kg: number;
    qc_qualified_kg: number;
    estimated_end_time: string;
    actual_output_kg: number;
    breakage_count: number;
    small_roll_count: number;
    fuzz_defect_count: number;
    color_uneven_count: number;
    last_step_name: string;
    notes: string;
    create_at: number;
    update_at: number;
    steps?: MESRecordStep[];
};

export type MESRecordStep = {
    id: number;
    record_id: number;
    step: number;
    step_name: string;
    operator: string;
    post_id: string;
    step_data: string;
    create_at: number;
};

export type MESLineInfo = {
    id: number;
    team_id: string;
    content: string;
    create_at: number;
    update_at: number;
    delete_at: number;
};

// ---- Promotion Types ----

export type InvitationStats = {
    total_invited: number;
    total_accepted: number;
    total_chain: number;
    total_chain_accepted: number;
};

export type InvitationRecord = {
    id: string;
    inviter_id: string;
    inviter_name: string;
    invitee_id: string;
    invitee_name: string;
    invitee_phone: string;
    invitee_company: string;
    invitee_invite_count: number;
    phone: string;
    status: string;
    create_at: number;
};

// ---- MES API helpers ----

const FRAPPE_PRODUCTION_BASE = '/plugins/com.mattermost.frappe-sync/api/production';

async function apiFetch(serverUrl: string, path: string, options: {method: string; body?: any}): Promise<any> {
    const client = NetworkManager.getClient(serverUrl);
    return client.doFetch(path, {method: options.method, ...(options.body ? {body: options.body} : {})});
}

export async function fetchProductionLines(serverUrl: string): Promise<ProductionLine[]> {
    const data = await apiFetch(serverUrl, `${FRAPPE_PRODUCTION_BASE}/lines`, {method: 'get'});
    return data?.lines || [];
}

export async function fetchMESPlans(serverUrl: string, teamId: string): Promise<MESPlan[]> {
    return apiFetch(serverUrl, `/api/v4/teams/${teamId}/mes/plans`, {method: 'get'});
}

export async function createMESPlan(serverUrl: string, teamId: string, plan: MESPlanInput): Promise<MESPlan> {
    return apiFetch(serverUrl, `/api/v4/teams/${teamId}/mes/plans`, {method: 'post', body: plan});
}

export async function updateMESPlan(serverUrl: string, teamId: string, planId: number, plan: MESPlanInput): Promise<MESPlan> {
    return apiFetch(serverUrl, `/api/v4/teams/${teamId}/mes/plans/${planId}`, {method: 'put', body: plan});
}

export async function deleteMESPlan(serverUrl: string, teamId: string, planId: number): Promise<void> {
    await apiFetch(serverUrl, `/api/v4/teams/${teamId}/mes/plans/${planId}`, {method: 'delete'});
}

export async function fetchRecordsByTeam(serverUrl: string, teamId: string, limit = 200): Promise<MESRecord[]> {
    return apiFetch(serverUrl, `/api/v4/teams/${teamId}/mes/records?limit=${limit}`, {method: 'get'});
}

export async function fetchRecordsByChannel(serverUrl: string, teamId: string, channelId: string, limit = 200): Promise<MESRecord[]> {
    return apiFetch(serverUrl, `/api/v4/teams/${teamId}/mes/records/channel/${channelId}?limit=${limit}`, {method: 'get'});
}

export async function fetchRecordWithSteps(serverUrl: string, teamId: string, recordId: number): Promise<MESRecord> {
    return apiFetch(serverUrl, `/api/v4/teams/${teamId}/mes/records/${recordId}/steps`, {method: 'get'});
}

export async function fetchLineInfo(serverUrl: string, teamId: string): Promise<MESLineInfo> {
    return apiFetch(serverUrl, `/api/v4/teams/${teamId}/mes/line-info`, {method: 'get'});
}

export async function updateLineInfo(serverUrl: string, teamId: string, content: string): Promise<MESLineInfo> {
    return apiFetch(serverUrl, `/api/v4/teams/${teamId}/mes/line-info`, {method: 'put', body: {content}});
}

// ---- Promotion API helpers ----

export async function fetchInvitationStats(serverUrl: string, userId: string): Promise<InvitationStats> {
    return apiFetch(serverUrl, `/api/v4/users/${userId}/invitations/stats`, {method: 'get'});
}

export async function fetchInvitations(serverUrl: string, userId: string): Promise<InvitationRecord[]> {
    const data = await apiFetch(serverUrl, `/api/v4/users/${userId}/invitations?per_page=100`, {method: 'get'});
    return Array.isArray(data) ? data : [];
}

/**
 * Fetch the user's dashboard access (visible tabs + admin status).
 * Also fetches the team object to get erp_address and conversations_enabled,
 * which are custom server fields not stored in the local WatermelonDB model.
 */
export async function getDashboardAccess(serverUrl: string, teamId?: string): Promise<DashboardAccess> {
    const client = NetworkManager.getClient(serverUrl);
    const params = teamId ? `?team_id=${teamId}` : '';
    const url = `${FRAPPE_SYNC_BASE}/api/dashboard/access${params}`;

    // Fetch team data in parallel to get erp_address and conversations_enabled
    const teamPromise = teamId ? client.getTeam(teamId).catch(() => null) : Promise.resolve(null);

    try {
        const data = await client.doFetch(url, {method: 'get'});
        const team = await teamPromise;
        if (team) {
            data.erp_address = (team as any).erp_address || '';
            data.conversations_enabled = Boolean((team as any).conversations_enabled);
            data.team_mes_enabled = Boolean((team as any).mes_enabled);
            data.sidebar_admin_enabled = Boolean((team as any).sidebar_admin_enabled);
        }
        return data;
    } catch {
        const team = await teamPromise;
        // Fallback: return all tabs if API fails
        return {
            tabs: ['conversations', 'finance', 'sales', 'hotproducts', 'inventory',
                'orders', 'projects', 'approvals', 'price_list', 'cloud_drive',
                'knowledge_base',
                'notebook'],
            is_admin: false,
            configurable: false,
            mes_enabled: true,
            erp_address: (team as any)?.erp_address || '',
            conversations_enabled: Boolean((team as any)?.conversations_enabled),
            team_mes_enabled: Boolean((team as any)?.mes_enabled),
            sidebar_admin_enabled: Boolean((team as any)?.sidebar_admin_enabled),
            contact_edit: false,
            contact_scope: 'own',
            allowed_contact_types: ['internal'],
        };
    }
}

// ---- ERP Apps Types ----

// Hot Products (热销榜)
export type HotProduct = {
    item_code: string;
    item_name: string;
    total_qty: number;
    total_amount: number;
    order_count: number;
    last_order_date: string;
    uom: string;
};

export type HotProductsData = {
    products: HotProduct[];
    total_qty: number;
    total_money: number;
    orders: number;
    uom: string;
};

// Approvals (审批清单)
export type Approval = {
    doctype: string;
    name: string;
    workflow_state: string;
    party: string;
    grand_total: number;
    date: string;
};

// Finance (流水账)
export type CashJournalEntry = {
    name: string;
    posting_date: string;
    direction: string;
    party: string;
    amount: number;
    mode_of_payment: string;
    account: string;
};

export type CashJournalGroup = {
    date: string;
    date_label: string;
    entries: CashJournalEntry[];
};

export type CashJournalSummary = {
    in_month: number;
    out_month: number;
    net_month: number;
};

export type CashJournalData = {
    summary: CashJournalSummary;
    groups: CashJournalGroup[];
    total_entries: number;
};

// Sales (销售统计)
export type SalesCustomer = {
    customer: string;
    customer_name: string;
    order_count: number;
    order_amount: number;
    billed_amount: number;
    paid_amount: number;
    outstanding_amount: number;
    last_order_date: string;
};

export type Salesperson = {
    name: string;
    display_name: string;
    order_count: number;
    order_amount: number;
    billed_amount: number;
    paid_amount: number;
    outstanding_amount: number;
    customers: SalesCustomer[];
};

export type SalesData = {
    salespeople: Salesperson[];
    totals: {
        order_count: number;
        order_amount: number;
        billed_amount: number;
        paid_amount: number;
        outstanding_amount: number;
    };
};

// Inventory (库存分析)
export type InventoryWarehouseItem = {
    item_code: string;
    item_name: string;
    qty: number;
    stock_value: number;
    turnover_days: number | null;
    last_out_date: string;
};

export type InventoryWarehouse = {
    warehouse: string;
    stock_value: number;
    item_count: number;
    daily_out_value: number;
    turnover_days: number | null;
    dead_count: number;
    dead_value: number;
    low_stock_count: number;
    items: InventoryWarehouseItem[];
};

export type InventoryAgingBucket = {
    bucket: string;
    value: number;
    qty: number;
};

export type InventoryTrendPoint = {
    month: string;
    stock_value: number;
    out_value: number;
    turnover_days: number | null;
};

export type InventoryItem = {
    item_code: string;
    item_name: string;
    qty: number;
    stock_value: number;
    turnover_days: number | null;
    flag_slow_high_value: boolean;
};

export type DeadStockItem = {
    item_code: string;
    item_name: string;
    warehouse: string;
    qty: number;
    stock_value: number;
    days_since_out: number;
    never_out: boolean;
};

export type LowStockItem = {
    item_code: string;
    item_name: string;
    warehouse: string;
    actual: number;
    safety: number;
    shortage: number;
};

export type InventoryData = {
    as_of: string;
    days: number;
    summary: {
        total_stock_value: number;
        daily_out_value: number;
        overall_turnover_days: number | null;
        healthy_pct: number;
        dead_count: number;
        dead_value: number;
        low_stock_count: number;
    };
    warehouses: InventoryWarehouse[];
    aging: {
        buckets: InventoryAgingBucket[];
        healthy_pct: number;
    };
    trend: InventoryTrendPoint[];
    items: InventoryItem[];
    dead_stock: DeadStockItem[];
    low_stock: LowStockItem[];
};

export type WarehouseItem = {
    name: string;
    warehouse_name: string;
};

// ---- ERP Apps API Functions ----

const MCP_API_BASE = '/plugins/com.mattermost.frappe-sync/api/mcp/tools';

async function mcpGet(client: any, toolName: string, params?: Record<string, string>): Promise<any> {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    const url = `${MCP_API_BASE}/${encodeURIComponent(toolName)}${query}`;
    return client.doFetch(url, {method: 'get'});
}

async function mcpPost(client: any, toolName: string, body: Record<string, any>): Promise<any> {
    const url = `${MCP_API_BASE}/${encodeURIComponent(toolName)}`;
    return client.doFetch(url, {method: 'post', body});
}

export async function fetchHotProducts(serverUrl: string, teamId?: string, from?: string, to?: string): Promise<HotProductsData> {
    const client = NetworkManager.getClient(serverUrl);
    const params: Record<string, string> = {sort_by: 'qty'};
    if (from && to) {
        params.from = from;
        params.to = to;
    } else {
        params.months = '1';
    }
    if (teamId) {params.team_id = teamId;}
    const data = await mcpGet(client, 'hot_products', params);
    return {
        products: (data?.products || []).map((p: any) => ({
            item_code: p.item_code || '',
            item_name: p.item_name || p.item_code || '',
            total_qty: p.total_qty || 0,
            total_amount: p.total_amount || 0,
            order_count: p.order_count || 0,
            last_order_date: p.last_order_date || '',
            uom: p.uom || '',
        })),
        total_qty: data?.total_qty || 0,
        total_money: data?.total_amount || 0,
        orders: data?.total_orders || 0,
        uom: data?.uom || '',
    };
}

export async function fetchApprovals(serverUrl: string, teamId?: string): Promise<Approval[]> {
    const client = NetworkManager.getClient(serverUrl);
    const params: Record<string, string> = {};
    if (teamId) {params.team_id = teamId;}
    const data = await mcpGet(client, 'pending_approvals', params);
    return (data?.pending || data?.data || []).map((a: any) => ({
        doctype: a.doctype || '',
        name: a.name || '',
        workflow_state: a.workflow_state || '',
        party: a.party || '',
        grand_total: a.grand_total || 0,
        date: a.date || '',
    }));
}

export async function postApprovalAction(serverUrl: string, doctype: string, name: string, action: 'Approve' | 'Reject', teamId?: string): Promise<boolean> {
    try {
        const client = NetworkManager.getClient(serverUrl);
        const body: Record<string, any> = {doctype, name, action};
        if (teamId) {body.team_id = teamId;}
        await mcpPost(client, 'approval_action', body);
        return true;
    } catch {
        return false;
    }
}

export async function fetchCashJournal(serverUrl: string, teamId?: string, from?: string, to?: string, type?: string): Promise<CashJournalData> {
    const client = NetworkManager.getClient(serverUrl);
    const params: Record<string, string> = {};
    if (from) {params.from = from;}
    if (to) {params.to = to;}
    if (type) {params.type = type;}
    if (teamId) {params.team_id = teamId;}
    const data = await mcpGet(client, 'finance', params);

    const entries: CashJournalEntry[] = (data?.entries || data?.data || []).map((e: any) => ({
        name: e.name || '',
        posting_date: e.posting_date || '',
        direction: e.direction || '',
        party: e.party || '',
        amount: e.amount || 0,
        mode_of_payment: e.mode_of_payment || '',
        account: e.account || '',
    }));

    const groupMap = new Map<string, CashJournalEntry[]>();
    for (const entry of entries) {
        const date = entry.posting_date;
        if (!groupMap.has(date)) {
            groupMap.set(date, []);
        }
        groupMap.get(date)!.push(entry);
    }

    const sortedDates = Array.from(groupMap.keys()).sort((a, b) => b.localeCompare(a));
    const groups: CashJournalGroup[] = sortedDates.map((date) => {
        const d = new Date(date + 'T00:00:00');
        // Return date in standard format, let UI layer handle localization
        const dateLabel = `${d.getMonth() + 1}/${d.getDate()}`;
        return {date, date_label: dateLabel, entries: groupMap.get(date)!};
    });

    return {
        summary: {
            in_month: data?.summary?.in_month || 0,
            out_month: data?.summary?.out_month || 0,
            net_month: data?.summary?.net_month || 0,
        },
        groups,
        total_entries: entries.length,
    };
}

export async function fetchSales(serverUrl: string, teamId?: string, months?: string, from?: string, to?: string): Promise<SalesData> {
    const client = NetworkManager.getClient(serverUrl);
    const params: Record<string, string> = {};
    if (from && to) {
        params.from = from;
        params.to = to;
    } else {
        params.months = months || '1';
    }
    if (teamId) {params.team_id = teamId;}
    const data = await mcpGet(client, 'sales_ranking', params);
    const salespeople = (data?.salespeople || []).map((s: any) => {
        const billed = s.billed_amount || 0;
        const paid = s.paid_amount || 0;
        return {
            name: s.name || '',
            display_name: s.name || '',
            order_count: s.order_count || 0,
            order_amount: s.order_amount || 0,
            billed_amount: billed,
            paid_amount: paid,
            outstanding_amount: billed - paid,
            customers: (s.customers || []).map((c: any) => {
                const cBilled = c.billed_amount || 0;
                const cPaid = c.paid_amount || 0;
                return {
                    customer: c.customer || '',
                    customer_name: c.customer_name || c.customer || '',
                    order_count: c.order_count || 0,
                    order_amount: c.order_amount || 0,
                    billed_amount: cBilled,
                    paid_amount: cPaid,
                    outstanding_amount: cBilled - cPaid,
                    last_order_date: c.last_order_date || '',
                };
            }),
        };
    });
    return {
        salespeople,
        totals: {
            order_count: data?.totals?.order_count || 0,
            order_amount: data?.totals?.order_amount || 0,
            billed_amount: data?.totals?.billed_amount || 0,
            paid_amount: data?.totals?.paid_amount || 0,
            outstanding_amount: (data?.totals?.billed_amount || 0) - (data?.totals?.paid_amount || 0),
        },
    };
}

export async function fetchInventory(serverUrl: string, teamId?: string, days?: string, deadDays?: string, agingDays?: string, warehouse?: string): Promise<InventoryData> {
    const client = NetworkManager.getClient(serverUrl);
    const params: Record<string, string> = {};
    if (days) {params.days = days;}
    if (deadDays) {params.dead_days = deadDays;}
    if (agingDays) {params.aging_days = agingDays;}
    if (warehouse) {params.warehouse = warehouse;}
    if (teamId) {params.team_id = teamId;}
    const data = await mcpGet(client, 'inventory', params);
    return {
        as_of: data?.as_of || '',
        days: data?.days || 30,
        summary: {
            total_stock_value: data?.summary?.total_stock_value || 0,
            daily_out_value: data?.summary?.daily_out_value || 0,
            overall_turnover_days: data?.summary?.overall_turnover_days ?? null,
            healthy_pct: data?.summary?.healthy_pct || 0,
            dead_count: data?.summary?.dead_count || 0,
            dead_value: data?.summary?.dead_value || 0,
            low_stock_count: data?.summary?.low_stock_count || 0,
        },
        warehouses: (data?.warehouses || []).map((w: any) => ({
            warehouse: w.warehouse || '',
            stock_value: w.stock_value || 0,
            item_count: w.item_count || 0,
            daily_out_value: w.daily_out_value || 0,
            turnover_days: w.turnover_days ?? null,
            dead_count: w.dead_count || 0,
            dead_value: w.dead_value || 0,
            low_stock_count: w.low_stock_count || 0,
            items: (w.items || []).map((i: any) => ({
                item_code: i.item_code || '',
                item_name: i.item_name || '',
                qty: i.qty || 0,
                stock_value: i.stock_value || 0,
                turnover_days: i.turnover_days ?? null,
                last_out_date: i.last_out_date || '',
            })),
        })),
        aging: {
            buckets: (data?.aging?.buckets || []).map((b: any) => ({
                bucket: b.bucket || '',
                value: b.value || 0,
                qty: b.qty || 0,
            })),
            healthy_pct: data?.aging?.healthy_pct || 0,
        },
        trend: (data?.trend || []).map((t: any) => ({
            month: t.month || '',
            stock_value: t.stock_value || 0,
            out_value: t.out_value || 0,
            turnover_days: t.turnover_days ?? null,
        })),
        items: (data?.items || []).map((i: any) => ({
            item_code: i.item_code || '',
            item_name: i.item_name || '',
            qty: i.qty || 0,
            stock_value: i.stock_value || 0,
            turnover_days: i.turnover_days ?? null,
            flag_slow_high_value: i.flag_slow_high_value || false,
        })),
        dead_stock: (data?.dead_stock || []).map((d: any) => ({
            item_code: d.item_code || '',
            item_name: d.item_name || '',
            warehouse: d.warehouse || '',
            qty: d.qty || 0,
            stock_value: d.stock_value || 0,
            days_since_out: d.days_since_out || 0,
            never_out: d.never_out || false,
        })),
        low_stock: (data?.low_stock || []).map((l: any) => ({
            item_code: l.item_code || '',
            item_name: l.item_name || '',
            warehouse: l.warehouse || '',
            actual: l.actual || 0,
            safety: l.safety || 0,
            shortage: l.shortage || 0,
        })),
    };
}

export async function fetchWarehouseList(serverUrl: string, teamId?: string): Promise<WarehouseItem[]> {
    const client = NetworkManager.getClient(serverUrl);
    const params: Record<string, string> = {};
    if (teamId) {params.team_id = teamId;}
    const data = await mcpGet(client, 'erpnext_warehouse_list', params);
    return (data?.items || []).map((w: any) => ({
        name: w.name || '',
        warehouse_name: w.warehouse_name || w.name || '',
    }));
}

// ---- Role Management Types ----

export type BusinessRoleDef = {
    id: number;
    role_key: string;
    role_name: string;
    source: string;
    create_at: number;
    update_at: number;
};

export type WorkbenchPermissions = {
    role_tab_permissions: Record<string, {
        tabs: string[];
        flags?: Record<string, boolean>;
    }>;
};

// ---- Role Management API ----
// Using Mattermost core API (/api/v4/) instead of plugin API

export async function fetchBusinessRoleDefs(serverUrl: string, teamId: string): Promise<BusinessRoleDef[]> {
    const data = await apiFetch(serverUrl, `/api/v4/teams/${teamId}/business-role-defs`, {method: 'get'});
    return Array.isArray(data) ? data : [];
}

export async function createBusinessRoleDef(serverUrl: string, teamId: string, roleName: string): Promise<BusinessRoleDef> {
    return apiFetch(serverUrl, `/api/v4/teams/${teamId}/business-role-defs`, {
        method: 'post',
        body: {role_name: roleName},
    });
}

export async function updateBusinessRoleDef(serverUrl: string, teamId: string, roleKey: string, roleName: string): Promise<BusinessRoleDef> {
    return apiFetch(serverUrl, `/api/v4/teams/${teamId}/business-role-defs/${encodeURIComponent(roleKey)}`, {
        method: 'put',
        body: {role_name: roleName},
    });
}

export async function deleteBusinessRoleDef(serverUrl: string, teamId: string, roleKey: string): Promise<void> {
    await apiFetch(serverUrl, `/api/v4/teams/${teamId}/business-role-defs/${encodeURIComponent(roleKey)}`, {method: 'delete'});
}

export async function getWorkbenchPermissions(serverUrl: string, teamId: string): Promise<WorkbenchPermissions> {
    return apiFetch(serverUrl, `/api/v4/teams/${teamId}/workbench-permissions`, {method: 'get'});
}

// ---- Conversations API ----

export type ConversationChannel = {
    id: string;
    display_name: string;
    last_post_at: number;
    member_ids?: string[];
};

export async function fetchConversations(
    serverUrl: string,
    teamId: string,
    userId?: string,
): Promise<ConversationChannel[]> {
    const client = NetworkManager.getClient(serverUrl);

    // If userId is provided, get channels for that user in the team
    if (userId) {
        try {
            // Use standard Mattermost API to get user's channels in the team
            const channels = await client.doFetch(
                `/api/v4/users/${userId}/teams/${teamId}/channels`,
                {method: 'get'},
            );

            if (!Array.isArray(channels)) {
                return [];
            }

            // Transform to ConversationChannel format
            return channels.map((ch: any) => ({
                id: ch.id,
                display_name: ch.display_name,
                last_post_at: ch.last_post_at || 0,
                member_ids: [], // Will be populated if needed
            }));
        } catch (err) {
            console.error('[fetchConversations] Failed to fetch user channels:', err);
            return [];
        }
    }

    // If no userId, return empty array
    return [];
}

// ---- Role Permissions ----

export async function saveRolePermission(
    serverUrl: string,
    teamId: string,
    roleKey: string,
    tabs: string[],
    flags?: Record<string, boolean>,
): Promise<WorkbenchPermissions> {
    return apiFetch(serverUrl, `/api/v4/teams/${teamId}/workbench-permissions`, {
        method: 'put',
        body: {
            role_key: roleKey,
            tabs,
            flags: flags || {},
        },
    });
}

// ---- Pick List (出入库) ----

export type PickListItem = {
    item_code: string;
    item_name?: string;
    qty: number;
    stock_qty?: number;
    warehouse: string;
    sales_order?: string;
};

export type PickList = {
    name: string;
    purpose: string;
    customer?: string;
    customer_name?: string;
    company: string;
    status: string;
    creation: string;
    parent_warehouse?: string;
    locations?: PickListItem[];
};

export async function fetchPickLists(
    serverUrl: string,
    purpose?: string,
    company?: string,
    teamId?: string,
): Promise<PickList[]> {
    const client = NetworkManager.getClient(serverUrl);
    const params: Record<string, string> = {limit: '50'};
    if (purpose) {params.purpose = purpose;}
    if (company) {params.company = company;}
    if (teamId) {params.team_id = teamId;}
    const data = await mcpGet(client, 'erpnext_pick_list_list', params);
    return (data?.data || []).map((d: any) => ({
        name: d.name || '',
        purpose: d.purpose || '',
        customer: d.customer || '',
        customer_name: d.customer_name || '',
        company: d.company || '',
        status: d.status || '',
        creation: d.creation || '',
        parent_warehouse: d.parent_warehouse || '',
    }));
}

export async function createPickList(
    serverUrl: string,
    company: string,
    purpose: string,
    locations: PickListItem[],
    customer?: string,
    teamId?: string,
): Promise<PickList> {
    const client = NetworkManager.getClient(serverUrl);
    const body: Record<string, any> = {
        company,
        purpose,
        locations: locations.map((l) => ({
            item_code: l.item_code,
            qty: l.qty,
            stock_qty: l.stock_qty || l.qty,
            warehouse: l.warehouse,
            ...(l.sales_order ? {sales_order: l.sales_order} : {}),
        })),
    };
    if (customer) {body.customer = customer;}
    if (teamId) {body.team_id = teamId;}
    const data = await mcpPost(client, 'erpnext_pick_list_create', body);
    const doc = data?.data || {};
    return {
        name: doc.name || '',
        purpose: doc.purpose || purpose,
        company: doc.company || company,
        status: doc.status || 'Draft',
        creation: doc.creation || '',
        customer: doc.customer || customer || '',
    };
}

// ---- Orders API ----

export type DashboardOrder = {
    name: string;
    status: string;
    workflow_state: string;
    customer_name: string;
    company: string;
    grand_total: number;
    transaction_date: string;
    delivery_date: string;
    production_stage: string;
    sales_person: string;
    outstanding_amount: number;
};

export async function fetchOrders(serverUrl: string, teamId?: string): Promise<DashboardOrder[]> {
    const client = NetworkManager.getClient(serverUrl);
    let url = `${FRAPPE_SYNC_BASE}/api/dashboard/orders`;
    const params: string[] = [];
    if (teamId) {
        params.push(`team_id=${encodeURIComponent(teamId)}`);
    }
    if (params.length > 0) {
        url += '?' + params.join('&');
    }
    const data = await client.doFetch(url, {method: 'get'});
    return (data?.orders || data?.data || []).map((o: any) => ({
        name: o.name || '',
        status: o.status || '',
        workflow_state: o.workflow_state || '',
        customer_name: o.customer_name || '',
        company: o.company || '',
        grand_total: o.grand_total || 0,
        transaction_date: o.transaction_date || '',
        delivery_date: o.delivery_date || '',
        production_stage: o.production_stage || '',
        sales_person: o.sales_person || o.owner_name || '',
        outstanding_amount: o.outstanding_amount || 0,
    }));
}

// ---- Projects API ----

export type DashboardProject = {
    name: string;
    project_name: string;
    status: string;
    project_type: string;
    percent_complete: number;
    expected_start_date: string;
    expected_end_date: string;
    customer: string;
    sales_order: string;
    total_sales_amount: number;
    gross_margin: number;
    per_gross_margin: number;
    task_total: number;
    task_completed: number;
};

export async function fetchProjects(serverUrl: string, teamId?: string): Promise<DashboardProject[]> {
    const client = NetworkManager.getClient(serverUrl);
    let url = `${FRAPPE_SYNC_BASE}/api/dashboard/projects`;
    const params: string[] = [];
    if (teamId) {
        params.push(`team_id=${encodeURIComponent(teamId)}`);
    }
    if (params.length > 0) {
        url += '?' + params.join('&');
    }
    const data = await client.doFetch(url, {method: 'get'});
    return (data?.projects || data?.data || []).map((p: any) => ({
        name: p.name || '',
        project_name: p.project_name || p.name || '',
        status: p.status || '',
        project_type: p.project_type || '',
        percent_complete: p.percent_complete || 0,
        expected_start_date: p.expected_start_date || '',
        expected_end_date: p.expected_end_date || '',
        customer: p.customer || '',
        sales_order: p.sales_order || '',
        total_sales_amount: p.total_sales_amount || 0,
        gross_margin: p.gross_margin || 0,
        per_gross_margin: p.per_gross_margin || 0,
        task_total: p.task_total || 0,
        task_completed: p.task_completed || 0,
    }));
}

// ---- Todo Update / Delete API (fact-extractor) ----

export async function updateTodo(
    serverUrl: string,
    teamId: string,
    channelId: string,
    lineNumber: number,
    text: string,
): Promise<{ok: boolean; content?: string; error?: string}> {
    const client = NetworkManager.getClient(serverUrl);
    const url = `${FRAPPE_SYNC_BASE}/api/todo/update`;
    return client.doFetch(url, {
        method: 'post',
        body: {team_id: teamId, channel_id: channelId, lineNumber, text},
    });
}

export async function deleteTodo(
    serverUrl: string,
    teamId: string,
    channelId: string,
    lineNumber: number,
): Promise<{ok: boolean; remainingCount?: number; removedText?: string; content?: string; error?: string}> {
    const client = NetworkManager.getClient(serverUrl);
    const url = `${FRAPPE_SYNC_BASE}/api/todo/delete`;
    return client.doFetch(url, {
        method: 'post',
        body: {team_id: teamId, channel_id: channelId, lineNumber},
    });
}

// ---- User Todos API (from fact-extractor) ----

export type UserTodo = {
    lineNumber: number;
    text: string;
    path: string;
    channel_id: string;
    channel_name: string;
    date: string;
};

export async function fetchUserTodos(serverUrl: string, teamId?: string): Promise<UserTodo[]> {
    const client = NetworkManager.getClient(serverUrl);
    const body: Record<string, any> = {mode: 'channel_active'};
    if (teamId) {
        body.team_id = teamId;
    }
    const url = `${FRAPPE_SYNC_BASE}/api/query`;
    const data = await client.doFetch(url, {method: 'post', body});

    const results = data?.results || [];
    const todos: UserTodo[] = [];

    for (const result of results) {
        const content: string = result.memory || result.content || '';
        const path: string = result.path || '';
        const channelName: string = result.channel_name || '';
        const channelId: string = result.channel_id || '';
        const date: string = result.date || '';

        // Parse markdown: extract lines starting with "- " (todo items)
        const lines = content.split('\n');
        let lineNum = 0;
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('- ')) {
                lineNum++;
                // Strip the "- " prefix and any [since MM-DD] tag for display
                let text = trimmed.substring(2).trim();
                todos.push({
                    lineNumber: lineNum,
                    text,
                    path,
                    channel_id: channelId,
                    channel_name: channelName,
                    date,
                });
            }
        }
    }

    return todos;
}

// ─── My Suppliers API ───

export type SupplierInfo = {
    team_id: string;
    team_name: string;
    contact_name: string;
    contact_position: string;
    order_count: number;
    project_count: number;
};

export async function checkErpSuppliers(serverUrl: string): Promise<boolean> {
    try {
        const client = NetworkManager.getClient(serverUrl);
        const result = await client.doFetch(
            '/plugins/com.mattermost.frappe-sync/api/my-suppliers/check',
            {method: 'GET'},
        );
        return result?.has_suppliers || false;
    } catch {
        return false;
    }
}

export async function fetchMySuppliers(serverUrl: string): Promise<SupplierInfo[]> {
    try {
        const client = NetworkManager.getClient(serverUrl);
        const result = await client.doFetch(
            '/plugins/com.mattermost.frappe-sync/api/my-suppliers',
            {method: 'GET'},
        );
        return Object.values(result?.suppliers || {});
    } catch {
        return [];
    }
}

export async function fetchSupplierOrders(serverUrl: string, teamId: string): Promise<any[]> {
    try {
        const client = NetworkManager.getClient(serverUrl);
        const result = await client.doFetch(
            `/plugins/com.mattermost.frappe-sync/api/my-suppliers/${teamId}/orders`,
            {method: 'GET'},
        );
        return result?.data || [];
    } catch {
        return [];
    }
}

export async function fetchSupplierProjects(serverUrl: string, teamId: string): Promise<any[]> {
    try {
        const client = NetworkManager.getClient(serverUrl);
        const result = await client.doFetch(
            `/plugins/com.mattermost.frappe-sync/api/my-suppliers/${teamId}/projects`,
            {method: 'GET'},
        );
        return result?.data || [];
    } catch {
        return [];
    }
}
