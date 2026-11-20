// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Model} from '@nozbe/watermelondb';
import {field} from '@nozbe/watermelondb/decorators';

import {MM_TABLES} from '@constants/database';

const {CONTACT_DEPARTMENT} = MM_TABLES.SERVER;

export default class ContactDepartmentModel extends Model {
    static table = CONTACT_DEPARTMENT;

    @field('team_id') teamId!: string;
    @field('dept_id') deptId!: number;
    @field('name') name!: string;
    @field('description') description!: string;
    @field('parent_id') parentId!: number | null;
    @field('create_at') createAt!: number;
    @field('update_at') updateAt!: number;
    @field('delete_at') deleteAt!: number;
}
