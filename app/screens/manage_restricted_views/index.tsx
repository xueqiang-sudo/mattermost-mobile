// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withObservables} from '@nozbe/watermelondb/react';

import {observeCurrentUserId} from '@queries/servers/system';
import {observeTeammateNameDisplay} from '@queries/servers/user';

import ManageRestrictedViews from './manage_restricted_views';

import type {WithDatabaseArgs} from '@typings/database/database';

const enhance = withObservables(['database'], ({database}: WithDatabaseArgs) => {
    const currentUserId = observeCurrentUserId(database);
    const teammateDisplayNameSetting = observeTeammateNameDisplay(database);

    return {
        currentUserId,
        teammateDisplayNameSetting,
    };
});

export default enhance(ManageRestrictedViews);
