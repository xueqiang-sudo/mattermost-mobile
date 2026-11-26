// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {tableSchema} from '@nozbe/watermelondb';

import {MM_TABLES} from '@constants/database';

const {ERP_PERMISSIONS_CACHE} = MM_TABLES.SERVER;

export default tableSchema({
    name: ERP_PERMISSIONS_CACHE,
    columns: [
        {name: 'user_id', type: 'string', isIndexed: true},
        {name: 'team_id', type: 'string', isIndexed: true},
        {name: 'doctypes', type: 'string'},  // JSON: Record<string, DocPermMatrix>
        {name: 'roles', type: 'string'},     // JSON: string[]
        {name: 'cached_at', type: 'number'},
    ],
});
