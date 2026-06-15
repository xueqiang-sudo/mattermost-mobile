// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {type IntlShape} from 'react-intl';
import {DeviceEventEmitter} from 'react-native';

import {Events} from '@constants';
import {NOTIFICATION_TYPE} from '@constants/push_notification';
import {DEFAULT_LOCALE} from '@i18n';
import {showNotificationChannelNotFoundSnackbar} from '@utils/snack_bar';

export const convertToNotificationData = (notification: Notification, tapped = true): NotificationWithData => {
    if (!notification.payload) {
        return notification;
    }

    const {payload} = notification;
    const notificationData: NotificationWithData = {
        ...notification,
        payload: {
            ack_id: payload.ack_id,
            channel_id: payload.channel_id,
            channel_name: payload.channel_name,
            identifier: payload.identifier || notification.identifier,
            from_webhook: payload.from_webhook,
            message: ((payload.type === NOTIFICATION_TYPE.MESSAGE) ? payload.message || notification.body : payload.body),
            override_icon_url: payload.override_icon_url,
            override_username: payload.override_username,
            post_id: payload.post_id,
            root_id: payload.root_id,
            sender_id: payload.sender_id,
            sender_name: payload.sender_name,
            server_id: payload.server_id,
            server_url: payload.server_url,
            team_id: payload.team_id,
            type: payload.type,
            sub_type: payload.sub_type,
            use_user_icon: payload.use_user_icon,
            version: payload.version,
            isCRTEnabled: typeof payload.is_crt_enabled === 'string' ? payload.is_crt_enabled === 'true' : Boolean(payload.is_crt_enabled),
            data: payload.data,
        },
        userInteraction: tapped,
        foreground: false,
    };

    return notificationData;
};

export type NotificationErrorType = 'Team' | 'Channel' | 'OptibotChannel' | 'Connection' | 'Post';

export const notificationError = (_intl: IntlShape, _type: NotificationErrorType) => {
    showNotificationChannelNotFoundSnackbar();
};

export const emitNotificationError = (type: NotificationErrorType) => {
    const req = setTimeout(() => {
        DeviceEventEmitter.emit(Events.NOTIFICATION_ERROR, type);
        clearTimeout(req);
    }, 500);
};

/** 会话过期本地通知已关闭：仅使用 JPush 远端消息推送，不再调度「会话已过期」提醒。 */
export const scheduleExpiredNotification = async (_serverUrl: string, _session: Session, _serverName: string, _locale = DEFAULT_LOCALE) => {
    return '';
};
