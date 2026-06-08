// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Screens} from '@constants';

/** 通讯录 Stack 参数表；独立文件避免 contacts ↔ contacts_stack 循环引用 */
export type ContactsStackParamList = {
    [Screens.CONTACTS]: undefined;
    [Screens.CONTACTS_DEPARTMENT_DETAIL]: {
        departmentId: number;
        departmentName: string;
        breadcrumb: string[];
        companyId: string;
        companyName?: string;

        /** 标签相关：管理员用户 ID 列表（序列化数组，非 Set） */
        managerIds?: string[];

        /** 企业所有者用户 ID */
        ownerId?: string;

        /** 当前登录用户 ID */
        currentUserId?: string;
    };
    [Screens.CONTACTS_SEARCH]: {
        companyId: string;
        companyName?: string;
        departmentId?: number;
        departmentName?: string;
        departmentBreadcrumb?: string[];
        currentUserId?: string;
    };
};
