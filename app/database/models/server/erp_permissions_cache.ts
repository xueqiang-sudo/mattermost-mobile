// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Model} from '@nozbe/watermelondb';
import {field, json} from '@nozbe/watermelondb/decorators';

import {MM_TABLES} from '@constants/database';

const {ERP_PERMISSIONS_CACHE} = MM_TABLES.SERVER;

export default class ErpPermissionsCacheModel extends Model {
    static table = ERP_PERMISSIONS_CACHE;

    @field('user_id') userId!: string;
    @field('team_id') teamId!: string;
    @field('is_erp_team') isErpTeam!: boolean;
    @field('has_erp_account') hasErpAccount!: boolean;
    @json('roles', (roles) => roles || []) roles!: string[];
    @json('allowed_doctypes', (doctypes) => doctypes || []) allowedDoctypes!: string[];
    @field('data_scope') dataScope!: string;
    @field('cached_at') cachedAt!: number;
}
