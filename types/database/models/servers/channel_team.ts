// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type ChannelModel from './channel';
import type TeamModel from './team';
import type {Relation, Model} from '@nozbe/watermelondb';
import type {Associations} from '@nozbe/watermelondb/Model';

/**
 * The ChannelTeam model represents the many-to-many association between
 * channels and teams, mirroring the server's channelteams table.
 */
declare class ChannelTeamModel extends Model {
    /** table (name) : ChannelTeam */
    static table: string;

    /** associations : Describes every relationship to this table. */
    static associations: Associations;

    /** channel_id : The foreign key to the related Channel record */
    channelId: string;

    /** team_id : The foreign key to the related Team record */
    teamId: string;

    /** channel : The related channel */
    channel: Relation<ChannelModel>;

    /** team : The related team */
    team: Relation<TeamModel>;
}

export default ChannelTeamModel;
