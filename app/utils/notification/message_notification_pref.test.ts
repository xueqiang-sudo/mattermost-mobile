// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Linking, Platform} from 'react-native';

import {
    ANDROID_APP_PACKAGE,
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

const mockedSendIntent = jest.mocked(Linking.sendIntent);
const mockedOpenSettings = jest.mocked(Linking.openSettings);

describe('message_notification_pref Android notification settings', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        Object.defineProperty(Platform, 'OS', {value: 'android'});
        mockedSendIntent.mockResolvedValue(undefined);
        mockedOpenSettings.mockResolvedValue(undefined);
    });

    it('openAppNotificationSettings should send APP_NOTIFICATION_SETTINGS intent', async () => {
        const result = await openAppNotificationSettings();

        expect(result).toBe(true);
        expect(mockedSendIntent).toHaveBeenCalledWith(
            'android.settings.APP_NOTIFICATION_SETTINGS',
            [{key: 'android.provider.extra.APP_PACKAGE', value: ANDROID_APP_PACKAGE}],
        );
        expect(mockedOpenSettings).not.toHaveBeenCalled();
    });

    it('openMessageNotificationChannelSettings should call Linking.openSettings', async () => {
        const result = await openMessageNotificationChannelSettings();

        expect(result).toBe(true);
        expect(mockedOpenSettings).toHaveBeenCalledTimes(1);
    });

    it('openAppNotificationSettings should fall back to openSettings when sendIntent fails', async () => {
        mockedSendIntent.mockRejectedValue(new Error('intent unavailable'));

        const result = await openAppNotificationSettings();

        expect(result).toBe(true);
        expect(mockedOpenSettings).toHaveBeenCalledTimes(1);
    });

    it('should return false when all fallbacks fail', async () => {
        mockedSendIntent.mockRejectedValue(new Error('intent unavailable'));
        mockedOpenSettings.mockRejectedValue(new Error('openSettings unavailable'));

        const result = await openAppNotificationSettings();

        expect(result).toBe(false);
    });

    it('openMessageNotificationChannelSettings should return false on failure', async () => {
        mockedOpenSettings.mockRejectedValue(new Error('openSettings unavailable'));

        const result = await openMessageNotificationChannelSettings();

        expect(result).toBe(false);
    });
});
