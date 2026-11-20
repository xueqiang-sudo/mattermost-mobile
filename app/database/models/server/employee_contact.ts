// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Model} from '@nozbe/watermelondb';
import {field} from '@nozbe/watermelondb/decorators';

import {MM_TABLES} from '@constants/database';

const {EMPLOYEE_CONTACT} = MM_TABLES.SERVER;

export default class EmployeeContactModel extends Model {
    static table = EMPLOYEE_CONTACT;

    @field('employee_id') employeeId!: string;
    @field('contact_id') contactId!: string;
    @field('contact_type') contactType!: string;
    @field('company') company!: string;
    @field('description') description!: string;
    @field('remark') remark!: string;
    @field('source') source!: string | null;
    @field('username') username!: string;
    @field('nickname') nickname!: string;
    @field('email') email!: string;
    @field('first_name') firstName!: string;
    @field('last_name') lastName!: string;
    @field('phone') phone!: string;
    @field('position') position!: string;
    @field('is_bot') isBot!: boolean;
    @field('last_picture_update') lastPictureUpdate!: number | null;
    @field('create_at') createAt!: number;
    @field('update_at') updateAt!: number;
}
