// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Database, Q} from '@nozbe/watermelondb';

import {MM_TABLES} from '@constants/database';
import {DEFAULT_TEAM_DEPARTMENT_NAME} from '@client/rest/constants';
import ContactDepartmentModel from '@database/models/server/contact_department';
import ContactDepartmentMemberModel from '@database/models/server/contact_department_member';
import ContactSyncVersionModel from '@database/models/server/contact_sync_version';
import EmployeeContactModel from '@database/models/server/employee_contact';
import NetworkManager from '@managers/network_manager';
import {logDebug} from '@utils/log';

import {
    fetchContactDirectoryContent,
    fetchDepartmentsByTeam,
    fetchDepartmentEmployees,
    fetchMembersWithoutDepartment,
    fetchEmployeeCountOfTeam,
    ensureTeamDefaultDepartment,
} from './contact_new';
import {fetchEmployeeContacts} from './employee_contact_new';

import type {MMDepartment, MMEmployeeContact, MMEmployeeContactSimple} from '@client/rest/team_department';

const {CONTACT_DEPARTMENT, CONTACT_DEPARTMENT_MEMBER, EMPLOYEE_CONTACT, CONTACT_SYNC_VERSION} = MM_TABLES.SERVER;

// ─── 企业通讯录同步 (P0) ───

/**
 * 同步企业通讯录：版本检查 → 按需全量拉取 → 写本地 DB
 * @returns usedCache=true 表示版本未变，直接用了本地数据
 */
export const syncContactDirectory = async (
    serverUrl: string,
    teamId: string,
    database: Database,
): Promise<{usedCache: boolean; error?: unknown}> => {
    const scopeKey = `team:${teamId}`;
    try {
        // 1. 获取服务器版本
        const client = NetworkManager.getClient(serverUrl);
        const serverVersion = await client.getTeamVersion(teamId);

        // 2. 读取本地版本
        const localRecords = await database.get<ContactSyncVersionModel>(CONTACT_SYNC_VERSION)
            .query(Q.where('scope_key', scopeKey))
            .fetch();
        const localVersion = localRecords[0]?.version;

        // 3. 版本相同 → 用缓存
        if (localVersion && localVersion === serverVersion.version) {
            logDebug('[syncContactDirectory] version match, using cache', {version: localVersion});
            return {usedCache: true};
        }

        // 4. 版本不同 → 全量拉取
        logDebug('[syncContactDirectory] version changed, syncing', {local: localVersion, server: serverVersion.version});

        // 确保默认部门存在（与 webapp 对齐）
        await ensureTeamDefaultDepartment(serverUrl, teamId);

        const content = await fetchContactDirectoryContent(serverUrl, teamId);
        if (content.error) {
            return {usedCache: false, error: content.error};
        }
        if (!content.data) {
            return {usedCache: false};
        }

        // 5. 全量拉取所有部门（不只是根级）用于本地存储
        const allDeptsRes = await fetchDepartmentsByTeam(serverUrl, teamId, {perPage: 10000});
        const allDepts: MMDepartment[] = (allDeptsRes.data ?? []).filter((d) => d.name !== DEFAULT_TEAM_DEPARTMENT_NAME);

        // 拉取每个部门的成员
        const deptMembersMap = new Map<number, UserProfile[]>();
        for (const dept of allDepts) {
            const membersRes = await fetchDepartmentEmployees(serverUrl, teamId, dept.id, {perPage: 10000});
            deptMembersMap.set(dept.id, membersRes.data ?? []);
        }

        // 默认部门成员 + 无部门成员
        const rootEmployees = content.data.employees ?? [];

        // 6. 写入本地 DB（事务）
        await database.write(async () => {
            // 清空旧数据
            const oldDepts = await database.get<ContactDepartmentModel>(CONTACT_DEPARTMENT)
                .query(Q.where('team_id', teamId)).fetch();
            for (const d of oldDepts) {
                await d.markAsDeleted();
            }

            const oldMembers = await database.get<ContactDepartmentMemberModel>(CONTACT_DEPARTMENT_MEMBER)
                .query(Q.where('team_id', teamId)).fetch();
            for (const m of oldMembers) {
                await m.markAsDeleted();
            }

            // 批量插入部门
            const deptCollection = database.get<ContactDepartmentModel>(CONTACT_DEPARTMENT);
            for (const dept of allDepts) {
                await deptCollection.create((r) => {
                    r.teamId = teamId;
                    r.deptId = dept.id;
                    r.name = dept.name;
                    r.description = dept.description || '';
                    r.parentId = dept.parent_id;
                    r.createAt = dept.create_at;
                    r.updateAt = dept.update_at;
                    r.deleteAt = dept.delete_at;
                });
            }

            // 批量插入部门成员
            const memberCollection = database.get<ContactDepartmentMemberModel>(CONTACT_DEPARTMENT_MEMBER);
            const insertedUserIds = new Set<string>();

            for (const [deptId, members] of deptMembersMap) {
                for (const user of members) {
                    await memberCollection.create((r) => {
                        r.teamId = teamId;
                        r.departmentId = deptId;
                        r.userId = user.id;
                        r.username = user.username || '';
                        r.nickname = user.nickname || '';
                        r.email = user.email || '';
                        r.firstName = user.first_name || '';
                        r.lastName = user.last_name || '';
                        r.position = user.position || '';
                        r.phone = user.phone || '';
                        r.roles = user.roles || '';
                        r.isBot = user.is_bot || false;
                        r.lastPictureUpdate = user.last_picture_update ?? null;
                        r.gender = (user as any).gender ?? null;
                        r.countryCode = (user as any).country_code ?? null;
                        r.createAt = user.create_at || 0;
                        r.updateAt = user.update_at || 0;
                    });
                    insertedUserIds.add(user.id);
                }
            }

            // 根目录成员（默认部门 + 无部门），使用虚拟 department_id = -1
            for (const user of rootEmployees) {
                if (!insertedUserIds.has(user.id)) {
                    await memberCollection.create((r) => {
                        r.teamId = teamId;
                        r.departmentId = -1;
                        r.userId = user.id;
                        r.username = user.username || '';
                        r.nickname = user.nickname || '';
                        r.email = user.email || '';
                        r.firstName = user.first_name || '';
                        r.lastName = user.last_name || '';
                        r.position = user.position || '';
                        r.phone = user.phone || '';
                        r.roles = user.roles || '';
                        r.isBot = user.is_bot || false;
                        r.lastPictureUpdate = user.last_picture_update ?? null;
                        r.gender = (user as any).gender ?? null;
                        r.countryCode = (user as any).country_code ?? null;
                        r.createAt = user.create_at || 0;
                        r.updateAt = user.update_at || 0;
                    });
                }
            }

            // 更新版本
            const versionCollection = database.get<ContactSyncVersionModel>(CONTACT_SYNC_VERSION);
            const existingVersions = await versionCollection.query(Q.where('scope_key', scopeKey)).fetch();
            if (existingVersions.length > 0) {
                await existingVersions[0].update((r) => {
                    r.version = serverVersion.version;
                    r.syncedAt = Date.now();
                });
            } else {
                await versionCollection.create((r) => {
                    r.scopeKey = scopeKey;
                    r.teamId = teamId;
                    r.version = serverVersion.version;
                    r.syncedAt = Date.now();
                });
            }
        });

        logDebug('[syncContactDirectory] sync complete', {depts: allDepts.length, version: serverVersion.version});
        return {usedCache: false};
    } catch (error) {
        logDebug('[syncContactDirectory] error', error);
        return {usedCache: false, error};
    }
};

// ─── 外部/内部联系人同步 (P1/P2) ───

/**
 * 同步用户的联系人（外部/内部）
 */
export const syncEmployeeContacts = async (
    serverUrl: string,
    employeeId: string,
    contactType: string,
    database: Database,
): Promise<{usedCache: boolean; error?: unknown}> => {
    const scopeKey = `user_contacts:${employeeId}:${contactType}`;
    try {
        // 1. 获取联系人版本
        const client = NetworkManager.getClient(serverUrl);
        const versionInfo = await client.getUserContactVersion(employeeId);
        const serverVersion = versionInfo.version;

        // 2. 读取本地版本
        const localRecords = await database.get<ContactSyncVersionModel>(CONTACT_SYNC_VERSION)
            .query(Q.where('scope_key', scopeKey))
            .fetch();
        const localVersion = localRecords[0]?.version;

        // 3. 版本相同 → 用缓存
        if (localVersion && localVersion === serverVersion) {
            logDebug('[syncEmployeeContacts] version match, using cache', {scopeKey, version: localVersion});
            return {usedCache: true};
        }

        // 4. 版本不同 → 拉取
        logDebug('[syncEmployeeContacts] version changed, syncing', {scopeKey, local: localVersion, server: serverVersion});

        const res = await fetchEmployeeContacts(serverUrl, employeeId, contactType as any, {perPage: 10000, granularity: 2});
        if (res.error) {
            return {usedCache: false, error: res.error};
        }

        const contacts = (res.data ?? []) as MMEmployeeContact[];

        // 5. 写入本地 DB
        await database.write(async () => {
            // 清空该用户该类型的旧数据
            const oldContacts = await database.get<EmployeeContactModel>(EMPLOYEE_CONTACT)
                .query(
                    Q.where('employee_id', employeeId),
                    Q.where('contact_type', contactType),
                ).fetch();
            for (const c of oldContacts) {
                await c.markAsDeleted();
            }

            // 批量插入
            const collection = database.get<EmployeeContactModel>(EMPLOYEE_CONTACT);
            for (const ec of contacts) {
                const contact = ec.contact as any;
                await collection.create((r) => {
                    r.employeeId = ec.employee_id;
                    r.contactId = ec.contact_id;
                    r.contactType = ec.contact_type;
                    r.company = ec.company || '';
                    r.description = ec.description || '';
                    r.remark = ec.remark || '';
                    r.source = ec.source ?? null;
                    r.username = contact?.username || '';
                    r.nickname = contact?.nickname || '';
                    r.email = contact?.email || '';
                    r.firstName = contact?.first_name || '';
                    r.lastName = contact?.last_name || '';
                    r.phone = contact?.phone || '';
                    r.position = contact?.position || '';
                    r.isBot = contact?.is_bot || false;
                    r.lastPictureUpdate = contact?.last_picture_update ?? null;
                    r.createAt = ec.create_at || 0;
                    r.updateAt = ec.update_at || 0;
                });
            }

            // 更新版本
            const versionCollection = database.get<ContactSyncVersionModel>(CONTACT_SYNC_VERSION);
            const existingVersions = await versionCollection.query(Q.where('scope_key', scopeKey)).fetch();
            if (existingVersions.length > 0) {
                await existingVersions[0].update((r) => {
                    r.version = serverVersion;
                    r.syncedAt = Date.now();
                });
            } else {
                await versionCollection.create((r) => {
                    r.scopeKey = scopeKey;
                    r.teamId = '';
                    r.version = serverVersion;
                    r.syncedAt = Date.now();
                });
            }
        });

        logDebug('[syncEmployeeContacts] sync complete', {scopeKey, count: contacts.length});
        return {usedCache: false};
    } catch (error) {
        logDebug('[syncEmployeeContacts] error', error);
        return {usedCache: false, error};
    }
};

// ─── 操作后强制刷新版本 ───

/**
 * 通讯录变更操作后调用：刷新本地版本标记为失效，
 * 下次进入页面时 sync 函数会自动全量拉取。
 */
export const invalidateContactSyncVersion = async (database: Database, scopeKey: string) => {
    await database.write(async () => {
        const records = await database.get<ContactSyncVersionModel>(CONTACT_SYNC_VERSION)
            .query(Q.where('scope_key', scopeKey))
            .fetch();
        for (const r of records) {
            await r.markAsDeleted();
        }
    });
};
