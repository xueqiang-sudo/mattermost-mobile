// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {fetchProfilesInTeam} from '@actions/remote/user';
import ContactService, {
    ContactCompanyTypes,
    DEFAULT_DEPARTMENT_NAME,
    type ContactCompany,
    type ContactDepartment,
    type ContactEmployee,
    type ContactEmployeeSearchItem,
    type CreateEmployeeRequest,
} from '@client/rest/contact';
import {General} from '@constants';
import NetworkManager from '@managers/network_manager';
import {getTeamById, queryMyTeams} from '@queries/servers/team';
import {getFullErrorMessage} from '@utils/errors';
import {generateId} from '@utils/general';
import {logDebug} from '@utils/log';

import type {Database} from '@nozbe/watermelondb';

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

export type ContactDirectoryContent = {
    departments: ContactDepartment[];
    employees: ContactEmployee[];
    memberCount: number;
};

export type FetchContactDirectoryContentResult = {
    data?: ContactDirectoryContent;
    error?: unknown;
};

export type FetchSearchContactEmployeesResult = {
    data?: ContactEmployeeSearchItem[];
    error?: unknown;
};

/**
 * 通讯录员工搜索：公司范围或指定部门范围（departmentId 有值时走部门搜索接口）。
 */
export const fetchSearchContactEmployees = async (
    companyId: string,
    keyword: string,
    options?: {departmentId?: number},
): Promise<FetchSearchContactEmployeesResult> => {
    if (!companyId) {
        return {error: new Error('companyId is required')};
    }
    const kw = keyword.trim();
    if (!kw) {
        return {data: []};
    }
    try {
        if (typeof options?.departmentId === 'number') {
            const data = await ContactService.searchDepartmentEmployees(options.departmentId, {
                keyword: kw,
                companyId,
            });
            return {data};
        }
        const data = await ContactService.searchCompanyEmployees(companyId, {keyword: kw});
        return {data};
    } catch (error) {
        logDebug('[fetchSearchContactEmployees]', getFullErrorMessage(error));
        return {error};
    }
};

/** 统一获取通讯录目录内容：根目录或子目录返回相同结构，调用层不区分层级 */
export const fetchContactDirectoryContent = async (companyId: string, departmentId?: number): Promise<FetchContactDirectoryContentResult> => {
    if (!companyId) {
        return {error: new Error('companyId is required')};
    }
    try {
        if (departmentId === undefined) {
            const [deptRes, empRes, countRes] = await Promise.all([
                fetchDepartmentsByCompany(companyId, {parentDepartmentId: -1}),
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
            fetchDepartmentDetail(companyId, departmentId),
            fetchEmployeeCountOfDepartment(companyId, departmentId),
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

/**
 * 将 Mattermost 用户映射为通讯录员工创建请求体。
 */
export const mapUserToContactEmployeePayload = (user: UserProfile): CreateEmployeeRequest => {
    const nameFromProfile = `${(user.first_name || '')}${(user.last_name || '')}`.trim();
    const name = user.nickname || nameFromProfile || user.username;

    return {
        id: user.id,
        name,
        email: user.email,
        position: user.position,
        phone: undefined,
    };
};

/**
 * 获取公司默认部门 ID；如失败仅记录日志并返回 undefined。
 */
const getOrCreateDefaultDepartmentId = async (companyId: string): Promise<number | undefined> => {
    const res = await fetchDefaultDepartmentId(companyId);
    if (res.error) {
        try {
            logDebug('[getOrCreateDefaultDepartmentId] fetchDefaultDepartmentId not ok, try to create default department, companyId: ', companyId);
            const defDepartment = await ContactService.createDepartment({
                company_id: companyId,
                name: DEFAULT_DEPARTMENT_NAME,
            });
            logDebug('[getOrCreateDefaultDepartmentId] create default department success, departmentId: ', defDepartment.id);
            return defDepartment.id;
        } catch (deptError) {
            logDebug('[getOrCreateDefaultDepartmentId] createDepartment failed:', getFullErrorMessage(deptError));
        }
        logDebug('[getOrCreateDefaultDepartmentId] fetchDefaultDepartmentId failed:', getFullErrorMessage(res.error));
        return undefined;
    }
    return res.data;
};

export type EnsureContactEmployeeForUserResult = {
    error?: unknown;
};

/**
 * 确保给定用户在通讯录中存在员工记录，并挂到指定公司与部门。
 *
 * - 如果员工不存在则创建；
 * - 始终确保员工已关联到 company；
 * - 根据 targetDepartmentId 决定挂载部门：
 *   - number → 直接挂到该部门；
 *   - null / undefined → 挂到默认部门（若存在）。
 *
 * 出错时只记录日志，不阻断主流程。
 */
export const ensureContactEmployeeForUser = async (
    serverUrl: string,
    companyId: string,
    user: UserProfile,
    targetDepartmentId?: number | null,
): Promise<EnsureContactEmployeeForUserResult> => {
    if (!serverUrl || !companyId || !user?.id) {
        return {error: new Error('serverUrl, companyId and user are required')};
    }

    try {
        let employee: ContactEmployee | undefined;

        try {
            employee = await ContactService.getEmployee(user.id);
        } catch (err) {
            // 若获取失败则尝试按映射创建
            const payload = mapUserToContactEmployeePayload(user);
            try {
                employee = await ContactService.createEmployee(payload);
            } catch (createErr) {
                logDebug('[ensureContactEmployeeForUser.createEmployee]', getFullErrorMessage(createErr));
                return {};
            }
        }

        if (!employee) {
            return {};
        }

        // 确保已关联到公司
        try {
            await ContactService.addEmployeeToCompany(employee.id, {company_id: companyId});
        } catch (companyErr) {
            logDebug('[ensureContactEmployeeForUser.addEmployeeToCompany]', getFullErrorMessage(companyErr));
        }

        // 处理部门挂载
        let departmentIdToUse: number | undefined;
        if (typeof targetDepartmentId === 'number') {
            departmentIdToUse = targetDepartmentId;
        } else {
            departmentIdToUse = await getOrCreateDefaultDepartmentId(companyId);
        }

        if (departmentIdToUse !== undefined) {
            try {
                await ContactService.addEmployeeToDepartment(employee.id, {
                    company_id: companyId,
                    department_id: departmentIdToUse,
                });
            } catch (deptErr) {
                logDebug('[ensureContactEmployeeForUser.addEmployeeToDepartment]', getFullErrorMessage(deptErr));
            }
        }

        return {};
    } catch (error) {
        logDebug('[ensureContactEmployeeForUser]', getFullErrorMessage(error));
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

/** 获取或创建当前 Mattermost 团队对应的通讯录公司（teamId 作为 company id）。
 * 创建企业时 owner_id 必须有，否则不创建。
 */
export const ensureTeamCompany = async (teamId: string, teamName: string, ownerId: string): Promise<EnsureTeamCompanyResult> => {
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
    if (!ownerId || ownerId.trim() === '') {
        return {error: new Error('owner_id is required when creating enterprise')};
    }
    try {
        const company = await ContactService.createCompany({
            id: teamId,
            name: teamName,
            type: ContactCompanyTypes.Team,
            owner_id: ownerId,
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

/** 获取公司下所有部门
 * @param [opts.parentDepartmentId]  指定父部门
 */
export const fetchDepartmentsByCompany = async (companyId: string, opts?: {parentDepartmentId?: number}): Promise<FetchDepartmentsOfCompanyResult> => {
    if (!companyId) {
        return {error: new Error('companyId is required')};
    }
    try {
        const res = await ContactService.getDepartmentsByCompany(companyId, opts);
        return {data: res || []};
    } catch (error) {
        logDebug('[ContactService.fetchDepartmentsByCompany]', getFullErrorMessage(error));
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
        const res = await fetchDepartmentsByCompany(companyId, {parentDepartmentId: -1});
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
        const deptRes = await fetchDepartmentsByCompany(companyId);
        if (deptRes.error) {
            return {error: deptRes.error};
        }
        const deptList = Array.isArray(deptRes.data) ? deptRes.data : [];
        const defaultDept = deptList.find((d) => d.name === DEFAULT_DEPARTMENT_NAME);
        if (!defaultDept) {
            logDebug('[fetchEmployeesOfDefaultDepartment]', 'No default department found');
            return {data: []};
        }
        const employees = await ContactService.getEmployeesOfDepartment(companyId, defaultDept.id);
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

/** 获取单个部门（含 parent_id，用于修改部门名称时提交） */
export const fetchContactDepartment = async (
    companyId: string,
    departmentId: number,
): Promise<{data?: ContactDepartment; error?: unknown}> => {
    if (!companyId) {
        return {error: new Error('companyId is required')};
    }
    try {
        const department = await ContactService.getDepartment(companyId, departmentId);
        return {data: department};
    } catch (error) {
        logDebug('[fetchContactDepartment]', getFullErrorMessage(error));
        return {error};
    }
};

/** 获取部门及子部门下员工总数（用于子部门人数展示） */
export const fetchEmployeeCountOfDepartment = async (
    companyId: string,
    departmentId: number,
): Promise<FetchEmployeeCountOfDepartmentResult> => {
    if (!companyId) {
        return {error: new Error('companyId is required')};
    }
    try {
        const count = await ContactService.getEmployeeCountOfDepartment(companyId, departmentId);
        return {data: count};
    } catch (error) {
        logDebug('[ContactService.fetchEmployeeCountOfDepartment]', getFullErrorMessage(error));
        return {error};
    }
};

/** 获取部门详情：子部门列表 + 部门下所有员工（含子部门），并行请求 */
export const fetchDepartmentDetail = async (companyId: string, departmentId: number): Promise<FetchDepartmentDetailResult> => {
    if (!companyId) {
        return {error: new Error('companyId is required')};
    }
    try {
        const [deptRes, empRes] = await Promise.all([
            fetchDepartmentsByCompany(companyId),
            ContactService.getEmployeesOfDepartment(companyId, departmentId),
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
            from_department_id: oldDepartmentId,
            to_department_id: newDepartmentId,
        });
        return {};
    } catch (error) {
        logDebug('[moveContactEmployeeToDepartment]', getFullErrorMessage(error));
        return {error};
    }
};

/** 删除部门（级联删除关联） */
export const deleteContactDepartmentForce = async (
    companyId: string,
    departmentId: number,
): Promise<{error?: unknown}> => {
    if (!companyId) {
        return {error: new Error('companyId is required')};
    }
    try {
        await ContactService.deleteDepartmentForce(companyId, departmentId);
        return {};
    } catch (error) {
        logDebug('[deleteContactDepartmentForce]', getFullErrorMessage(error));
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

export type FetchMyCompaniesResult = {
    data?: ContactCompany[];
    error?: unknown;
};

/** 将接口返回规范为 ContactCompany[]（兼容 { companies/data/items } 等包装） */
function normalizeContactCompanyList(raw: unknown): ContactCompany[] {
    if (Array.isArray(raw)) {
        return raw.filter(
            (c): c is ContactCompany =>
                Boolean(c) &&
                typeof (c as ContactCompany).id === 'string' &&
                typeof (c as ContactCompany).name === 'string',
        );
    }
    if (raw && typeof raw === 'object') {
        const o = raw as Record<string, unknown>;
        const nested = o.companies ?? o.data ?? o.items ?? o.list;
        if (nested !== undefined) {
            return normalizeContactCompanyList(nested);
        }
    }
    return [];
}

/** 获取当前员工所属企业 */
export const fetchMyCompanies = async (employeeId: string): Promise<FetchMyCompaniesResult> => {
    if (!employeeId) {
        return {error: new Error('employeeId is required')};
    }
    try {
        const raw = await ContactService.getEmployeeCompanies(employeeId);
        const merged = normalizeContactCompanyList(raw);
        const seen = new Set<string>();
        const deduped = merged.filter((c) => {
            if (!c.id || seen.has(c.id)) {
                return false;
            }
            seen.add(c.id);
            return true;
        });
        return {data: deduped};
    } catch (error) {
        logDebug('[ContactService.fetchMyCompanies]', getFullErrorMessage(error));
        return {error};
    }
};

/** 管理企业列表单项：合并「通讯录员工-企业」与「Mattermost 团队对应企业（id = team_id）」 */
export type ManageEnterpriseEntry = {
    id: string;
    name: string;
    type: ContactCompanyType;
    description?: string;

    /** 当前用户在该 Mattermost 团队中 */
    isMattermostTeam: boolean;

    /** 通讯录中已有以该 id 为键的公司（含团队映射企业） */
    hasContactCompanyRecord: boolean;
};

export type FetchManageEnterpriseListResult = {
    data?: ManageEnterpriseEntry[];
    error?: unknown;
};

/**
 * 合并两套企业来源：
 * 1) 通讯录：当前用户在员工-企业关联中的企业（含自建/加入的独立企业）；
 * 2) Mattermost：用户所在团队；团队与通讯录对齐时 company.id === team_id（见 ensureTeamCompany）。
 * 若团队尚未在通讯录建企，仍列出团队；管理企业详情页不会自动同步（需求：MM 有、通讯录无时不同步）。
 */
export const fetchManageEnterpriseList = async (
    database: Database,
    employeeId: string,
): Promise<FetchManageEnterpriseListResult> => {
    if (!employeeId) {
        return {error: new Error('employeeId is required')};
    }

    const byId = new Map<string, ManageEnterpriseEntry>();

    const contactRes = await fetchMyCompanies(employeeId);
    if (contactRes.data?.length) {
        for (const c of contactRes.data) {
            byId.set(c.id, {
                id: c.id,
                name: c.name,
                type: c.type,
                description: c.description,
                isMattermostTeam: false,
                hasContactCompanyRecord: true,
            });
        }
    }

    let myTeamRows: Array<{id: string}> = [];
    try {
        myTeamRows = await queryMyTeams(database).fetch();
    } catch (e) {
        logDebug('[fetchManageEnterpriseList.queryMyTeams]', getFullErrorMessage(e));
    }

    await Promise.all(
        myTeamRows.map(async (mt) => {
            const teamId = mt.id;
            const team = await getTeamById(database, teamId);
            const teamLabel = team?.displayName ?? team?.name ?? teamId;
            const companyRes = await fetchCompany(teamId);
            const prev = byId.get(teamId);

            if (companyRes.data) {
                byId.set(teamId, {
                    id: teamId,
                    name: companyRes.data.name || prev?.name || teamLabel,
                    type: companyRes.data.type,
                    description: companyRes.data.description ?? prev?.description,
                    isMattermostTeam: true,
                    hasContactCompanyRecord: true,
                });
                return;
            }

            if (prev) {
                byId.set(teamId, {
                    ...prev,
                    isMattermostTeam: true,
                    name: prev.name || teamLabel,
                });
                return;
            }

            byId.set(teamId, {
                id: teamId,
                name: teamLabel,
                type: ContactCompanyTypes.Team,
                isMattermostTeam: true,
                hasContactCompanyRecord: false,
            });
        }),
    );

    const data = Array.from(byId.values()).sort((a, b) => {
        if (a.isMattermostTeam !== b.isMattermostTeam) {
            return a.isMattermostTeam ? -1 : 1;
        }
        return a.name.localeCompare(b.name, undefined, {sensitivity: 'base'});
    });

    if (data.length === 0 && contactRes.error && myTeamRows.length === 0) {
        return {error: contactRes.error};
    }

    return {data};
};

export type CreateEnterpriseForEmployeeParams = {
    name: string;
    type?: ContactCompanyType;
    description?: string;
};

export type CreateEnterpriseForEmployeeResult = {
    data?: ContactCompany;
    error?: unknown;
};

/** 创建 Mattermost 团队后同步创建通讯录企业，并将当前用户加入 */
export const syncTeamToContactAfterCreate = async (
    serverUrl: string,
    team: Team,
    currentUserId: string,
): Promise<{error?: unknown}> => {
    if (!serverUrl || !team?.id || !currentUserId) {
        return {};
    }
    try {
        const companyRes = await ensureTeamCompany(team.id, team.display_name || team.name, currentUserId);
        if (companyRes.error) {
            logDebug('[syncTeamToContactAfterCreate.ensureTeamCompany]', getFullErrorMessage(companyRes.error));
            return companyRes;
        }
        const client = NetworkManager.getClient(serverUrl);
        const user = await client.getUser(currentUserId);
        await ensureContactEmployeeForUser(serverUrl, team.id, user);
        return {};
    } catch (error) {
        logDebug('[syncTeamToContactAfterCreate]', getFullErrorMessage(error));
        return {error};
    }
};

/** 为当前员工创建企业并自动加入该企业 */
export const createEnterpriseForEmployee = async (
    employeeId: string,
    params: CreateEnterpriseForEmployeeParams,
): Promise<CreateEnterpriseForEmployeeResult> => {
    const name = params.name?.trim();
    if (!employeeId || !name) {
        return {error: new Error('employeeId and name are required')};
    }
    try {
        const company = await ContactService.createCompany({
            id: generateId(),
            name,
            type: params.type ?? ContactCompanyTypes.Team,
            description: params.description,
            owner_id: employeeId,
        });
        try {
            await ContactService.addEmployeeToCompany(employeeId, {company_id: company.id});
        } catch (err) {
            logDebug('[ContactService.createEnterpriseForEmployee.addEmployeeToCompany]', getFullErrorMessage(err));
        }
        return {data: company};
    } catch (error) {
        logDebug('[ContactService.createEnterpriseForEmployee]', getFullErrorMessage(error));
        return {error};
    }
};

export type JoinEnterpriseResult = {
    error?: unknown;
};

/** 通过企业 ID 加入企业 */
export const joinEnterprise = async (employeeId: string, companyId: string): Promise<JoinEnterpriseResult> => {
    if (!employeeId || !companyId) {
        return {error: new Error('employeeId and companyId are required')};
    }
    try {
        const companyRes = await fetchCompany(companyId);
        if (companyRes.error || !companyRes.data) {
            return {error: companyRes.error ?? new Error('Company not found')};
        }
        await ContactService.addEmployeeToCompany(employeeId, {company_id: companyId});
        return {};
    } catch (error) {
        logDebug('[ContactService.joinEnterprise]', getFullErrorMessage(error));
        return {error};
    }
};

export type QuitEnterpriseResult = {
    error?: unknown;
};

/** 退出企业（从企业中移除当前员工关联） */
export const quitEnterprise = async (employeeId: string, companyId: string): Promise<QuitEnterpriseResult> => {
    if (!employeeId || !companyId) {
        return {error: new Error('employeeId and companyId are required')};
    }
    try {
        await ContactService.removeEmployeeFromCompany(employeeId, {company_id: companyId});
        return {};
    } catch (error) {
        logDebug('[ContactService.quitEnterprise]', getFullErrorMessage(error));
        return {error};
    }
};

/**
 * 获取 Mattermost 团队的创建者 ID（若 API 返回 creator_id）。
 * 用于判断当前用户是否为创建者，从而决定显示「解散」或「退出」。
 */
export const fetchTeamCreatorId = async (
    serverUrl: string,
    teamId: string,
): Promise<string | undefined> => {
    if (!serverUrl || !teamId) {
        return undefined;
    }
    try {
        const client = NetworkManager.getClient(serverUrl);
        const team = await client.getTeam(teamId);
        return team?.creator_id;
    } catch (error) {
        logDebug('[fetchTeamCreatorId]', getFullErrorMessage(error));
        return undefined;
    }
};

/**
 * 判断当前用户是否有权限管理企业通讯录。
 * - 通讯录存在且 owner_id 有效：owner_id === userId
 * - 通讯录存在但 owner_id 为空：团队创建者或管理员（fetchCanDissolveTeam）
 * - 通讯录不存在：团队创建者或管理员（仅他们可自动创建）
 */
export const fetchCanManageEnterprise = async (
    serverUrl: string,
    teamId: string,
    userId: string,
    company?: ContactCompany | null,
): Promise<boolean> => {
    if (!serverUrl || !teamId || !userId) {
        return false;
    }
    const ownerId = company?.owner_id ?? (company as {ownerId?: string})?.ownerId;
    if (ownerId != null && ownerId !== '') {
        return ownerId === userId;
    }
    return fetchCanDissolveTeam(serverUrl, teamId, userId);
};

/**
 * 判断当前用户是否有权限解散 Mattermost 团队。
 * 条件：为团队创建者（creator_id）或团队管理员（scheme_admin）。
 * 需求1/3：MM 有通讯录无、或通讯录有但 owner_id 为空时，以此判断显示「解散」或「退出」。
 */
export const fetchCanDissolveTeam = async (
    serverUrl: string,
    teamId: string,
    userId: string,
): Promise<boolean> => {
    if (!serverUrl || !teamId || !userId) {
        return false;
    }
    try {
        const client = NetworkManager.getClient(serverUrl);
        const [team, member] = await Promise.all([
            client.getTeam(teamId),
            client.getTeamMember(teamId, userId),
        ]);
        const isCreator = team?.creator_id === userId;
        const isAdmin = member?.scheme_admin === true;
        return Boolean(isCreator || isAdmin);
    } catch (error) {
        logDebug('[fetchCanDissolveTeam]', getFullErrorMessage(error));
        return false;
    }
};

export type DissolveEnterpriseResult = {
    error?: unknown;
};

/** 解散企业（通讯录强制删除公司，含级联） */
export const dissolveEnterprise = async (companyId: string): Promise<DissolveEnterpriseResult> => {
    if (!companyId) {
        return {error: new Error('companyId is required')};
    }
    try {
        await ContactService.deleteCompanyForce(companyId);
        return {};
    } catch (error) {
        logDebug('[ContactService.dissolveEnterprise]', getFullErrorMessage(error));
        return {error};
    }
};

export type SyncTeamMembersToCompanyResult = {
    error?: unknown;
};

/**
 * 将指定 Team 的所有成员同步到通讯录公司，并挂到默认部门。
 * 仅用于 ensureTeamCompany 创建新企业后的首次初始化。
 */
export const syncTeamMembersToCompany = async (
    serverUrl: string,
    teamId: string,
    companyId: string,
): Promise<SyncTeamMembersToCompanyResult> => {
    if (!serverUrl || !teamId || !companyId) {
        return {error: new Error('serverUrl, teamId and companyId are required')};
    }

    try {
        // 1. 拉取 Team 成员（分页）
        const allMembers: UserProfile[] = [];
        const perPage = General.PROFILE_CHUNK_SIZE;
        let page = 0;

        while (true) {
            const {users, error} = await fetchProfilesInTeam(serverUrl, teamId, page, perPage, '', {}, true);
            if (error) {
                logDebug('[syncTeamMembersToCompany.fetchProfilesInTeam]', getFullErrorMessage(error));
                break;
            }
            if (!users || !users.length) {
                break;
            }
            allMembers.push(...users);
            if (users.length < perPage) {
                break;
            }
            page += 1;
        }

        if (!allMembers.length) {
            return {};
        }

        // 2. 逐个创建/更新员工并挂到公司 + 默认部门
        for (const user of allMembers) {
            await ensureContactEmployeeForUser(serverUrl, companyId, user, null);
        }

        return {};
    } catch (error) {
        logDebug('[syncTeamMembersToCompany]', getFullErrorMessage(error));
        return {error};
    }
};
