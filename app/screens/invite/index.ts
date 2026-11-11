// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import {of as of$} from 'rxjs';
import {switchMap} from 'rxjs/operators';

import {observeCurrentTeam} from '@queries/servers/team';
import {observeCurrentUser} from '@queries/servers/user';

import Invite from './invite';

import type {WithDatabaseArgs} from '@typings/database/database';

const enhanced = withObservables([], ({database}: WithDatabaseArgs) => {
    const team = observeCurrentTeam(database);
    const currentUser = observeCurrentUser(database);

    return {
        teamId: team.pipe(
            switchMap((t) => of$(t?.id)),
        ),
        teamInviteId: team.pipe(
            switchMap((t) => of$(t?.inviteId)),
        ),
        currentUserId: currentUser.pipe(
            switchMap((u) => of$(u?.id)),
        ),
    };
});

export default withDatabase(enhanced(Invite));
