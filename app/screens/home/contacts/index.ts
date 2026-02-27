// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';

import {observeCurrentTeamId} from '@queries/servers/system';
import {observeCurrentUser, observeTeammateNameDisplay} from '@queries/servers/user';

import ContactsScreen from './contacts';

import type {WithDatabaseArgs} from '@typings/database/database';

const enhance = withObservables([], ({database}: WithDatabaseArgs) => ({
    currentUser: observeCurrentUser(database),
    currentTeamId: observeCurrentTeamId(database),
    teammateDisplayNameSetting: observeTeammateNameDisplay(database),
}));

export default withDatabase(enhance(ContactsScreen));
