// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import {of} from 'rxjs';
import {map, switchMap} from 'rxjs/operators';

import {observeCurrentChannelId, observeCurrentTeamId, observeCurrentUserId} from '@queries/servers/system';
import {queryAllChannelsForTeam} from '@queries/servers/channel';
import {observeTeam} from '@queries/servers/team';
import {observeCurrentUser, observeUserIdsInTeam} from '@queries/servers/user';
import {queryCategoriesByTeamIds} from '@queries/servers/categories';
import DatabaseManager from '@database/manager';

import ForwardMessage from './forward_message';

import type {WithDatabaseArgs} from '@typings/database/database';

const enhanced = withObservables([], ({database, serverUrl}: WithDatabaseArgs) => {
    const currentChannelId = observeCurrentChannelId(database);
    const currentTeamId = observeCurrentTeamId(database);
    const currentUserId = observeCurrentUserId(database);
    const currentUser = observeCurrentUser(database);

    // 【范围限制】只显示当前团队的频道（含公开/私密团队频道 + 本团队的 DM/GM/共享频道），
    // 对齐 webapp 转发选人面板：不跨团队展示频道。
    const channels = currentTeamId.pipe(
        switchMap((teamId) =>
            teamId ? queryAllChannelsForTeam(database, teamId).observe() : of([]),
        ),
    );

    // 顶部标题使用当前团队的 display_name（企业团队名称）。
    const team = currentTeamId.pipe(
        switchMap((teamId) => (teamId ? observeTeam(database, teamId) : of(null))),
    );

    // Team member IDs for classification
    const teamMemberIds = currentTeamId.pipe(
        switchMap((teamId) =>
            teamId ? observeUserIdsInTeam(database, teamId) : of(new Set<string>()),
        ),
    );

    // Bot user IDs for classification
    const botUserIds = database.get('User').query().observe().pipe(
        map((users) => {
            const botIds = new Set<string>();
            for (const user of users) {
                if ((user as any).isBot) {
                    botIds.add(user.id);
                }
            }
            return botIds;
        }),
    );

    // Custom categories for the current team
    const customCategories = currentTeamId.pipe(
        switchMap(async (teamId) => {
            if (!teamId) return [];
            try {
                const allCategories = await queryCategoriesByTeamIds(database, [teamId]).fetch();
                const custom = allCategories.filter((cat) => cat.type === 'custom');
                // Get channels for each custom category
                const categoriesWithChannels = await Promise.all(
                    custom.map(async (cat) => {
                        const categoryChannels = await cat.categoryChannels.fetch();
                        const channelIds = categoryChannels.map((cc) => cc.channelId);
                        return {
                            id: cat.id,
                            displayName: cat.displayName,
                            channelIds,
                        };
                    }),
                );
                return categoriesWithChannels;
            } catch (e) {
                return [];
            }
        }),
        switchMap((result) => of(result)),
    );

    return {
        currentChannelId,
        currentUserId,
        currentUser,
        channels,
        team,
        teamMemberIds,
        botUserIds,
        customCategories,
        serverUrl: of(serverUrl),
    };
});

export default withDatabase(enhanced(ForwardMessage));
