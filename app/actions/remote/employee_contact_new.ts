// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
import NetworkManager from '@managers/network_manager';
import {getFullErrorMessage} from '@utils/errors';
import {logDebug} from '@utils/log';

import type {MMEmployeeContact, MMEmployeeContactType, MMUpsertEmployeeContactRequest} from '@client/rest/team_department';

/** 供应商/客户搜索行：与 {@link searchEmployeeContacts} 返回结构一致 */
export type EmployeeContactSearchRow = {
    employee: UserProfile;
    alreadyAdded: boolean;
};

/**
 * 获取指定员工的联系人列表
 */
export const fetchEmployeeContacts = async (
    serverUrl: string,
    employeeId: string,
    contactType: MMEmployeeContactType,
    opts?: {page?: number; perPage?: number; granularity?: 1 | 2},
): Promise<FetchRemoteResult<MMEmployeeContact[]>> => {
    try {
        const granularity = opts?.granularity ?? 2;
        const client = NetworkManager.getClient(serverUrl);
        const employeeContacts = await client.getEmployeeContacts(employeeId, {contactType, ...(opts || {}), granularity});
        return {data: employeeContacts};
    } catch (error) {
        logDebug('[fetchEmployeeContacts] catch error', getFullErrorMessage(error));
        return {error};
    }
};

/**
 * 获取指定员工的所有联系人（分组返回）
 */
export const fetchAllEmployeeContacts = async (
    serverUrl: string,
    employeeId: string,
    opts?: {page?: number; perPage?: number; granularity?: 1 | 2},
): Promise<FetchRemoteResult<{customers: MMEmployeeContact[]; suppliers: MMEmployeeContact[]}>> => {
    try {
        const customersRes = await fetchEmployeeContacts(serverUrl, employeeId, 'customer', opts);
        const suppliersRes = await fetchEmployeeContacts(serverUrl, employeeId, 'supplier', opts);
        return {data: {customers: customersRes.data ?? [], suppliers: suppliersRes.data ?? []}};
    } catch (error) {
        logDebug('[fetchAllEmployeeContacts] catch error', getFullErrorMessage(error));
        return {error};
    }
};

/** 供应商/客户列表行（对齐原 EmployeeContactDetail 在 UI 上的用法） */
export type EmployeeContactDetailRow = {
    contact: UserProfile;
    contact_type: MMEmployeeContactType;
    description?: string;
    remark?: string;
    created_at: number;
};

function profileFromMmEmployeeContact(row: MMEmployeeContact): UserProfile {
    const embedded = row.contact;
    if (embedded && typeof embedded === 'object' && 'username' in embedded) {
        return embedded as UserProfile;
    }
    const simple = embedded as SimpleUserProfile | undefined;
    if (simple?.username) {
        return {
            ...simple,
            create_at: row.create_at,
            update_at: row.update_at,
            delete_at: 0,
            auth_service: '',
            notify_props: {} as UserNotifyProps,
        } as UserProfile;
    }
    return {
        id: row.contact_id,
        username: row.contact_id,
        email: '',
        nickname: '',
        first_name: '',
        last_name: '',
        position: '',
        roles: '',
        locale: '',
        create_at: row.create_at,
        update_at: row.update_at,
        delete_at: 0,
        auth_service: '',
        notify_props: {} as UserNotifyProps,
    };
}

/**
 * 获取带展示信息的联系人列表（Mattermost 员工联系人 API，granularity=2）
 */
export const fetchEmployeeContactsWithDetails = async (
    serverUrl: string,
    employeeId: string,
    contactType: MMEmployeeContactType,
): Promise<FetchRemoteResult<EmployeeContactDetailRow[]>> => {
    try {
        const res = await fetchEmployeeContacts(serverUrl, employeeId, contactType, {granularity: 2});
        if (res.error) {
            return {error: res.error};
        }
        const data = (res.data ?? []).map((row) => ({
            contact: profileFromMmEmployeeContact(row),
            contact_type: row.contact_type,
            description: row.description,
            remark: row.remark,
            created_at: row.create_at,
        }));
        return {data};
    } catch (error) {
        logDebug('[fetchEmployeeContactsWithDetails]', getFullErrorMessage(error));
        return {error};
    }
};

/**
 * 添加联系人关系
 */
export const addEmployeeContact = async (
    serverUrl: string,
    employeeId: string,
    contactRequest: MMUpsertEmployeeContactRequest,
): Promise<{error?: unknown}> => {
    try {
        const client = NetworkManager.getClient(serverUrl);
        await client.addEmployeeContact(employeeId, contactRequest);
        return {};
    } catch (error) {
        logDebug('[addEmployeeContact] catch error', getFullErrorMessage(error));
        return {error};
    }
};

/**
 * 移除联系人关系
 */
export const removeEmployeeContact = async (
    serverUrl: string,
    employeeId: string,
    contactId: string,
    contactType: MMEmployeeContactType,
): Promise<{error?: unknown}> => {
    try {
        const client = NetworkManager.getClient(serverUrl);
        await client.deleteEmployeeContact(employeeId, {contact_id: contactId, contact_type: contactType});
        return {};
    } catch (error) {
        logDebug('[removeEmployeeContact] catch error', getFullErrorMessage(error));
        return {error};
    }
};

/**
 * 更新供应商/客户关系：备注名与关系说明（PUT）
 */
export const updateEmployeeContact = async (
    serverUrl: string,
    employeeId: string,
    contactId: string,
    contactType: MMEmployeeContactType,
    update: Omit<MMUpsertEmployeeContactRequest, 'contact_id' | 'contact_type'>,
): Promise<{error?: unknown}> => {
    try {
        const client = NetworkManager.getClient(serverUrl);
        await client.updateEmployeeContact(employeeId, {contact_id: contactId, contact_type: contactType, ...(update || {})});
        return {};
    } catch (error) {
        logDebug('[updateEmployeeContact] catch error', getFullErrorMessage(error));
        return {error};
    }
};

/**
 * 按关键词搜索通讯录员工；已添加为当前类型的联系人也会返回，并标记 alreadyAdded（界面不可选）。
 */
export const searchEmployeeContacts = async (
    serverUrl: string,
    contactType: MMEmployeeContactType,
    employeeId: string,
    searchQuery: string,
): Promise<FetchRemoteResult<EmployeeContactSearchRow[]>> => {
    try {
        const client = NetworkManager.getClient(serverUrl);
        const employees = await client.searchUsers(searchQuery, {exact_match: true});
        if (employees.length === 0) {
            return {data: []};
        }
        const myContacts = (await fetchEmployeeContacts(serverUrl, employeeId, contactType)).data ?? [];
        const addedContactIds = new Set(myContacts.map((c) => c.contact_id));
        return {
            data: employees.map((employee) => ({
                employee,
                alreadyAdded: addedContactIds.has(employee.id),
            })),
        };
    } catch (error) {
        logDebug('[searchEmployeeContacts]', getFullErrorMessage(error));
        return {error};
    }
};
