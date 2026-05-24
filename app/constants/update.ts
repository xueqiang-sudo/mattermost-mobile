// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

export const UPDATE_TYPE = {
    NONE: 'none',
    SUGGEST: 'suggest',
    FORCE: 'force',
} as const;

export const UPDATE = {
    CHECK_TIMEOUT: 10000,

    /** 「稍后再说」后抑制建议更新弹窗的时长（毫秒），当前为 1 小时 */
    SUGGEST_LATER_SUPPRESS_MS: 60 * 60 * 1000,
} as const;

export const APP_UPDATE_STORE_KEY = 'app_update_skip_info';

export default {
    UPDATE,
    UPDATE_TYPE,
    APP_UPDATE_STORE_KEY,
};
