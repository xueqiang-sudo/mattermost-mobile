// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import {of as of$} from 'rxjs';
import {combineLatestWith, switchMap} from 'rxjs/operators';

import {General} from '@constants';
import {observeChannel, observeChannelInfo} from '@queries/servers/channel';
import {observeConfigBooleanValue} from '@queries/servers/system';
import {observeCurrentUser, observeUser} from '@queries/servers/user';
import {getUserCustomStatus, getUserIdFromChannelName, isCustomStatusExpired as checkCustomStatusIsExpired, username2Nickname} from '@utils/user';

import Extra from './extra';

import type {WithDatabaseArgs} from '@typings/database/database';

type Props = WithDatabaseArgs & {
    channelId: string;
}

const enhanced = withObservables(['channelId'], ({channelId, database}: Props) => {
    const currentUser = observeCurrentUser(database);
    const channel = observeChannel(database, channelId);
    const channelInfo = observeChannelInfo(database, channelId);
    const createdAt = channel.pipe(switchMap((c) => of$(c?.type === General.DM_CHANNEL ? 0 : c?.createAt)));
    const header = channelInfo.pipe(switchMap((ci) => of$(ci?.header)));
    const dmUser = currentUser.pipe(
        combineLatestWith(channel),
        switchMap(([user, c]) => {
            if (c?.type === General.DM_CHANNEL && user) {
                const teammateId = getUserIdFromChannelName(user.id, c.name);
                return observeUser(database, teammateId);
            }

            return of$(undefined);
        }),
    );

    const createdBy = channel.pipe(
        switchMap((ch) => (ch?.creatorId ? observeUser(database, ch.creatorId) : of$(undefined))),
        combineLatestWith(currentUser),
        switchMap(([creator, me]) => of$(username2Nickname(creator, {locale: me?.locale, useFallbackUsername: false}))),
    );

    const customStatus = dmUser.pipe(
        switchMap((dm) => of$(checkCustomStatusIsExpired(dm) ? undefined : getUserCustomStatus(dm))),
    );

    const isCustomStatusEnabled = observeConfigBooleanValue(database, 'EnableCustomUserStatuses');

    return {
        createdAt,
        createdBy,
        customStatus,
        header,
        isCustomStatusEnabled,
    };
});

export default withDatabase(enhanced(Extra));
