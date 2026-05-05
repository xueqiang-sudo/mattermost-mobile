// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

export const UPDATE_TYPE = {
    NONE: 'none',
    SUGGEST: 'suggest',
    FORCE: 'force',
} as const;

export const UPDATE = {
    SKIP_MAX_COUNT: 3,
    SKIP_COOLDOWN_HOURS: 24,
    CHECK_TIMEOUT: 10000,
} as const;

export const APP_UPDATE_STORE_KEY = 'app_update_skip_info';

export default {
    UPDATE,
    UPDATE_TYPE,
    APP_UPDATE_STORE_KEY,
};
