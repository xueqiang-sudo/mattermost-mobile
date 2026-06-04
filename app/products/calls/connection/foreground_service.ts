// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import VIForegroundService from '@voximplant/react-native-foreground-service';

import {logError} from '@utils/log';

/** 与 Android [CustomPushNotificationHelper.CHANNEL_MIN_IMPORTANCE_ID]「其他通知」一致 */
const channelConfig = {
    id: 'channel_02',
    name: '其他通知',
    description: '其他通知',
    enableVibration: false,
};

// Note: multiple calls with same arguments are a noop.
export const foregroundServiceSetup = () => {
    VIForegroundService.getInstance().createNotificationChannel(channelConfig);
};

export const foregroundServiceStart = async () => {
    const notificationConfig = {
        channelId: 'channel_02',
        id: 345678,
        title: 'Optibot',
        text: 'Optibot Calls Microphone',
        icon: '',
        button: 'Stop',
    };
    try {
        await VIForegroundService.getInstance().startService(notificationConfig);
    } catch (e) {
        logError('Calls: Cannot start ForegroundService, error:', e);
    }
};

export const foregroundServiceStop = async () => {
    await VIForegroundService.getInstance().stopService();
};
