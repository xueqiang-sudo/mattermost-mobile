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
];

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
