// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * Mattermost /api/v4 团队部门与员工联系人（客户/供应商）API。
 * 与独立通讯录 contact.ts（X-API-KEY）并存；本模块走主 Client Bearer 认证。
 * GET 列表类接口按团队版本 / 用户联系人版本做内存与可选磁盘缓存（对齐 contact.ts 思路）。
 */

import {buildQueryString} from '@utils/helpers';

import {PER_PAGE_DEFAULT} from './constants';
import {
    clearContactDiskCacheCompany,
    readContactDiskCache,
    writeContactDiskCache,
} from './contact_disk_cache';

import type ClientBase from './base';

/** 关闭后所有请求直连，不读/写缓存（调试用） */
export const MM_TEAM_DEPARTMENT_ENABLE_CACHE = true;

/** 为 true 时在内存缓存未命中时读写 contact_disk_cache（第二段 key 使用 mm_team: / mm_user_contacts: 前缀，避免与通讯录 companyId 冲突） */
export const MM_TEAM_DEPARTMENT_ENABLE_DISK_CACHE = true;

const MM_TEAM_DEPARTMENT_VERSION_CACHE_TTL_MS = 5000;

function teamDiskScopeKey(teamId: string): string {
    return `mm_team:${teamId}`;
}

function userContactsDiskScopeKey(userId: string): string {
    return `mm_user_contacts:${userId}`;
}

export type MMStatusOK = {
    status: 'OK';
};

export type MMDepartment = {
    id: number;
    team_id: string;
    name: string;
    description: string;
    parent_id: number | null;
    create_at: number;
    update_at: number;
    delete_at: number;
};

export type MMDepartmentAncestor = {
    id: number;
    team_id: string;
    name: string;
    parent_id: number | null;
};

export type MMGetDepartmentsResponse = {
    departments: MMDepartment[];
    total_count: number;
};

export type MMTeamVersion = {
    team_id: string;
    version: string;
    updated_at: number;
};

export type MMDepartmentStats = {
    team_id: string;
    total_departments: number;
    root_departments: number;
    total_members: number;
    average_members_per_department: number;
};

export type MMDepartmentMemberUser = {
    id: string;
    username: string;
    email?: string;
    first_name?: string;
    last_name?: string;
    nickname?: string;
    position?: string;
};

export type MMDepartmentMembersWithCount = {
    members: MMDepartmentMemberUser[];
    total_count: number;
};

export type MMEmployeeContactType = 'customer' | 'supplier';

export type MMEmployeeContact = {
    id: string;
    employee_id: string;
    contact_id: string;
    contact_type: MMEmployeeContactType;
    description: string;
    remark: string;
    create_at: number;
    update_at: number;
};

export type MMEmployeeContactWithDetails = MMEmployeeContact & {
    employee_name?: string;
    employee_email?: string;
    contact_name?: string;
    contact_email?: string;
};

export type MMContactVersionInfo = {
    user_id: string;
    version: string;
    last_updated?: number;
};

export type MMUpdateContactVersionResponse = {
    user_id: string;
    version: string;
    updated_at?: number;
};

export type MMCreateDepartmentRequest = {
    name: string;
    description?: string;
    parent_id?: number | null;
};

export type MMUpdateDepartmentRequest = {
    name?: string;
    description?: string;
    parent_id?: number | null;
};

export type MMAddDepartmentMemberRequest = {
    user_id: string;
};

export type MMBatchDepartmentMembersRequest = {
    user_ids: string[];
};

export type MMMoveDepartmentMemberRequest = {
    user_id: string;
    target_department_id: number;
};

export type MMBatchMoveDepartmentMembersRequest = {
    source_department_id: number;
    target_department_id: number;
    user_ids: string[];
};

export type MMUpsertEmployeeContactRequest = {
    contact_id: string;
    contact_type: MMEmployeeContactType;
    description?: string;
    remark?: string;
};

export type MMDeleteEmployeeContactRequest = {
    contact_id: string;
    contact_type: MMEmployeeContactType;
};

export type MMUpdateContactVersionRequest = {
    version: string;
};

export interface ClientTeamDepartmentMix {
    getTeamVersion: (teamId: string) => Promise<MMTeamVersion>;
    getDepartments: (teamId: string, page?: number, perPage?: number) => Promise<MMGetDepartmentsResponse>;
    createDepartment: (teamId: string, body: MMCreateDepartmentRequest) => Promise<MMDepartment>;
    getDepartment: (teamId: string, departmentId: number) => Promise<MMDepartment>;
    updateDepartment: (teamId: string, departmentId: number, body: MMUpdateDepartmentRequest) => Promise<MMDepartment>;
    deleteDepartment: (teamId: string, departmentId: number) => Promise<MMStatusOK>;
    getDepartmentTree: (teamId: string, opts?: {parentId?: number; page?: number; perPage?: number}) => Promise<MMDepartment[]>;
    getDepartmentChildren: (teamId: string, departmentId: number) => Promise<MMDepartment[]>;
    getDepartmentAncestors: (teamId: string, departmentId: number) => Promise<MMDepartmentAncestor[]>;
    getDepartmentMembers: (teamId: string, departmentId: number, page?: number, perPage?: number) => Promise<MMDepartmentMembersWithCount>;
    addDepartmentMember: (teamId: string, departmentId: number, body: MMAddDepartmentMemberRequest) => Promise<MMStatusOK>;
    removeDepartmentMember: (teamId: string, departmentId: number, userId: string) => Promise<MMStatusOK>;
    batchAddDepartmentMembers: (teamId: string, departmentId: number, body: MMBatchDepartmentMembersRequest) => Promise<MMStatusOK>;
    batchRemoveDepartmentMembers: (teamId: string, departmentId: number, body: MMBatchDepartmentMembersRequest) => Promise<MMStatusOK>;
    moveDepartmentMember: (teamId: string, departmentId: number, body: MMMoveDepartmentMemberRequest) => Promise<MMStatusOK>;
    batchMoveDepartmentMembers: (teamId: string, body: MMBatchMoveDepartmentMembersRequest) => Promise<MMStatusOK>;
    getUserDepartments: (userId: string, teamId: string) => Promise<MMDepartment[]>;
    getDepartmentStats: (teamId: string) => Promise<MMDepartmentStats>;
    getEmployeeContacts: (userId: string, opts?: {contactType?: MMEmployeeContactType; page?: number; perPage?: number}) => Promise<MMEmployeeContact[]>;
    getEmployeeContactsWithDetails: (userId: string, opts?: {contactType?: MMEmployeeContactType; page?: number; perPage?: number}) => Promise<MMEmployeeContactWithDetails[]>;
    addEmployeeContact: (userId: string, body: MMUpsertEmployeeContactRequest) => Promise<MMStatusOK>;
    updateEmployeeContact: (userId: string, body: MMUpsertEmployeeContactRequest) => Promise<MMStatusOK>;
    deleteEmployeeContact: (userId: string, body: MMDeleteEmployeeContactRequest) => Promise<MMStatusOK>;
    getUserContactVersion: (userId: string) => Promise<MMContactVersionInfo>;
    updateUserContactVersion: (userId: string, body: MMUpdateContactVersionRequest) => Promise<MMUpdateContactVersionResponse>;
}

const ClientTeamDepartment = <TBase extends Constructor<ClientBase>>(superclass: TBase) => class extends superclass {
    private versionByTeam = new Map<string, {version: string; at: number}>();
    private versionInflightTeam = new Map<string, Promise<string>>();
    private responseByTeam = new Map<string, Map<string, {version: string; data: unknown; at: number}>>();

    private versionByUserContacts = new Map<string, {version: string; at: number}>();
    private versionInflightUserContacts = new Map<string, Promise<string>>();
    private responseByUserContacts = new Map<string, Map<string, {version: string; data: unknown; at: number}>>();

    private departmentsBase(teamId: string) {
        return `${this.getTeamRoute(teamId)}/departments`;
    }

    private async resolveTeamStructureVersion(teamId: string): Promise<string> {
        const now = Date.now();
        const cached = this.versionByTeam.get(teamId);
        if (cached && now - cached.at <= MM_TEAM_DEPARTMENT_VERSION_CACHE_TTL_MS) {
            return cached.version;
        }

        const inflight = this.versionInflightTeam.get(teamId);
        if (inflight) {
            return inflight;
        }

        const p = (async () => {
            const data = (await this.doFetch(`${this.getTeamRoute(teamId)}/version`, {method: 'get'})) as MMTeamVersion;
            const v = data.version;
            this.versionByTeam.set(teamId, {version: v, at: Date.now()});
            return v;
        })();

        this.versionInflightTeam.set(teamId, p);
        try {
            return await p;
        } finally {
            this.versionInflightTeam.delete(teamId);
        }
    }

    private async invalidateTeamStructureCache(teamId: string) {
        this.versionByTeam.delete(teamId);
        this.responseByTeam.delete(teamId);
        this.versionInflightTeam.delete(teamId);
        const baseUrl = this.getBaseRoute();
        if (MM_TEAM_DEPARTMENT_ENABLE_DISK_CACHE && baseUrl) {
            await clearContactDiskCacheCompany(baseUrl, teamDiskScopeKey(teamId));
        }
    }

    private async doRequestTeamStructureGet<T>(teamId: string, path: string): Promise<T> {
        if (!MM_TEAM_DEPARTMENT_ENABLE_CACHE) {
            return (await this.doFetch(path, {method: 'get'})) as T;
        }

        let version: string;
        try {
            version = await this.resolveTeamStructureVersion(teamId);
        } catch {
            return (await this.doFetch(path, {method: 'get'})) as T;
        }

        let map = this.responseByTeam.get(teamId);
        if (!map) {
            map = new Map();
            this.responseByTeam.set(teamId, map);
        }
        const hit = map.get(path);
        if (hit && hit.version === version) {
            return hit.data as T;
        }

        const baseUrl = this.getBaseRoute();
        if (MM_TEAM_DEPARTMENT_ENABLE_DISK_CACHE && baseUrl) {
            const diskData = await readContactDiskCache(baseUrl, teamDiskScopeKey(teamId), path, version);
            if (diskData !== null) {
                map.set(path, {version, data: diskData, at: Date.now()});
                return diskData as T;
            }
        }

        const data = (await this.doFetch(path, {method: 'get'})) as T;
        map.set(path, {version, data, at: Date.now()});
        if (MM_TEAM_DEPARTMENT_ENABLE_DISK_CACHE && baseUrl) {
            await writeContactDiskCache(baseUrl, teamDiskScopeKey(teamId), path, version, data);
        }
        return data;
    }

    private async resolveUserContactsVersion(userId: string): Promise<string> {
        const now = Date.now();
        const cached = this.versionByUserContacts.get(userId);
        if (cached && now - cached.at <= MM_TEAM_DEPARTMENT_VERSION_CACHE_TTL_MS) {
            return cached.version;
        }

        const inflight = this.versionInflightUserContacts.get(userId);
        if (inflight) {
            return inflight;
        }

        const p = (async () => {
            const data = (await this.doFetch(`${this.getUserRoute(userId)}/contacts/version`, {method: 'get'})) as MMContactVersionInfo;
            const v = data.version;
            this.versionByUserContacts.set(userId, {version: v, at: Date.now()});
            return v;
        })();

        this.versionInflightUserContacts.set(userId, p);
        try {
            return await p;
        } finally {
            this.versionInflightUserContacts.delete(userId);
        }
    }

    private async invalidateUserContactsCache(userId: string) {
        this.versionByUserContacts.delete(userId);
        this.responseByUserContacts.delete(userId);
        this.versionInflightUserContacts.delete(userId);
        const baseUrl = this.getBaseRoute();
        if (MM_TEAM_DEPARTMENT_ENABLE_DISK_CACHE && baseUrl) {
            await clearContactDiskCacheCompany(baseUrl, userContactsDiskScopeKey(userId));
        }
    }

    private async doRequestUserContactsGet<T>(userId: string, path: string): Promise<T> {
        if (!MM_TEAM_DEPARTMENT_ENABLE_CACHE) {
            return (await this.doFetch(path, {method: 'get'})) as T;
        }

        let version: string;
        try {
            version = await this.resolveUserContactsVersion(userId);
        } catch {
            return (await this.doFetch(path, {method: 'get'})) as T;
        }

        let map = this.responseByUserContacts.get(userId);
        if (!map) {
            map = new Map();
            this.responseByUserContacts.set(userId, map);
        }
        const hit = map.get(path);
        if (hit && hit.version === version) {
            return hit.data as T;
        }

        const baseUrl = this.getBaseRoute();
        if (MM_TEAM_DEPARTMENT_ENABLE_DISK_CACHE && baseUrl) {
            const diskData = await readContactDiskCache(baseUrl, userContactsDiskScopeKey(userId), path, version);
            if (diskData !== null) {
                map.set(path, {version, data: diskData, at: Date.now()});
                return diskData as T;
            }
        }

        const data = (await this.doFetch(path, {method: 'get'})) as T;
        map.set(path, {version, data, at: Date.now()});
        if (MM_TEAM_DEPARTMENT_ENABLE_DISK_CACHE && baseUrl) {
            await writeContactDiskCache(baseUrl, userContactsDiskScopeKey(userId), path, version, data);
        }
        return data;
    }

    /** 返回团队结构当前版本（不参与「按版本缓存业务 GET」的封装，便于外部轮询）；会写入短期 version 缓存供后续 GET 命中 */
    getTeamVersion = async (teamId: string) => {
        const data = (await this.doFetch(`${this.getTeamRoute(teamId)}/version`, {method: 'get'})) as MMTeamVersion;
        this.versionByTeam.set(teamId, {version: data.version, at: Date.now()});
        return data;
    };

    getDepartments = (teamId: string, page = 0, perPage = PER_PAGE_DEFAULT) => {
        const path = `${this.departmentsBase(teamId)}${buildQueryString({page, per_page: perPage})}`;
        return this.doRequestTeamStructureGet<MMGetDepartmentsResponse>(teamId, path);
    };

    createDepartment = async (teamId: string, body: MMCreateDepartmentRequest) => {
        await this.invalidateTeamStructureCache(teamId);
        try {
            const res = (await this.doFetch(this.departmentsBase(teamId), {method: 'post', body})) as MMDepartment;
            await this.invalidateTeamStructureCache(teamId);
            return res;
        } catch (e) {
            await this.invalidateTeamStructureCache(teamId);
            throw e;
        }
    };

    getDepartment = (teamId: string, departmentId: number) => {
        const path = `${this.departmentsBase(teamId)}/${departmentId}`;
        return this.doRequestTeamStructureGet<MMDepartment>(teamId, path);
    };

    updateDepartment = async (teamId: string, departmentId: number, body: MMUpdateDepartmentRequest) => {
        await this.invalidateTeamStructureCache(teamId);
        try {
            const res = (await this.doFetch(`${this.departmentsBase(teamId)}/${departmentId}`, {method: 'put', body})) as MMDepartment;
            await this.invalidateTeamStructureCache(teamId);
            return res;
        } catch (e) {
            await this.invalidateTeamStructureCache(teamId);
            throw e;
        }
    };

    deleteDepartment = async (teamId: string, departmentId: number) => {
        await this.invalidateTeamStructureCache(teamId);
        try {
            const res = (await this.doFetch(`${this.departmentsBase(teamId)}/${departmentId}`, {method: 'delete'})) as MMStatusOK;
            await this.invalidateTeamStructureCache(teamId);
            return res;
        } catch (e) {
            await this.invalidateTeamStructureCache(teamId);
            throw e;
        }
    };

    getDepartmentTree = (teamId: string, opts?: {parentId?: number; page?: number; perPage?: number}) => {
        const {parentId, page = 0, perPage = PER_PAGE_DEFAULT} = opts || {};
        const q: Record<string, number> = {page, per_page: perPage};
        if (typeof parentId === 'number') {
            q.parent_id = parentId;
        }
        const path = `${this.departmentsBase(teamId)}/tree${buildQueryString(q)}`;
        return this.doRequestTeamStructureGet<MMDepartment[]>(teamId, path);
    };

    getDepartmentChildren = (teamId: string, departmentId: number) => {
        const path = `${this.departmentsBase(teamId)}/${departmentId}/children`;
        return this.doRequestTeamStructureGet<MMDepartment[]>(teamId, path);
    };

    getDepartmentAncestors = (teamId: string, departmentId: number) => {
        const path = `${this.departmentsBase(teamId)}/${departmentId}/ancestors`;
        return this.doRequestTeamStructureGet<MMDepartmentAncestor[]>(teamId, path);
    };

    getDepartmentMembers = (teamId: string, departmentId: number, page = 0, perPage = PER_PAGE_DEFAULT) => {
        const path = `${this.departmentsBase(teamId)}/${departmentId}/members${buildQueryString({page, per_page: perPage})}`;
        return this.doRequestTeamStructureGet<MMDepartmentMembersWithCount>(teamId, path);
    };

    addDepartmentMember = async (teamId: string, departmentId: number, body: MMAddDepartmentMemberRequest) => {
        await this.invalidateTeamStructureCache(teamId);
        try {
            const res = (await this.doFetch(`${this.departmentsBase(teamId)}/${departmentId}/members`, {method: 'post', body})) as MMStatusOK;
            await this.invalidateTeamStructureCache(teamId);
            return res;
        } catch (e) {
            await this.invalidateTeamStructureCache(teamId);
            throw e;
        }
    };

    removeDepartmentMember = async (teamId: string, departmentId: number, userId: string) => {
        await this.invalidateTeamStructureCache(teamId);
        try {
            const res = (await this.doFetch(`${this.departmentsBase(teamId)}/${departmentId}/members/${encodeURIComponent(userId)}`, {method: 'delete'})) as MMStatusOK;
            await this.invalidateTeamStructureCache(teamId);
            return res;
        } catch (e) {
            await this.invalidateTeamStructureCache(teamId);
            throw e;
        }
    };

    batchAddDepartmentMembers = async (teamId: string, departmentId: number, body: MMBatchDepartmentMembersRequest) => {
        await this.invalidateTeamStructureCache(teamId);
        try {
            const res = (await this.doFetch(`${this.departmentsBase(teamId)}/${departmentId}/members/batch`, {method: 'post', body})) as MMStatusOK;
            await this.invalidateTeamStructureCache(teamId);
            return res;
        } catch (e) {
            await this.invalidateTeamStructureCache(teamId);
            throw e;
        }
    };

    batchRemoveDepartmentMembers = async (teamId: string, departmentId: number, body: MMBatchDepartmentMembersRequest) => {
        await this.invalidateTeamStructureCache(teamId);
        try {
            const res = (await this.doFetch(`${this.departmentsBase(teamId)}/${departmentId}/members/batch`, {method: 'delete', body})) as MMStatusOK;
            await this.invalidateTeamStructureCache(teamId);
            return res;
        } catch (e) {
            await this.invalidateTeamStructureCache(teamId);
            throw e;
        }
    };

    moveDepartmentMember = async (teamId: string, departmentId: number, body: MMMoveDepartmentMemberRequest) => {
        await this.invalidateTeamStructureCache(teamId);
        try {
            const res = (await this.doFetch(`${this.departmentsBase(teamId)}/${departmentId}/members/move`, {method: 'post', body})) as MMStatusOK;
            await this.invalidateTeamStructureCache(teamId);
            return res;
        } catch (e) {
            await this.invalidateTeamStructureCache(teamId);
            throw e;
        }
    };

    batchMoveDepartmentMembers = async (teamId: string, body: MMBatchMoveDepartmentMembersRequest) => {
        await this.invalidateTeamStructureCache(teamId);
        try {
            const res = (await this.doFetch(`${this.departmentsBase(teamId)}/members/move-batch`, {method: 'post', body})) as MMStatusOK;
            await this.invalidateTeamStructureCache(teamId);
            return res;
        } catch (e) {
            await this.invalidateTeamStructureCache(teamId);
            throw e;
        }
    };

    getUserDepartments = (userId: string, teamId: string) => {
        const path = `${this.getUserRoute(userId)}/departments${buildQueryString({team_id: teamId})}`;
        return this.doRequestTeamStructureGet<MMDepartment[]>(teamId, path);
    };

    getDepartmentStats = (teamId: string) => {
        const path = `${this.departmentsBase(teamId)}/stats`;
        return this.doRequestTeamStructureGet<MMDepartmentStats>(teamId, path);
    };

    getEmployeeContacts = (userId: string, opts?: {contactType?: MMEmployeeContactType; page?: number; perPage?: number}) => {
        const page = opts?.page ?? 0;
        const perPage = opts?.perPage ?? PER_PAGE_DEFAULT;
        const q: Record<string, string | number> = {page, per_page: perPage};
        if (opts?.contactType) {
            q.contact_type = opts.contactType;
        }
        const path = `${this.getUserRoute(userId)}/contacts${buildQueryString(q)}`;
        return this.doRequestUserContactsGet<MMEmployeeContact[]>(userId, path);
    };

    getEmployeeContactsWithDetails = (userId: string, opts?: {contactType?: MMEmployeeContactType; page?: number; perPage?: number}) => {
        const page = opts?.page ?? 0;
        const perPage = opts?.perPage ?? PER_PAGE_DEFAULT;
        const q: Record<string, string | number> = {page, per_page: perPage};
        if (opts?.contactType) {
            q.contact_type = opts.contactType;
        }
        const path = `${this.getUserRoute(userId)}/contacts/details${buildQueryString(q)}`;
        return this.doRequestUserContactsGet<MMEmployeeContactWithDetails[]>(userId, path);
    };

    addEmployeeContact = async (userId: string, body: MMUpsertEmployeeContactRequest) => {
        await this.invalidateUserContactsCache(userId);
        try {
            const res = (await this.doFetch(`${this.getUserRoute(userId)}/contacts`, {method: 'post', body})) as MMStatusOK;
            await this.invalidateUserContactsCache(userId);
            return res;
        } catch (e) {
            await this.invalidateUserContactsCache(userId);
            throw e;
        }
    };

    updateEmployeeContact = async (userId: string, body: MMUpsertEmployeeContactRequest) => {
        await this.invalidateUserContactsCache(userId);
        try {
            const res = (await this.doFetch(`${this.getUserRoute(userId)}/contacts`, {method: 'put', body})) as MMStatusOK;
            await this.invalidateUserContactsCache(userId);
            return res;
        } catch (e) {
            await this.invalidateUserContactsCache(userId);
            throw e;
        }
    };

    deleteEmployeeContact = async (userId: string, body: MMDeleteEmployeeContactRequest) => {
        await this.invalidateUserContactsCache(userId);
        try {
            const res = (await this.doFetch(`${this.getUserRoute(userId)}/contacts`, {method: 'delete', body})) as MMStatusOK;
            await this.invalidateUserContactsCache(userId);
            return res;
        } catch (e) {
            await this.invalidateUserContactsCache(userId);
            throw e;
        }
    };

    getUserContactVersion = async (userId: string) => {
        const data = (await this.doFetch(`${this.getUserRoute(userId)}/contacts/version`, {method: 'get'})) as MMContactVersionInfo;
        this.versionByUserContacts.set(userId, {version: data.version, at: Date.now()});
        return data;
    };

    updateUserContactVersion = async (userId: string, body: MMUpdateContactVersionRequest) => {
        await this.invalidateUserContactsCache(userId);
        try {
            const res = (await this.doFetch(`${this.getUserRoute(userId)}/contacts/version`, {method: 'put', body})) as MMUpdateContactVersionResponse;
            await this.invalidateUserContactsCache(userId);
            return res;
        } catch (e) {
            await this.invalidateUserContactsCache(userId);
            throw e;
        }
    };
};

export default ClientTeamDepartment;
