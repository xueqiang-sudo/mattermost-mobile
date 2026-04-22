// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
import {PER_PAGE_DEFAULT, DEFAULT_TEAM_DEPARTMENT_NAME} from '@client/rest/constants';
import NetworkManager from '@managers/network_manager';
import {getFullErrorMessage} from '@utils/errors';
import {logDebug} from '@utils/log';

import {forceLogoutIfNecessary} from './session';

import type {MMDepartment, MMDepartmentMemberUser} from '@client/rest/team_department';

/** 确保团队默认部门存在 */
export const ensureTeamDefaultDepartment = async (serverUrl: string, teamId: string): Promise<{
    data?: MMDepartment;
    error?: unknown;
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

/** 获取公司默认部门 ID（根目录对应部门，用于「移至根目录」） */
export const fetchDefaultDepartmentId = async (serverUrl: string, teamId: string): Promise<{
    data?: number;
    error?: unknown;
}> => {
    const res = await fetchDefaultDepartment(serverUrl, teamId);
    if (res.error) {
        return {error: res.error};
    }
    return {data: res.data?.id};
};

/** 获取团队默认部门 */
export const fetchDefaultDepartment = async (serverUrl: string, teamId: string): Promise<{
    data?: MMDepartment;
    error?: unknown;
}> => {
    try {
        const res = await fetchDepartmentsByTeam(serverUrl, teamId, {parentId: -1, perPage: 10000});
        if (res.error) {
            return {error: res.error};
        }
        const defaultDept = (res.data || []).find((d) => d.name === DEFAULT_TEAM_DEPARTMENT_NAME);
        return defaultDept ? {data: defaultDept} : {};
    } catch (error) {
        logDebug('[fetchDefaultDepartment] catch error', getFullErrorMessage(error));
        return {error};
    }
};

/** 获取团队部门列表 */
export const fetchDepartmentsByTeam = async (serverUrl: string, teamId: string, opts?: {parentId?: number; page?: number; perPage?: number}) => {
    try {
        const currPage = opts?.page ?? 0;
        const currPerPage = opts?.perPage ?? PER_PAGE_DEFAULT;
        const client = NetworkManager.getClient(serverUrl);
        const res = await client.getDepartments(teamId, opts);
        const totalPages = Math.ceil(res.total_count / currPerPage);
        return {data: res.departments || [], totalCount: res.total_count, totalPages, currentPage: currPage, hasMore: totalPages && currPage < (totalPages - 1)};
    } catch (error) {
        logDebug('[fetchDepartmentsByTeam] catch error', getFullErrorMessage(error));
        return {error};
    }
};

/** 获取默认部门下所有员工（按 DEFAULT_DEPARTMENT_NAME 识别默认部门） */
export const fetchEmployeesOfDefaultDepartment = async (serverUrl: string, teamId: string): Promise<{
    data?: MMDepartmentMemberUser[];
    error?: unknown;
}> => {
    try {
        const deptRes = await fetchDefaultDepartmentId(serverUrl, teamId);
        if (deptRes.error) {
            return {error: deptRes.error};
        }
        const defaultDeptId = deptRes.data;
        if (!defaultDeptId) {
            logDebug('[fetchEmployeesOfDefaultDepartment]', 'No default department found');
            return {data: []};
        }
        const membersRes = await fetchDepartmentEmployees(serverUrl, teamId, defaultDeptId, {perPage: 10000});
        if (membersRes.error) {
            return {error: membersRes.error};
        }
        return {data: membersRes.data || []};
    } catch (error) {
        logDebug('[ContactService.fetchEmployeesOfDefaultDepartment]', getFullErrorMessage(error));
        return {error};
    }
};

export const fetchDepartmentEmployees = async (serverUrl: string, teamId: string, departmentId: number, opts?: {page?: number; perPage?: number}): Promise<{
    data?: MMDepartmentMemberUser[];
    error?: unknown;
}> => {
    try {
        const client = NetworkManager.getClient(serverUrl);
        const res = await client.getDepartmentMembers(teamId, departmentId, opts);
        return {data: res.members};
    } catch (error) {
        logDebug('[fetchDepartmentEmployees] catch error', getFullErrorMessage(error));
        return {error};
    }
};
