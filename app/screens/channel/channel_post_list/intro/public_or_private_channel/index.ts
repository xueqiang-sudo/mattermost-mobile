// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import {combineLatest, of as of$} from 'rxjs';
import {map} from 'rxjs/operators';

import {observeCurrentUser, observeUser} from '@queries/servers/user';
import {username2Nickname} from '@utils/user';

import PublicOrPrivateChannel from './public_or_private_channel';

import type {WithDatabaseArgs} from '@typings/database/database';
import type ChannelModel from '@typings/database/models/servers/channel';

const enhanced = withObservables([], ({channel, database}: {channel: ChannelModel} & WithDatabaseArgs) => {
    let creator;
    if (channel.creatorId) {
        const me = observeCurrentUser(database);
        const profile = observeUser(database, channel.creatorId);

        creator = combineLatest([profile, me]).pipe(
            map(([user, currentUser]) => (user ? username2Nickname(user, {locale: currentUser?.locale}) : '')),
        );
    } else {
        creator = of$(undefined);
    }

    return {
        creator,
    };
});

export default withDatabase(enhanced(PublicOrPrivateChannel));
