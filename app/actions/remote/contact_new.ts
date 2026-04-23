// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
import {PER_PAGE_DEFAULT, DEFAULT_TEAM_DEPARTMENT_NAME} from '@client/rest/constants';
import NetworkManager from '@managers/network_manager';
import {getFullErrorMessage} from '@utils/errors';
import {logDebug} from '@utils/log';

import {forceLogoutIfNecessary} from './session';

import type {MMCreateDepartmentRequest, MMDepartment, MMUpdateDepartmentRequest} from '@client/rest/team_department';

type FetchNumberResult = FetchRemoteResult<number>;

export type ContactDirectoryContent = {
    departments: MMDepartment[];
    employees: UserProfile[];
    memberCount: number;
};

export const syncTeamMembersToDefaultDepartment = async (serverUrl: string, teamId: string) => {
    // eslint-disable-next-line no-warning-comments
    // TODO qgs: 考虑让服务器来进行同步到默认部门
    try {
        const res = await ensureTeamDefaultDepartment(serverUrl, teamId);
        if (res.error) {
            throw res.error;
        }
        const department = res.data as MMDepartment;
        const client = NetworkManager.getClient(serverUrl);

        // 所有部门
        const allDepartments = (await client.getDepartments(teamId, {perPage: 10000})).departments || [];

        // 所有部门员工 ids
        const allDepartmentMemberIds: Set<string> = new Set();
        const allDepartmentMemberPromises = [];
        for (const departmentItem of allDepartments) {
            const deptMemberPromise = client.getDepartmentMembers(teamId, departmentItem.id, {perPage: 10000}).then((membersRes) => membersRes.members.forEach((memberItem) => allDepartmentMemberIds.add(memberItem.id)));
            allDepartmentMemberPromises.push(deptMemberPromise);
        }
        await Promise.all(allDepartmentMemberPromises);

        // 获取团队所有用户Id
        const allUids = (await client.getTeamMembers(teamId, 0, 10000)).map((item) => item.user_id);

        const needAddUserIds: string[] = allUids.filter((uid) => !allDepartmentMemberIds.has(uid));
        if (needAddUserIds.length) {
            await client.batchAddDepartmentMembers(teamId, department.id, {user_ids: needAddUserIds});
        }
        return {data: true};
    } catch (error) {
        logDebug('[syncTeamMembersToDefaultDepartment] catch error', getFullErrorMessage(error));
        forceLogoutIfNecessary(serverUrl, error);
        return {error};
    }
};

/** 确保团队默认部门存在 */
export const ensureTeamDefaultDepartment = async (serverUrl: string, teamId: string): Promise<FetchRemoteResult<MMDepartment> & {
    isNewCreate?: boolean; /** 为 true 表示本次为新建，false 或缺失表示已存在 */
}> => {
    try {
        const res1 = await fetchDefaultDepartment(serverUrl, teamId);
        if (res1.data) {
            return {data: res1.data};
        }
        const client = NetworkManager.getClient(serverUrl);
        const department = await client.createDepartment(teamId, {name: DEFAULT_TEAM_DEPARTMENT_NAME, is_unique_name: true});
        return {data: department, isNewCreate: true};
    } catch (error) {
        logDebug('[ensureTeamDefaultDepartment] catch error', getFullErrorMessage(error));
        return {error};
    }
};

export const addUserToDefaultDepartment = async (serverUrl: string, teamId: string, userId: string): Promise<FetchRemoteResult<boolean>> => {
    try {
        const departmentRes = await ensureTeamDefaultDepartment(serverUrl, teamId);
        if (departmentRes.error) {
            throw departmentRes.error;
        }
        const department = departmentRes.data as MMDepartment;
        const addRes = await addUserToDepartment(serverUrl, teamId, department.id, userId);
        if (addRes.error) {
            throw addRes.error;
        }
        return {data: true};
    } catch (error) {
        logDebug('[addUserToDefaultDepartment] catch error', getFullErrorMessage(error));
        return {error};
    }
};

export const addUserToDepartment = async (serverUrl: string, teamId: string, departmentId: number, userId: string): Promise<FetchRemoteResult<boolean>> => {
    try {
        const client = NetworkManager.getClient(serverUrl);
        await client.addDepartmentMember(teamId, departmentId, {user_id: userId});
        return {data: true};
    } catch (error) {
        logDebug('[addUserToDepartment] catch error', getFullErrorMessage(error));
        return {error};
    }
};

/** 获取公司默认部门 ID（根目录对应部门，用于「移至根目录」） */
export const fetchDefaultDepartmentId = async (serverUrl: string, teamId: string): Promise<FetchNumberResult> => {
    const res = await fetchDefaultDepartment(serverUrl, teamId);
    if (res.error) {
        return {error: res.error};
    }
    return {data: res.data?.id};
};

/** 获取团队默认部门 */
export const fetchDefaultDepartment = async (serverUrl: string, teamId: string): Promise<FetchRemoteResult<MMDepartment>> => {
    try {
        const res = await fetchDepartmentsByTeam(serverUrl, teamId, {parentId: -1, perPage: 10000});
        if (res.error) {
            throw res.error;
        }
        const defaultDept = (res.data || []).find((d) => d.name === DEFAULT_TEAM_DEPARTMENT_NAME);
        return defaultDept ? {data: defaultDept} : {};
    } catch (error) {
        logDebug('[fetchDefaultDepartment] catch error', getFullErrorMessage(error));
        return {error};
    }
};

/** 获取团队部门列表 */
export const fetchDepartmentsByTeam = async (serverUrl: string, teamId: string, opts?: {parentId?: number; page?: number; perPage?: number; useChildApi?: boolean}) => {
    try {
        const client = NetworkManager.getClient(serverUrl);
        if (opts && opts.useChildApi && typeof opts.parentId === 'number') {
            const childrenDepartments = await client.getDepartmentChildren(teamId, opts.parentId) || [];
            return {data: childrenDepartments, totalCount: childrenDepartments.length, totalPages: 1, currentPage: 1, hasMore: false};
        }
        const currPage = opts?.page ?? 0;
        const currPerPage = opts?.perPage ?? PER_PAGE_DEFAULT;
        const res = await client.getDepartments(teamId, opts);
        const totalPages = Math.ceil(res.total_count / currPerPage);
        return {data: res.departments || [], totalCount: res.total_count, totalPages, currentPage: currPage, hasMore: totalPages && currPage < (totalPages - 1)};
    } catch (error) {
        logDebug('[fetchDepartmentsByTeam] catch error', getFullErrorMessage(error));
        return {error};
    }
};

/** 获取默认部门下所有员工 */
export const fetchEmployeesOfDefaultDepartment = async (serverUrl: string, teamId: string) => {
    try {
        const deptRes = await fetchDefaultDepartmentId(serverUrl, teamId);
        if (deptRes.error) {
            throw deptRes.error;
        }
        const defaultDeptId = deptRes.data;
        if (!defaultDeptId) {
            logDebug('[fetchEmployeesOfDefaultDepartment]', 'No default department found');
            return {data: []};
        }
        const membersRes = await fetchDepartmentEmployees(serverUrl, teamId, defaultDeptId, {perPage: 10000});
        if (membersRes.error) {
            throw membersRes.error;
        }
        return {data: membersRes.data || []};
    } catch (error) {
        logDebug('[fetchEmployeesOfDefaultDepartment] catch error', getFullErrorMessage(error));
        return {error};
    }
};

export const fetchDepartmentEmployees = async (serverUrl: string, teamId: string, departmentId: number, opts?: {page?: number; perPage?: number}) => {
    try {
        const client = NetworkManager.getClient(serverUrl);
        const res = await client.getDepartmentMembers(teamId, departmentId, opts);
        return {data: res.members};
    } catch (error) {
        logDebug('[fetchDepartmentEmployees] catch error', getFullErrorMessage(error));
        return {error};
    }
};

/** 获取公司下员工总数（用于人数展示） */
export const fetchEmployeeCountOfTeam = async (serverUrl: string, teamId: string): Promise<FetchNumberResult> => {
    try {
        const client = NetworkManager.getClient(serverUrl);
        const res = await client.getTeamStats(teamId);
        return {data: res.total_member_count || 0};
    } catch (error) {
        logDebug('[fetchEmployeeCountOfTeam] catch error', getFullErrorMessage(error));
        return {error};
    }
};

/** 获取部门及子部门下员工总数（用于子部门人数展示） */
export const fetchEmployeeCountOfDepartment = async (serverUrl: string, teamId: string, departmentId: number): Promise<FetchNumberResult> => {
    try {
        const client = NetworkManager.getClient(serverUrl);
        const res = await client.getDepartmentStats(teamId, departmentId);
        return {data: res.total_members || 0};
    } catch (error) {
        logDebug('[fetchEmployeeCountOfDepartment] catch error', getFullErrorMessage(error));
        return {error};
    }
};

/**
 * 通讯录员工搜索：公司范围或指定部门范围（departmentId 有值时添加 department_id 过滤）。
 */
export const fetchSearchContactEmployees = async (
    serverUrl: string,
    teamId: string,
    keyword: string,
    options?: {departmentId?: number},
) => {
    const kw = keyword.trim();
    if (!kw) {
        return {data: []};
    }
    try {
        const client = NetworkManager.getClient(serverUrl);
        const searchOpts: SearchUserOptions = {
            team_id: teamId,
        };
        if (typeof options?.departmentId === 'number') {
            searchOpts.department_id = options.departmentId;
        }
        const users = await client.searchUsers(kw, searchOpts);
        return {data: users || []};
    } catch (error) {
        logDebug('[fetchSearchContactEmployees] catch error', getFullErrorMessage(error));
        forceLogoutIfNecessary(serverUrl, error);
        return {error};
    }
};

/** 统一获取通讯录目录内容：根目录或子目录返回相同结构，调用层不区分层级 */
export const fetchContactDirectoryContent = async (serverUrl: string, teamId: string, departmentId?: number): Promise<FetchRemoteResult<ContactDirectoryContent>> => {
    try {
        if (departmentId === undefined) {
            const [deptRes, empRes, countRes] = await Promise.all([
                fetchDepartmentsByTeam(serverUrl, teamId, {parentId: -1, perPage: 10000}),
                fetchEmployeesOfDefaultDepartment(serverUrl, teamId),
                fetchEmployeeCountOfTeam(serverUrl, teamId),
            ]);
            if (deptRes.error) {
                throw deptRes.error;
            }
            const departments = (deptRes.data || []).filter((d) => d.name !== DEFAULT_TEAM_DEPARTMENT_NAME);
            const employees = empRes.data ?? [];
            const memberCount = countRes.error ? 0 : (countRes.data ?? 0);
            return {data: {departments, employees, memberCount}};
        }
        const [detailRes, countRes] = await Promise.all([
            fetchDepartmentDetail(serverUrl, teamId, departmentId),
            fetchEmployeeCountOfDepartment(serverUrl, teamId, departmentId),
        ]);
        if (detailRes.error) {
            throw detailRes.error;
        }
        const departments = detailRes.data?.subDepartments ?? [];
        const employees = detailRes.data?.employees ?? [];
        const memberCount = countRes.error ? 0 : (countRes.data ?? 0);
        return {data: {departments, employees, memberCount}};
    } catch (error) {
        logDebug('[fetchContactDirectoryContent] catch error', getFullErrorMessage(error));
        return {error};
    }
};

/** 获取部门详情：子部门列表 + 部门下所有员工（含子部门），并行请求 */
export const fetchDepartmentDetail = async (serverUrl: string, teamId: string, departmentId: number): Promise<FetchRemoteResult<{subDepartments: MMDepartment[]; employees: UserProfile[]}>> => {
    try {
        const [deptRes, empRes] = await Promise.all([
            fetchDepartmentsByTeam(serverUrl, teamId, {parentId: departmentId, useChildApi: true}),
            fetchDepartmentEmployees(serverUrl, teamId, departmentId, {perPage: 10000}),
        ]);

        if (deptRes.error) {
            throw deptRes.error;
        }
        return {data: {subDepartments: deptRes.data || [], employees: empRes.data || []}};
    } catch (error) {
        logDebug('[fetchDepartmentDetail] catch error', getFullErrorMessage(error));
        return {error};
    }
};

/** 获取公司全部员工 */
export const fetchTeamEmployeesList = async (serverUrl: string, teamId: string, opts?: {page?: number; perPage?: number}): Promise<FetchRemoteResult<UserProfile[]>> => {
    try {
        const client = NetworkManager.getClient(serverUrl);
        const userProfiles = await client.getProfilesInTeam(teamId, opts?.page ?? 0, opts?.perPage ?? PER_PAGE_DEFAULT);
        return {data: userProfiles || []};
    } catch (error) {
        logDebug('[fetchTeamEmployeesList] catch error', getFullErrorMessage(error));
        return {error};
    }
};

/** 获取单个部门（含 parent_id，用于修改部门名称时提交） */
export const fetchContactDepartment = async (serverUrl: string, teamId: string, departmentId: number): Promise<FetchRemoteResult<MMDepartment>> => {
    try {
        const client = NetworkManager.getClient(serverUrl);
        const department = await client.getDepartment(teamId, departmentId);
        return {data: department};
    } catch (error) {
        logDebug('[fetchContactDepartment] catch error', getFullErrorMessage(error));
        return {error};
    }
};

/** 创建子部门（或根目录下一级部门） */
export const createSubDepartment = async (
    serverUrl: string,
    teamId: string,
    name: string,
    parentDepartmentId?: number,
): Promise<FetchRemoteResult<MMDepartment>> => {
    if (!teamId || !name?.trim()) {
        return {error: new Error('teamId and name are required')};
    }
    try {
        const body: MMCreateDepartmentRequest = {
            name: name.trim(),
        };
        if (parentDepartmentId != null) {
            body.parent_id = parentDepartmentId;
        }
        const client = NetworkManager.getClient(serverUrl);
        const department = await client.createDepartment(teamId, body);
        return {data: department};
    } catch (error) {
        logDebug('[createSubDepartment] catch error', getFullErrorMessage(error));
        return {error};
    }
};

/** 更新部门名称等信息；parentId 为 number 时设为父部门，null 时移到根（顶层），undefined 时不改 parent */
export const updateContactDepartment = async (
    serverUrl: string,
    teamId: string,
    departmentId: number,
    name: string,
    parentId?: number | null,
): Promise<FetchRemoteResult<MMDepartment>> => {
    try {
        const client = NetworkManager.getClient(serverUrl);
        const body: MMUpdateDepartmentRequest = {
            name: name.trim(),
        };
        if (parentId !== undefined) {
            body.parent_id = parentId ?? null;
        }
        const department = await client.updateDepartment(teamId, departmentId, body);
        return {data: department};
    } catch (error) {
        logDebug('[updateContactDepartment] catch error', getFullErrorMessage(error));
        return {error};
    }
};

/** 将员工从旧部门调动到新部门 */
export const moveContactEmployeeToDepartment = async (
    serverUrl: string,
    teamId: string,
    employeeId: string,
    oldDepartmentId: number,
    newDepartmentId: number,
): Promise<{error?: unknown}> => {
    try {
        const client = NetworkManager.getClient(serverUrl);
        await client.moveDepartmentMember(teamId, oldDepartmentId, {
            user_id: employeeId,
            target_department_id: newDepartmentId,
        });
        return {};
    } catch (error) {
        logDebug('[moveContactEmployeeToDepartment] catch error', getFullErrorMessage(error));
        return {error};
    }
};

/** 批量将员工从旧部门调动到新部门 */
export const batchMoveContactEmployeeToDepartment = async (
    serverUrl: string,
    teamId: string,
    employeeIds: string[],
    oldDepartmentId: number,
    newDepartmentId: number,
): Promise<{error?: unknown}> => {
    try {
        const client = NetworkManager.getClient(serverUrl);
        await client.batchMoveDepartmentMembers(teamId, {
            user_ids: employeeIds,
            source_department_id: oldDepartmentId,
            target_department_id: newDepartmentId,
        });
        return {};
    } catch (error) {
        logDebug('[batchMoveContactEmployeeToDepartment] catch error', getFullErrorMessage(error));
        return {error};
    }
};

/** 删除部门（级联删除关联） */
export const deleteContactDepartmentForce = async (serverUrl: string, teamId: string, departmentId: number): Promise<{error?: unknown}> => {
    try {
        const client = NetworkManager.getClient(serverUrl);
        await client.deleteDepartment(teamId, departmentId);
        return {};
    } catch (error) {
        logDebug('[deleteContactDepartmentForce]', getFullErrorMessage(error));
        return {error};
    }
};
