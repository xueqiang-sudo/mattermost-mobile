// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import {Q} from '@nozbe/watermelondb';
import {of as of$} from 'rxjs';
import {switchMap, combineLatestWith, distinctUntilChanged, map} from 'rxjs/operators';

import {MM_TABLES} from '@constants/database';
import {Preferences} from '@constants';
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
    console.log(`[ClassifiedGroup ${title}] withObservables running, channelIds:`, channelIds.length);

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
            console.log(`[ClassifiedGroup ${title}] Combining: channels=${chs.length}, myChannels=${mys.length}`);
            const myMap = new Map(mys.map((m) => [m.id, m]));
            const result = chs.reduce<ChannelWithMyChannel[]>((result, channel) => {
                const myChannel = myMap.get(channel.id);
                if (myChannel) {
                    result.push({channel, myChannel, sortOrder: 0});
                } else {
                    // Fallback: create a minimal MyChannel-like object for channels without MyChannel records
                    // This ensures classified channels are still displayed
                    console.log(`[ClassifiedGroup ${title}] Channel ${channel.id} (${channel.displayName}) has no MyChannel record, using fallback`);
                    result.push({
                        channel,
                        myChannel: {
                            id: channel.id,
                            lastPostAt: channel.createAt || 0,
                            lastViewedAt: 0,
                            isUnread: false,
                            mentionsCount: 0,
                            manuallyUnread: false,
                            lastFetchedAt: 0,
                            roles: '',
                            notifyProps: {} as any,
                            _raw: {} as any,
                            update: async () => {},
                            prepareUpdate: () => ({} as any),
                            markAsDeleted: async () => {},
                            markAsDestroyed: async () => {},
                            collection: {} as any,
                            subcollections: [],
                        } as any,
                        sortOrder: 0,
                    });
                }
                return result;
            }, []);
            console.log(`[ClassifiedGroup ${title}] After combining: ${result.length} channels (with fallback)`);
            return of$(result);
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
            console.log(`[ClassifiedGroup ${title}] Starting filter pipeline with ${cwms.length} channels`);
            let filtered = cwms;
            const initial = cwms.length;

            const beforeArchived = filtered.length;
            filtered = filterArchivedChannels(filtered, channelId);
            const afterArchived = filtered.length;
            console.log(`[ClassifiedGroup ${title}] After archived filter: ${afterArchived} (removed ${beforeArchived - afterArchived})`);

            const beforeManual = filtered.length;
            filtered = filterManuallyClosedDms(filtered, notifyProps, manuallyClosedDms, userId, unreadId);
            const afterManual = filtered.length;
            console.log(`[ClassifiedGroup ${title}] After manual close filter: ${afterManual} (removed ${beforeManual - afterManual})`);

            const beforeAuto = filtered.length;
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
            const afterAuto = filtered.length;
            console.log(`[ClassifiedGroup ${title}] After autoclose filter: ${afterAuto} (removed ${beforeAuto - afterAuto})`);

            // Sort by recent activity (most recent first)
            const sorted = sortChannels('recent' as CategorySorting, filtered, notifyProps, locale);
            console.log(`[ClassifiedGroup ${title}] Final sorted count: ${sorted.length}`);
            return of$({
                channels: sorted,
                filterStats: {
                    initial,
                    afterArchived: beforeArchived - afterArchived,
                    afterManual: beforeManual - afterManual,
                    afterAuto: beforeAuto - afterAuto,
                    final: sorted.length,
                },
            });
        }),
        // sortChannels already returns ChannelModel[], no need to map again
        switchMap((result) => {
            console.log(`[ClassifiedGroup ${title}] Final result: ${result.channels.length} ChannelModel objects`);
            return of$({channels: result.channels, filterStats: result.filterStats});
        }),
        distinctUntilChanged((a, b) => {
            if (a.channels.length !== b.channels.length) {
                return false;
            }
            return a.channels.every((ch, i) => ch && b.channels[i] && ch.id === b.channels[i].id);
        }),
    );

    return {
        sortedChannels: sortedChannels.pipe(map(r => r.channels)),
        filterStats: sortedChannels.pipe(map(r => r.filterStats)),
        title: of$(title),
        groupId: of$(groupId),
        onChannelSwitch: of$(onChannelSwitch),
    };
});

export default withDatabase(enhanced(ClassifiedGroup));
