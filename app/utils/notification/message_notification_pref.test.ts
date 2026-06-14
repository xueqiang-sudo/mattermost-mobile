// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Linking, Platform} from 'react-native';
import Permissions from 'react-native-permissions';

import {
    openAppNotificationSettings,
    openMessageNotificationChannelSettings,
} from './message_notification_pref';

jest.mock('react-native', () => {
    const RN = jest.requireActual('react-native');
    return {
        ...RN,
        Platform: {
            ...RN.Platform,
            OS: 'android',
        },
        Linking: {
            sendIntent: jest.fn(),
            openSettings: jest.fn(),
        },
        NativeModules: {
            ...RN.NativeModules,
        },
    };
});

jest.mock('react-native-permissions', () => ({
    __esModule: true,
    default: {
        openSettings: jest.fn(),
    },
    checkNotifications: jest.fn(),
    RESULTS: {
        GRANTED: 'granted',
        LIMITED: 'limited',
    },
}));

jest.mock('@actions/app/global', () => ({
    storeGlobal: jest.fn(),
}));

jest.mock('@queries/app/global', () => ({
    queryGlobalValue: jest.fn(),
}));

jest.mock('@utils/log', () => ({
    logDebug: jest.fn(),
    logError: jest.fn(),
}));

const mockedPermissionsOpenSettings = jest.mocked(Permissions.openSettings);
const mockedOpenSettings = jest.mocked(Linking.openSettings);

describe('message_notification_pref notification settings', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        Object.defineProperty(Platform, 'OS', {value: 'android'});
        mockedPermissionsOpenSettings.mockResolvedValue(undefined);
        mockedOpenSettings.mockResolvedValue(undefined);
    });

    it('openAppNotificationSettings should open system notification settings', async () => {
        const result = await openAppNotificationSettings();

        expect(result).toBe(true);
        expect(mockedPermissionsOpenSettings).toHaveBeenCalledWith('notifications');
        expect(mockedOpenSettings).not.toHaveBeenCalled();
    });

    it('openMessageNotificationChannelSettings should call Linking.openSettings on Android', async () => {
        const result = await openMessageNotificationChannelSettings();

        expect(result).toBe(true);
        expect(mockedOpenSettings).toHaveBeenCalledTimes(1);
        expect(mockedPermissionsOpenSettings).not.toHaveBeenCalled();
    });

    it('openMessageNotificationChannelSettings should open notification settings on iOS', async () => {
        Object.defineProperty(Platform, 'OS', {value: 'ios'});

        const result = await openMessageNotificationChannelSettings();

        expect(result).toBe(true);
        expect(mockedPermissionsOpenSettings).toHaveBeenCalledWith('notifications');
        expect(mockedOpenSettings).not.toHaveBeenCalled();
    });

    it('openAppNotificationSettings should fall back to Linking.openSettings when Permissions.openSettings fails', async () => {
        mockedPermissionsOpenSettings.mockRejectedValue(new Error('permissions unavailable'));

        const result = await openAppNotificationSettings();

        expect(result).toBe(true);
        expect(mockedOpenSettings).toHaveBeenCalledTimes(1);
    });

    it('openAppNotificationSettings should return false when all fallbacks fail', async () => {
        mockedPermissionsOpenSettings.mockRejectedValue(new Error('permissions unavailable'));
        mockedOpenSettings.mockRejectedValue(new Error('openSettings unavailable'));

        const result = await openAppNotificationSettings();

        expect(result).toBe(false);
    });

    it('openMessageNotificationChannelSettings should return false on Android when Linking.openSettings fails', async () => {
        mockedOpenSettings.mockRejectedValue(new Error('openSettings unavailable'));

        const result = await openMessageNotificationChannelSettings();

        expect(result).toBe(false);
    });

    it('openMessageNotificationChannelSettings should return false on iOS when all fallbacks fail', async () => {
        Object.defineProperty(Platform, 'OS', {value: 'ios'});
        mockedPermissionsOpenSettings.mockRejectedValue(new Error('permissions unavailable'));
        mockedOpenSettings.mockRejectedValue(new Error('openSettings unavailable'));

        const result = await openMessageNotificationChannelSettings();

        expect(result).toBe(false);
    });
});
