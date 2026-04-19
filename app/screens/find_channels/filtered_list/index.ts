// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import {of as of$} from 'rxjs';
import {combineLatestWith, switchMap} from 'rxjs/operators';

import {General} from '@constants';
import {observeArchiveChannelsByTerm, observeDirectChannelsByTerm, observeJoinedChannelsByTerm, observeNotDirectChannelsByTerm} from '@queries/servers/channel';
import {observeConfigValue, observeCurrentTeamId} from '@queries/servers/system';
import {queryJoinedTeams} from '@queries/servers/team';
import {observeTeammateNameDisplay} from '@queries/servers/user';
import {removeChannelsFromArchivedTeams, retrieveChannels} from '@screens/find_channels/utils';

import FilteredList, {MAX_RESULTS} from './filtered_list';

import type {WithDatabaseArgs} from '@typings/database/database';

type EnhanceProps = WithDatabaseArgs & {
    term: string;
}

const enhanced = withObservables(['term'], ({database, term}: EnhanceProps) => {
    const teamIds = queryJoinedTeams(database).observe().pipe(
        // eslint-disable-next-line max-nested-callbacks
        switchMap((teams) => of$(new Set(teams.map((t) => t.id)))),
    );
    const currentTeamId$ = observeCurrentTeamId(database);
    const joinedChannelsMatchStart = currentTeamId$.pipe(
        switchMap((teamId) => observeJoinedChannelsByTerm(database, term, MAX_RESULTS, true, teamId)),
    );
    const joinedChannelsMatch = currentTeamId$.pipe(
        switchMap((teamId) => observeJoinedChannelsByTerm(database, term, MAX_RESULTS, false, teamId)),
    );
    const directChannelsMatchStart = observeDirectChannelsByTerm(database, term, MAX_RESULTS, true);
    const directChannelsMatch = observeDirectChannelsByTerm(database, term, MAX_RESULTS);

    const channelsMatchStart = joinedChannelsMatchStart.pipe(
        combineLatestWith(directChannelsMatchStart),
        switchMap((matchStart) => {
            return retrieveChannels(database, matchStart.flat(), true);
        }),
        combineLatestWith(teamIds),
        switchMap(([myChannels, tmIds]) => of$(removeChannelsFromArchivedTeams(myChannels, tmIds))),
    );

    const channelsMatch = joinedChannelsMatch.pipe(
        combineLatestWith(directChannelsMatch),
        switchMap((matched) => retrieveChannels(database, matched.flat(), true)),
        combineLatestWith(teamIds),
        switchMap(([myChannels, tmIds]) => of$(removeChannelsFromArchivedTeams(myChannels, tmIds))),
    );

    const archivedChannels = currentTeamId$.pipe(
        switchMap((teamId) => observeArchiveChannelsByTerm(database, term, MAX_RESULTS, teamId).pipe(
            switchMap((archived) => retrieveChannels(database, archived)),
        )),
    );

    const usersMatchStart = observeNotDirectChannelsByTerm(database, term, MAX_RESULTS, true);
    const usersMatch = observeNotDirectChannelsByTerm(database, term, MAX_RESULTS);

    const restrictDirectMessage = observeConfigValue(database, 'RestrictDirectMessage').pipe(
        switchMap((v) => of$(v !== General.RESTRICT_DIRECT_MESSAGE_ANY)),
    );

    const teammateDisplayNameSetting = observeTeammateNameDisplay(database);

    return {
        archivedChannels,
        channelsMatch,
        channelsMatchStart,
        currentTeamId: currentTeamId$,
        restrictDirectMessage,
        showTeamName: of$(false),
        teamIds,
        teammateDisplayNameSetting,
        usersMatchStart,
        usersMatch,
    };
});

export default withDatabase(enhanced(FilteredList));
