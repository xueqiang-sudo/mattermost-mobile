// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import ContactService, {
    ContactCompanyTypes,
    DEFAULT_DEPARTMENT_NAME,
    type ContactCompany,
    type ContactDepartment,
    type ContactEmployee,
    type ContactEmployeeDetails,
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

export type FetchEmployeeDetailsResult = {
    data?: ContactEmployeeDetails;
    error?: unknown;
};

export type FetchEmployeeCountOfDepartmentResult = {
    data?: number;
    error?: unknown;
};

export type ContactDirectoryContent = {
    departments: ContactDepartment[];
    employees: ContactEmployee[];
    memberCount: number;
};

export type FetchContactDirectoryContentResult = {
    data?: ContactDirectoryContent;
    error?: unknown;
};

/** 统一获取通讯录目录内容：根目录或子目录返回相同结构，调用层不区分层级 */
export const fetchContactDirectoryContent = async (
    companyId: string,
    departmentId?: number,
): Promise<FetchContactDirectoryContentResult> => {
    if (!companyId) {
        return {error: new Error('companyId is required')};
    }
    try {
        if (departmentId === undefined) {
            const [deptRes, empRes, countRes] = await Promise.all([
                fetchDepartmentsOfCompany(companyId, {parentDepartmentId: -1}),
                fetchEmployeesOfDefaultDepartment(companyId),
                fetchEmployeeCountOfCompany(companyId),
            ]);
            if (deptRes.error) {
                return {error: deptRes.error};
            }
            const departments = (deptRes.data || []).filter((d) => d.name !== DEFAULT_DEPARTMENT_NAME);
            const employees = empRes.data ?? [];
            const memberCount = countRes.error ? 0 : (countRes.data ?? 0);
            return {data: {departments, employees, memberCount}};
        }
        const [detailRes, countRes] = await Promise.all([
            fetchDepartmentDetail(departmentId, companyId),
            fetchEmployeeCountOfDepartment(departmentId),
        ]);
        if (detailRes.error) {
            return {error: detailRes.error};
        }
        const departments = detailRes.data?.subDepartments ?? [];
        const employees = detailRes.data?.employees ?? [];
        const memberCount = countRes.error ? 0 : (countRes.data ?? 0);
        return {data: {departments, employees, memberCount}};
    } catch (error) {
        logDebug('[fetchContactDirectoryContent]', getFullErrorMessage(error));
        return {error};
    }
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
        try {
            await ContactService.createDepartment({
                company_id: teamId,
                name: DEFAULT_DEPARTMENT_NAME,
            });
        } catch (deptError) {
            logDebug('[ContactService.ensureTeamCompany] createDepartment failed:', getFullErrorMessage(deptError));
        }
        return {data: company, isNewCreate: true};
    } catch (error) {
        logDebug('[ContactService.ensureTeamCompany]', getFullErrorMessage(error));
        return {error};
    }
};

/** 获取公司下所有部门 */
export const fetchDepartmentsOfCompany = async (companyId: string, opts?: {parentDepartmentId?: number}): Promise<FetchDepartmentsOfCompanyResult> => {
    if (!companyId) {
        return {error: new Error('companyId is required')};
    }
    try {
        const res = await ContactService.getCompanyWithDepartments(companyId, opts);
        return {data: res.departments || []};
    } catch (error) {
        logDebug('[ContactService.fetchDepartmentsOfCompany]', getFullErrorMessage(error));
        return {error};
    }
};

export type FetchDefaultDepartmentIdResult = {
    data?: number;
    error?: unknown;
};

/** 获取公司默认部门 ID（根目录对应部门，用于「移至根目录」） */
export const fetchDefaultDepartmentId = async (companyId: string): Promise<FetchDefaultDepartmentIdResult> => {
    if (!companyId) {
        return {error: new Error('companyId is required')};
    }
    try {
        const res = await fetchDepartmentsOfCompany(companyId, {parentDepartmentId: -1});
        if (res.error) {
            return {error: res.error};
        }
        const defaultDept = (res.data || []).find((d) => d.name === DEFAULT_DEPARTMENT_NAME);
        return defaultDept ? {data: defaultDept.id} : {};
    } catch (error) {
        logDebug('[fetchDefaultDepartmentId]', getFullErrorMessage(error));
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

/** 获取员工详情（含公司、部门列表） */
export const fetchEmployeeDetails = async (employeeId: string): Promise<FetchEmployeeDetailsResult> => {
    if (!employeeId) {
        return {error: new Error('employeeId is required')};
    }
    try {
        const details = await ContactService.getEmployeeDetails(employeeId);
        return {data: details as ContactEmployeeDetails};
    } catch (error) {
        logDebug('[ContactService.fetchEmployeeDetails]', getFullErrorMessage(error));
        return {error};
    }
};

/** 获取单个部门（含 parent_id，用于修改部门名称时提交） */
export const fetchContactDepartment = async (departmentId: number): Promise<{data?: ContactDepartment; error?: unknown}> => {
    try {
        const department = await ContactService.getDepartment(departmentId);
        return {data: department};
    } catch (error) {
        logDebug('[fetchContactDepartment]', getFullErrorMessage(error));
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

export type CreateSubDepartmentResult = {
    data?: ContactDepartment;
    error?: unknown;
};

export type UpdateContactDepartmentResult = {
    data?: ContactDepartment;
    error?: unknown;
};

/** 创建子部门（或根目录下一级部门） */
export const createSubDepartment = async (
    companyId: string,
    name: string,
    parentDepartmentId?: number,
): Promise<CreateSubDepartmentResult> => {
    if (!companyId || !name?.trim()) {
        return {error: new Error('companyId and name are required')};
    }
    try {
        const body: {company_id: string; name: string; parent_id?: number} = {
            company_id: companyId,
            name: name.trim(),
        };
        if (parentDepartmentId != null) {
            body.parent_id = parentDepartmentId;
        }
        const department = await ContactService.createDepartment(body);
        return {data: department};
    } catch (error) {
        logDebug('[createSubDepartment]', getFullErrorMessage(error));
        return {error};
    }
};

/** 更新部门名称等信息；parentId 为 number 时设为父部门，null 时移到根（顶层），undefined 时不改 parent */
export const updateContactDepartment = async (
    departmentId: number,
    companyId: string,
    name: string,
    parentId?: number | null,
): Promise<UpdateContactDepartmentResult> => {
    if (!companyId || !name?.trim()) {
        return {error: new Error('companyId and name are required')};
    }
    try {
        const body: {company_id: string; name: string; parent_id?: number | null} = {
            company_id: companyId,
            name: name.trim(),
        };
        if (parentId !== undefined) {
            body.parent_id = parentId ?? null;
        }
        const department = await ContactService.updateDepartment(departmentId, body);
        return {data: department};
    } catch (error) {
        logDebug('[updateContactDepartment]', getFullErrorMessage(error));
        return {error};
    }
};

export type UpdateContactCompanyResult = {
    data?: ContactCompany;
    error?: unknown;
};

/** 更新企业名称等信息 */
export const updateContactCompany = async (
    companyId: string,
    name: string,
): Promise<UpdateContactCompanyResult> => {
    if (!companyId || !name?.trim()) {
        return {error: new Error('companyId and name are required')};
    }
    try {
        const companyRes = await fetchCompany(companyId);
        if (companyRes.error || !companyRes.data) {
            return {error: companyRes.error ?? new Error('Company not found')};
        }
        const company = await ContactService.updateCompany(companyId, {
            ...companyRes.data,
            name: name.trim(),
        });
        return {data: company};
    } catch (error) {
        logDebug('[updateContactCompany]', getFullErrorMessage(error));
        return {error};
    }
};

export type UpdateContactEmployeeResult = {
    data?: ContactEmployee;
    error?: unknown;
};

/** 更新员工信息（姓名、邮箱、职位、手机等） */
export const updateContactEmployee = async (
    employeeId: string,
    updates: Partial<Pick<ContactEmployee, 'name' | 'email' | 'position' | 'phone'>>,
): Promise<UpdateContactEmployeeResult> => {
    if (!employeeId) {
        return {error: new Error('employeeId is required')};
    }
    try {
        const current = await ContactService.getEmployee(employeeId);
        const updated = await ContactService.updateEmployee(employeeId, {...current, ...updates});
        return {data: updated};
    } catch (error) {
        logDebug('[updateContactEmployee]', getFullErrorMessage(error));
        return {error};
    }
};

/** 将员工从旧部门调动到新部门（一人只能属于一个部门，接口内部先删旧再加新） */
export const moveContactEmployeeToDepartment = async (
    employeeId: string,
    companyId: string,
    oldDepartmentId: number,
    newDepartmentId: number,
): Promise<{error?: unknown}> => {
    if (!employeeId || !companyId) {
        return {error: new Error('employeeId and companyId are required')};
    }
    try {
        await ContactService.moveEmployeeToDepartment(employeeId, {
            company_id: companyId,
            old_department_id: oldDepartmentId,
            department_id: newDepartmentId,
        });
        return {};
    } catch (error) {
        logDebug('[moveContactEmployeeToDepartment]', getFullErrorMessage(error));
        return {error};
    }
};

/** 删除部门（级联删除关联） */
export const deleteContactDepartment = async (departmentId: number): Promise<{error?: unknown}> => {
    try {
        await ContactService.deleteDepartment(departmentId);
        return {};
    } catch (error) {
        logDebug('[deleteContactDepartment]', getFullErrorMessage(error));
        return {error};
    }
};

/** 删除员工（级联删除公司、部门关联） */
export const deleteContactEmployee = async (employeeId: string): Promise<{error?: unknown}> => {
    if (!employeeId) {
        return {error: new Error('employeeId is required')};
    }
    try {
        await ContactService.deleteEmployee(employeeId);
        return {};
    } catch (error) {
        logDebug('[deleteContactEmployee]', getFullErrorMessage(error));
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
