// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Database, Q} from '@nozbe/watermelondb';
import {of as of$} from 'rxjs';

import {MM_TABLES} from '@constants/database';

import type ChannelModel from '@typings/database/models/servers/channel';
import type MyChannelModel from '@typings/database/models/servers/my_channel';

const {SERVER: {CHANNEL, MY_CHANNEL}} = MM_TABLES;

export const retrieveChannels = (database: Database, myChannels: MyChannelModel[], orderedByLastViewedAt = false) => {
    const ids = myChannels.map((m) => m.id);
    if (ids.length) {
        const idsStr = `'${ids.join("','")}'`;
        const order = orderedByLastViewedAt ? 'order by my.last_viewed_at desc' : '';
        return database.get<ChannelModel>(CHANNEL).query(
            Q.unsafeSqlQuery(`select distinct c.* from ${MY_CHANNEL} my
            inner join ${CHANNEL} c on c.id=my.id and c.id in (${idsStr})
            ${order}`),
        ).observe();
    }

    return of$([]);
};

export const removeChannelsFromArchivedTeams = (recentChannels: ChannelModel[], teamIds: Set<string>) => {
    return recentChannels.filter((channel) => {
        if (!channel.teamId) {
            return true;
        }
        return teamIds.has(channel.teamId);
    });
};

/**
 * 查找/最近列表：仅保留当前团队（企业）的频道。
 * DM/GM 如果已关联 team_id，也按企业过滤；未关联的空 team_id DM/GM 不显示。
 */
export const filterChannelsToCurrentTeam = (channels: ChannelModel[], currentTeamId: string): ChannelModel[] => {
    if (!currentTeamId) {
        return channels;
    }
    return channels.filter((channel) => {
        return channel.teamId === currentTeamId;
    });
};
