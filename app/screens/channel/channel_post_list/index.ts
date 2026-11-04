// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Q} from '@nozbe/watermelondb';
import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import React from 'react';
import {combineLatest, of as of$} from 'rxjs';
import {switchMap, distinctUntilChanged} from 'rxjs/operators';

import {MM_TABLES} from '@constants/database';
import {Preferences} from '@constants';
import {getAdvanceSettingPreferenceAsBool} from '@helpers/api/preference';
import {observeMyChannel, observeChannelSettings} from '@queries/servers/channel';
import {queryPostsBetween, queryPostsInChannel} from '@queries/servers/post';
import {queryAdvanceSettingsPreferences} from '@queries/servers/preference';
import {observeIsCRTEnabled} from '@queries/servers/thread';

import ChannelPostList from './channel_post_list';

import type {WithDatabaseArgs} from '@typings/database/database';
import type PostModel from '@typings/database/models/servers/post';

const {POST} = MM_TABLES.SERVER;

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

    // 【关键修复】直接观察 Post 表的变化（按 channel_id 过滤）
    // 当新 Post 被创建时，即使 PostsInChannel 的 earliest/latest 没变化，
    // 也能触发重新渲染。解决了多文件发送时不渲染的问题。
    const postsTableObserver = database.get<PostModel>(POST).query(
        Q.where('channel_id', channelId),
    ).observeWithColumns(['update_at']);

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
        posts: combineLatest([isCRTEnabledObserver, postsInChannelObserver, clearedAt$, postsTableObserver]).pipe(
            switchMap(([isCRTEnabled, postsInChannel, clearedAt, _postsTrigger]) => {
                if (!postsInChannel.length) {
                    return of$([]);
                }

                const {earliest, latest} = postsInChannel[0];
                const effectiveEarliest = clearedAt > 0 ? Math.max(earliest, clearedAt) : earliest;
                return queryPostsBetween(database, effectiveEarliest, latest, Q.desc, '', channelId, isCRTEnabled ? '' : undefined).observe();
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
