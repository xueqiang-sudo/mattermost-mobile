// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {tableSchema} from '@nozbe/watermelondb';

import {MM_TABLES} from '@constants/database';

const {EMPLOYEE_CONTACT} = MM_TABLES.SERVER;

export default tableSchema({
    name: EMPLOYEE_CONTACT,
    columns: [
        {name: 'employee_id', type: 'string', isIndexed: true},
        {name: 'contact_id', type: 'string'},
        {name: 'contact_type', type: 'string', isIndexed: true},
        {name: 'company', type: 'string'},
        {name: 'description', type: 'string'},
        {name: 'remark', type: 'string'},
        {name: 'source', type: 'string', isOptional: true},
        {name: 'username', type: 'string'},
        {name: 'nickname', type: 'string'},
        {name: 'email', type: 'string'},
        {name: 'first_name', type: 'string'},
        {name: 'last_name', type: 'string'},
        {name: 'phone', type: 'string'},
        {name: 'position', type: 'string'},
        {name: 'is_bot', type: 'boolean'},
        {name: 'last_picture_update', type: 'number', isOptional: true},
        {name: 'create_at', type: 'number'},
        {name: 'update_at', type: 'number'},
    ],
});
