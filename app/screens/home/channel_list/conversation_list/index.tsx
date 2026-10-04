// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import {Q} from '@nozbe/watermelondb';
import {combineLatest, of} from 'rxjs';
import {startWith, switchMap, tap, withLatestFrom} from 'rxjs/operators';

import {fetchProfilesInChannel} from '@actions/remote/user';
import {observeIsPlaybooksEnabled} from '@playbooks/database/queries/version';
import {observeRecentConversationsForTeam, queryChannelMembers} from '@queries/servers/channel';
import {observeCurrentTeamId, observeServerUrl} from '@queries/servers/system';
import {General, MM_TABLES} from '@constants';

import ConversationListLayout from './conversation_list_layout';

import type {WithDatabaseArgs} from '@typings/database/database';
import type ChannelModel from '@typings/database/models/servers/channel';

const enhanced = withObservables([], ({database}: WithDatabaseArgs) => {
    const currentTeamId = observeCurrentTeamId(database);
    const serverUrl = observeServerUrl(database);

    /** 切换团队时先清空列表：switchMap 取消订阅后否则会一直显示上一团队末次发出的会话，直到新团队 observable 首次发射 */
    const sortedChannels = currentTeamId.pipe(
        switchMap((teamId) => {
            if (!teamId) {
                return of([]);
            }
            return observeRecentConversationsForTeam(database, teamId).pipe(
                startWith([] as ChannelModel[]),
            );
        }),
    );

    // Fetch members for GM channels only if not already in local database
    // This ensures complete member data for display names while avoiding unnecessary server calls
    const channelsWithMemberFetch = sortedChannels.pipe(
        withLatestFrom(serverUrl),
        tap(async ([channels, url]) => {
            const gmChannels = channels.filter(c => c.type === General.GM_CHANNEL);

            // Check which GM channels are missing member data in local database
            const channelsNeedingFetch: ChannelModel[] = [];
            for (const channel of gmChannels) {
                try {
                    const memberCount = await queryChannelMembers(database, channel.id).fetchCount();
                    // If less than 2 members (only current user or none), fetch from server
                    if (memberCount < 2) {
                        channelsNeedingFetch.push(channel);
                    }
                } catch (error) {
                    // If query fails, assume we need to fetch
                    channelsNeedingFetch.push(channel);
                }
            }

            // Only fetch from server for channels that need it
            channelsNeedingFetch.forEach(channel => {
                fetchProfilesInChannel(url, channel.id, undefined, {page: 0, per_page: 200}).catch(() => {
                    // Silently ignore errors - this is a best-effort fetch
                });
            });
        }),
        switchMap(([channels]) => of(channels)),
    );

    const playbooksEnabled = observeIsPlaybooksEnabled(database);

    return {
        currentTeamId,
        sortedChannels: channelsWithMemberFetch,
        playbooksEnabled,
    };
});

export default withDatabase(enhanced(ConversationListLayout));
