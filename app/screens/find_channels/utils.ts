// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Database, Q} from '@nozbe/watermelondb';
import {of as of$} from 'rxjs';

import {General} from '@constants';
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
 * 查找/最近列表：公开与私有频道仅保留当前团队（企业）；DM/GM 在模型上无 team_id，不做团队过滤。
 */
export const filterChannelsToCurrentTeam = (channels: ChannelModel[], currentTeamId: string): ChannelModel[] => {
    if (!currentTeamId) {
        return channels;
    }
    return channels.filter((channel) => {
        if (channel.type === General.DM_CHANNEL || channel.type === General.GM_CHANNEL) {
            return true;
        }
        return channel.teamId === currentTeamId;
    });
};
