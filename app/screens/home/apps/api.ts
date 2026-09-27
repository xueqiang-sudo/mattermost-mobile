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
    contact_edit?: boolean;
    contact_scope?: string;
    allowed_contact_types?: string[];
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
    // ERP-only apps
    {key: 'hotproducts', labelId: 'workbench.tab.hot_products', defaultLabel: '热销榜', iconName: 'fire', erpOnly: true, noPermission: false},
    {key: 'approvals', labelId: 'workbench.tab.approvals', defaultLabel: '审批清单', iconName: 'check-circle-outline', erpOnly: true, noPermission: false},
    {key: 'finance', labelId: 'workbench.tab.finance', defaultLabel: '流水账', iconName: 'credit-card-outline', erpOnly: true, noPermission: false},
    {key: 'sales', labelId: 'workbench.tab.sales', defaultLabel: '销售统计', iconName: 'chart-line', erpOnly: true, noPermission: false},
    {key: 'inventory', labelId: 'workbench.tab.inventory', defaultLabel: '库存分析', iconName: 'archive-outline', erpOnly: true, noPermission: false},
    // Common apps
    {key: 'conversations', labelId: 'workbench.tab.conversations', defaultLabel: '会话查询', iconName: 'forum-outline', erpOnly: false, noPermission: false},
    {key: 'price_list', labelId: 'workbench.tab.price_list', defaultLabel: '价格表', iconName: 'file-excel-outline', erpOnly: false, noPermission: false},
    {key: 'cloud_drive', labelId: 'workbench.tab.cloud_drive', defaultLabel: '云盘', iconName: 'folder-outline', erpOnly: false, noPermission: false},
    {key: 'knowledge_base', labelId: 'workbench.tab.knowledge_base', defaultLabel: '知识库', iconName: 'book-outline', erpOnly: false, noPermission: false},
    {key: 'notebook', labelId: 'workbench.tab.notebook', defaultLabel: '记事本', iconName: 'notebook-outline', erpOnly: false, noPermission: true},
    // MES & Promotion
    {key: 'mes', labelId: 'sidebar.tab.mes', defaultLabel: 'MES', iconName: 'monitor', erpOnly: false, noPermission: false},
    {key: 'promotion', labelId: 'sidebar.tab.promotion', defaultLabel: '推广', iconName: 'share-variant-outline', erpOnly: false, noPermission: true},
    // Role Management
    {key: 'role_management', labelId: 'sidebar.tab.role_management', defaultLabel: '角色管理', iconName: 'account-group', erpOnly: false, noPermission: false},
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
    const body = options.body ? JSON.stringify(options.body) : undefined;
    return client.doFetch(path, {method: options.method, ...(body ? {body} : {})});
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
 */
export async function getDashboardAccess(serverUrl: string, teamId?: string): Promise<DashboardAccess> {
    const client = NetworkManager.getClient(serverUrl);
    const params = teamId ? `?team_id=${teamId}` : '';
    const url = `${FRAPPE_SYNC_BASE}/api/dashboard/access${params}`;

    try {
        const data = await client.doFetch(url, {method: 'get'});
        return data;
    } catch {
        // Fallback: return all tabs if API fails
        return {
            tabs: ['conversations', 'finance', 'sales', 'hotproducts', 'inventory',
                'orders', 'projects', 'approvals', 'price_list', 'cloud_drive',
                'knowledge_base', 'notebook'],
            is_admin: false,
            configurable: false,
            contact_edit: false,
            contact_scope: 'own',
            allowed_contact_types: ['internal'],
        };
    }
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

export async function fetchBusinessRoleDefs(serverUrl: string, teamId: string): Promise<BusinessRoleDef[]> {
    const data = await apiFetch(serverUrl, `${FRAPPE_SYNC_BASE}/api/teams/${teamId}/business-roles`, {method: 'get'});
    return Array.isArray(data) ? data : [];
}

export async function createBusinessRoleDef(serverUrl: string, teamId: string, roleName: string): Promise<BusinessRoleDef> {
    return apiFetch(serverUrl, `${FRAPPE_SYNC_BASE}/api/teams/${teamId}/business-roles`, {
        method: 'post',
        body: {role_name: roleName},
    });
}

export async function updateBusinessRoleDef(serverUrl: string, teamId: string, roleKey: string, roleName: string): Promise<BusinessRoleDef> {
    return apiFetch(serverUrl, `${FRAPPE_SYNC_BASE}/api/teams/${teamId}/business-roles/${roleKey}`, {
        method: 'put',
        body: {role_name: roleName},
    });
}

export async function deleteBusinessRoleDef(serverUrl: string, teamId: string, roleKey: string): Promise<void> {
    await apiFetch(serverUrl, `${FRAPPE_SYNC_BASE}/api/teams/${teamId}/business-roles/${roleKey}`, {method: 'delete'});
}

export async function getWorkbenchPermissions(serverUrl: string, teamId: string): Promise<WorkbenchPermissions> {
    return apiFetch(serverUrl, `${FRAPPE_SYNC_BASE}/api/teams/${teamId}/permissions`, {method: 'get'});
}

export async function saveRolePermission(
    serverUrl: string,
    teamId: string,
    roleKey: string,
    tabs: string[],
    flags?: Record<string, boolean>,
): Promise<WorkbenchPermissions> {
    const body: Record<string, unknown> = {tabs};
    if (flags) {
        body.flags = flags;
    }
    return apiFetch(serverUrl, `${FRAPPE_SYNC_BASE}/api/teams/${teamId}/permissions/${roleKey}`, {
        method: 'put',
        body,
    });
}
