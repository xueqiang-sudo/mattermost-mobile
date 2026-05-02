// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
import NetworkManager from '@managers/network_manager';
import {getFullErrorMessage} from '@utils/errors';
import {logDebug} from '@utils/log';
import {getFullName, user2FullPhone} from '@utils/user';

import type {MMEmployeeContact, MMEmployeeContactDetail, MMEmployeeContactSimple, MMEmployeeContactType, MMUpsertEmployeeContactRequest} from '@client/rest/team_department';

/** 供应商/客户搜索行：与 {@link searchExactGlobalEmployeeContacts} 返回结构一致 */
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
): Promise<FetchRemoteResult<MMEmployeeContact[] | MMEmployeeContactSimple[] | MMEmployeeContactDetail[]>> => {
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

/** 模糊匹配我的指定类型的联系人 */
export const searchEmployeeContacts = async (
    serverUrl: string,
    contactType: MMEmployeeContactType,
    employeeId: string,
    searchQuery: string,
    opts?: {page?: number; perPage?: number; granularity?: 1 | 2},
): Promise<FetchRemoteResult<MMEmployeeContactSimple[] | MMEmployeeContactDetail[]>> => {
    try {
        // eslint-disable-next-line no-unused-expressions, no-param-reassign
        !opts && (opts = {});
        // eslint-disable-next-line no-unused-expressions
        !(opts.granularity === 1 || opts.granularity === 2) && (opts.granularity = 2);
        const myContacts = ((await fetchEmployeeContacts(serverUrl, employeeId, contactType, opts)).data ?? []) as MMEmployeeContactSimple[] | MMEmployeeContactDetail[];
        const filteredContacts = myContacts.filter((c) => {
            if (c.contact.username?.includes(searchQuery) || c.contact.email?.includes(searchQuery) || c.contact.nickname?.includes(searchQuery)) {
                return true;
            }
            if ((c.contact.first_name || c.contact.last_name) && getFullName(c.contact).includes(searchQuery)) {
                return true;
            }
            if (c.contact.phone && user2FullPhone(c.contact).includes(searchQuery)) {
                return true;
            }
            return false;
        });
        return {data: filteredContacts};
    } catch (error) {
        logDebug('[searchEmployeeContacts] catch error', getFullErrorMessage(error));
        return {error};
    }
};

/**
 * 按关键词精准全局搜索联系人；已添加为当前类型的联系人也会返回，并标记 alreadyAdded（界面不可选）。
 */
export const searchExactGlobalEmployeeContacts = async (
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
        const myContacts = (await fetchEmployeeContacts(serverUrl, employeeId, contactType, {page: 0, perPage: 10000})).data ?? [];
        const addedContactIds = new Set(myContacts.map((c) => c.contact_id));
        return {
            data: employees.map((employee) => ({
                employee,
                alreadyAdded: addedContactIds.has(employee.id),
            })),
        };
    } catch (error) {
        logDebug('[searchExactGlobalEmployeeContacts] catch error', getFullErrorMessage(error));
        return {error};
    }
};
