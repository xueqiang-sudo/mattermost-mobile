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

export type FetchEmployeesOfCompaniesByTypeResult = {
    data?: ContactEmployee[];
    error?: unknown;
};

const typeMap: Record<ContactCompanyType, string> = {
    team: ContactCompanyTypes.Team,
    customer: ContactCompanyTypes.Customer,
    supplier: ContactCompanyTypes.Supplier,
};

export type FetchCompanyResult = {
    data?: ContactCompany;
    error?: unknown;
};

export type EnsureTeamCompanyResult = {
    data?: ContactCompany;
    error?: unknown;

    /** 为 true 表示本次为新建，false 或缺失表示已存在 */
    isNewCreate?: boolean;
};

export type FetchDepartmentsOfCompanyResult = {
    data?: ContactDepartment[];
    error?: unknown;
};

export type FetchEmployeesResult = {
    data?: ContactEmployee[];
    error?: unknown;
};

export type FetchEmployeeCountOfCompanyResult = {
    data?: number;
    error?: unknown;
};

export type FetchDepartmentDetailResult = {
    data?: { subDepartments: ContactDepartment[]; employees: ContactEmployee[] };
    error?: unknown;
};

export type FetchEmployeeCountOfDepartmentResult = {
    data?: number;
    error?: unknown;
};

/** 根据 id 获取单个通讯录公司 */
export const fetchCompany = async (companyId: string): Promise<FetchCompanyResult> => {
    if (!companyId) {
        return {error: new Error('companyId is required')};
    }
    try {
        const company = await ContactService.getCompany(companyId);
        return {data: company};
    } catch (error) {
        logDebug('[ContactService.fetchCompany]', getFullErrorMessage(error));
        return {error};
    }
};

/** 获取或创建当前 Mattermost 团队对应的通讯录公司（teamId 作为 company id） */
export const ensureTeamCompany = async (teamId: string, teamName: string): Promise<EnsureTeamCompanyResult> => {
    if (!teamId) {
        return {error: new Error('teamId is required')};
    }
    const getRes = await fetchCompany(teamId);
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
        return {data: company, isNewCreate: true};
    } catch (error) {
        logDebug('[ContactService.ensureTeamCompany]', getFullErrorMessage(error));
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

/** 获取公司下所有部门 */
export const fetchDepartmentsOfCompany = async (companyId: string): Promise<FetchDepartmentsOfCompanyResult> => {
    if (!companyId) {
        return {error: new Error('companyId is required')};
    }
    try {
        const raw = await ContactService.getCompanyWithDepartments(companyId);
        return {data: normalizeDepartments(raw)};
    } catch (error) {
        logDebug('[ContactService.fetchDepartmentsOfCompany]', getFullErrorMessage(error));
        return {error};
    }
};

/** 获取默认部门下所有员工（按 DEFAULT_DEPARTMENT_NAME 识别默认部门） */
export const fetchEmployeesOfDefaultDepartment = async (companyId: string): Promise<FetchEmployeesResult> => {
    if (!companyId) {
        return {error: new Error('companyId is required')};
    }
    try {
        const deptRes = await fetchDepartmentsOfCompany(companyId);
        if (deptRes.error) {
            return {error: deptRes.error};
        }
        const deptList = Array.isArray(deptRes.data) ? deptRes.data : [];
        const defaultDept = deptList.find((d) => d.name === DEFAULT_DEPARTMENT_NAME);
        if (!defaultDept) {
            logDebug('[fetchEmployeesOfDefaultDepartment]', 'No default department found');
            return {data: []};
        }
        const employees = await ContactService.getEmployeesOfDepartment(defaultDept.id);
        return {data: employees};
    } catch (error) {
        logDebug('[ContactService.fetchEmployeesOfDefaultDepartment]', getFullErrorMessage(error));
        return {error};
    }
};

/** 获取公司下员工总数（用于人数展示） */
export const fetchEmployeeCountOfCompany = async (companyId: string): Promise<FetchEmployeeCountOfCompanyResult> => {
    if (!companyId) {
        return {error: new Error('companyId is required')};
    }
    try {
        const count = await ContactService.getCompanyEmployeeCount(companyId);
        return {data: count};
    } catch (error) {
        logDebug('[ContactService.fetchEmployeeCountOfCompany]', getFullErrorMessage(error));
        return {error};
    }
};

/** 获取部门及子部门下员工总数（用于子部门人数展示） */
export const fetchEmployeeCountOfDepartment = async (departmentId: number): Promise<FetchEmployeeCountOfDepartmentResult> => {
    try {
        const count = await ContactService.getEmployeeCountOfDepartment(departmentId);
        return {data: count};
    } catch (error) {
        logDebug('[ContactService.fetchEmployeeCountOfDepartment]', getFullErrorMessage(error));
        return {error};
    }
};

/** 获取部门详情：子部门列表 + 部门下所有员工（含子部门），并行请求 */
export const fetchDepartmentDetail = async (
    departmentId: number,
    companyId: string,
): Promise<FetchDepartmentDetailResult> => {
    if (!companyId) {
        return {error: new Error('companyId is required')};
    }
    try {
        const [deptRes, empRes] = await Promise.all([
            fetchDepartmentsOfCompany(companyId),
            ContactService.getEmployeesOfDepartment(departmentId),
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

/** 按公司类型获取员工（team/customer/supplier，去重） */
export const fetchEmployeesOfCompaniesByType = async (
    type: ContactCompanyType,
): Promise<FetchEmployeesOfCompaniesByTypeResult> => {
    try {
        const companies = await ContactService.getCompanies();
        const targetType = typeMap[type];
        const filteredCompanies = companies.filter((c) => c.type === targetType);

        const employeeArrays = await Promise.all(
            filteredCompanies.map((c) => ContactService.getEmployeesOfCompany(c.id)),
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
        logDebug('[ContactService.fetchEmployeesOfCompaniesByType]', getFullErrorMessage(error));
        return {error};
    }
};
