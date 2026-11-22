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
        {name: 'is_erp_team', type: 'boolean'},
        {name: 'has_erp_account', type: 'boolean'},
        {name: 'roles', type: 'string'},
        {name: 'allowed_doctypes', type: 'string'},
        {name: 'data_scope', type: 'string'},
        {name: 'cached_at', type: 'number'},
    ],
});
