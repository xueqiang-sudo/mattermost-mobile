// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import React from 'react';
import {of as of$} from 'rxjs';
import {combineLatestWith, distinctUntilChanged, map, switchMap} from 'rxjs/operators';

import LeaveChannelLabel from '@components/channel_actions/leave_channel_label';
import {General, Permissions} from '@constants';
import {observeChannel} from '@queries/servers/channel';
import {observePermissionForChannel, observePermissionForTeam} from '@queries/servers/role';
import {observeCurrentTeam} from '@queries/servers/team';
import {observeCurrentUser} from '@queries/servers/user';
import {isDefaultChannel} from '@utils/channel';

import ChannelInfoCard from '../channel_info_card';
import {CHANNEL_INFO_CARD_INNER_PADDING, CHANNEL_INFO_SECTION_GAP} from '../channel_info_constants';

import Archive from './archive';
import ConvertPrivate from './convert_private';

import type {WithDatabaseArgs} from '@typings/database/database';
import type {AvailableScreens} from '@typings/screens/navigation';

type Props = {
    channelId: string;
    componentId: AvailableScreens;
}

type BodyProps = Props & {
    hasDestructiveRows: boolean;
    resolvedType?: ChannelType;
}

const DestructiveOptionsBody = ({channelId, componentId, hasDestructiveRows, resolvedType}: BodyProps) => {
    if (!hasDestructiveRows) {
        return null;
    }

    const type = resolvedType;

    return (
        <ChannelInfoCard
            contentStyle={{
                paddingVertical: 8,
                paddingHorizontal: CHANNEL_INFO_CARD_INNER_PADDING,
            }}
            style={{marginTop: CHANNEL_INFO_SECTION_GAP}}
            testID='channel_info.card.destructive'
        >
            {type === General.OPEN_CHANNEL &&
            <ConvertPrivate channelId={channelId}/>
            }
            <LeaveChannelLabel
                channelId={channelId}
                isOptionItem={true}
                testID='channel_info.options.leave_channel.option'
            />
            {type !== General.DM_CHANNEL && type !== General.GM_CHANNEL &&
            <Archive
                channelId={channelId}
                componentId={componentId}
                type={type}
            />
            }
        </ChannelInfoCard>
    );
};

type OwnProps = WithDatabaseArgs & Props;

const enhanced = withObservables(['channelId'], ({channelId, database}: OwnProps) => {
    const currentUser = observeCurrentUser(database);
    const team = observeCurrentTeam(database);
    const channel = observeChannel(database, channelId);
    const canLeave = channel.pipe(
        combineLatestWith(currentUser),
        switchMap(([ch, u]) => {
            const isDC = isDefaultChannel(ch);
            return of$(!isDC || (isDC && Boolean(u?.isGuest)));
        }),
    );
    const displayName = channel.pipe(
        switchMap((c) => of$(c?.displayName)),
    );
    const resolvedType = channel.pipe(
        switchMap((c) => of$(c?.type)),
    );
    const isArchived = channel.pipe(
        switchMap((c) => of$((c?.deleteAt || 0) > 0)),
    );

    const canConvert = channel.pipe(
        combineLatestWith(currentUser),
        switchMap(([ch, u]) => {
            if (!ch || !u || isDefaultChannel(ch)) {
                return of$(false);
            }

            return observePermissionForChannel(database, ch, u, Permissions.CONVERT_PUBLIC_CHANNEL_TO_PRIVATE, false);
        }),
    );

    const canArchive = channel.pipe(
        combineLatestWith(currentUser, canLeave, isArchived, resolvedType),
        switchMap(([ch, u, leave, archived, t]) => {
            if (
                t === General.DM_CHANNEL || t === General.GM_CHANNEL ||
                !ch || !u || !leave || archived
            ) {
                return of$(false);
            }

            if (t === General.OPEN_CHANNEL) {
                return observePermissionForChannel(database, ch, u, Permissions.DELETE_PUBLIC_CHANNEL, true);
            }

            return observePermissionForChannel(database, ch, u, Permissions.DELETE_PRIVATE_CHANNEL, true);
        }),
    );

    const canUnarchive = team.pipe(
        combineLatestWith(currentUser, isArchived, resolvedType),
        switchMap(([tm, u, archived, chType]) => {
            if (
                chType === General.DM_CHANNEL || chType === General.GM_CHANNEL ||
                !tm || !u || !archived
            ) {
                return of$(false);
            }

            return observePermissionForTeam(database, tm, u, Permissions.MANAGE_TEAM, false);
        }),
    );

    const hasDestructiveRows = channel.pipe(
        combineLatestWith(canLeave, displayName, resolvedType, canConvert, canArchive, canUnarchive),
        map(([, cl, dn, t, cc, ca, cu]) => {
            const showConvert = t === General.OPEN_CHANNEL && cc;
            const showArchive = Boolean(
                t && t !== General.DM_CHANNEL && t !== General.GM_CHANNEL && (ca || cu),
            );
            const showLeave = Boolean(dn && t && cl);
            return Boolean(showConvert || showArchive || showLeave);
        }),
        distinctUntilChanged(),
    );

    return {
        hasDestructiveRows,
        resolvedType,
    };
});

export default withDatabase(enhanced(DestructiveOptionsBody));
