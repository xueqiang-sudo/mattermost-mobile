// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import {Observable, of as of$} from 'rxjs';
import {combineLatestWith, distinctUntilChanged, switchMap} from 'rxjs/operators';

import {queryMyRecentChannels} from '@queries/servers/channel';
import {observeCurrentTeamId} from '@queries/servers/system';
import {observeTeam, queryJoinedTeams} from '@queries/servers/team';
import {filterChannelsToCurrentTeam, removeChannelsFromArchivedTeams, retrieveChannels} from '@screens/find_channels/utils';

import UnfilteredList from './unfiltered_list';

import type {WithDatabaseArgs} from '@typings/database/database';

const MAX_CHANNELS = 20;

const enhanced = withObservables([], ({database}: WithDatabaseArgs) => {
    const teamIds: Observable<Set<string>> = queryJoinedTeams(database).observe().pipe(
        // eslint-disable-next-line max-nested-callbacks
        switchMap((teams) => of$(new Set(teams.map((t) => t.id)))),
    );

    const recentChannels = queryMyRecentChannels(database, MAX_CHANNELS).
        observeWithColumns(['last_viewed_at']).pipe(
            switchMap((myChannels) => retrieveChannels(database, myChannels, true)),
            combineLatestWith(teamIds),
            switchMap(([myChannels, tmIds]) => of$(removeChannelsFromArchivedTeams(myChannels, tmIds))),
            combineLatestWith(observeCurrentTeamId(database)),
            switchMap(([channels, currentTeamId]) => of$(filterChannelsToCurrentTeam(channels, currentTeamId))),
        );

    const currentTeamDisplayName = observeCurrentTeamId(database).pipe(
        switchMap((teamId) => {
            if (!teamId) {
                return of$('');
            }
            return observeTeam(database, teamId).pipe(
                switchMap((team) => of$(team?.displayName ?? '')),
                distinctUntilChanged(),
            );
        }),
        distinctUntilChanged(),
    );

    return {
        currentTeamDisplayName,
        recentChannels,
        showTeamName: of$(false),
    };
});

export default withDatabase(enhanced(UnfilteredList));
