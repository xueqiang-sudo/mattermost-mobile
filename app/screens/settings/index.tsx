// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';

import {observeConfigValue} from '@queries/servers/system';

import Settings from './settings';

import type {WithDatabaseArgs} from '@typings/database/database';

const enhanced = withObservables([], ({database}: WithDatabaseArgs) => {
    const siteName = observeConfigValue(database, 'SiteName');

    return {
        siteName,
    };
});

export default withDatabase(enhanced(Settings));
