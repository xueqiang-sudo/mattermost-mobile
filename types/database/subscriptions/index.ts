// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Subscription} from 'rxjs';

export type UnreadMessages = {
    mentions: number;
    unread: boolean;
    /** 非静音未读频道总数 */
    unreadCount: number;
};

export type UnreadSubscription = UnreadMessages & {
    subscription?: Subscription;
};
