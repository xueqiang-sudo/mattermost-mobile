// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {tableSchema} from '@nozbe/watermelondb';

import {MM_TABLES} from '@constants/database';

const {CONTACT_DEPARTMENT} = MM_TABLES.SERVER;

export default tableSchema({
    name: CONTACT_DEPARTMENT,
    columns: [
        {name: 'team_id', type: 'string', isIndexed: true},
        {name: 'dept_id', type: 'number'},
        {name: 'name', type: 'string'},
        {name: 'description', type: 'string'},
        {name: 'parent_id', type: 'number', isOptional: true},
        {name: 'create_at', type: 'number'},
        {name: 'update_at', type: 'number'},
        {name: 'delete_at', type: 'number'},
    ],
});
