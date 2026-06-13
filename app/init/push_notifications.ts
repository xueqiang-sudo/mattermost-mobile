// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import RNUtils from '@mattermost/rnutils';
import {Platform} from 'react-native';
import {checkNotifications, requestNotifications, RESULTS} from 'react-native-permissions';
import JPush from 'jpush-react-native';

import {storeConfig} from '@actions/app/config';
import {ACTIVE_SERVER_URL_KEY} from '@constants/database';
import DatabaseManager from '@database/manager';
import EphemeralStore from '@store/ephemeral_store';
import {areSystemNotificationsEnabled} from '@utils/notification/message_notification_pref';
import {logDebug, logError} from '@utils/log';

import type {NotificationData, NotificationWithData} from '@typings/notification';

const TAG = '[PushNotifications]';

/** 请求通知权限（适用于初始化时） */
export async function requestPermissionIfNeeded() {
    if (Platform.OS === 'android') {
        return;
    }

    const enabled = await areSystemNotificationsEnabled();
    if (enabled) {
        return;
    }

    try {
        const result = await requestNotifications(['alert', 'sound', 'badge']);
        if (result.status !== RESULTS.GRANTED) {
            logDebug(`${TAG} 通知权限请求被拒绝`, result);
        }
    } catch (error) {
        logError(`${TAG} 通知权限请求失败`, error);
    }
}

/** 注册远程通知（JPush SDK 内部处理注册，仅需检查权限状态） */
export async function registerIfNeeded() {
    if (Platform.OS === 'android') {
        return;
    }

    const {status} = await checkNotifications();
    if (status === RESULTS.DENIED) {
        await requestNotifications(['alert', 'sound', 'badge']);
    }

    // JPush SDK 内部处理远程通知注册
    JPush.resumePush();
}

/** 处理前台接收到的通知，更新应用内数据 */
export async function handleInAppNotification(serverUrl: string, notification: NotificationWithData) {
    try {
        // 更新应用内配置（如通知计数等）
        await storeConfig(serverUrl);
    } catch (error) {
        logError(`${TAG} handleInAppNotification 失败`, error);
    }
}

/** 处理通知跳转 */
export function handleNotificationPress(notification: NotificationData) {
    const serverUrl = notification.payload?.server_url || notification.payload?.serverUrl;
    if (serverUrl) {
        EphemeralStore.setCurrentServerUrl(serverUrl);
    }
}

/** 移除指定频道的通知 */
export async function removeChannelNotifications(serverUrl: string, channelId: string) {
    try {
        RNUtils.removeChannelNotifications(serverUrl, channelId);
    } catch (error) {
        logError(`${TAG} removeChannelNotifications 失败`, error);
    }
}

/** 移除指定服务器的通知 */
export async function removeServerNotifications(serverUrl: string) {
    try {
        RNUtils.removeServerNotifications(serverUrl);
    } catch (error) {
        logError(`${TAG} removeServerNotifications 失败`, error);
    }
}

/** 移除指定帖子的通知 */
export async function removeThreadNotifications(serverUrl: string, rootId: string) {
    try {
        RNUtils.removeThreadNotifications(serverUrl, rootId);
    } catch (error) {
        logError(`${TAG} removeThreadNotifications 失败`, error);
    }
}

/** 以 JPush 本地通知方式调度一个通知，返回实际使用的 messageID */
export async function scheduleNotification(notification: LocalNotificationData): Promise<string | undefined> {
    if (Platform.OS === 'android') {
        return undefined;
    }

    try {
        const messageID = notification.id?.toString() || String(Date.now());
        JPush.addLocalNotification({
            messageID,
            title: notification.title || '',
            content: notification.body || '',
            extras: notification.userInfo || {},
            fireTime: notification.fireDate ? new Date(notification.fireDate) : new Date(Date.now() + 1000),
        });
        return messageID;
    } catch (error) {
        logError(`${TAG} scheduleNotification 失败`, error);
        return undefined;
    }
}

/** 取消已调度的本地通知 */
export async function cancelScheduleNotification(notificationId: string) {
    if (Platform.OS === 'android') {
        return;
    }

    const messageID = String(notificationId).trim();
    if (!messageID || messageID === 'NaN' || messageID === 'undefined') {
        logDebug(`${TAG} cancelScheduleNotification 跳过无效 messageID`, messageID);
        return;
    }

    try {
        JPush.removeLocalNotification({messageID});
    } catch (error) {
        logError(`${TAG} cancelScheduleNotification 失败`, error);
    }
}

/** 立即发送本地通知 */
export async function localNotification(notification: LocalNotificationData) {
    await scheduleNotification(notification);
}

interface LocalNotificationData {
    id?: string | number;
    title?: string;
    body?: string;
    userInfo?: Record<string, unknown>;
    fireDate?: number;
}