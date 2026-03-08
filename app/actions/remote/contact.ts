// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import ContactService, {
    ContactCompanyTypes,
    DEFAULT_DEPARTMENT_NAME,
    type ContactCompany,
    type ContactDepartment,
    type ContactEmployee,
} from '@client/rest/contact';
import {getFullErrorMessage} from '@utils/errors';
import {logDebug} from '@utils/log';

export type ContactCompanyType = 'team' | 'customer' | 'supplier';

export type FetchContactCompaniesResult = {
    data?: ContactCompany[];
    error?: unknown;
};

export type FetchEmployeesByCompanyTypeResult = {
    data?: ContactEmployee[];
    error?: unknown;
};

const typeMap: Record<ContactCompanyType, string> = {
    team: ContactCompanyTypes.Team,
    customer: ContactCompanyTypes.Customer,
    supplier: ContactCompanyTypes.Supplier,
};

export type GetCompanyByIdResult = {
    data?: ContactCompany;
    error?: unknown;
};

export type FetchEmployeesByCompanyIdResult = {
    data?: ContactEmployee[];
    error?: unknown;
};

export type EnsureTeamContactCompanyResult = {
    data?: ContactCompany;
    error?: unknown;
};

export type FetchCompanyDepartmentsResult = {
    data?: ContactDepartment[];
    error?: unknown;
};

export type FetchDepartmentEmployeesResult = {
    data?: ContactEmployee[];
    error?: unknown;
};

export type FetchCompanyEmployeeCountResult = {
    data?: number;
    error?: unknown;
};

export type FetchDepartmentDetailResult = {
    data?: { subDepartments: ContactDepartment[]; employees: ContactEmployee[] };
    error?: unknown;
};

/** 通过 id 获取单个通讯录公司 */
export const getCompanyById = async (companyId: string): Promise<GetCompanyByIdResult> => {
    if (!companyId) {
        return {error: new Error('companyId is required')};
    }
    try {
        const company = await ContactService.getCompany(companyId);
        return {data: company};
    } catch (error) {
        logDebug('[ContactService.getCompanyById]', getFullErrorMessage(error));
        return {error};
    }
};

/** 获取指定公司的所有员工 */
export const fetchEmployeesByCompanyId = async (companyId: string): Promise<FetchEmployeesByCompanyIdResult> => {
    if (!companyId) {
        return {error: new Error('companyId is required')};
    }
    try {
        const employees = await ContactService.getCompanyAllEmployees(companyId);
        return {data: employees};
    } catch (error) {
        logDebug('[ContactService.fetchEmployeesByCompanyId]', getFullErrorMessage(error));
        return {error};
    }
};

/** 先尝试获取通讯录企业，若不存在/失败则创建，id 为 currentTeamId */
export const ensureTeamContactCompany = async (teamId: string, teamName: string): Promise<EnsureTeamContactCompanyResult> => {
    if (!teamId) {
        return {error: new Error('teamId is required')};
    }
    const getRes = await getCompanyById(teamId);
    if (getRes.data) {
        return {data: getRes.data};
    }
    if (!teamName) {
        return getRes;
    }
    try {
        const company = await ContactService.createCompany({
            id: teamId,
            name: teamName,
            type: ContactCompanyTypes.Team,
        });
        return {data: company};
    } catch (error) {
        logDebug('[ContactService.ensureTeamContactCompany]', getFullErrorMessage(error));
        return {error};
    }
};

/** 规范化部门列表：API 可能返回数组或 {departments: [...]} */
function normalizeDepartments(raw: unknown): ContactDepartment[] {
    if (Array.isArray(raw)) {
        return raw;
    }
    if (raw && typeof raw === 'object') {
        const obj = raw as Record<string, unknown>;
        if (Array.isArray(obj.departments)) {
            return obj.departments as ContactDepartment[];
        }
        if (Array.isArray(obj.data)) {
            return obj.data as ContactDepartment[];
        }
    }
    return [];
}

/** 获取公司下的所有部门 */
export const fetchCompanyDepartments = async (companyId: string): Promise<FetchCompanyDepartmentsResult> => {
    if (!companyId) {
        return {error: new Error('companyId is required')};
    }
    try {
        const raw = await ContactService.getCompanyDepartments(companyId);
        return {data: normalizeDepartments(raw)};
    } catch (error) {
        logDebug('[ContactService.fetchCompanyDepartments]', getFullErrorMessage(error));
        return {error};
    }
};

/** 获取默认部门员工（按名称识别默认部门） */
export const fetchDefaultDepartmentEmployees = async (companyId: string): Promise<FetchDepartmentEmployeesResult> => {
    if (!companyId) {
        return {error: new Error('companyId is required')};
    }
    try {
        const deptRes = await fetchCompanyDepartments(companyId);
        if (deptRes.error) {
            return {error: deptRes.error};
        }
        const deptList = Array.isArray(deptRes.data) ? deptRes.data : [];
        const defaultDept = deptList.find((d) => d.name === DEFAULT_DEPARTMENT_NAME);
        if (!defaultDept) {
            logDebug('[fetchDefaultDepartmentEmployees]', 'No default department found');
            return {data: []};
        }
        const employees = await ContactService.getDepartmentAllEmployees(defaultDept.id);
        return {data: employees};
    } catch (error) {
        logDebug('[ContactService.fetchDefaultDepartmentEmployees]', getFullErrorMessage(error));
        return {error};
    }
};

/** 获取公司下员工总数（用于企业通讯录人数展示） */
export const fetchCompanyEmployeeCount = async (companyId: string): Promise<FetchCompanyEmployeeCountResult> => {
    if (!companyId) {
        return {error: new Error('companyId is required')};
    }
    try {
        const count = await ContactService.getCompanyEmployeeCount(companyId);
        return {data: count};
    } catch (error) {
        logDebug('[ContactService.fetchCompanyEmployeeCount]', getFullErrorMessage(error));
        return {error};
    }
};

/** 获取指定部门的员工（直接隶属于该部门的成员） */
export const fetchDepartmentEmployees = async (departmentId: number): Promise<FetchDepartmentEmployeesResult> => {
    try {
        const employees = await ContactService.getDepartmentEmployees(departmentId);
        return {data: employees};
    } catch (error) {
        logDebug('[ContactService.fetchDepartmentEmployees]', getFullErrorMessage(error));
        return {error};
    }
};

/** 获取部门详情：子部门 + 本部门成员，并行请求 */
export const fetchDepartmentDetail = async (
    departmentId: number,
    companyId: string,
): Promise<FetchDepartmentDetailResult> => {
    if (!companyId) {
        return {error: new Error('companyId is required')};
    }
    try {
        const [deptRes, empRes] = await Promise.all([
            fetchCompanyDepartments(companyId),
            ContactService.getDepartmentEmployees(departmentId),
        ]);

        if (deptRes.error) {
            return {error: deptRes.error};
        }

        const allDepts: ContactDepartment[] = Array.isArray(deptRes.data) ? deptRes.data : [];
        const subDepartments = allDepts.filter((d) => d && d.parent_id === departmentId);
        const employees = Array.isArray(empRes) ? empRes : [];

        return {data: {subDepartments, employees}};
    } catch (error) {
        logDebug('[fetchDepartmentDetail]', getFullErrorMessage(error));
        return {error};
    }
};

export const fetchContactCompanies = async (): Promise<FetchContactCompaniesResult> => {
    try {
        const companies = await ContactService.getCompanies();
        return {data: companies};
    } catch (error) {
        logDebug('[ContactService.fetchContactCompanies]', getFullErrorMessage(error));
        return {error};
    }
};

export const fetchEmployeesByCompanyType = async (
    type: ContactCompanyType,
): Promise<FetchEmployeesByCompanyTypeResult> => {
    try {
        const companies = await ContactService.getCompanies();
        const targetType = typeMap[type];
        const filteredCompanies = companies.filter((c) => c.type === targetType);

        const employeeArrays = await Promise.all(
            filteredCompanies.map((c) => ContactService.getCompanyAllEmployees(c.id)),
        );
        const allEmployees: ContactEmployee[] = [];
        const seenIds = new Set<string>();
        for (const employees of employeeArrays) {
            for (const emp of employees) {
                if (!seenIds.has(emp.id)) {
                    seenIds.add(emp.id);
                    allEmployees.push(emp);
                }
            }
        }
        return {data: allEmployees};
    } catch (error) {
        logDebug('[ContactService.fetchEmployeesByCompanyType]', getFullErrorMessage(error));
        return {error};
    }
};
