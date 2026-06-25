// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Q} from '@nozbe/watermelondb';
import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import React from 'react';
import {combineLatest, of as of$} from 'rxjs';
import {switchMap, distinctUntilChanged} from 'rxjs/operators';

import {Preferences} from '@constants';
import {getAdvanceSettingPreferenceAsBool} from '@helpers/api/preference';
import {observeMyChannel, observeChannelSettings} from '@queries/servers/channel';
import {queryPostsBetween, queryPostsInChannel} from '@queries/servers/post';
import {queryAdvanceSettingsPreferences} from '@queries/servers/preference';
import {observeIsCRTEnabled} from '@queries/servers/thread';

import ChannelPostList from './channel_post_list';

import type {WithDatabaseArgs} from '@typings/database/database';

const enhanced = withObservables(['channelId'], ({database, channelId}: {channelId: string} & WithDatabaseArgs) => {
    const isCRTEnabledObserver = observeIsCRTEnabled(database);
    const postsInChannelObserver = queryPostsInChannel(database, channelId).observeWithColumns(['earliest', 'latest']);
    const myChannelObserver = observeMyChannel(database, channelId);

    // 观察频道的 cleared_at 时间戳（"清空聊天记录"功能设置），
    // cleared_at 之前的帖子不再显示，仅影响当前用户，其他成员不受影响
    const clearedAt$ = observeChannelSettings(database, channelId).pipe(
        switchMap((settings) => {
            const clearedAt = settings?.notifyProps?.cleared_at;
            return of$(clearedAt ? parseInt(clearedAt, 10) : 0);
        }),
        distinctUntilChanged(),
    );

    return {
        isCRTEnabled: isCRTEnabledObserver,
        lastViewedAt: myChannelObserver.pipe(
            switchMap((myChannel) => of$(myChannel?.viewedAt)),
            distinctUntilChanged(),
        ),
        unreadCount: myChannelObserver.pipe(
            switchMap((myChannel) => {
                if (!myChannel) {
                    return of$(0);
                }
                return of$(myChannel.messageCount || 0);
            }),
            distinctUntilChanged(),
        ),
        // 帖子查询：保留 PostsInChannel 的 earliest 下界，去掉 latest 上界。
        // 改名后 PostsInChannel.latest 可能未及时更新，导致新帖子被排除在 Q.between 之外。
        // 用 Q.gte(earliest) 替代 Q.between(earliest, latest) 可确保新帖子不被遗漏。
        posts: combineLatest([isCRTEnabledObserver, postsInChannelObserver, clearedAt$]).pipe(
            switchMap(([isCRTEnabled, postsInChannel, clearedAt]) => {
                if (!postsInChannel.length) {
                    return of$([]);
                }

                const {earliest} = postsInChannel[0];
                const effectiveEarliest = clearedAt > 0 ? Math.max(earliest, clearedAt) : earliest;

                const clauses: Q.Clause[] = [
                    Q.where('channel_id', channelId),
                    Q.where('delete_at', Q.eq(0)),
                    Q.where('create_at', Q.gte(effectiveEarliest)),
                ];
                if (!isCRTEnabled) {
                    clauses.push(Q.where('root_id', ''));
                }
                clauses.push(Q.sortBy('create_at', Q.desc));

                return database.collections.get('Post').query(...clauses).observe();
            }),
        ),
        shouldShowJoinLeaveMessages: queryAdvanceSettingsPreferences(database, Preferences.ADVANCED_FILTER_JOIN_LEAVE).
            observeWithColumns(['value']).pipe(
                switchMap((preferences) => of$(getAdvanceSettingPreferenceAsBool(preferences, Preferences.ADVANCED_FILTER_JOIN_LEAVE, true))),
                distinctUntilChanged(),
            ),
    };
});

export default React.memo(withDatabase(enhanced(ChannelPostList)));
