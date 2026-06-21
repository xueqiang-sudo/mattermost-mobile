// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Preferences} from '@constants';

export const DARK_MODE_SETTING = {
    SYSTEM: 'system',
    LIGHT: 'light',
    DARK: 'dark',
} as const;

export type DarkModeSetting = typeof DARK_MODE_SETTING[keyof typeof DARK_MODE_SETTING];

export function parseStoredDarkModeSetting(value: unknown): DarkModeSetting {
    if (value === DARK_MODE_SETTING.LIGHT || value === DARK_MODE_SETTING.DARK) {
        return value;
    }

    return DARK_MODE_SETTING.SYSTEM;
}

export function getThemeForDarkModeSetting(setting: DarkModeSetting): Theme | null {
    switch (setting) {
        case DARK_MODE_SETTING.LIGHT:
            return Preferences.THEMES.quartz;
        case DARK_MODE_SETTING.DARK:
            return Preferences.THEMES.onyx;
        default:
            return null;
    }
}
