// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Database, Q} from '@nozbe/watermelondb';

import {MM_TABLES} from '@constants/database';
import ContactDepartmentModel from '@database/models/server/contact_department';
import ContactDepartmentMemberModel from '@database/models/server/contact_department_member';
import ContactSyncVersionModel from '@database/models/server/contact_sync_version';
import EmployeeContactModel from '@database/models/server/employee_contact';

const {CONTACT_DEPARTMENT, CONTACT_DEPARTMENT_MEMBER, EMPLOYEE_CONTACT, CONTACT_SYNC_VERSION} = MM_TABLES.SERVER;

/** 获取指定 scope 的本地同步版本 */
export const getContactSyncVersion = async (database: Database, scopeKey: string): Promise<string | undefined> => {
    const records = await database.get<ContactSyncVersionModel>(CONTACT_SYNC_VERSION)
        .query(Q.where('scope_key', scopeKey))
        .fetch();
    return records[0]?.version;
};

/** 写入/更新同步版本 */
export const upsertContactSyncVersion = async (database: Database, scopeKey: string, teamId: string, version: string) => {
    const collection = database.get<ContactSyncVersionModel>(CONTACT_SYNC_VERSION);
    const existing = await collection.query(Q.where('scope_key', scopeKey)).fetch();
    if (existing.length > 0) {
        await existing[0].update((r) => {
            r.version = version;
            r.syncedAt = Date.now();
        });
    } else {
        await collection.create((r) => {
            r.scopeKey = scopeKey;
            r.teamId = teamId;
            r.version = version;
            r.syncedAt = Date.now();
        });
    }
};

/** 获取企业部门列表（根目录或子部门） */
export const queryLocalDepartments = async (database: Database, teamId: string, parentId?: number): Promise<ContactDepartmentModel[]> => {
    const conditions: Q.Clause[] = [Q.where('team_id', teamId)];
    if (parentId === undefined) {
        // 根目录：parent_id IS NULL 或 按 DEFAULT_TEAM_DEPARTMENT_NAME 过滤
        conditions.push(Q.or(
            Q.where('parent_id', Q.eq(null as any)),
            Q.where('parent_id', -1),
        ));
    } else {
        conditions.push(Q.where('parent_id', parentId));
    }
    return database.get<ContactDepartmentModel>(CONTACT_DEPARTMENT)
        .query(...conditions)
        .fetch();
};

/** 获取部门下的成员 */
export const queryLocalDepartmentMembers = async (database: Database, teamId: string, departmentId: number): Promise<ContactDepartmentMemberModel[]> => {
    return database.get<ContactDepartmentMemberModel>(CONTACT_DEPARTMENT_MEMBER)
        .query(
            Q.where('team_id', teamId),
            Q.where('department_id', departmentId),
        )
        .fetch();
};

/** 获取企业全部成员（去重：所有部门成员合并） */
export const queryLocalAllMembers = async (database: Database, teamId: string): Promise<ContactDepartmentMemberModel[]> => {
    return database.get<ContactDepartmentMemberModel>(CONTACT_DEPARTMENT_MEMBER)
        .query(Q.where('team_id', teamId))
        .fetch();
};

/** 获取用户的指定类型联系人（外部/内部） */
export const queryLocalEmployeeContacts = async (database: Database, employeeId: string, contactType: string): Promise<EmployeeContactModel[]> => {
    return database.get<EmployeeContactModel>(EMPLOYEE_CONTACT)
        .query(
            Q.where('employee_id', employeeId),
            Q.where('contact_type', contactType),
        )
        .fetch();
};

/** 将 ContactDepartmentMember 转换为 SimpleUserProfile 兼容对象 */
export const memberToUserProfile = (m: ContactDepartmentMemberModel): SimpleUserProfile => ({
    id: m.userId,
    username: m.username,
    nickname: m.nickname,
    email: m.email,
    first_name: m.firstName,
    last_name: m.lastName,
    position: m.position,
    phone: m.phone || undefined,
    roles: m.roles,
    locale: '',
    is_bot: m.isBot,
    last_picture_update: m.lastPictureUpdate ?? undefined,
    country_code: m.countryCode ?? undefined,
});

/** 将 EmployeeContactModel 转换为 UI 展示所需的联系人对象 */
export const employeeContactToUI = (ec: EmployeeContactModel) => ({
    id: ec.id,
    employee_id: ec.employeeId,
    contact_id: ec.contactId,
    contact_type: ec.contactType as 'internal' | 'external',
    company: ec.company,
    description: ec.description,
    remark: ec.remark,
    source: ec.source as 'manual' | 'erp' | undefined,
    create_at: ec.createAt,
    update_at: ec.updateAt,
    contact: {
        id: ec.contactId,
        username: ec.username,
        nickname: ec.nickname,
        email: ec.email,
        first_name: ec.firstName,
        last_name: ec.lastName,
        phone: ec.phone,
        position: ec.position,
        is_bot: ec.isBot,
        last_picture_update: ec.lastPictureUpdate ?? undefined,
    } as SimpleUserProfile,
});
