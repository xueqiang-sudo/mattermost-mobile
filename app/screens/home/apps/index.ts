// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';

import {observeCurrentTeam} from '@queries/servers/team';
import {observeCurrentUser} from '@queries/servers/user';

import {AppsStack} from './apps_stack';

import type {WithDatabaseArgs} from '@typings/database/database';

const enhance = withObservables([], ({database}: WithDatabaseArgs) => {
    const currentTeam = observeCurrentTeam(database);
    const currentUser = observeCurrentUser(database);

    return {
        currentUser,
        currentTeam,
    };
});

export default withDatabase(enhance(AppsStack));
