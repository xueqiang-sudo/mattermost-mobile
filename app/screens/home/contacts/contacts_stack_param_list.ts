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
