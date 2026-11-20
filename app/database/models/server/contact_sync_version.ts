// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Model} from '@nozbe/watermelondb';
import {field} from '@nozbe/watermelondb/decorators';

import {MM_TABLES} from '@constants/database';

const {CONTACT_SYNC_VERSION} = MM_TABLES.SERVER;

export default class ContactSyncVersionModel extends Model {
    static table = CONTACT_SYNC_VERSION;

    @field('scope_key') scopeKey!: string;
    @field('team_id') teamId!: string;
    @field('version') version!: string;
    @field('synced_at') syncedAt!: number;
}
