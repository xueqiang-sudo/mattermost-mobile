// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import {combineLatest, of as of$} from 'rxjs';
import {switchMap} from 'rxjs/operators';

import {getCurrentTeamId} from '@queries/servers/system';
import {queryMyTeams} from '@queries/servers/team';
import {observeCurrentUser} from '@queries/servers/user';

import SelectTeam from './select_team';

import type {WithDatabaseArgs} from '@typings/database/database';

const enhanced = withObservables([], ({database}: WithDatabaseArgs) => {
    // TODO https://mattermost.atlassian.net/browse/MM-43622
    // const canCreateTeams = observeCurrentUser(database).pipe(
    //     switchMap((u) => (u ? of$(u.roles.split(' ')) : of$([]))),
    //     switchMap((values) => queryRolesByNames(database, values).observeWithColumns(['permissions'])),
    //     switchMap((r) => of$(hasPermission(r, Permissions.CREATE_TEAM, false))),
    // );

    const myTeams = queryMyTeams(database).observe();
    const nTeams = myTeams.pipe(switchMap((mm) => of$(mm.length)));

    // 优先使用上次选择的团队，如果没有则使用第一个团队
    const firstTeamId = combineLatest([
        myTeams,
        of$(getCurrentTeamId(database)),
    ]).pipe(
        switchMap(([teams, currentTeamId]) => {
            // 如果当前团队ID存在且在用户团队列表中，使用它
            if (currentTeamId && teams.some((t) => t.id === currentTeamId)) {
                return of$(currentTeamId);
            }
            // 否则使用第一个团队
            return of$(teams[0]?.id);
        }),
    );

    return {
        nTeams,
        firstTeamId,
        currentUser: observeCurrentUser(database),
    };
});

export default withDatabase(enhanced(SelectTeam));
