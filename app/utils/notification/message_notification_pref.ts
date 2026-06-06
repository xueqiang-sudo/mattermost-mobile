// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Linking, NativeModules, Platform} from 'react-native';
import {checkNotifications, RESULTS} from 'react-native-permissions';
import Permissions from 'react-native-permissions';

import {storeGlobal} from '@actions/app/global';
import {GLOBAL_IDENTIFIERS} from '@constants/database';
import {queryGlobalValue} from '@queries/app/global';
import {logDebug, logError} from '@utils/log';

/** Android 新消息通知渠道 ID（与 CustomPushNotificationHelper.CHANNEL_JPUSH_NEW_MESSAGE_ID 一致） */
export const JPUSH_NEW_MESSAGE_CHANNEL_ID = 'jpush_new_message_v5';

/** Android 应用包名 */
export const ANDROID_APP_PACKAGE = 'com.optibot.cn';

/** 打开系统应用通知设置页（「消息通知」开关使用） */
export async function openAppNotificationSettings(): Promise<boolean> {
    // if (Platform.OS !== 'android') {
    //     try {
    //         await Linking.openSettings();
    //         return true;
    //     } catch (fallbackError) {
    //         logError('[message_notification_pref.openAppNotificationSettings] Linking.openSettings 失败', fallbackError);
    //         return false;
    //     }
    // }
    try {
        logDebug('[message_notification_pref.openAppNotificationSettings] try Permissions.openSettings notifications');
        await Permissions.openSettings('notifications');
        logDebug('[message_notification_pref.openAppNotificationSettings] Permissions.openSettings notifications 成功');
        return true;
    } catch (error) {
        logError('[message_notification_pref.openAppNotificationSettings] sendIntent 失败，回退 openSettings', error);
        try {
            logDebug('[message_notification_pref.openAppNotificationSettings] try Linking.openSettings');
            await Linking.openSettings();
            logDebug('[message_notification_pref.openAppNotificationSettings] Linking.openSettings 成功');
            return true;
        } catch (fallbackError) {
            logError('[message_notification_pref.openAppNotificationSettings] Linking.openSettings 失败', fallbackError);
            return false;
        }
    }
}

/** 打开系统设置页（「消息提醒方式」使用，打开应用信息页） */
export async function openMessageNotificationChannelSettings(): Promise<boolean> {
    try {
        logDebug('[message_notification_pref.openMessageNotificationChannelSettings] try Linking.openSettings');
        await Linking.openSettings();
        logDebug('[message_notification_pref.openMessageNotificationChannelSettings] Linking.openSettings 成功');
        return true;
    } catch (error) {
        logError('[message_notification_pref.openMessageNotificationChannelSettings] Linking.openSettings 失败', error);
        return false;
    }
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

type JPushModuleWithNotificationCheck = {
    isNotificationEnabled?: (callback: (enabled: boolean) => void) => void;
};

/**
 * 系统级通知是否可用（应用通知总开关 + Android 13+ POST_NOTIFICATIONS）。
 * 与设置页「通知已禁用」横幅判断一致。
 */
export async function areSystemNotificationsEnabled(): Promise<boolean> {
    try {
        const {status} = await checkNotifications();
        const permissionGranted = status === RESULTS.GRANTED || status === RESULTS.LIMITED;
        logDebug('[message_notification_pref.areSystemNotificationsEnabled] 权限检查', {
            status,
            permissionGranted,
        });
        if (!permissionGranted) {
            return false;
        }

        if (Platform.OS === 'android') {
            const jpushModule = NativeModules.JPushModule as JPushModuleWithNotificationCheck | undefined;
            if (jpushModule?.isNotificationEnabled) {
                const jpushEnabled = await new Promise<boolean>((resolve) => {
                    jpushModule.isNotificationEnabled!((enabled) => {
                        resolve(Boolean(enabled));
                    });
                });
                logDebug('[message_notification_pref.areSystemNotificationsEnabled] JPush 应用通知开关', {
                    jpushEnabled,
                });
                return jpushEnabled;
            }
            logDebug('[message_notification_pref.areSystemNotificationsEnabled] 无 JPush isNotificationEnabled，视为已开启');
        }

        return true;
    } catch (error) {
        logError('[message_notification_pref.areSystemNotificationsEnabled]', error);
        return false;
    }
}
