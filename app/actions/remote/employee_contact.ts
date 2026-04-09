// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {ContactService} from '@client/rest';
import type {ContactEmployee} from '@client/rest/contact';
import EmployeeContactService, {
    type CreateEmployeeContactRequest,
    type EmployeeContact,
    type EmployeeContactDetail,
    type EmployeeContactType,
    type UpdateEmployeeContactRequest,
} from '@client/rest/employee_contact';
import {getFullErrorMessage} from '@utils/errors';
import {logDebug} from '@utils/log';

export type FetchEmployeeContactsResult = {
    data?: EmployeeContact[];
    error?: unknown;
};

export type FetchEmployeeContactsDetailsResult = {
    data?: EmployeeContactDetail[];
    error?: unknown;
};

export type FetchAllEmployeeContactsResult = {
    data?: {
        customers: EmployeeContact[];
        suppliers: EmployeeContact[];
    };
    error?: unknown;
};

export type AddEmployeeContactResult = {
    data?: {message: string};
    error?: unknown;
};

export type RemoveEmployeeContactResult = {
    data?: {message: string};
    error?: unknown;
};

export type UpdateEmployeeContactResult = {
    data?: {message: string};
    error?: unknown;
};

/** 通讯录搜索一行：含是否已是当前类型的「我的联系人」 */
export type ContactEmployeeSearchRow = {
    employee: ContactEmployee;
    alreadyAdded: boolean;
};

export type SearchEmployeeContactsResult = {
    data?: ContactEmployeeSearchRow[];
    error?: unknown;
};

/**
 * 获取指定员工的联系人列表（基础信息）
 */
export const fetchEmployeeContacts = async (
    employeeId: string,
    contactType: EmployeeContactType,
): Promise<FetchEmployeeContactsResult> => {
    if (!employeeId) {
        return {error: new Error('employeeId is required')};
    }
    try {
        const response = await EmployeeContactService.getContacts(employeeId, contactType);
        return {data: response.contacts};
    } catch (error) {
        logDebug('[fetchEmployeeContacts]', getFullErrorMessage(error));
        return {error};
    }
};

/**
 * 获取指定员工的联系人列表（详细信息）
 */
export const fetchEmployeeContactsWithDetails = async (
    employeeId: string,
    contactType: EmployeeContactType,
): Promise<FetchEmployeeContactsDetailsResult> => {
    if (!employeeId) {
        return {error: new Error('employeeId is required')};
    }
    try {
        const response = await EmployeeContactService.getContactsWithDetails(employeeId, contactType);
        return {data: response.contacts};
    } catch (error) {
        logDebug('[fetchEmployeeContactsWithDetails]', getFullErrorMessage(error));
        return {error};
    }
};

/**
 * 获取指定员工的所有联系人（分组返回）
 */
export const fetchAllEmployeeContacts = async (
    employeeId: string,
): Promise<FetchAllEmployeeContactsResult> => {
    if (!employeeId) {
        return {error: new Error('employeeId is required')};
    }
    try {
        const response = await EmployeeContactService.getAllContacts(employeeId);
        return {data: response.contacts};
    } catch (error) {
        logDebug('[fetchAllEmployeeContacts]', getFullErrorMessage(error));
        return {error};
    }
};

/**
 * 添加联系人关系
 */
export const addEmployeeContact = async (
    employeeId: string,
    contact: CreateEmployeeContactRequest,
): Promise<AddEmployeeContactResult> => {
    if (!employeeId) {
        return {error: new Error('employeeId is required')};
    }
    try {
        const response = await EmployeeContactService.addContact(employeeId, contact);
        return {data: response};
    } catch (error) {
        logDebug('[addEmployeeContact]', getFullErrorMessage(error));
        return {error};
    }
};

/**
 * 移除联系人关系
 */
export const removeEmployeeContact = async (
    employeeId: string,
    contactId: string,
    contactType: EmployeeContactType,
): Promise<RemoveEmployeeContactResult> => {
    if (!employeeId || !contactId) {
        return {error: new Error('employeeId and contactId are required')};
    }
    try {
        const response = await EmployeeContactService.removeContact(employeeId, contactId, contactType);
        return {data: response};
    } catch (error) {
        logDebug('[removeEmployeeContact]', getFullErrorMessage(error));
        return {error};
    }
};

/**
 * 更新供应商/客户关系：备注名与关系说明（PUT）
 */
export const updateEmployeeContact = async (
    employeeId: string,
    contactId: string,
    contactType: EmployeeContactType,
    update: UpdateEmployeeContactRequest,
): Promise<UpdateEmployeeContactResult> => {
    if (!employeeId || !contactId) {
        return {error: new Error('employeeId and contactId are required')};
    }
    try {
        const response = await EmployeeContactService.updateContact(employeeId, contactId, contactType, update);
        return {data: response};
    } catch (error) {
        logDebug('[updateEmployeeContact]', getFullErrorMessage(error));
        return {error};
    }
};

/**
 * 按关键词搜索通讯录员工；已添加为当前类型的联系人也会返回，并标记 alreadyAdded（界面不可选）。
 * 结果较多时一次拉取「我的该类型联系人」再对比；结果较少时本端仍一次拉取列表后在本地逐条判断（无单条 exists 接口时避免重复请求）。
 */
export const searchEmployeeContacts = async (
    contactType: EmployeeContactType,
    employeeId: string,
    searchQuery: string,
): Promise<SearchEmployeeContactsResult> => {
    try {
        const employees = await ContactService.searchExactEmployees(searchQuery);
        if (employees.length === 0) {
            return {data: []};
        }

        const myContacts = (await EmployeeContactService.getContacts(employeeId, contactType)).contacts;
        const addedIds = new Set(myContacts.map((c) => c.id));

        return {
            data: employees.map((employee) => ({
                employee,
                alreadyAdded: addedIds.has(employee.id),
            })),
        };
    } catch (error) {
        logDebug('[searchEmployeeContacts]', getFullErrorMessage(error));
        return {error};
    }
};
