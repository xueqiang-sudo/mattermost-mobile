// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {updateMe} from '@actions/remote/user';
import DatabaseManager from '@database/manager';
import {getCurrentUser} from '@queries/servers/user';
import {logDebug, logError, logInfo} from '@utils/log';
import {getNotificationProps} from '@utils/user';

import {
    areSystemNotificationsEnabled,
    setMessageNotificationEnabled,
} from './message_notification_pref';

export type PushSystemSyncResult = {
    push: UserNotifyPropsPush;
    changed: boolean;
    systemEnabled: boolean;
};

/**
 * 根据系统通知开关解析 notify_props.push：
 * - 系统关 → none
 * - 系统开且当前为 none → all
 * - 系统开且为 mention/all → 保持不变
 */
export function resolvePushForSystemState(
    systemEnabled: boolean,
    currentPush: UserNotifyPropsPush | string | undefined,
): UserNotifyPropsPush {
    if (!systemEnabled) {
        return 'none';
    }
    if (currentPush === 'mention' || currentPush === 'all') {
        return currentPush;
    }
    return 'all';
}

export async function syncNotifyPushWithSystemSettings(
    serverUrl: string,
    userId: string,
    notifyProps: UserNotifyProps,
    options?: {syncJPush?: boolean},
): Promise<PushSystemSyncResult> {
    const systemEnabled = await areSystemNotificationsEnabled();
    const currentPush = notifyProps.push as UserNotifyPropsPush | undefined;
    const push = resolvePushForSystemState(systemEnabled, currentPush);
    const changed = push !== currentPush;

    if (changed) {
        logInfo('[push_system_sync.syncNotifyPushWithSystemSettings] 更新 notify_props.push', {
            from: currentPush,
            to: push,
            systemEnabled,
        });
        const result = await updateMe(serverUrl, {
            notify_props: {
                ...notifyProps,
                push,
            },
        });
        if (result.error) {
            throw result.error;
        }
    } else {
        logDebug('[push_system_sync.syncNotifyPushWithSystemSettings] notify_props.push 已与系统通知一致', {
            push,
            systemEnabled,
        });
    }

    await setMessageNotificationEnabled(push !== 'none');

    if (options?.syncJPush !== false) {
        const JPushManager = (await import('@init/jpush')).default;
        await JPushManager.syncForNotifyPush(push, userId);
    }

    return {push, changed, systemEnabled};
}

/** 当前活跃用户：系统通知与 notify_props.push 双向对齐（登录后、回前台、设置页） */
export async function syncActiveUserPushWithSystemSettings(): Promise<PushSystemSyncResult | null> {
    try {
        const serverUrl = await DatabaseManager.getActiveServerUrl();
        if (!serverUrl) {
            return null;
        }

        const database = DatabaseManager.serverDatabases[serverUrl]?.database;
        if (!database) {
            return null;
        }

        const user = await getCurrentUser(database);
        const userId = user?.id;
        if (!userId) {
            return null;
        }

        const notifyProps = getNotificationProps(user);
        return await syncNotifyPushWithSystemSettings(serverUrl, userId, notifyProps);
    } catch (error) {
        logError('[push_system_sync.syncActiveUserPushWithSystemSettings]', error);
        return null;
    }
}
