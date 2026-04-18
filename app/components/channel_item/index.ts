// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import React from 'react';
import {asyncScheduler, combineLatest, of as of$} from 'rxjs';
import {distinctUntilChanged, map, shareReplay, switchMap, throttleTime} from 'rxjs/operators';

import {observeChannelsWithCalls} from '@calls/state';
import {General, Preferences} from '@constants';
import {withServerUrl} from '@context/server';
import {getDisplayNamePreferenceAsBool} from '@helpers/api/preference';
import {observeIsMutedSetting, observeMyChannel, queryChannelMembers} from '@queries/servers/channel';
import {queryDraft} from '@queries/servers/drafts';
import {observeLastPostInChannel} from '@queries/servers/post';
import {queryDisplayNamePreferences} from '@queries/servers/preference';
import {observeCurrentChannelId, observeCurrentUserId} from '@queries/servers/system';
import {observeTeam} from '@queries/servers/team';
import {observeCurrentUser} from '@queries/servers/user';
import {getTimezone} from '@utils/user';

import ChannelItem, {ROW_HEIGHT, ROW_HEIGHT_CENTER_LIST, ROW_HEIGHT_CONVERSATION, ROW_HEIGHT_WITH_TEAM} from './channel_item';
import {HOME_CONVERSATION_LAST_POST_THROTTLE_MS} from './conversation_list_constants';

import type {WithDatabaseArgs} from '@typings/database/database';
import type ChannelModel from '@typings/database/models/servers/channel';

type EnhanceProps = WithDatabaseArgs & {
    channel: ChannelModel | Channel;
    showTeamName?: boolean;
    serverUrl?: string;
    shouldHighlightActive?: boolean;
    shouldHighlightState?: boolean;
    isOnHome?: boolean;
    showChannelTypeTag?: boolean;
}

const enhance = withObservables(['channel', 'shouldHighlightActive', 'shouldHighlightState', 'isOnHome'], ({
    channel,
    database,
    serverUrl,
    shouldHighlightActive = false,
    shouldHighlightState = false,
    isOnHome = false,
}: EnhanceProps) => {
    const currentUserId = observeCurrentUserId(database);
    const myChannel = observeMyChannel(database, channel.id);

    const hasDraft = shouldHighlightState ? queryDraft(database, channel.id).observeWithColumns(['message', 'files', 'metadata']).pipe(
        switchMap((drafts) => {
            if (!drafts.length) {
                return of$(false);
            }

            const draft = drafts[0];
            const standardPriority = draft?.metadata?.priority?.priority === '';

            if (!draft.message && !draft.files.length && standardPriority) {
                return of$(false);
            }

            return of$(true);
        }),
        distinctUntilChanged(),
    ) : of$(false);

    const isActive = shouldHighlightActive ?
        observeCurrentChannelId(database).pipe(
            switchMap((id) => of$(id ? id === channel.id : false)),
            distinctUntilChanged(),
        ) : of$(false);

    const isMuted = shouldHighlightState ?
        myChannel.pipe(
            switchMap((mc) => {
                if (!mc) {
                    return of$(false);
                }
                return observeIsMutedSetting(database, mc.id);
            }),
        ) : of$(false);

    const teamId = 'teamId' in channel ? channel.teamId : channel.team_id;
    const teamDisplayName = teamId ?
        observeTeam(database, teamId).pipe(
            switchMap((team) => of$(team?.displayName || '')),
            distinctUntilChanged(),
        ) : of$('');

    const membersCount =
        channel.type === General.GM_CHANNEL ||
        channel.type === General.OPEN_CHANNEL ||
        channel.type === General.PRIVATE_CHANNEL ?
            queryChannelMembers(database, channel.id).observeCount(false) :
            of$(0);

    const isUnread = shouldHighlightState ?
        myChannel.pipe(
            switchMap((mc) => of$(mc?.isUnread)),
            distinctUntilChanged(),
        ) : of$(false);

    const mentionsCount = shouldHighlightState ?
        myChannel.pipe(
            switchMap((mc) => of$(mc?.mentionsCount ?? 0)),
            distinctUntilChanged(),
        ) : of$(0);

    const messageCount = shouldHighlightState ?
        myChannel.pipe(
            switchMap((mc) => of$(mc?.messageCount ?? 0)),
            distinctUntilChanged(),
        ) : of$(0);

    const hasCall = observeChannelsWithCalls(serverUrl || '').pipe(
        switchMap((calls) => of$(Boolean(calls[channel.id]))),
        distinctUntilChanged(),
    );

    const lastPostSource = observeLastPostInChannel(database, channel.id).pipe(
        shareReplay({bufferSize: 1, refCount: true}),
    );
    const lastPost = isOnHome ?
        lastPostSource.pipe(
            throttleTime(HOME_CONVERSATION_LAST_POST_THROTTLE_MS, asyncScheduler, {leading: true, trailing: true}),
            shareReplay({bufferSize: 1, refCount: true}),
        ) :
        lastPostSource;
    const lastPostAt = (isOnHome && shouldHighlightState) ?
        combineLatest([lastPost, myChannel]).pipe(
            map(([post, mc]) => Math.max(post?.createAt ?? 0, mc?.lastPostAt ?? 0)),
            distinctUntilChanged(),
        ) : of$(0);

    const lastPostPreview = isOnHome ?
        lastPost.pipe(
            switchMap((post) => of$(post?.message ?? '')),
            distinctUntilChanged(),
        ) : of$('');

    const currentTimezone = observeCurrentUser(database).pipe(
        map((user) => getTimezone(user?.timezone) || null),
        distinctUntilChanged(),
    );

    const isMilitaryTime = queryDisplayNamePreferences(database).
        observeWithColumns(['value']).pipe(
            map((prefs) => getDisplayNamePreferenceAsBool(prefs, Preferences.USE_MILITARY_TIME)),
            distinctUntilChanged(),
        );

    return {
        channel: 'observe' in channel ? channel.observe() : of$(channel),
        currentUserId,
        currentTimezone,
        hasDraft,
        isActive,
        isMuted,
        membersCount,
        isUnread,
        mentionsCount,
        messageCount,
        teamDisplayName,
        hasCall,
        lastPostAt,
        lastPostPreview,
        isMilitaryTime,
    };
});

export {ROW_HEIGHT, ROW_HEIGHT_CENTER_LIST, ROW_HEIGHT_CONVERSATION, ROW_HEIGHT_WITH_TEAM};
export default React.memo(withDatabase(withServerUrl(enhance(ChannelItem))));
