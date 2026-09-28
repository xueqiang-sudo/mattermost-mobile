// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import {Q} from '@nozbe/watermelondb';
import {of as of$} from 'rxjs';
import {switchMap, combineLatestWith, distinctUntilChanged} from 'rxjs/operators';

import {MM_TABLES, Preferences} from '@constants';
import {observeNotifyPropsByChannels, queryChannelsById} from '@queries/servers/channel';
import {queryPreferencesByCategoryAndName} from '@queries/servers/preference';
import {observeCurrentChannelId, observeCurrentUserId, observeLastUnreadChannelId} from '@queries/servers/system';
import {observeDeactivatedUsers} from '@queries/servers/user';
import {type ChannelWithMyChannel, filterArchivedChannels, filterAutoclosedDMs, filterManuallyClosedDms, sortChannels} from '@utils/categories';

import ClassifiedGroup from './classified_group';

import type {WithDatabaseArgs} from '@typings/database/database';
import type MyChannelModel from '@typings/database/models/servers/my_channel';

const {SERVER: {MY_CHANNEL}} = MM_TABLES;

type EnhanceProps = {
    channelIds: string[];
    title: string;
    groupId: string;
    locale: string;
    isTablet: boolean;
    onChannelSwitch: (channel: Channel | import('@typings/database/models/servers/channel').default) => void;
} & WithDatabaseArgs;

const enhanced = withObservables(['channelIds'], ({channelIds, database, isTablet, locale, title, groupId, onChannelSwitch}: EnhanceProps) => {
    const currentUserId = observeCurrentUserId(database);
    const currentChannelId = isTablet ? observeCurrentChannelId(database) : of$('');
    const lastUnreadId = isTablet ? observeLastUnreadChannelId(database) : of$(undefined);

    // Observe channels by ID
    const channels = channelIds.length > 0
        ? queryChannelsById(database, channelIds).observeWithColumns(['display_name', 'delete_at'])
        : of$([]);

    // Observe myChannel records for the same IDs
    const myChannels = channelIds.length > 0
        ? database.get<MyChannelModel>(MY_CHANNEL).query(Q.where('id', Q.oneOf(channelIds))).observeWithColumns(['last_post_at', 'is_unread'])
        : of$([]);

    // Combine channels and myChannels into ChannelWithMyChannel[]
    const channelsWithMyChannel = channels.pipe(
        combineLatestWith(myChannels),
        switchMap(([chs, mys]) => {
            const myMap = new Map(mys.map((m) => [m.id, m]));
            return of$(chs.reduce<ChannelWithMyChannel[]>((result, channel) => {
                const myChannel = myMap.get(channel.id);
                if (myChannel) {
                    result.push({channel, myChannel, sortOrder: 0});
                }
                return result;
            }, []));
        }),
    );

    const notifyPropsPerChannel = myChannels.pipe(
        switchMap((mc) => observeNotifyPropsByChannels(database, mc)),
    );

    const hiddenDmPrefs = queryPreferencesByCategoryAndName(database, Preferences.CATEGORIES.DIRECT_CHANNEL_SHOW, undefined, 'false').
        observeWithColumns(['value']);
    const hiddenGmPrefs = queryPreferencesByCategoryAndName(database, Preferences.CATEGORIES.GROUP_CHANNEL_SHOW, undefined, 'false').
        observeWithColumns(['value']);
    const manuallyClosedPrefs = hiddenDmPrefs.pipe(
        combineLatestWith(hiddenGmPrefs),
        switchMap(([dms, gms]) => of$(dms.concat(gms))),
    );

    const approxViewTimePrefs = queryPreferencesByCategoryAndName(database, Preferences.CATEGORIES.CHANNEL_APPROXIMATE_VIEW_TIME, undefined).
        observeWithColumns(['value']);
    const openTimePrefs = queryPreferencesByCategoryAndName(database, Preferences.CATEGORIES.CHANNEL_OPEN_TIME, undefined).
        observeWithColumns(['value']);
    const autoclosePrefs = approxViewTimePrefs.pipe(
        combineLatestWith(openTimePrefs),
        switchMap(([viewTimes, openTimes]) => of$(viewTimes.concat(openTimes))),
    );

    const deactivated = observeDeactivatedUsers(database);

    const sortedChannels = channelsWithMyChannel.pipe(
        combineLatestWith(currentUserId, currentChannelId, lastUnreadId, notifyPropsPerChannel, manuallyClosedPrefs, autoclosePrefs, deactivated),
        switchMap(([cwms, userId, channelId, unreadId, notifyProps, manuallyClosedDms, autoclose, deactivatedUsers]) => {
            let filtered = cwms;
            filtered = filterArchivedChannels(filtered, channelId);
            filtered = filterManuallyClosedDms(filtered, notifyProps, manuallyClosedDms, userId, unreadId);
            // Use 'direct_messages' category type so DM autoclose logic applies
            filtered = filterAutoclosedDMs(
                'direct_messages' as CategoryType,
                Preferences.CHANNEL_SIDEBAR_LIMIT_DMS_DEFAULT,
                userId,
                channelId,
                filtered,
                autoclose,
                notifyProps,
                deactivatedUsers,
                unreadId,
            );
            // Sort by recent activity (most recent first)
            return of$(sortChannels('recent' as CategorySorting, filtered, notifyProps, locale));
        }),
        // Extract just the ChannelModel[] from ChannelWithMyChannel[]
        switchMap((cwms) => of$(cwms.map((c) => c.channel))),
        distinctUntilChanged((a, b) => {
            if (a.length !== b.length) {
                return false;
            }
            return a.every((ch, i) => ch.id === b[i].id);
        }),
    );

    return {
        sortedChannels,
        title,
        groupId,
        onChannelSwitch,
    };
});

export default withDatabase(enhanced(ClassifiedGroup));
