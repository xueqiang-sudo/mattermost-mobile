// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Screens} from '@constants';

import type {MMEmployeeContactType} from '@client/rest/team_department';

/** 通讯录 Stack 参数表；独立文件避免 contacts ↔ contacts_stack 循环引用 */
export type ContactsStackParamList = {
    [Screens.CONTACTS]: undefined;
    [Screens.MY_SUPPLIERS]: undefined;
    [Screens.MY_CUSTOMERS]: undefined;
    [Screens.SUPPLIER_CUSTOMER_FORM]: {
        kind: MMEmployeeContactType;
        ownerId: string;
        existingContactId?: string;
        initialContactName?: string;
        initialDescription?: string;
        initialRemark?: string;
        initialContactEmail?: string;
        initialContactPhone?: string;
        initialContactPosition?: string;
        initialContactUsername?: string;
        mattermostUserIdForAvatar?: string;
        readOnly?: boolean;
    };
    [Screens.CONTACTS_DEPARTMENT_DETAIL]: {
        departmentId: number | null;
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

        /** 从父部门页传递：进入子部门时是否保持管理模式 */
        initialManageMode?: boolean;
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
