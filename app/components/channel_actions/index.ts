// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import {of as of$} from 'rxjs';
import {combineLatestWith, switchMap} from 'rxjs/operators';

import {observeChannel} from '@queries/servers/channel';
import {observeCanManageChannelMembers, observePermissionForChannel} from '@queries/servers/role';
import {observeCurrentUser} from '@queries/servers/user';
import {permissionForEditingChannelAnnouncement} from '@utils/channel';

import ChannelActions from './channel_actions';

import type {WithDatabaseArgs} from '@typings/database/database';

type OwnProps = WithDatabaseArgs & {
    channelId: string;
}

const enhanced = withObservables(['channelId'], ({channelId, database}: OwnProps) => {
    const channel = observeChannel(database, channelId);
    const channelType = channel.pipe(
        switchMap((c) => of$(c?.type)),
    );

    const canManageMembers = observeCurrentUser(database).pipe(
        switchMap((u) => (u ? observeCanManageChannelMembers(database, channelId, u) : of$(false))),
    );

    const canEditAnnouncement = channel.pipe(
        combineLatestWith(observeCurrentUser(database)),
        switchMap(([ch, u]) => {
            const perm = permissionForEditingChannelAnnouncement(ch?.type);
            if (!ch || !u || !perm) {
                return of$(false);
            }
            return observePermissionForChannel(database, ch, u, perm, false);
        }),
    );

    return {
        canEditAnnouncement,
        channelType,
        canManageMembers,
    };
});

export default withDatabase(enhanced(ChannelActions));
