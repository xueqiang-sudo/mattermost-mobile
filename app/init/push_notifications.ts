// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import RNUtils from '@mattermost/rnutils/src';
import {defineMessages} from 'react-intl';
import {AppState, DeviceEventEmitter, Platform, type EmitterSubscription} from 'react-native';
import {
    Notification,
    NotificationAction,
    NotificationBackgroundFetchResult,
    NotificationCategory,
    type NotificationCompletion,
    Notifications,
    type NotificationTextInput,
    type Registered,
    type RegistrationError,
} from 'react-native-notifications';
import {requestNotifications} from 'react-native-permissions';

import {storeDeviceToken} from '@actions/app/global';
import {markChannelAsViewed} from '@actions/local/channel';
import {backgroundNotification, openNotification} from '@actions/remote/notifications';
import {isCallsStartedMessage} from '@calls/utils';
import {Device, Events, Navigation, PushNotification, Screens} from '@constants';
import DatabaseManager from '@database/manager';
import {DEFAULT_LOCALE, getLocalizedMessage} from '@i18n';
import {getServerDisplayName} from '@queries/app/servers';
import {getCurrentChannelId} from '@queries/servers/system';
import {showOverlay} from '@screens/navigation';
import NavigationStore from '@store/navigation_store';
import {isBetaApp} from '@utils/general';
import {isMainActivity, isTablet} from '@utils/helpers';
import {logDebug, logInfo} from '@utils/log';
import {convertToNotificationData} from '@utils/notification';

const messages = defineMessages({
    replyTitle: {
        id: 'mobile.push_notification_reply.title',
        defaultMessage: 'Reply',
    },
    replyButton: {
        id: 'mobile.push_notification_reply.button',
        defaultMessage: 'Send',
    },
    replyPlaceholder: {
        id: 'mobile.push_notification_reply.placeholder',
        defaultMessage: 'Write a reply...',
    },
});

class PushNotificationsSingleton {
    configured = false;
    subscriptions?: EmitterSubscription[];

    init(register: boolean) {
        this.subscriptions?.forEach((v) => v.remove());
        this.subscriptions = [
            Notifications.events().registerNotificationOpened(this.onNotificationOpened),
            Notifications.events().registerRemoteNotificationsRegistered(this.onRemoteNotificationsRegistered),
            Notifications.events().registerNotificationReceivedBackground(this.onNotificationReceivedBackground),
            Notifications.events().registerNotificationReceivedForeground(this.onNotificationReceivedForeground),
            Notifications.events().registerRemoteNotificationsRegistrationFailed(this.NotificationsRegistrationFailed),
            Notifications.events().registerRemoteNotificationsRegistrationDenied(this.onRemoteNotificationsRegistrationDenied),
        ];

        if (register) {
            this.registerIfNeeded();
        }
    }

    async registerIfNeeded() {
        const isRegistered = await Notifications.isRegisteredForRemoteNotifications();
        if (!isRegistered) {
            await requestNotifications(['alert', 'sound', 'badge']);
        }
        Notifications.registerRemoteNotifications();
    }

    createReplyCategory = () => {
        const replyTitle = getLocalizedMessage(DEFAULT_LOCALE, messages.replyTitle.id);
        const replyButton = getLocalizedMessage(DEFAULT_LOCALE, messages.replyButton.id);
        const replyPlaceholder = getLocalizedMessage(DEFAULT_LOCALE, messages.replyPlaceholder.id);
        const replyTextInput: NotificationTextInput = {buttonTitle: replyButton, placeholder: replyPlaceholder};
        const replyAction = new NotificationAction(PushNotification.REPLY_ACTION, 'background', replyTitle, true, replyTextInput);
        return new NotificationCategory(PushNotification.CATEGORY, [replyAction]);
    };

    getServerUrlFromNotification = async (notification: NotificationWithData) => {
        const {payload} = notification;

        if (!payload?.channel_id && (!payload?.server_url || !payload.server_id)) {
            return payload?.server_url;
        }

        let serverUrl = payload.server_url;
        if (!serverUrl && payload.server_id) {
            serverUrl = await DatabaseManager.getServerUrlFromIdentifier(payload.server_id);
        }

        return serverUrl;
    };

    handleClearNotification = async (notification: NotificationWithData) => {
        const {payload} = notification;
        const serverUrl = await this.getServerUrlFromNotification(notification);

        if (serverUrl && payload?.channel_id) {
            markChannelAsViewed(serverUrl, payload.channel_id);
        }
    };

    handleInAppNotification = async (serverUrl: string, notification: NotificationWithData) => {
        const {payload} = notification;

        // Do not show overlay if this is a call-started message (the call_notification will alert the user)
        if (isCallsStartedMessage(payload)) {
            return;
        }

        const database = DatabaseManager.serverDatabases[serverUrl]?.database;
        if (database) {
            const isTabletDevice = isTablet();
            const displayName = await getServerDisplayName(serverUrl);
            const channelId = await getCurrentChannelId(database);
            let serverName;
            if (Object.keys(DatabaseManager.serverDatabases).length > 1) {
                serverName = displayName;
            }

            const isThreadNotification = Boolean(payload?.root_id);

            const isSameChannelNotification = payload?.channel_id === channelId;
            let isInChannelScreen = NavigationStore.getVisibleScreen() === Screens.CHANNEL;
            if (isTabletDevice) {
                isInChannelScreen = NavigationStore.getVisibleTab() === Screens.HOME;
            }

            const condition1 = !isInChannelScreen;
            const condition2 = isInChannelScreen && (!isSameChannelNotification || isThreadNotification);

            if (condition1 || condition2) {
                // Dismiss the screen if it's already visible or else it blocks the navigation
                DeviceEventEmitter.emit(Navigation.NAVIGATION_SHOW_OVERLAY);

                const screen = Screens.IN_APP_NOTIFICATION;
                const passProps = {
                    notification,
                    serverName,
                    serverUrl,
                };

                showOverlay(screen, passProps);
            }
        }
    };

    handleMessageNotification = async (notification: NotificationWithData) => {
        const {payload, foreground, userInteraction} = notification;
        const serverUrl = await this.getServerUrlFromNotification(notification);
        if (serverUrl) {
            if (foreground) {
                // Move this to a local action
                this.handleInAppNotification(serverUrl, notification);
            } else if (userInteraction && !payload?.userInfo?.local) {
                // Handle notification tapped
                openNotification(serverUrl, notification);
            } else {
                backgroundNotification(serverUrl, notification);
            }
        }
    };

    handleSessionNotification = async (notification: NotificationWithData) => {
        logInfo('Session expired notification');

        const serverUrl = await this.getServerUrlFromNotification(notification);

        if (serverUrl) {
            if (notification.userInteraction) {
                DeviceEventEmitter.emit(Events.SESSION_EXPIRED, serverUrl);
            } else {
                DeviceEventEmitter.emit(Events.SERVER_LOGOUT, {serverUrl});
            }
        }
    };

    processNotification = async (notification: NotificationWithData) => {
        const {payload} = notification;

        if (payload) {
            switch (payload.type) {
                case PushNotification.NOTIFICATION_TYPE.CLEAR:
                    this.handleClearNotification(notification);
                    break;
                case PushNotification.NOTIFICATION_TYPE.MESSAGE:
                    this.handleMessageNotification(notification);
                    break;
                case PushNotification.NOTIFICATION_TYPE.SESSION:
                    this.handleSessionNotification(notification);
                    break;
            }
        }
    };

    localNotification = (notification: Notification) => {
        Notifications.postLocalNotification(notification);
    };

    // This triggers when a notification is tapped and the app was in the background (iOS)
    onNotificationOpened = (incoming: Notification, completion: () => void) => {
        const notification = convertToNotificationData(incoming, false);
        notification.userInteraction = true;

        this.processNotification(notification);
        completion();
    };

    // This triggers when the app was in the background (iOS)
    onNotificationReceivedBackground = async (incoming: Notification, completion: (response: NotificationBackgroundFetchResult) => void) => {
        if (incoming.payload.verified === 'false') {
            logDebug('not handling background notification because it was not verified, ackId=', incoming.payload.ackId);
            return;
        }
        const notification = convertToNotificationData(incoming, false);
        this.processNotification(notification);

        completion(NotificationBackgroundFetchResult.NEW_DATA);
    };

    // This triggers when the app was in the foreground (Android and iOS)
    // Also triggers when the app was in the background (Android)
    onNotificationReceivedForeground = (incoming: Notification, completion: (response: NotificationCompletion) => void) => {
        if (incoming.payload.verified === 'false') {
            logDebug('not handling foreground notification because it was not verified, ackId=', incoming.payload.ackId);
            return;
        }
        const notification = convertToNotificationData(incoming, false);
        if (AppState.currentState !== 'inactive') {
            notification.foreground = AppState.currentState === 'active' && isMainActivity();

            this.processNotification(notification);
        }

        // Always play a sound, except when this is a foreground notification about a call
        const sound = !(notification.foreground && isCallsStartedMessage(notification.payload));
        completion({alert: false, sound, badge: true});
    };

    onRemoteNotificationsRegistered = async (event: Registered) => {
        if (!this.configured) {
            this.configured = true;
            const {deviceToken} = event;
            let prefix;

            if (Platform.OS === 'ios') {
                prefix = Device.PUSH_NOTIFY_APPLE_REACT_NATIVE;
                if (isBetaApp) {
                    prefix = `${prefix}beta`;
                }
            } else {
                prefix = Device.PUSH_NOTIFY_ANDROID_REACT_NATIVE;
            }

            const token = `${prefix}-v2:${deviceToken}`;
            storeDeviceToken(token);
            logDebug('Notification token registered', token);

            // Store the device token in the default database
            this.requestNotificationReplyPermissions();
        }
        return null;
    };

    onRemoteNotificationsRegistrationDenied = () => {
        logDebug('Notification registration denied');
    };

    NotificationsRegistrationFailed = (event: RegistrationError) => {
        logDebug('Notification registration failed', event);
    };

    removeChannelNotifications = async (serverUrl: string, channelId: string) => {
        RNUtils.removeChannelNotifications(serverUrl, channelId);
    };

    removeServerNotifications = (serverUrl: string) => {
        RNUtils.removeServerNotifications(serverUrl);
    };

    removeThreadNotifications = async (serverUrl: string, threadId: string) => {
        RNUtils.removeThreadNotifications(serverUrl, threadId);
    };

    requestNotificationReplyPermissions = () => {
        if (Platform.OS === 'ios') {
            const replyCategory = this.createReplyCategory();
            Notifications.setCategories([replyCategory]);
        }
    };

    scheduleNotification = (notification: Notification) => {
        if (notification.fireDate) {
            if (Platform.OS === 'ios') {
                notification.fireDate = new Date(notification.fireDate).toISOString();
            }

            return Notifications.postLocalNotification(notification);
        }

        return 0;
    };

    cancelScheduleNotification = (notificationId: number) => {
        Notifications.cancelLocalNotification(notificationId);
    };
}

const PushNotifications = new PushNotificationsSingleton();
export default PushNotifications;
