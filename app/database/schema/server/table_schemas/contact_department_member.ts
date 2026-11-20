// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {tableSchema} from '@nozbe/watermelondb';

import {MM_TABLES} from '@constants/database';

const {CONTACT_DEPARTMENT_MEMBER} = MM_TABLES.SERVER;

export default tableSchema({
    name: CONTACT_DEPARTMENT_MEMBER,
    columns: [
        {name: 'team_id', type: 'string', isIndexed: true},
        {name: 'department_id', type: 'number', isIndexed: true},
        {name: 'user_id', type: 'string'},
        {name: 'username', type: 'string'},
        {name: 'nickname', type: 'string'},
        {name: 'email', type: 'string'},
        {name: 'first_name', type: 'string'},
        {name: 'last_name', type: 'string'},
        {name: 'position', type: 'string'},
        {name: 'phone', type: 'string'},
        {name: 'roles', type: 'string'},
        {name: 'is_bot', type: 'boolean'},
        {name: 'last_picture_update', type: 'number', isOptional: true},
        {name: 'gender', type: 'string', isOptional: true},
        {name: 'country_code', type: 'string', isOptional: true},
        {name: 'create_at', type: 'number'},
        {name: 'update_at', type: 'number'},
    ],
});
