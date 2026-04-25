// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Screens} from '@constants';

import type {MMEmployeeContactType} from '@client/rest/team_department';

export type MyHomepageStackParamList = {
    [Screens.MY_HOMEPAGE]: undefined;
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
        /** When known (e.g. matches Mattermost user id), skip email lookup for avatar */
        mattermostUserIdForAvatar?: string;
    };
};
