// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {pinyin} from 'pinyin-pro';

import {username2Nickname} from '@utils/user';

import type {SectionListData} from 'react-native';

/**
 * 联系人列表排序用展示名：昵称优先（与选人列表展示一致），无则回退 username。
 */
export function getContactListDisplayName(user: UserProfile | SimpleUserProfile): string {
    const fromNickname = username2Nickname(user, {includeFullName: true, useFallbackUsername: true});
    const trimmed = (fromNickname || '').trim();
    if (trimmed) {
        return trimmed;
    }
    return user.username || '';
}

/**
 * 供应商/客户显示名统一处理：
 * - 没有设置备注：显示昵称
 * - 设置了备注：显示「备注（昵称）」
 */
export function getSupplierCustomerDisplayName(remark: string | null | undefined, contact: UserProfile | SimpleUserProfile): string {
    const nickname = getContactListDisplayName(contact);
    const trimmedRemark = remark?.trim();
    if (trimmedRemark) {
        if (trimmedRemark === nickname) {
            return trimmedRemark;
        }
        return `${trimmedRemark} (${nickname})`;
    }
    return nickname;
}

/** 汉字与扩展 A 区（含常用汉字）；用于判断是否走拼音首字母 */
const CJK_RE = /[\u3400-\u9FFF\uF900-\uFAFF]/;

/**
 * 取首字符对应的分组键：0–9、A–Z；汉字取拼音首字母大写；其余归为「#」。
 */
export function getContactSectionId(displayName: string): string {
    const trimmed = displayName.trim();
    if (!trimmed) {
        return '#';
    }
    const firstChar = [...trimmed][0] ?? '';
    if (/^[0-9]$/.test(firstChar)) {
        return firstChar;
    }
    if (/^[a-zA-Z]$/i.test(firstChar)) {
        return firstChar.toUpperCase();
    }
    if (CJK_RE.test(firstChar)) {
        try {
            const initial = pinyin(firstChar, {pattern: 'first', toneType: 'none'});
            const letter = initial.charAt(0).toUpperCase();
            if (/^[A-Z]$/.test(letter)) {
                return letter;
            }
        } catch {
            // ignore
        }
        return '#';
    }
    return '#';
}

function compareSectionKeys(a: string, b: string): number {
    const rank = (k: string): number => {
        if (k >= '0' && k <= '9') {
            return k.charCodeAt(0) - 48;
        }
        if (k >= 'A' && k <= 'Z') {
            return 100 + k.charCodeAt(0);
        }
        return 200;
    };
    return rank(a) - rank(b);
}

/**
 * 私聊/群聊选人：按展示名首字母（数字/字母/拼音首字母）分组，供 SectionList 使用。
 */
export function createContactSectionsByNickname(profiles: UserProfile[]): Array<SectionListData<UserProfile>> {
    if (!profiles.length) {
        return [];
    }

    const sorted = [...profiles].sort((a, b) => {
        const na = getContactListDisplayName(a);
        const nb = getContactListDisplayName(b);
        return na.localeCompare(nb, undefined, {numeric: true, sensitivity: 'base'});
    });

    const bucket = new Map<string, UserProfile[]>();
    for (const p of sorted) {
        const label = getContactListDisplayName(p);
        const key = getContactSectionId(label);
        const list = bucket.get(key) || [];
        list.push(p);
        bucket.set(key, list);
    }

    const keys = [...bucket.keys()].sort(compareSectionKeys);
    return keys.map((k, index) => ({
        first: index === 0,
        id: k,
        /** 自定义字段；勿用 `title`，避免与 RN SectionList 内部对 section.title 的处理冲突导致表头空白 */
        mmSectionLabel: k,
        data: bucket.get(k)!,
    }));
}
