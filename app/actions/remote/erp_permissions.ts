// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Database, Q} from '@nozbe/watermelondb';

import {MM_TABLES} from '@constants/database';
import DatabaseManager from '@database/manager';
import ErpPermissionsCacheModel from '@database/models/server/erp_permissions_cache';
import NetworkManager from '@managers/network_manager';
import {getCurrentTeamId} from '@queries/servers/system';
import {getCurrentUserId} from '@queries/servers/system';

const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

export type ErpPermissionsResponse = {
    is_erp_team: boolean;
    has_erp_account?: boolean;
    roles?: string[];
    allowed_doctypes?: string[];
    data_scope?: string;
};

/**
 * Fetch ERP permissions from server
 */
export async function fetchErpPermissions(
    serverUrl: string,
    teamId: string,
): Promise<ErpPermissionsResponse | null> {
    try {
        const client = NetworkManager.getClient(serverUrl);
        const response = await client.doFetch(
            `/plugins/com.mattermost.frappe-sync/api/erp/permissions?team_id=${teamId}`,
            {method: 'GET'},
        );
        return response;
    } catch (error) {
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
                record.isErpTeam = permissions.is_erp_team;
                record.hasErpAccount = permissions.has_erp_account || false;
                record.roles = permissions.roles || [];
                record.allowedDoctypes = permissions.allowed_doctypes || [];
                record.dataScope = permissions.data_scope || 'self';
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

        if (!userId || !teamId) {
            return null;
        }

        // Check cache first (unless force refresh)
        if (!forceRefresh) {
            const cached = await getErpPermissionsCache(database, userId, teamId);
            if (cached) {
                return {
                    is_erp_team: cached.isErpTeam,
                    has_erp_account: cached.hasErpAccount,
                    roles: cached.roles,
                    allowed_doctypes: cached.allowedDoctypes,
                    data_scope: cached.dataScope,
                };
            }
        }

        // Fetch from server
        const permissions = await fetchErpPermissions(serverUrl, teamId);
        if (permissions) {
            // Save to cache
            await saveErpPermissionsCache(database, userId, teamId, permissions);
        }

        return permissions;
    } catch (error) {
        console.warn('[getErpPermissions] Failed to get ERP permissions:', error);
        return null;
    }
}
