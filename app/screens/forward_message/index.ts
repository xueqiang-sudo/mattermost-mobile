// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import {of} from 'rxjs';
import {switchMap} from 'rxjs/operators';

import {observeCurrentChannelId, observeCurrentTeamId} from '@queries/servers/system';
import {queryAllChannelsForTeam} from '@queries/servers/channel';
import {observeTeam} from '@queries/servers/team';

import ForwardMessage from './forward_message';

import type {WithDatabaseArgs} from '@typings/database/database';

const enhanced = withObservables([], ({database}: WithDatabaseArgs) => {
    const currentChannelId = observeCurrentChannelId(database);
    const currentTeamId = observeCurrentTeamId(database);

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

    return {
        currentChannelId,
        channels,
        team,
    };
});

export default withDatabase(enhanced(ForwardMessage));
