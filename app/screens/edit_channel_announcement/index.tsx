// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import {of as of$} from 'rxjs';
import {combineLatestWith, switchMap} from 'rxjs/operators';

import {observeChannel, observeChannelInfo} from '@queries/servers/channel';
import {observePermissionForChannel} from '@queries/servers/role';
import {observeCurrentUser} from '@queries/servers/user';
import {permissionForEditingChannelAnnouncement} from '@utils/channel';

import EditChannelAnnouncement from './edit_channel_announcement';

import type {WithDatabaseArgs} from '@typings/database/database';

type OwnProps = WithDatabaseArgs & {
    channelId: string;
}

const enhanced = withObservables(['channelId'], ({channelId, database}: OwnProps) => {
    const channel = observeChannel(database, channelId);
    const channelInfo = observeChannelInfo(database, channelId);
    const currentUser = observeCurrentUser(database);
    const canEdit = channel.pipe(
        combineLatestWith(currentUser),
        switchMap(([ch, user]) => {
            const perm = permissionForEditingChannelAnnouncement(ch?.type);
            if (!ch || !user || !perm) {
                return of$(false);
            }
            return observePermissionForChannel(database, ch, user, perm, false);
        }),
    );

    return {
        canEdit,
        channel,
        channelInfo,
    };
});

export default withDatabase(enhanced(EditChannelAnnouncement));
