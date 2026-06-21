// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import {of as of$} from 'rxjs';
import {switchMap} from 'rxjs/operators';

import {observeChannel, observeChannelMembers} from '@queries/servers/channel';
import {observeCurrentTeamId} from '@queries/servers/system';
import {queryUsersById} from '@queries/servers/user';

import SearchChatHistory from './search_chat_history';

import type ChannelMembershipModel from '@typings/database/models/servers/channel_membership';
import type UserModel from '@typings/database/models/servers/user';
import type {WithDatabaseArgs} from '@typings/database/database';

type Props = WithDatabaseArgs & {
    channelId: string;
}

const enhance = withObservables(['channelId'], ({channelId, database}: Props) => {
    const channel = observeChannel(database, channelId);
    const teamId = channel.pipe(
        switchMap((c) => (c?.teamId ? of$(c.teamId) : observeCurrentTeamId(database))),
    );

    const memberUsers = channelId
        ? observeChannelMembers(database, channelId).pipe(
            switchMap((members: ChannelMembershipModel[]) => {
                const ids = members.map((m) => m.userId);
                if (ids.length === 0) {
                    return of$([] as UserModel[]);
                }
                return queryUsersById(database, ids).observe();
            }),
        )
        : of$([] as UserModel[]);

    const memberIds = memberUsers.pipe(
        switchMap((users) => of$(users.map((u) => u.id))),
    );

    return {
        channel,
        teamId,
        memberIds,
        memberUsers,
    };
});

export default withDatabase(enhance(SearchChatHistory));
