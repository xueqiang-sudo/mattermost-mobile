// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {field, immutableRelation} from '@nozbe/watermelondb/decorators';
import Model, {type Associations} from '@nozbe/watermelondb/Model';

import {MM_TABLES} from '@constants/database';

import type {Relation} from '@nozbe/watermelondb';
import type ChannelModel from '@typings/database/models/servers/channel';
import type ChannelTeamModelInterface from '@typings/database/models/servers/channel_team';
import type TeamModel from '@typings/database/models/servers/team';

const {CHANNEL, TEAM, CHANNEL_TEAM} = MM_TABLES.SERVER;

/**
 * The ChannelTeam model represents the many-to-many association between
 * channels and teams, mirroring the server's channelteams table.
 */
export default class ChannelTeamModel extends Model implements ChannelTeamModelInterface {
    /** table (name) : ChannelTeam */
    static table = CHANNEL_TEAM;

    /** associations : Describes every relationship to this table. */
    static associations: Associations = {
        [CHANNEL]: {type: 'belongs_to', key: 'channel_id'},
        [TEAM]: {type: 'belongs_to', key: 'team_id'},
    };

    /** channel_id : The foreign key to the related Channel record */
    @field('channel_id') channelId!: string;

    /** team_id : The foreign key to the related Team record */
    @field('team_id') teamId!: string;

    /** channel : The related channel */
    @immutableRelation(CHANNEL, 'channel_id') channel!: Relation<ChannelModel>;

    /** team : The related team */
    @immutableRelation(TEAM, 'team_id') team!: Relation<TeamModel>;
}
