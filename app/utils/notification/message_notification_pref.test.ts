// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Linking, Platform} from 'react-native';

import RNUtils from '@mattermost/rnutils';

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

jest.mock('@mattermost/rnutils', () => ({
    openNotificationManagementSettings: jest.fn(),
}));

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
const mockedOpenNotificationManagementSettings = jest.mocked(
    (RNUtils as unknown as {openNotificationManagementSettings: jest.Mock}).openNotificationManagementSettings,
);

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

    it('openMessageNotificationChannelSettings should send APP_NOTIFICATION_SETTINGS intent', async () => {
        mockedOpenNotificationManagementSettings.mockResolvedValue(true);

        const result = await openMessageNotificationChannelSettings();

        expect(result).toBe(true);
        expect(mockedOpenNotificationManagementSettings).toHaveBeenCalledTimes(1);
        expect(mockedOpenNotificationManagementSettings).toHaveBeenCalledWith(ANDROID_APP_PACKAGE);
    });

    it('should fall back to Linking.openSettings when sendIntent fails', async () => {
        mockedOpenNotificationManagementSettings.mockRejectedValue(new Error('native unavailable'));
        mockedSendIntent.mockResolvedValue(undefined);

        const result = await openMessageNotificationChannelSettings();

        expect(result).toBe(true);
        // 回退链路：RNUtils 失败 => openAppNotificationSettings(App 通知) 的 sendIntent
        expect(mockedSendIntent).toHaveBeenCalledTimes(1);
    });

    it('should return false when both RNUtils and fallbacks fail', async () => {
        mockedOpenNotificationManagementSettings.mockRejectedValue(new Error('native unavailable'));
        mockedSendIntent.mockRejectedValue(new Error('intent unavailable'));
        mockedOpenSettings.mockRejectedValue(new Error('openSettings unavailable'));

        const result = await openAppNotificationSettings();

        expect(result).toBe(false);
    });

    it('should return false on non-Android platforms', async () => {
        Object.defineProperty(Platform, 'OS', {value: 'ios'});

        const result = await openMessageNotificationChannelSettings();

        expect(result).toBe(false);
        expect(mockedSendIntent).not.toHaveBeenCalled();
        expect(mockedOpenSettings).not.toHaveBeenCalled();
    });
});
