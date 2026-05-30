// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {PushNotification} from '@constants';

import {
    buildNotificationFromJPushExtras,
    hasRequiredJPushExtras,
} from './jpush_notification';

describe('jpush_notification', () => {
    const baseNotification = {
        messageID: 'msg-1',
        title: 'Alice',
        content: 'Hello',
        extras: {
            channel_id: 'channel-1',
            post_id: 'post-1',
            sender_name: 'Alice',
            sender_id: 'user-1',
            message: 'Hello',
        },
    };

    it('should validate required jpush extras', () => {
        expect(hasRequiredJPushExtras(baseNotification.extras, baseNotification.content)).toBe(true);
        expect(hasRequiredJPushExtras({...baseNotification.extras, channel_id: ''}, baseNotification.content)).toBe(false);
        expect(hasRequiredJPushExtras({...baseNotification.extras, message: ''}, 'fallback body')).toBe(true);
    });

    it('should build notification payload with configured server url', () => {
        const data = buildNotificationFromJPushExtras(baseNotification, 'https://mm.example.com');

        expect(data.payload?.channel_id).toBe('channel-1');
        expect(data.payload?.post_id).toBe('post-1');
        expect(data.payload?.root_id).toBe('post-1');
        expect(data.payload?.server_url).toBe('https://mm.example.com');
        expect(data.payload?.type).toBe(PushNotification.NOTIFICATION_TYPE.MESSAGE);
        expect(data.userInteraction).toBe(true);
    });
});
