// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import {of as of$} from 'rxjs';
import {map, switchMap} from 'rxjs/operators';

import {queryUsersOnChannel} from '@queries/servers/channel';
import {observeCurrentUserId} from '@queries/servers/system';

import GmAvatarGrid from './gm_avatar_grid';

import type {WithDatabaseArgs} from '@typings/database/database';

type Props = WithDatabaseArgs & {
    channelId: string;
    size: number;
    isOnCenterBg?: boolean;
    isUnread?: boolean;
    isMuted?: boolean;
    style?: import('react-native').StyleProp<import('react-native').ViewStyle>;
};

const enhanced = withObservables(['channelId'], ({channelId, database}: Props) => {
    const currentUserId = observeCurrentUserId(database);

    const users = currentUserId.pipe(
        switchMap((userId) => {
            return queryUsersOnChannel(database, channelId).observeWithColumns(['last_picture_update']).pipe(
                map((allUsers) => {
                    const sorted = [...allUsers].sort((a, b) => (a.id === userId ? -1 : 0) - (b.id === userId ? -1 : 0));
                    return sorted.slice(0, 9);
                }),
            );
        }),
    );

    return {users};
});

export default withDatabase(enhanced(GmAvatarGrid));
