// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Linking, NativeModules, Platform} from 'react-native';
import {checkNotifications, RESULTS} from 'react-native-permissions';

import {storeGlobal} from '@actions/app/global';
import {GLOBAL_IDENTIFIERS} from '@constants/database';
import {queryGlobalValue} from '@queries/app/global';
import {logDebug, logError} from '@utils/log';

/** Android 新消息通知渠道 ID（与 CustomPushNotificationHelper.CHANNEL_JPUSH_NEW_MESSAGE_ID 一致） */
export const JPUSH_NEW_MESSAGE_CHANNEL_ID = 'jpush_new_message_v5';

/** Android「其他通知」渠道 ID（与 CustomPushNotificationHelper.CHANNEL_MIN_IMPORTANCE_ID 一致） */
export const ANDROID_OTHER_NOTIFICATION_CHANNEL_ID = 'channel_02';

export const ANDROID_APP_PACKAGE = 'com.optibot.cn';

type NotificationSettingsModule = {
    openAppNotificationSettings: () => Promise<boolean>;
    openMessageChannelSettings: () => Promise<boolean>;
    getResolvedMessageChannelId?: () => Promise<string>;
    isHuaweiLikeDevice?: () => Promise<boolean>;
    syncNotificationChannels?: () => Promise<boolean>;
};

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
            logDebug('[message_notification_pref.openAppNotificationSettingsViaLinking] 尝试 Intent', {
                action: config.action,
            });
            await Linking.sendIntent(config.action, config.extras);
            logDebug('[message_notification_pref.openAppNotificationSettingsViaLinking] 成功', {
                action: config.action,
            });
            return true;
        } catch (_error) {
            logDebug('[message_notification_pref.openAppNotificationSettingsViaLinking] 失败，尝试下一个', {
                action: config.action,
            });
        }
    }
    logDebug('[message_notification_pref.openAppNotificationSettingsViaLinking] 所有 Intent 均失败');
    return false;
}

/** 打开本 App 通知管理页（与微信一致：仅展示「新消息通知」「其他通知」） */
export async function openAppNotificationSettings(): Promise<boolean> {
    if (Platform.OS !== 'android') {
        logDebug('[message_notification_pref.openAppNotificationSettings] 非 Android，跳过');
        return false;
    }

    logDebug('[message_notification_pref.openAppNotificationSettings] 开始');
    const notificationSettings = NativeModules.NotificationSettings as NotificationSettingsModule | undefined;
    if (notificationSettings?.openAppNotificationSettings) {
        try {
            const opened = await notificationSettings.openAppNotificationSettings();
            logDebug('[message_notification_pref.openAppNotificationSettings] Native 模块结果', {opened});
            return opened;
        } catch (error) {
            logError('[message_notification_pref.openAppNotificationSettings] Native 模块异常', error);
        }
    } else {
        logDebug('[message_notification_pref.openAppNotificationSettings] 无 Native 模块，走 Linking 回退');
    }

    return openAppNotificationSettingsViaLinking();
}

/** 与原生 [MessageNotificationChannel.ensureAppNotificationChannels] 同步渠道 */
export async function syncAppNotificationChannels(): Promise<boolean> {
    if (Platform.OS !== 'android') {
        return false;
    }

    logDebug('[message_notification_pref.syncAppNotificationChannels] 开始');
    const notificationSettings = NativeModules.NotificationSettings as NotificationSettingsModule | undefined;
    if (!notificationSettings?.syncNotificationChannels) {
        logDebug('[message_notification_pref.syncAppNotificationChannels] 无 Native 模块，跳过');
        return false;
    }

    try {
        const synced = await notificationSettings.syncNotificationChannels();
        logDebug('[message_notification_pref.syncAppNotificationChannels] 完成', {synced});
        return synced;
    } catch (error) {
        logError('[message_notification_pref.syncAppNotificationChannels] 失败', error);
        return false;
    }
}

async function resolveMessageChannelIdForSettings(): Promise<string> {
    const notificationSettings = NativeModules.NotificationSettings as NotificationSettingsModule | undefined;
    if (notificationSettings?.getResolvedMessageChannelId) {
        try {
            const resolved = await notificationSettings.getResolvedMessageChannelId();
            if (resolved) {
                return resolved;
            }
        } catch (error) {
            logError('[message_notification_pref.resolveMessageChannelIdForSettings]', error);
        }
    }
    return JPUSH_NEW_MESSAGE_CHANNEL_ID;
}

async function openMessageChannelSettingsViaLinking(channelId: string): Promise<boolean> {
    if (Platform.OS !== 'android') {
        return false;
    }

    const intentAttempts: Array<{action: string; extras: Array<{key: string; value: string}>}> = [
        {
            action: 'android.settings.APP_NOTIFICATION_SETTINGS',
            extras: [
                {key: 'android.provider.extra.APP_PACKAGE', value: ANDROID_APP_PACKAGE},
                {key: 'android.provider.extra.CHANNEL_ID', value: channelId},
            ],
        },
        {
            action: 'android.settings.APP_NOTIFICATION_SETTINGS',
            extras: [
                {key: 'app_package', value: ANDROID_APP_PACKAGE},
                {key: 'channel_id', value: channelId},
            ],
        },
        {
            action: 'android.settings.CHANNEL_NOTIFICATION_SETTINGS',
            extras: [
                {key: 'android.provider.extra.APP_PACKAGE', value: ANDROID_APP_PACKAGE},
                {key: 'android.provider.extra.CHANNEL_ID', value: channelId},
            ],
        },
        {
            action: 'android.settings.CHANNEL_NOTIFICATION_SETTINGS',
            extras: [
                {key: 'app_package', value: ANDROID_APP_PACKAGE},
                {key: 'channel_id', value: channelId},
            ],
        },
    ];

    for (const {action, extras} of intentAttempts) {
        try {
            logDebug('[message_notification_pref.openMessageChannelSettingsViaLinking] 尝试 Intent', {
                action,
                channelId,
                extras: extras.map((e) => e.key),
            });
            await Linking.sendIntent(action, extras);
            logDebug('[message_notification_pref.openMessageChannelSettingsViaLinking] 成功', {action});
            return true;
        } catch (_error) {
            logDebug('[message_notification_pref.openMessageChannelSettingsViaLinking] 失败，尝试下一个', {action});
        }
    }
    return false;
}

/** 打开「新消息通知」渠道设置页（横幅、锁屏、响铃、提示音） */
export async function openMessageNotificationChannelSettings(): Promise<boolean> {
    if (Platform.OS !== 'android') {
        logDebug('[message_notification_pref.openMessageNotificationChannelSettings] 非 Android，跳过');
        return false;
    }

    logDebug('[message_notification_pref.openMessageNotificationChannelSettings] 开始');
    const notificationSettings = NativeModules.NotificationSettings as NotificationSettingsModule | undefined;
    if (notificationSettings?.openMessageChannelSettings) {
        try {
            const opened = await notificationSettings.openMessageChannelSettings();
            logDebug('[message_notification_pref.openMessageNotificationChannelSettings] Native 模块结果', {opened});
            if (opened) {
                return true;
            }
        } catch (error) {
            logError('[message_notification_pref.openMessageNotificationChannelSettings] Native 模块异常', error);
        }
    } else {
        logDebug('[message_notification_pref.openMessageNotificationChannelSettings] 无 Native 模块，走 Linking 回退');
    }

    if (notificationSettings?.isHuaweiLikeDevice) {
        try {
            const huaweiLike = await notificationSettings.isHuaweiLikeDevice();
            if (huaweiLike) {
                logDebug(
                    '[message_notification_pref.openMessageNotificationChannelSettings] 华为/鸿蒙设备跳过 Linking 兜底',
                );
                return false;
            }
        } catch (error) {
            logError('[message_notification_pref.openMessageNotificationChannelSettings] isHuaweiLikeDevice', error);
        }
    }

    const channelId = await resolveMessageChannelIdForSettings();
    if (await openMessageChannelSettingsViaLinking(channelId)) {
        return true;
    }

    logDebug('[message_notification_pref.openMessageNotificationChannelSettings] 渠道页全部失败，不回退应用总览');
    return false;
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
