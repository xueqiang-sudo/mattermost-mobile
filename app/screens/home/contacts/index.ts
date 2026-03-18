// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';

// import {of as of$} from 'rxjs';

import {observeCurrentTeamId} from '@queries/servers/system';
import {observeCurrentUser} from '@queries/servers/user';

import {ContactsStack} from './contacts_stack';

import type {WithDatabaseArgs} from '@typings/database/database';

const enhance = withObservables([], ({database}: WithDatabaseArgs) => ({
    currentUser: observeCurrentUser(database),
    currentTeamId: observeCurrentTeamId(database), //of$('tmpteam1001'),
}));

export default withDatabase(enhance(ContactsStack));
