// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {searchContactEmployees} from '@actions/remote/contact_new';
import {fetchAllEmployeeContacts, searchEmployeeContacts} from '@actions/remote/employee_contact_new';
import {searchProfiles, fetchProfilesInTeam} from '@actions/remote/user';
import {MMEmployeeContactTypes} from '@client/rest/team_department';

export type CandidateDraft = {
    userId: string;
    user?: SimpleUserProfile;
    sourceFlags: {
        globalSearch: boolean;
        enterpriseSearch: boolean;
        customer: boolean;
        supplier: boolean;
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
            customer: false,
            supplier: false,
            self: userId === selfUserId,
        },
    };
    map.set(userId, created);
    return created;
}

/** 候选联系人搜索
 * 1. 精准全局搜索联系人
 * 2. 模糊搜索企业员工(通讯录员工)
 * 2. 模糊匹配我的联系人
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

    const [globalExactRes, enterpriseRes, suppliersRes, customersRes] = await Promise.all([
        searchProfiles(serverUrl, trimmed, {exact_match: true}),
        searchContactEmployees(serverUrl, teamId, trimmed),
        searchEmployeeContacts(serverUrl, MMEmployeeContactTypes.Supplier, currentUserId, trimmed, {granularity: 2}),
        searchEmployeeContacts(serverUrl, MMEmployeeContactTypes.Customer, currentUserId, trimmed, {granularity: 2}),
    ]);

    for (const user of enterpriseRes.data ?? []) {
        const draft = ensureDraft(draftUids, drafts, user, currentUserId);
        draft.sourceFlags.enterpriseSearch = true;
    }

    for (const employee of globalExactRes.data ?? []) {
        const draft = ensureDraft(draftUids, drafts, employee, currentUserId);
        draft.sourceFlags.globalSearch = true;
    }

    for (const employeeContact of suppliersRes.data ?? []) {
        const draft = ensureDraft(draftUids, drafts, employeeContact.contact, currentUserId);
        draft.sourceFlags.supplier = true;
    }

    for (const employeeContact of customersRes.data ?? []) {
        const draft = ensureDraft(draftUids, drafts, employeeContact.contact, currentUserId);
        draft.sourceFlags.customer = true;
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

/** 获取候选联系人列表
 * 1. 企业员工(通讯录员工)
 * 2. 获取我的联系人(供应商/客户)
 */
export async function getEmployeeCandidates(
    serverUrl: string,
    teamId: string,
    currentUserId: string,
): Promise<CandidateDraft[]> {
    const drafts = new Map<string, CandidateDraft>();
    const draftUids = new Set<string>();
    const [enterpriseRes, fullEmployeeContactsRes] = await Promise.all([
        fetchProfilesInTeam(serverUrl, teamId, undefined, undefined, undefined, undefined, true),
        fetchAllEmployeeContacts(serverUrl, currentUserId, {granularity: 2}),
    ]);
    for (const user of enterpriseRes.users ?? []) {
        const draft = ensureDraft(draftUids, drafts, user, currentUserId);
        draft.sourceFlags.enterpriseSearch = true;
    }
    for (const employeeContact of fullEmployeeContactsRes.data?.suppliers ?? []) {
        const draft = ensureDraft(draftUids, drafts, employeeContact.contact as SimpleUserProfile, currentUserId);
        draft.sourceFlags.supplier = true;
    }
    for (const employeeContact of fullEmployeeContactsRes.data?.customers ?? []) {
        const draft = ensureDraft(draftUids, drafts, employeeContact.contact as SimpleUserProfile, currentUserId);
        draft.sourceFlags.customer = true;
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
