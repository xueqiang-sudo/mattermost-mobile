// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Platform} from 'react-native';

import EphemeralStore from '@store/ephemeral_store';

const mockDeleteAlias = jest.fn();
const mockStopPush = jest.fn();
const mockClearLocalNotifications = jest.fn();
const mockClearAllNotifications = jest.fn();
const mockSetBadge = jest.fn();
const mockAddConnectEventListener = jest.fn();
const mockAddNotificationListener = jest.fn();

jest.mock('jcore-react-native', () => ({
    __esModule: true,
    default: {},
}));

jest.mock('jpush-react-native', () => ({
    __esModule: true,
    default: {
        deleteAlias: (...args: unknown[]) => mockDeleteAlias(...args),
        stopPush: (...args: unknown[]) => mockStopPush(...args),
        clearLocalNotifications: (...args: unknown[]) => mockClearLocalNotifications(...args),
        clearAllNotifications: (...args: unknown[]) => mockClearAllNotifications(...args),
        setBadge: (...args: unknown[]) => mockSetBadge(...args),
        addConnectEventListener: (...args: unknown[]) => mockAddConnectEventListener(...args),
        addNotificationListener: (...args: unknown[]) => mockAddNotificationListener(...args),
        init: jest.fn(),
        setBackgroundEnable: jest.fn(),
        setLoggerEnable: jest.fn(),
        getRegistrationID: jest.fn(),
    },
}));

jest.mock('@mattermost/rnutils', () => ({
    __esModule: true,
    default: {
        clearAllDeliveredNotifications: jest.fn(),
    },
}));

jest.mock('@actions/remote/notifications', () => ({
    openNotification: jest.fn(),
}));

jest.mock('@init/push_notifications', () => ({
    handleInAppNotification: jest.fn(),
}));

jest.mock('@store/ephemeral_store', () => ({
    __esModule: true,
    default: {
        clearPendingJPushNotification: jest.fn(),
        setPendingJPushNotification: jest.fn(),
    },
}));

jest.mock('@store/navigation_store', () => ({
    __esModule: true,
    default: {
        getScreensInStack: jest.fn(() => []),
        getVisibleScreen: jest.fn(() => ''),
    },
}));

jest.mock('@utils/notification/message_notification_pref', () => ({
    areSystemNotificationsEnabled: jest.fn(() => Promise.resolve(true)),
    JPUSH_NEW_MESSAGE_CHANNEL_ID: 'test-channel',
}));

import JPushManager from './jpush';

type JPushManagerInternals = {
    initialized: boolean;
    listenersAttached: boolean;
    appReady: boolean;
    pendingColdStartNotification: unknown;
};

const baseNotification = {
    messageID: 'msg-1',
    title: 'Alice',
    content: 'Hello',
    badge: '0',
    ring: '1',
    extras: {
        channel_id: 'channel-1',
        post_id: 'post-1',
        sender_name: 'Alice',
        sender_id: 'user-1',
        message: 'Hello',
    },
    notificationEventType: 'notificationOpened' as const,
};

describe('JPushManager logout cleanup', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        JPushManager.setLoggedIn(false);
        (JPushManager as unknown as JPushManagerInternals).initialized = false;
        (JPushManager as unknown as JPushManagerInternals).listenersAttached = false;
        (JPushManager as unknown as JPushManagerInternals).appReady = false;
        (JPushManager as unknown as JPushManagerInternals).pendingColdStartNotification = null;
    });

    it('resetForLogout clears login state, pending notification, and ephemeral store', () => {
        JPushManager.setLoggedIn(true);
        (JPushManager as unknown as JPushManagerInternals).pendingColdStartNotification = baseNotification;

        JPushManager.resetForLogout('test');

        expect(JPushManager.isLoggedIn()).toBe(false);
        expect((JPushManager as unknown as JPushManagerInternals).pendingColdStartNotification).toBeNull();
        expect(EphemeralStore.clearPendingJPushNotification).toHaveBeenCalled();
        expect(mockClearLocalNotifications).toHaveBeenCalled();
        expect(mockClearAllNotifications).toHaveBeenCalled();
        expect(mockSetBadge).toHaveBeenCalledWith({badge: 0, appBadge: 0});
    });

    it('resetForLogout deletes alias and stops push when SDK is initialized', () => {
        (JPushManager as unknown as JPushManagerInternals).initialized = true;
        const originalOS = Platform.OS;
        Platform.OS = 'android';

        JPushManager.resetForLogout('terminateSession');

        expect(mockDeleteAlias).toHaveBeenCalledWith(expect.objectContaining({sequence: expect.any(Number)}));
        expect(mockStopPush).toHaveBeenCalled();

        Platform.OS = originalOS;
    });

    it('resetForLogout skips alias deletion when SDK is not initialized', () => {
        (JPushManager as unknown as JPushManagerInternals).initialized = false;

        JPushManager.resetForLogout('terminateSession');

        expect(mockDeleteAlias).not.toHaveBeenCalled();
        expect(mockStopPush).not.toHaveBeenCalled();
    });

    it('markAppReady keeps pending cold start notification until login is restored', () => {
        (JPushManager as unknown as JPushManagerInternals).pendingColdStartNotification = baseNotification;
        JPushManager.setLoggedIn(false);

        JPushManager.markAppReady();

        expect((JPushManager as unknown as JPushManagerInternals).pendingColdStartNotification).toBe(baseNotification);
    });

    it('stores opened notification during cold start before login is restored', () => {
        JPushManager.setLoggedIn(false);
        (JPushManager as unknown as JPushManagerInternals).appReady = false;
        (JPushManager as unknown as {setupListeners: () => void}).setupListeners();
        const notificationListener = mockAddNotificationListener.mock.calls[0][0];

        notificationListener(baseNotification);

        expect((JPushManager as unknown as JPushManagerInternals).pendingColdStartNotification).toBe(baseNotification);
    });

    it('does not mark app ready when initial launch checks for pending notification', () => {
        JPushManager.setLoggedIn(false);

        expect(JPushManager.getPendingColdStartNotification()).toBeNull();

        expect((JPushManager as unknown as JPushManagerInternals).appReady).toBe(false);
    });
});
