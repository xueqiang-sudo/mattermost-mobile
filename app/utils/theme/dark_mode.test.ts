// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Preferences} from '@constants';

import {
    DARK_MODE_SETTING,
    getThemeForDarkModeSetting,
    parseStoredDarkModeSetting,
} from './dark_mode';

describe('dark_mode', () => {
    describe('parseStoredDarkModeSetting', () => {
        it('returns system when value is missing or invalid', () => {
            expect(parseStoredDarkModeSetting(undefined)).toBe(DARK_MODE_SETTING.SYSTEM);
            expect(parseStoredDarkModeSetting(null)).toBe(DARK_MODE_SETTING.SYSTEM);
            expect(parseStoredDarkModeSetting('')).toBe(DARK_MODE_SETTING.SYSTEM);
            expect(parseStoredDarkModeSetting('invalid')).toBe(DARK_MODE_SETTING.SYSTEM);
        });

        it('returns light and dark for stored values', () => {
            expect(parseStoredDarkModeSetting(DARK_MODE_SETTING.LIGHT)).toBe(DARK_MODE_SETTING.LIGHT);
            expect(parseStoredDarkModeSetting(DARK_MODE_SETTING.DARK)).toBe(DARK_MODE_SETTING.DARK);
        });
    });

    describe('getThemeForDarkModeSetting', () => {
        it('returns Quartz for light mode', () => {
            expect(getThemeForDarkModeSetting(DARK_MODE_SETTING.LIGHT)).toBe(Preferences.THEMES.quartz);
        });

        it('returns Onyx for dark mode', () => {
            expect(getThemeForDarkModeSetting(DARK_MODE_SETTING.DARK)).toBe(Preferences.THEMES.onyx);
        });

        it('returns null for system mode', () => {
            expect(getThemeForDarkModeSetting(DARK_MODE_SETTING.SYSTEM)).toBeNull();
        });
    });
});
