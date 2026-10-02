// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {searchContactEmployees} from '@actions/remote/contact_new';
import {fetchEmployeeContacts, searchEmployeeContacts} from '@actions/remote/employee_contact_new';
import {searchProfiles, fetchProfilesInTeam} from '@actions/remote/user';
import {MMEmployeeContactTypes} from '@client/rest/team_department';

export type CandidateDraft = {
    userId: string;
    user?: SimpleUserProfile;
    sourceFlags: {
        globalSearch: boolean;
        enterpriseSearch: boolean;
        external: boolean;
        self: boolean;
    };
};

function ensureDraft(uidSet: Set<string>, map: Map<string, CandidateDraft>, user: SimpleUserProfile, selfUserId: string) {
    const userId = user.id;
    if (!uidSet.has(userId)) {
        uidSet.add(userId);
    }
    const existing = map.get(userId);
    if (existing) {
        return existing;
    }

    const created: CandidateDraft = {
        userId,
        user,
        sourceFlags: {
            globalSearch: false,
            enterpriseSearch: false,
            external: false,
            self: userId === selfUserId,
        },
    };
    map.set(userId, created);
    return created;
}

/** 候选联系人搜索
 * 1. 精准全局搜索联系人
 * 2. 模糊搜索企业员工(通讯录员工)
 * 3. 模糊匹配外部联系人
 */
export async function searchEmployeeCandidates(
    serverUrl: string,
    teamId: string,
    currentUserId: string,
    term: string,
): Promise<CandidateDraft[]> {
    const trimmed = term.trim();
    if (!trimmed) {
        return [];
    }

    const drafts = new Map<string, CandidateDraft>();
    const draftUids = new Set<string>();

    const [globalExactRes, enterpriseRes, externalRes] = await Promise.all([
        searchProfiles(serverUrl, trimmed, {exact_match: true}),
        searchContactEmployees(serverUrl, teamId, trimmed),
        searchEmployeeContacts(serverUrl, MMEmployeeContactTypes.External, currentUserId, trimmed, {granularity: 2}),
    ]);

    for (const user of enterpriseRes.data ?? []) {
        const draft = ensureDraft(draftUids, drafts, user, currentUserId);
        draft.sourceFlags.enterpriseSearch = true;
    }

    for (const employee of globalExactRes.data ?? []) {
        const draft = ensureDraft(draftUids, drafts, employee, currentUserId);
        draft.sourceFlags.globalSearch = true;
    }

    for (const employeeContact of externalRes.data ?? []) {
        const draft = ensureDraft(draftUids, drafts, employeeContact.contact, currentUserId);
        draft.sourceFlags.external = true;
    }

    const candidateDrafts: CandidateDraft[] = [];
    draftUids.forEach((uid) => {
        const draft = drafts.get(uid);
        if (draft) {
            candidateDrafts.push(draft);
        }
    });

    return candidateDrafts;
}

/** 获取候选联系人列表（对标 webapp）
 * 1. 企业员工(通讯录员工)
 * 2. 外部联系人
 */
export async function getEmployeeCandidates(
    serverUrl: string,
    teamId: string,
    currentUserId: string,
): Promise<CandidateDraft[]> {
    const drafts = new Map<string, CandidateDraft>();
    const draftUids = new Set<string>();
    const [enterpriseRes, externalRes] = await Promise.all([
        fetchProfilesInTeam(serverUrl, teamId, undefined, undefined, undefined, undefined, true),
        fetchEmployeeContacts(serverUrl, currentUserId, MMEmployeeContactTypes.External, {page: 0, perPage: 200, granularity: 2}),
    ]);
    for (const user of enterpriseRes.users ?? []) {
        const draft = ensureDraft(draftUids, drafts, user, currentUserId);
        draft.sourceFlags.enterpriseSearch = true;
    }
    for (const employeeContact of (externalRes.data ?? []) as MMEmployeeContactSimple[]) {
        if (employeeContact.contact) {
            const draft = ensureDraft(draftUids, drafts, employeeContact.contact, currentUserId);
            draft.sourceFlags.external = true;
        }
    }
    const candidateDrafts: CandidateDraft[] = [];
    draftUids.forEach((uid) => {
        const draft = drafts.get(uid);
        if (draft) {
            candidateDrafts.push(draft);
        }
    });
    return candidateDrafts;
}

/** 获取外部候选联系人（仅外部联系人，不含企业内成员） */
export async function getExternalCandidates(
    serverUrl: string,
    currentUserId: string,
): Promise<CandidateDraft[]> {
    const drafts = new Map<string, CandidateDraft>();
    const draftUids = new Set<string>();
    const externalRes = await fetchEmployeeContacts(serverUrl, currentUserId, MMEmployeeContactTypes.External, {page: 0, perPage: 200, granularity: 2});
    for (const employeeContact of (externalRes.data ?? []) as MMEmployeeContactSimple[]) {
        if (employeeContact.contact) {
            const draft = ensureDraft(draftUids, drafts, employeeContact.contact, currentUserId);
            draft.sourceFlags.external = true;
        }
    }
    const candidateDrafts: CandidateDraft[] = [];
    draftUids.forEach((uid) => {
        const draft = drafts.get(uid);
        if (draft) {
            candidateDrafts.push(draft);
        }
    });
    return candidateDrafts;
}

/** 搜索外部候选联系人（精确匹配 + 外部联系人，不含企业内成员） */
export async function searchExternalCandidates(
    serverUrl: string,
    currentUserId: string,
    term: string,
): Promise<CandidateDraft[]> {
    const trimmed = term.trim();
    if (!trimmed) {
        return [];
    }

    const drafts = new Map<string, CandidateDraft>();
    const draftUids = new Set<string>();

    const [globalExactRes, externalRes] = await Promise.all([
        searchProfiles(serverUrl, trimmed, {exact_match: true}),
        searchEmployeeContacts(serverUrl, MMEmployeeContactTypes.External, currentUserId, trimmed, {granularity: 2}),
    ]);

    for (const employee of globalExactRes.data ?? []) {
        const draft = ensureDraft(draftUids, drafts, employee, currentUserId);
        draft.sourceFlags.globalSearch = true;
    }

    for (const employeeContact of externalRes.data ?? []) {
        const draft = ensureDraft(draftUids, drafts, employeeContact.contact, currentUserId);
        draft.sourceFlags.external = true;
    }

    const candidateDrafts: CandidateDraft[] = [];
    draftUids.forEach((uid) => {
        const draft = drafts.get(uid);
        if (draft) {
            candidateDrafts.push(draft);
        }
    });
    return candidateDrafts;
}
