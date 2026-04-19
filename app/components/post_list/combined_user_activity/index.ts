// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import React from 'react';
import {combineLatest, of as of$} from 'rxjs';
import {map, switchMap} from 'rxjs/operators';

import {Permissions} from '@constants';
import {observeChannel} from '@queries/servers/channel';
import {queryPostsById} from '@queries/servers/post';
import {observePermissionForPost} from '@queries/servers/role';
import {observeCurrentUserId} from '@queries/servers/system';
import {observeUser, queryUsersByIdsOrUsernames} from '@queries/servers/user';
import {generateCombinedPost, getPostIdsForCombinedUserActivityPost, isUserActivityProp} from '@utils/post_list';

import CombinedUserActivity from './combined_user_activity';

import type {WithDatabaseArgs} from '@typings/database/database';
import type UserModel from '@typings/database/models/servers/user';

const withCombinedPosts = withObservables(['postId'], ({database, postId}: WithDatabaseArgs & {postId: string}) => {
    const currentUserId = observeCurrentUserId(database);
    const currentUser = currentUserId.pipe(
        switchMap((value) => observeUser(database, value)),
    );

    const postIds = getPostIdsForCombinedUserActivityPost(postId);

    // Columns observed: `props` is used by `usernamesById`. `message` is used by generateCombinedPost.
    const posts = queryPostsById(database, postIds).observeWithColumns(['props', 'message']);
    const post = posts.pipe(map((ps) => (ps.length ? generateCombinedPost(postId, ps) : null)));
    const channelType = post.pipe(
        switchMap((p) => {
            const channelId = p?.channel_id;
            if (!channelId) {
                return of$(undefined);
            }
            return observeChannel(database, channelId).pipe(
                map((ch) => ch?.type),
            );
        }),
    );
    const canDelete = combineLatest([posts, currentUser]).pipe(
        switchMap(([ps, u]) => (ps.length ? observePermissionForPost(database, ps[0], u, Permissions.DELETE_OTHERS_POSTS, false) : of$(false))),
    );

    const usersById = post.pipe(
        switchMap(
            (p) => {
                const userActivity = isUserActivityProp(p?.props?.user_activity) ? p.props.user_activity : undefined;
                if (!userActivity) {
                    return of$<Record<string, UserModel>>({});
                }
                return queryUsersByIdsOrUsernames(database, userActivity.allUserIds, userActivity.allUsernames).observeWithColumns(['username', 'nickname', 'first_name', 'last_name']).
                    pipe(
                        switchMap((users) => {
                            return of$(users.reduce((acc: Record<string, UserModel>, user) => {
                                acc[user.id] = user;
                                return acc;
                            }, {}));
                        }),
                    );
            },
        ),
    );

    return {
        canDelete,
        channelType,
        currentUserId,
        post,
        usersById,
    };
});

export default React.memo(withDatabase(withCombinedPosts(CombinedUserActivity)));
