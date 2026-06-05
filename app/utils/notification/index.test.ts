// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import moment from 'moment-timezone';
import {createIntl} from 'react-intl';
import {DeviceEventEmitter} from 'react-native';

import {Events} from '@constants';
import {DEFAULT_LOCALE, getTranslations} from '@i18n';
import {showNotificationChannelNotFoundSnackbar} from '@utils/snack_bar';

import {
    convertToNotificationData,
    notificationError,
    emitNotificationError,
    scheduleExpiredNotification,
} from '.';

jest.mock('@init/push_notifications', () => ({
    scheduleNotification: jest.fn(),
}));

jest.mock('@utils/snack_bar', () => ({
    showNotificationChannelNotFoundSnackbar: jest.fn(),
}));

describe('Notification Utils', () => {
    const intl = createIntl({locale: DEFAULT_LOCALE, messages: getTranslations(DEFAULT_LOCALE)});
    const notification = {
        identifier: 'id',
        payload: {
            ack_id: 'ack_id',
            channel_id: 'channel_id',
            channel_name: 'channel_name',
            from_webhook: true,
            message: 'Test message',
            override_icon_url: 'icon_url',
            override_username: 'username',
            post_id: 'post_id',
            root_id: 'root_id',
            sender_id: 'sender_id',
            sender_name: 'sender_name',
            server_id: 'server_id',
            server_url: 'server_url',
            team_id: 'team_id',
            type: 'message',
            sub_type: 'sub_type',
            use_user_icon: true,
            version: '1.0',
            is_crt_enabled: 'true',
            data: {},
        },
        body: 'body',
    };

    const session = {
        expires_at: moment().add(10, 'hours').valueOf(),
    };

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('convertToNotificationData', () => {
        it('should convert notification with payload to NotificationWithData', () => {
            const result = convertToNotificationData(notification as any, true);
            const not = {...notification};
            Reflect.deleteProperty(not.payload, 'is_crt_enabled');
            expect(result).toEqual({
                ...not,
                payload: {
                    ...not.payload,
                    identifier: 'id',
                    isCRTEnabled: true,
                    message: 'Test message',
                },
                userInteraction: true,
                foreground: false,
            });
        });

        it('should return the original notification if no payload is present', () => {
            const result = convertToNotificationData({identifier: 'id'} as any, false);
            expect(result).toEqual({identifier: 'id'});
        });
    });

    describe('notificationError', () => {
        it('should show snackbar for Channel type', () => {
            notificationError(intl, 'Channel');
            expect(showNotificationChannelNotFoundSnackbar).toHaveBeenCalled();
        });

        it('should show snackbar for Team type', () => {
            notificationError(intl, 'Team');
            expect(showNotificationChannelNotFoundSnackbar).toHaveBeenCalled();
        });

        it('should show snackbar for Post type', () => {
            notificationError(intl, 'Post');
            expect(showNotificationChannelNotFoundSnackbar).toHaveBeenCalled();
        });

        it('should show snackbar for Connection type', () => {
            notificationError(intl, 'Connection');
            expect(showNotificationChannelNotFoundSnackbar).toHaveBeenCalled();
        });
    });

    describe('emitNotificationError', () => {
        it('should emit notification error after 500ms', (done) => {
            const spyEmit = jest.spyOn(DeviceEventEmitter, 'emit');
            emitNotificationError('Channel');
            setTimeout(() => {
                expect(spyEmit).toHaveBeenCalledWith(Events.NOTIFICATION_ERROR, 'Channel');
                done();
            }, 600); // wait a little longer than 500ms to ensure the timeout has executed
        });
    });

    describe('scheduleExpiredNotification', () => {
        it('should schedule a notification for session expiration with hours', () => {
            const result = scheduleExpiredNotification('server_url', session as any, 'ServerName', 'en');
            expect(scheduleNotification).toHaveBeenCalledWith(expect.objectContaining({
                fireDate: new Date(session.expires_at).toISOString(),
                body: 'Please log in to continue receiving notifications. Sessions for ServerName are configured to expire every 10 hours.',
                title: 'Session Expired',
            }));
            expect(result).toBeDefined();
        });

        it('should return 0 if expiresAt is not defined', () => {
            const result = scheduleExpiredNotification('server_url', {} as any, 'ServerName', 'en');
            expect(result).toBe(0);
        });
    });
});
