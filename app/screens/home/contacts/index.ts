// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import {combineLatest} from 'rxjs';
import {switchMap} from 'rxjs/operators';

import {Permissions} from '@constants';
import {observePermissionForTeam} from '@queries/servers/role';
import {observeCurrentTeam} from '@queries/servers/team';
import {observeCurrentUser} from '@queries/servers/user';

import {ContactsStack} from './contacts_stack';

import type {WithDatabaseArgs} from '@typings/database/database';

const enhance = withObservables([], ({database}: WithDatabaseArgs) => {
    const currentTeam = observeCurrentTeam(database);
    const currentUser = observeCurrentUser(database);
    const isEnterpriseManager = combineLatest([currentUser, currentTeam]).pipe(
        switchMap(([u, t]) => observePermissionForTeam(database, t, u, Permissions.MANAGE_TEAM, false)),
    );

    return {
        currentUser,
        currentTeam,
        isEnterpriseManager,
    };

});

export default withDatabase(enhance(ContactsStack));
