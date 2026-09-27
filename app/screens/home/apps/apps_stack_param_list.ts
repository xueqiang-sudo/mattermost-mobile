// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Screens} from '@constants';

export type AppsStackParamList = {
    [Screens.APPS_HOME]: undefined;
    [Screens.APPS_WEBVIEW]: {
        appKey: string;
        title: string;
    };
    [Screens.APPS_MES]: undefined;
    [Screens.APPS_PROMOTION]: undefined;
    [Screens.APPS_ROLE_MANAGEMENT]: undefined;
};
