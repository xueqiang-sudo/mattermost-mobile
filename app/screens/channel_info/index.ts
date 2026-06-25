// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import {combineLatest, of as of$} from 'rxjs';
import {distinctUntilChanged, switchMap, combineLatestWith, map} from 'rxjs/operators';

import {observeIsCallsEnabledInChannel} from '@calls/observers';
import {observeCallsConfig} from '@calls/state';
import {General} from '@constants';
import {withServerUrl} from '@context/server';
import {observeIsPlaybooksEnabled} from '@playbooks/database/queries/version';
import {observeIsChannelFavorited} from '@queries/servers/categories';
import {
    observeChannelMembers,
    observeChannelSettings,
    observeCurrentChannel,
    observeIsMutedSetting,
} from '@queries/servers/channel';
import {observeCanAddBookmarks} from '@queries/servers/channel_bookmark';
import {observeCanManageChannelMembers, observeCanManageChannelSettings} from '@queries/servers/role';
import {
    observeConfigBooleanValue,
    observeConfigValue,
    observeCurrentChannelId,
    observeCurrentTeamId,
    observeCurrentUserId,
} from '@queries/servers/system';
import {observeCurrentTeam} from '@queries/servers/team';
import {observeIsCRTEnabled} from '@queries/servers/thread';
import {observeCurrentUser, observeUser, observeUserIsChannelAdmin, observeUserIsTeamAdmin} from '@queries/servers/user';
import {getChannelTitleDisplayName, isDefaultChannel, isTypeDMorGM} from '@utils/channel';
import {isMinimumServerVersion} from '@utils/helpers';
import {getUserIdFromChannelName, isSystemAdmin} from '@utils/user';

import ChannelInfo from './channel_info';

import type {WithDatabaseArgs} from '@typings/database/database';

type Props = WithDatabaseArgs & {
    serverUrl: string;
}

const enhanced = withObservables([], ({serverUrl, database}: Props) => {
    const channel = observeCurrentChannel(database);
    const type = channel.pipe(switchMap((c) => of$(c?.type)));
    const channelId = channel.pipe(switchMap((c) => of$(c?.id || '')));
    const teamId = channel.pipe(switchMap((c) => (c?.teamId ? of$(c.teamId) : observeCurrentTeamId(database))));
    const userId = observeCurrentUserId(database);
    const currentUser = observeCurrentUser(database);
    const isTeamAdmin = combineLatest([teamId, userId]).pipe(
        switchMap(([tId, uId]) => observeUserIsTeamAdmin(database, uId, tId)),
    );
    const isChannelCreator = combineLatest([channel, userId]).pipe(
        switchMap(([c, uId]) => of$(Boolean(c?.creatorId && c.creatorId === uId))),
        distinctUntilChanged(),
    );

    const callsPluginEnabled = observeCallsConfig(serverUrl).pipe(
        switchMap((config) => of$(config.pluginEnabled)),
        distinctUntilChanged(),
    );

    // callsDefaultEnabled means "live mode" post 7.6
    const callsDefaultEnabled = observeCallsConfig(serverUrl).pipe(
        switchMap((config) => of$(config.DefaultEnabled)),
        distinctUntilChanged(),
    );
    const allowEnableCalls = observeCallsConfig(serverUrl).pipe(
        switchMap((config) => of$(config.AllowEnableCalls)),
        distinctUntilChanged(),
    );
    const systemAdmin = currentUser.pipe(
        switchMap((u) => (u ? of$(u.roles) : of$(''))),
        switchMap((roles) => of$(isSystemAdmin(roles || ''))),
        distinctUntilChanged(),
    );
    const channelAdmin = combineLatest([userId, channelId]).pipe(
        switchMap(([uId, chId]) => observeUserIsChannelAdmin(database, uId, chId)),
        distinctUntilChanged(),
    );
    const serverVersion = observeConfigValue(database, 'Version');
    const callsGAServer = serverVersion.pipe(
        switchMap((v) => of$(isMinimumServerVersion(v || '', 7, 6))),
    );
    const dmOrGM = type.pipe(switchMap((t) => of$(isTypeDMorGM(t))));
    const isTeamDefaultOpenChannel = channel.pipe(
        switchMap((c) => of$(Boolean(c?.type === General.OPEN_CHANNEL && isDefaultChannel(c)))),
    );
    const canEnableDisableCalls = combineLatest([callsPluginEnabled, callsDefaultEnabled, allowEnableCalls, systemAdmin, channelAdmin, callsGAServer, dmOrGM, isTeamAdmin]).pipe(
        switchMap(([pluginEnabled, liveMode, allow, sysAdmin, chAdmin, gaServer, dmGM, tAdmin]) => {
            // Always false if the plugin is not enabled.
            // if GA 7.6:
            //   allow (will always be true) and !liveMode = system admins can enable/disable
            //   allow (will always be true) and liveMode = channel, team, system admins, DM/GM participants can enable/disable
            // if pre GA 7.6:
            //   allow and !liveMode  = channel, system admins, DM/GM participants can enable/disable
            //   allow and liveMode   = channel, system admins, DM/GM participants can enable/disable
            //   !allow and !liveMode = system admins can enable/disable -- can combine with below
            //   !allow and liveMode  = system admins can enable/disable -- can combine with above
            // Note: There are ways to 'simplify' the conditions below. Here we're preferring clarity.

            if (!pluginEnabled) {
                return of$(false);
            }

            if (gaServer) {
                if (allow && !liveMode) {
                    return of$(Boolean(sysAdmin));
                }
                if (allow && liveMode) {
                    return of$(Boolean(chAdmin || tAdmin || sysAdmin || dmGM));
                }
                return of$(false);
            }

            // now we're pre GA 7.6
            if (allow && liveMode) {
                return of$(Boolean(chAdmin || sysAdmin || dmGM));
            }
            if (allow && !liveMode) {
                return of$(Boolean(sysAdmin || chAdmin || dmGM));
            }
            if (!allow) {
                return of$(Boolean(sysAdmin));
            }
            return of$(false);
        }),
    );
    const isCallsEnabledInChannel = observeIsCallsEnabledInChannel(database, serverUrl, observeCurrentChannelId(database));
    const groupCallsAllowed = observeCallsConfig(serverUrl).pipe(
        switchMap((config) => of$(config.GroupCallsAllowed)),
        distinctUntilChanged(),
    );

    const canManageMembers = currentUser.pipe(
        combineLatestWith(channelId),
        switchMap(([u, cId]) => (u ? observeCanManageChannelMembers(database, cId, u) : of$(false))),
        distinctUntilChanged(),
    );

    const canManageSettings = currentUser.pipe(
        combineLatestWith(channelId),
        switchMap(([u, cId]) => (u ? observeCanManageChannelSettings(database, cId, u) : of$(false))),
        distinctUntilChanged(),
    );

    const isGuestUser = currentUser.pipe(
        switchMap((u) => (u ? of$(u.isGuest) : of$(false))),
        distinctUntilChanged(),
    );

    const isConvertGMFeatureAvailable = serverVersion.pipe(
        switchMap((version) => of$(isMinimumServerVersion(version || '', 9, 1))),
    );

    const isBookmarksEnabled = observeConfigBooleanValue(database, 'FeatureFlagChannelBookmarks');

    const canAddBookmarks = channelId.pipe(
        switchMap((cId) => {
            return observeCanAddBookmarks(database, cId);
        }),
    );

    const isPlaybooksEnabled = observeIsPlaybooksEnabled(database);

    // New observables for PC-aligned channel info screens
    const isFavorite = combineLatest([teamId, channelId]).pipe(
        switchMap(([tId, cId]) => (tId && cId ? observeIsChannelFavorited(database, tId, cId) : of$(false))),
        distinctUntilChanged(),
    );

    const isMuted = channelId.pipe(
        switchMap((cId) => (cId ? observeIsMutedSetting(database, cId) : of$(false))),
        distinctUntilChanged(),
    );

    const channelSettings = channelId.pipe(
        switchMap((cId) => (cId ? observeChannelSettings(database, cId) : of$(undefined))),
    );

    const memberIds = channelId.pipe(
        switchMap((cId) => (cId ? observeChannelMembers(database, cId) : of$([]))),
        map((members) => members.map((m) => m.userId)),
        distinctUntilChanged(),
    );

    const channelMembersCount = memberIds.pipe(
        map((ids) => ids.length),
        distinctUntilChanged(),
    );

    // For DM: observe the other user in the conversation
    const dmUserId = combineLatest([observeCurrentUserId(database), channel]).pipe(
        switchMap(([currentUserId, c]) => {
            if (!c) {
                return of$('');
            }
            return of$(getUserIdFromChannelName(currentUserId, c.name));
        }),
        distinctUntilChanged(),
    );

    const dmUser = dmUserId.pipe(
        switchMap((id) => (id ? observeUser(database, id) : of$(undefined))),
    );

    const currentUserId = observeCurrentUserId(database);

    const currentTeam = observeCurrentTeam(database);
    const displayName = combineLatest([channel, currentTeam]).pipe(
        switchMap(([c, t]) => of$(getChannelTitleDisplayName(c, t?.displayName))),
        distinctUntilChanged(),
    );
    const displayNameCustomized = channel.pipe(
        switchMap((c) => of$(Boolean(c?.displayNameCustomized))),
        distinctUntilChanged(),
    );
    const teamInviteId = currentTeam.pipe(
        switchMap((t) => of$(t?.inviteId || '')),
        distinctUntilChanged(),
    );
    const teamDisplayName = currentTeam.pipe(
        switchMap((t) => of$(t?.displayName || '')),
        distinctUntilChanged(),
    );

    // For GM: get myNickname from channel settings
    const myNickname = channelSettings.pipe(
        switchMap((s) => of$((s?.notifyProps as Record<string, string>)?.nickname || '')),
        distinctUntilChanged(),
    );

    return {
        channelId,
        type,
        isTeamDefaultOpenChannel,
        canEnableDisableCalls,
        isCallsEnabledInChannel,
        groupCallsAllowed,
        canAddBookmarks,
        canManageMembers,
        canManageSettings,
        isBookmarksEnabled,
        isCRTEnabled: observeIsCRTEnabled(database),
        isGuestUser,
        isConvertGMFeatureAvailable,
        isPlaybooksEnabled,
        isFavorite,
        isMuted,
        channelSettings,
        memberIds,
        channelMembersCount,
        dmUser,
        currentUserId,
        myNickname,
        currentUser,
        displayName,
        displayNameCustomized,
        teamInviteId,
        teamDisplayName,
        isTeamAdmin,
        isChannelCreator,
    };
});

export default withDatabase(withServerUrl(enhanced(ChannelInfo)));
