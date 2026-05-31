// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Linking, NativeModules, Platform} from 'react-native';

import {storeGlobal} from '@actions/app/global';
import {GLOBAL_IDENTIFIERS} from '@constants/database';
import {queryGlobalValue} from '@queries/app/global';
import {logDebug, logError} from '@utils/log';

/** Android 新消息通知渠道 ID（与 CustomPushNotificationHelper.CHANNEL_JPUSH_NEW_MESSAGE_ID 一致） */
export const JPUSH_NEW_MESSAGE_CHANNEL_ID = 'jpush_new_message_v5';

export const ANDROID_APP_PACKAGE = 'com.optibot.cn';

type NotificationSettingsModule = {
    openMessageChannelSettings: () => Promise<boolean>;
};

async function openChannelSettingsViaLinking(): Promise<boolean> {
    if (Platform.OS !== 'android') {
        return false;
    }
    const intentConfigs = [
        {
            action: 'android.settings.CHANNEL_NOTIFICATION_SETTINGS',
            extras: [
                {key: 'android.provider.extra.APP_PACKAGE', value: ANDROID_APP_PACKAGE},
                {key: 'android.provider.extra.CHANNEL_ID', value: JPUSH_NEW_MESSAGE_CHANNEL_ID},
            ],
        },
        {
            action: 'android.settings.CHANNEL_NOTIFICATION_SETTINGS',
            extras: [
                {key: 'app_package', value: ANDROID_APP_PACKAGE},
                {key: 'channel_id', value: JPUSH_NEW_MESSAGE_CHANNEL_ID},
            ],
        },
        {
            action: 'android.settings.APP_NOTIFICATION_SETTINGS',
            extras: [
                {key: 'android.provider.extra.APP_PACKAGE', value: ANDROID_APP_PACKAGE},
                {key: 'android.provider.extra.CHANNEL_ID', value: JPUSH_NEW_MESSAGE_CHANNEL_ID},
            ],
        },
    ];
    for (const config of intentConfigs) {
        try {
            await Linking.sendIntent(config.action, config.extras);
            return true;
        } catch (_error) {
            // 尝试下一个 Intent
        }
    }
    logDebug('[message_notification_pref.openChannelSettingsViaLinking] 所有 Intent 均失败');
    return false;
}

async function openAppNotificationSettingsViaLinking(): Promise<boolean> {
    if (Platform.OS !== 'android') {
        return false;
    }
    const intentConfigs = [
        {
            action: 'android.settings.APP_NOTIFICATION_SETTINGS',
            extras: [
                {key: 'android.provider.extra.APP_PACKAGE', value: ANDROID_APP_PACKAGE},
            ],
        },
        {
            action: 'android.settings.APP_NOTIFICATION_SETTINGS',
            extras: [
                {key: 'app_package', value: ANDROID_APP_PACKAGE},
            ],
        },
    ];
    for (const config of intentConfigs) {
        try {
            await Linking.sendIntent(config.action, config.extras);
            return true;
        } catch (_error) {
            // 尝试下一个 Intent
        }
    }
    logDebug('[message_notification_pref.openAppNotificationSettingsViaLinking] 所有 Intent 均失败');
    return false;
}

export async function openMessageNotificationChannelSettings(): Promise<boolean> {
    if (Platform.OS !== 'android') {
        return false;
    }

    const notificationSettings = NativeModules.NotificationSettings as NotificationSettingsModule | undefined;
    if (notificationSettings?.openMessageChannelSettings) {
        try {
            await notificationSettings.openMessageChannelSettings();
            return true;
        } catch (error) {
            logError('[message_notification_pref.openMessageChannelSettings]', error);
        }
    }

    return openChannelSettingsViaLinking();
}

/** 打开本 App 通知管理页（非全局通知设置，避免华为落到「社交通讯」分类页） */
export async function openAppNotificationSettings(): Promise<boolean> {
    return openAppNotificationSettingsViaLinking();
}

export async function getMessageNotificationEnabled(): Promise<boolean> {
    try {
        const records = await queryGlobalValue(GLOBAL_IDENTIFIERS.MESSAGE_NOTIFICATION_ENABLED)?.fetch();
        if (!records?.length) {
            return true;
        }
        return Boolean(records[0].value);
    } catch {
        return true;
    }
}

export async function setMessageNotificationEnabled(enabled: boolean): Promise<void> {
    await storeGlobal(GLOBAL_IDENTIFIERS.MESSAGE_NOTIFICATION_ENABLED, enabled, false);
}
