// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {CONNECT_URL} from '@env';

import LocalConfig from '@assets/config.json';
import {PushNotification} from '@constants';
import {getActiveServerUrl} from '@init/credentials';

export type JPushNotificationEventShape = {
    messageID: string;
    title: string;
    content: string;
    extras: Record<string, string>;
};

/** 与 launch.ts 一致：优先 CONNECT_URL / DefaultServerUrl，再回退当前已登录服务器 */
export async function resolveJPushServerUrl(): Promise<string | undefined> {
    const configured = CONNECT_URL || LocalConfig.DefaultServerUrl;
    if (configured) {
        return configured;
    }
    return getActiveServerUrl();
}

export function hasRequiredJPushExtras(extras: Record<string, string>, content?: string): boolean {
    return Boolean(
        extras.channel_id?.trim() &&
        extras.post_id?.trim() &&
        extras.sender_name?.trim() &&
        extras.sender_id?.trim() &&
        (extras.message?.trim() || content?.trim()),
    );
}

/**
 * 将 JPush extras 组装为 openNotification / launchAppFromNotification 所需结构。
 * 推送 extras 仅需：channel_id、post_id、sender_name、sender_id、message；server_url 由客户端配置注入。
 */
export function buildNotificationFromJPushExtras(
    notification: JPushNotificationEventShape,
    serverUrl: string,
    options?: {userInteraction?: boolean; foreground?: boolean},
): NotificationWithData {
    const {extras} = notification;
    const channelId = extras.channel_id;
    const postId = extras.post_id;
    const message = extras.message?.trim() || notification.content;
    const userInteraction = options?.userInteraction ?? true;
    const foreground = options?.foreground ?? false;

    return {
        identifier: notification.messageID,
        body: message,
        title: notification.title || extras.sender_name,
        payload: {
            ack_id: postId || '',
            channel_id: channelId,
            post_id: postId,
            root_id: postId,
            sender_id: extras.sender_id,
            sender_name: extras.sender_name,
            message,
            server_url: serverUrl,
            type: PushNotification.NOTIFICATION_TYPE.MESSAGE,
        },
        userInteraction,
        foreground,
    } as unknown as NotificationWithData;
}
