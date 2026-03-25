// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Q} from '@nozbe/watermelondb';
import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import {of as of$} from 'rxjs';
import {map, switchMap, combineLatestWith} from 'rxjs/operators';

import {MM_TABLES} from '@constants/database';
import {queryUsersOnChannel} from '@queries/servers/channel';
import {observeCurrentUserId} from '@queries/servers/system';
import {queryUsersById} from '@queries/servers/user';

import GmAvatarGrid from './gm_avatar_grid';

import type {WithDatabaseArgs} from '@typings/database/database';

type Props = WithDatabaseArgs & {
    channelId: string;
    channelName?: string;
    expectedCount?: number;
    size: number;
    isOnCenterBg?: boolean;
    isUnread?: boolean;
    isMuted?: boolean;
    style?: import('react-native').StyleProp<import('react-native').ViewStyle>;
};

const enhanced = withObservables(['channelId', 'channelName'], ({channelId, channelName, database}: Props) => {
    const {SERVER: {POST}} = MM_TABLES;
    const currentUserId = observeCurrentUserId(database);

    const users = currentUserId.pipe(
        switchMap((userId) => {
            const usersFromMembership = queryUsersOnChannel(database, channelId).observeWithColumns(['last_picture_update']);

            const parsedUserIds = (channelName || '').split('__').filter(Boolean);
            const usersFromChannelName = parsedUserIds.length ? queryUsersById(database, parsedUserIds).observeWithColumns(['last_picture_update']) : of$([]);
            const recentPostUserIds = database.get(POST).query(
                Q.where('channel_id', channelId),
                Q.where('delete_at', 0),
                Q.sortBy('create_at', Q.desc),
                Q.take(60),
            ).observeWithColumns(['user_id']).pipe(
                map((posts) => [...new Set(posts.map((post) => post.userId).filter(Boolean))]),
            );

            return usersFromMembership.pipe(
                combineLatestWith(usersFromChannelName),
                combineLatestWith(recentPostUserIds),
                switchMap(([[membershipUsers, fallbackUsers], postUserIds]) => {
                    const usersFromRecentPosts = postUserIds.length ? queryUsersById(database, postUserIds).observeWithColumns(['last_picture_update']) : of$([]);
                    return usersFromRecentPosts.pipe(
                        map((recentUsers) => {
                    const mergedUsers = [...membershipUsers];
                    const seenIds = new Set(mergedUsers.map((u) => u.id));
                    for (const user of fallbackUsers) {
                        if (!seenIds.has(user.id)) {
                            mergedUsers.push(user);
                            seenIds.add(user.id);
                        }
                    }
                    for (const user of recentUsers) {
                        if (!seenIds.has(user.id)) {
                            mergedUsers.push(user);
                            seenIds.add(user.id);
                        }
                    }

                    const sorted = [...mergedUsers].sort((a, b) => (a.id === userId ? -1 : 0) - (b.id === userId ? -1 : 0));
                    return sorted.slice(0, 9);
                        }),
                    );
                }),
            );
        }),
    );

    return {users};
});

export default withDatabase(enhanced(GmAvatarGrid));
