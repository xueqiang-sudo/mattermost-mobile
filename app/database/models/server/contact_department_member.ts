// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Model} from '@nozbe/watermelondb';
import {field} from '@nozbe/watermelondb/decorators';

import {MM_TABLES} from '@constants/database';

const {CONTACT_DEPARTMENT_MEMBER} = MM_TABLES.SERVER;

export default class ContactDepartmentMemberModel extends Model {
    static table = CONTACT_DEPARTMENT_MEMBER;

    @field('team_id') teamId!: string;
    @field('department_id') departmentId!: number;
    @field('user_id') userId!: string;
    @field('username') username!: string;
    @field('nickname') nickname!: string;
    @field('email') email!: string;
    @field('first_name') firstName!: string;
    @field('last_name') lastName!: string;
    @field('position') position!: string;
    @field('phone') phone!: string;
    @field('roles') roles!: string;
    @field('is_bot') isBot!: boolean;
    @field('last_picture_update') lastPictureUpdate!: number | null;
    @field('gender') gender!: string | null;
    @field('country_code') countryCode!: string | null;
    @field('create_at') createAt!: number;
    @field('update_at') updateAt!: number;
}
