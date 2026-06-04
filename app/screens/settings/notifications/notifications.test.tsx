// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {type ComponentProps} from 'react';

import DatabaseManager from '@database/manager';
import * as DeviceHooks from '@hooks/device';
import {renderWithEverything, waitFor} from '@test/intl-test-helper';
import TestHelper from '@test/test_helper';
import {syncNotifyPushWithSystemSettings} from '@utils/notification/push_system_sync';

import Notifications from './notifications';

import type Database from '@nozbe/watermelondb/Database';

jest.mock('@utils/notification/push_system_sync', () => ({
    syncNotifyPushWithSystemSettings: jest.fn(),
}));

jest.mock('@utils/notification/message_notification_pref', () => ({
    areSystemNotificationsEnabled: jest.fn(),
    openAppNotificationSettings: jest.fn().mockResolvedValue(true),
}));

const mockedSyncNotifyPushWithSystemSettings = jest.mocked(syncNotifyPushWithSystemSettings);

function getBaseProps(): ComponentProps<typeof Notifications> {
    return {
        componentId: 'Settings' as const,
        currentUser: TestHelper.fakeUserModel({id: 'user1', username: 'username1'}),
        emailInterval: '0',
        enableAutoResponder: false,
        enableEmailBatching: false,
        isCRTEnabled: false,
        sendEmailNotifications: false,
        serverVersion: '10.3.0',
    };
}

describe('Notifications message toggle (system-linked)', () => {
    let database: Database;
    const messageToggleTestId = 'notification_settings.message_notification.toggle.toggled.false.button';
    const messageToggleOnTestId = 'notification_settings.message_notification.toggle.toggled.true.button';
    const mentionToggleTestId = 'notification_settings.mention_only.toggle';
    const serverUrl = 'server-1';

    beforeAll(async () => {
        const server = await TestHelper.setupServerDatabase(serverUrl);
        database = server.database;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(DeviceHooks, 'useAppState').mockReturnValue('active');
    });

    afterAll(async () => {
        await DatabaseManager.destroyServerDatabase(serverUrl);
    });

    it('should show message toggle off when system notifications are disabled', async () => {
        mockedSyncNotifyPushWithSystemSettings.mockResolvedValue({
            push: 'none',
            changed: false,
            systemEnabled: false,
        });
        const wrapper = renderWithEverything(<Notifications {...getBaseProps()}/>, {database});
        await waitFor(() => {
            expect(wrapper.getByTestId(messageToggleTestId)).toBeVisible();
        });
        expect(wrapper.queryByTestId(mentionToggleTestId)).toBeNull();
        expect(wrapper.queryByTestId('notifications-disabled-notice')).toBeNull();
    });

    it('should show message toggle on and mention option when system notifications are enabled', async () => {
        mockedSyncNotifyPushWithSystemSettings.mockResolvedValue({
            push: 'all',
            changed: false,
            systemEnabled: true,
        });
        const wrapper = renderWithEverything(<Notifications {...getBaseProps()}/>, {database});
        await waitFor(() => {
            expect(wrapper.getByTestId(messageToggleOnTestId)).toBeVisible();
        });
        expect(wrapper.getByTestId(mentionToggleTestId)).toBeVisible();
    });

    it('should re-check system notification state when appState becomes active', async () => {
        mockedSyncNotifyPushWithSystemSettings.mockResolvedValue({
            push: 'none',
            changed: false,
            systemEnabled: false,
        });
        const appStateSpy = jest.spyOn(DeviceHooks, 'useAppState');
        appStateSpy.mockReturnValue('active');
        const wrapper = renderWithEverything(<Notifications {...getBaseProps()}/>, {database});
        await waitFor(() => {
            expect(mockedSyncNotifyPushWithSystemSettings).toHaveBeenCalledTimes(1);
        });

        appStateSpy.mockReturnValue('background');
        wrapper.rerender(<Notifications {...getBaseProps()}/>);
        await waitFor(() => {
            expect(mockedSyncNotifyPushWithSystemSettings).toHaveBeenCalledTimes(1);
        });

        appStateSpy.mockReturnValue('active');
        wrapper.rerender(<Notifications {...getBaseProps()}/>);
        await waitFor(() => {
            expect(mockedSyncNotifyPushWithSystemSettings).toHaveBeenCalledTimes(2);
        });
    });

    it('should prevent state update after unmount (isCurrent race prevention)', async () => {
        jest.spyOn(DeviceHooks, 'useAppState').mockReturnValue('active');

        let resolvePromise!: (value: {push: UserNotifyPropsPush; changed: boolean; systemEnabled: boolean}) => void;
        const promise = new Promise<{push: UserNotifyPropsPush; changed: boolean; systemEnabled: boolean}>((resolve) => {
            resolvePromise = resolve;
        });
        mockedSyncNotifyPushWithSystemSettings.mockReturnValue(promise);

        const wrapper = renderWithEverything(<Notifications {...getBaseProps()}/>, {database});
        wrapper.unmount();

        resolvePromise({push: 'none', changed: false, systemEnabled: false});

        await new Promise((r) => setTimeout(r, 10));
    });
});
