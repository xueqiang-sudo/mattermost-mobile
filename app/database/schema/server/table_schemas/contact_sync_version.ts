// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {tableSchema} from '@nozbe/watermelondb';

import {MM_TABLES} from '@constants/database';

const {CONTACT_SYNC_VERSION} = MM_TABLES.SERVER;

export default tableSchema({
    name: CONTACT_SYNC_VERSION,
    columns: [
        {name: 'scope_key', type: 'string', isIndexed: true},
        {name: 'team_id', type: 'string', isIndexed: true},
        {name: 'version', type: 'string'},
        {name: 'synced_at', type: 'number'},
    ],
});
