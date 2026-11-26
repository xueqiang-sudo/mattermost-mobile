// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Model} from '@nozbe/watermelondb';
import {field, json} from '@nozbe/watermelondb/decorators';

import {MM_TABLES} from '@constants/database';

const {ERP_PERMISSIONS_CACHE} = MM_TABLES.SERVER;

// DocPerm permission levels for a single DocType
export type DocPermMatrix = {
    read: boolean;
    write: boolean;
    create: boolean;
    delete: boolean;
    submit: boolean;
    cancel: boolean;
};

export default class ErpPermissionsCacheModel extends Model {
    static table = ERP_PERMISSIONS_CACHE;

    @field('user_id') userId!: string;
    @field('team_id') teamId!: string;
    @json('doctypes', (doctypes) => doctypes || {}) doctypes!: Record<string, DocPermMatrix>;
    @json('roles', (roles) => roles || []) roles!: string[];
    @field('cached_at') cachedAt!: number;
}
