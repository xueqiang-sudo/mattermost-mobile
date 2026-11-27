// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Database, Q} from '@nozbe/watermelondb';

import {MM_TABLES} from '@constants/database';
import DatabaseManager from '@database/manager';
import ErpPermissionsCacheModel from '@database/models/server/erp_permissions_cache';
import NetworkManager from '@managers/network_manager';
import {getCurrentTeamId} from '@queries/servers/system';
import {getCurrentUserId} from '@queries/servers/system';
import {debugLog} from '@store/debug_log';

const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

// DocPerm permission levels for a single DocType
export type DocPermMatrix = {
    read: boolean;
    write: boolean;
    create: boolean;
    delete: boolean;
    submit: boolean;
    cancel: boolean;
};

// Full permissions matrix response from server
export type ErpPermissionsResponse = {
    doctypes: Record<string, DocPermMatrix>;
    roles: string[];
};

// DocTypes needed for mobile workspace apps
const WORKSPACE_DOCTYPES = [
    'Item',                  // hot_products, stock, inventory
    'Quotation',             // approvals
    'Sales Invoice',         // finance, sales
    'Sales Order',           // sales, sales_orders
    'Stock Entry',           // warehouse_inout
    'Customer',              // customers
    'Supplier',              // suppliers
    'Work Order',            // work_orders
    'Project',               // projects
    'Purchase Order',        // purchase_orders
    'Quality Inspection',    // quality_inspection
    'GL Entry',              // finance (流水账)
    'Journal Entry',         // finance (流水账)
    'Subcontracting Order',  // subcontracting
    'Bin',                   // inventory
];

/**
 * Fetch ERP permissions matrix from server
 */
export async function fetchErpPermissions(
    serverUrl: string,
    teamId: string,
): Promise<ErpPermissionsResponse | null> {
    try {
        debugLog('[fetchErpPermissions] requesting permissions-matrix, teamId=', teamId);
        const client = NetworkManager.getClient(serverUrl);
        const doctypesParam = WORKSPACE_DOCTYPES.join(',');
        const response: ErpPermissionsResponse = await client.doFetch(
            `/plugins/com.mattermost.frappe-sync/api/erp/permissions-matrix?team_id=${teamId}&doctypes=${encodeURIComponent(doctypesParam)}`,
            {method: 'GET'},
        ) as ErpPermissionsResponse;
        debugLog('[fetchErpPermissions] response received:', JSON.stringify({
            roles: response?.roles,
            doctypes_count: response?.doctypes ? Object.keys(response.doctypes).length : 0,
            doctypes: response?.doctypes,
        }));
        return response;
    } catch (error: any) {
        debugLog('[fetchErpPermissions] FAILED:', error?.message || error, ' status=', error?.status_code || error?.statusCode);
        console.warn('[fetchErpPermissions] Failed to fetch ERP permissions:', error);
        return null;
    }
}

/**
 * Get cached ERP permissions from database
 */
export async function getErpPermissionsCache(
    database: Database,
    userId: string,
    teamId: string,
): Promise<ErpPermissionsCacheModel | null> {
    try {
        const cache = await database.get<ErpPermissionsCacheModel>(MM_TABLES.SERVER.ERP_PERMISSIONS_CACHE)
            .query(
                Q.where('user_id', userId),
                Q.where('team_id', teamId),
            )
            .fetch();

        if (cache.length === 0) {
            return null;
        }

        const record = cache[0];
        const now = Date.now();

        // Check if expired
        if (now - record.cachedAt >= CACHE_DURATION_MS) {
            return null;
        }

        return record;
    } catch (error) {
        console.warn('[getErpPermissionsCache] Failed to get cache:', error);
        return null;
    }
}

/**
 * Save ERP permissions to cache
 */
export async function saveErpPermissionsCache(
    database: Database,
    userId: string,
    teamId: string,
    permissions: ErpPermissionsResponse,
): Promise<void> {
    try {
        await database.write(async () => {
            // Delete existing cache
            const existing = await database.get<ErpPermissionsCacheModel>(MM_TABLES.SERVER.ERP_PERMISSIONS_CACHE)
                .query(
                    Q.where('user_id', userId),
                    Q.where('team_id', teamId),
                )
                .fetch();

            for (const record of existing) {
                await record.markAsDeleted();
            }

            // Create new cache
            await database.get<ErpPermissionsCacheModel>(MM_TABLES.SERVER.ERP_PERMISSIONS_CACHE).create((record) => {
                record.userId = userId;
                record.teamId = teamId;
                record.doctypes = permissions.doctypes;
                record.roles = permissions.roles || [];
                record.cachedAt = Date.now();
            });
        });
    } catch (error) {
        console.warn('[saveErpPermissionsCache] Failed to save cache:', error);
    }
}

/**
 * Clear ERP permissions cache
 */
export async function clearErpPermissionsCache(
    database: Database,
    userId: string,
    teamId: string,
): Promise<void> {
    try {
        await database.write(async () => {
            const cache = await database.get<ErpPermissionsCacheModel>(MM_TABLES.SERVER.ERP_PERMISSIONS_CACHE)
                .query(
                    Q.where('user_id', userId),
                    Q.where('team_id', teamId),
                )
                .fetch();

            for (const record of cache) {
                await record.markAsDeleted();
            }
        });
    } catch (error) {
        console.warn('[clearErpPermissionsCache] Failed to clear cache:', error);
    }
}

/**
 * Get ERP permissions with caching
 */
export async function getErpPermissions(
    serverUrl: string,
    forceRefresh = false,
): Promise<ErpPermissionsResponse | null> {
    try {
        const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
        const userId = await getCurrentUserId(database);
        const teamId = await getCurrentTeamId(database);

        debugLog('[getErpPermissions] start: userId=', userId, ' teamId=', teamId, ' forceRefresh=', forceRefresh);

        if (!userId || !teamId) {
            debugLog('[getErpPermissions] missing userId or teamId, returning null');
            return null;
        }

        // Check cache first (unless force refresh)
        if (!forceRefresh) {
            const cached = await getErpPermissionsCache(database, userId, teamId);
            if (cached) {
                debugLog('[getErpPermissions] cache HIT, roles=', cached.roles,
                    ' doctypes_count=', Object.keys(cached.doctypes || {}).length);
                return {
                    doctypes: cached.doctypes,
                    roles: cached.roles,
                };
            }
            debugLog('[getErpPermissions] cache MISS, fetching from server');
        }

        // Fetch from server
        const permissions = await fetchErpPermissions(serverUrl, teamId);
        if (permissions) {
            debugLog('[getErpPermissions] server response: roles=', permissions.roles,
                ' doctypes=', JSON.stringify(permissions.doctypes));
            // Save to cache
            await saveErpPermissionsCache(database, userId, teamId, permissions);
        } else {
            debugLog('[getErpPermissions] server returned null/empty permissions');
        }

        return permissions;
    } catch (error: any) {
        debugLog('[getErpPermissions] FAILED:', error?.message || error);
        console.warn('[getErpPermissions] Failed to get ERP permissions:', error);
        return null;
    }
}
