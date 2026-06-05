// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Linking, NativeModules, Platform} from 'react-native';
import {checkNotifications, RESULTS} from 'react-native-permissions';

import RNUtils from '@mattermost/rnutils';

import {storeGlobal} from '@actions/app/global';
import {GLOBAL_IDENTIFIERS} from '@constants/database';
import {queryGlobalValue} from '@queries/app/global';
import {logDebug, logError} from '@utils/log';

/** Android 新消息通知渠道 ID（与 CustomPushNotificationHelper.CHANNEL_JPUSH_NEW_MESSAGE_ID 一致） */
export const JPUSH_NEW_MESSAGE_CHANNEL_ID = 'jpush_new_message_v5';

/** Android 应用包名 */
export const ANDROID_APP_PACKAGE = 'com.optibot.cn';

const ANDROID_APP_NOTIFICATION_SETTINGS_ACTION = 'android.settings.APP_NOTIFICATION_SETTINGS';
const ANDROID_EXTRA_APP_PACKAGE = 'android.provider.extra.APP_PACKAGE';

/**
 * Android：打开系统「应用通知」页（应用维度的通知开关/样式入口）。
 */
async function openAndroidAppNotificationSettings(): Promise<boolean> {
    if (Platform.OS !== 'android') {
        return false;
    }
    try {
        await Linking.sendIntent(ANDROID_APP_NOTIFICATION_SETTINGS_ACTION, [
            {key: ANDROID_EXTRA_APP_PACKAGE, value: ANDROID_APP_PACKAGE},
        ]);
        return true;
    } catch (error) {
        logError('[message_notification_pref.openAndroidAppNotificationSettings] sendIntent 失败，回退 openSettings', error);
        try {
            await Linking.openSettings();
            return true;
        } catch (fallbackError) {
            logError('[message_notification_pref.openAndroidAppNotificationSettings] Linking.openSettings 失败', fallbackError);
            return false;
        }
    }
}

/** 打开系统通知设置页（用户可在系统层面设置横幅、锁屏、响铃等） */
export async function openAppNotificationSettings(): Promise<boolean> {
    return openAndroidAppNotificationSettings();
}

type RNUtilsWithNotificationManagementSettings = {
    openNotificationManagementSettings?: (packageName: string) => Promise<boolean>;
};

/**
 * Android：打开系统「通知管理」页（横幅、锁屏、桌面角标、响铃等，系统层面入口）。
 *
 * 目标是替换掉此前与 openAppNotificationSettings 共用同一 Intent 的问题。
 */
async function openAndroidNotificationManagementSettings(): Promise<boolean> {
    if (Platform.OS !== 'android') {
        return false;
    }

    try {
        const opened = await (RNUtils as unknown as RNUtilsWithNotificationManagementSettings)
            .openNotificationManagementSettings?.(ANDROID_APP_PACKAGE);

        // 如果原生方法不存在或返回 false，继续回退链路。
        if (opened) {
            return true;
        }
    } catch (error) {
        logError('[message_notification_pref.openAndroidNotificationManagementSettings] RNUtils 调用失败，回退', error);
    }

    // 回退 1：仍然尝试标准 APP_NOTIFICATION_SETTINGS（至少能把用户带到通知设置附近）。
    try {
        return await openAndroidAppNotificationSettings();
    } catch {
        // ignore
    }

    // 回退 2：兜底到应用设置页。
    try {
        await Linking.openSettings();
        return true;
    } catch (error) {
        logError('[message_notification_pref.openAndroidNotificationManagementSettings] Linking.openSettings 失败', error);
        return false;
    }
}

/** 打开系统「通知管理」总页（横幅、锁屏、响铃等，非单个 channel 详情） */
export async function openMessageNotificationChannelSettings(): Promise<boolean> {
    return openAndroidNotificationManagementSettings();
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
