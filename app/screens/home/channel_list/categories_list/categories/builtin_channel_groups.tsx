// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {useIntl} from 'react-intl';
import {Q} from '@nozbe/watermelondb';
import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import {of as of$} from 'rxjs';
import {switchMap, combineLatestWith, distinctUntilChanged, map} from 'rxjs/operators';

import {MM_TABLES} from '@constants/database';
import {queryChannelsById} from '@queries/servers/channel';
import {observeUserIdsInTeam} from '@queries/servers/user';
import {buildGmMemberMap, classifyChannel} from '@utils/channel_classification';
import {from} from 'rxjs';

// Import from ./classified_group/index explicitly to get the withObservables-wrapped
// version that accepts channelIds:string[] and resolves them to sortedChannels:ChannelModel[].
// A bare './classified_group' import resolves to classified_group.tsx (the raw component
// which expects sortedChannels directly), not classified_group/index.ts (the wrapper).
import ClassifiedGroup from './classified_group/index';

import type {WithDatabaseArgs} from '@typings/database/database';
import type CategoryModel from '@typings/database/models/servers/category';
import type ChannelModel from '@typings/database/models/servers/channel';
import type ChannelMembershipModel from '@typings/database/models/servers/channel_membership';
import type MyChannelModel from '@typings/database/models/servers/my_channel';
import type UserModel from '@typings/database/models/servers/user';

const {SERVER: {CHANNEL_MEMBERSHIP, USER}} = MM_TABLES;

type EnhanceProps = {
    builtInCategories: CategoryModel[];
    customCategories: CategoryModel[];
    currentUserId: string;
    locale: string;
    isTablet: boolean;
    onChannelSwitch: (channel: Channel | ChannelModel) => void;
} & WithDatabaseArgs;

type RenderProps = {
    internalChannelIds: string[];
    externalChannelIds: string[];
    locale: string;
    isTablet: boolean;
    onChannelSwitch: (channel: Channel | ChannelModel) => void;
};

const BuiltinChannelGroupsRenderer = ({
    internalChannelIds,
    externalChannelIds,
    locale,
    isTablet,
    onChannelSwitch,
}: RenderProps) => {
    const intl = useIntl();
    const internalTitle = intl.formatMessage({id: 'sidebar.classification.internal', defaultMessage: 'Internal'});
    const externalTitle = intl.formatMessage({id: 'sidebar.classification.external', defaultMessage: 'External'});

    return (
        <>
            <ClassifiedGroup
                title={internalTitle}
                groupId='internal'
                channelIds={internalChannelIds}
                locale={locale}
                isTablet={isTablet}
                onChannelSwitch={onChannelSwitch}
            />
            <ClassifiedGroup
                title={externalTitle}
                groupId='external'
                channelIds={externalChannelIds}
                locale={locale}
                isTablet={isTablet}
                onChannelSwitch={onChannelSwitch}
            />
        </>
    );
};

const enhanced = withObservables(
    ['builtInCategories', 'customCategories', 'currentUserId'],
    ({builtInCategories, customCategories, currentUserId, database, locale, isTablet, onChannelSwitch}: EnhanceProps) => {
        // Get current team ID
        const currentTeamId = of$(builtInCategories).pipe(
            map(cats => {
                const teamId = cats[0]?.teamId || '';
                return teamId;
            }),
        );

        // Observe TEAM_MEMBERSHIP reactively so classification updates
        // when fetchTeamMembersForClassification writes new members
        const teamMemberIds$ = currentTeamId.pipe(
            switchMap((tid) => (tid ? observeUserIdsInTeam(database, tid) : of$(new Set<string>()))),
        );

        // Get channel IDs from custom categories using observables
        const customCategoryChannelIds = of$(customCategories).pipe(
            switchMap((cats) => {
                return from((async () => {
                    const customIds = new Set<string>();
                    for (const cat of cats) {
                        const cc = await cat.categoryChannels.fetch();
                        for (const c of cc) {
                            customIds.add(c.channelId);
                        }
                    }
                    return customIds;
                })());
            }),
        );

        // Get channel IDs from built-in categories (DM/GM channels are placed here by the server per team)
        const builtInCategoryChannelIds = of$(builtInCategories).pipe(
            switchMap((cats) => {
                return from((async () => {
                    const ids = new Set<string>();
                    for (const cat of cats) {
                        const cc = await cat.categoryChannels.fetch();
                        for (const c of cc) {
                            ids.add(c.channelId);
                        }
                    }
                    return ids;
                })());
            }),
        );

        // Get ALL channels the user is a member of by querying MyChannel table
        // This ensures we only get channels that have MyChannel records (which ClassifiedGroup needs)
        const {SERVER: {MY_CHANNEL}} = MM_TABLES;
        const allUserChannels = database.get<MyChannelModel>(MY_CHANNEL)
            .query()
            .observe()
            .pipe(
                switchMap((myChannels) => {
                    const channelIds = myChannels.map(m => m.id);
                    if (channelIds.length === 0) {
                        return of$([] as ChannelModel[]);
                    }
                    return queryChannelsById(database, channelIds).observe();
                }),
            );

        // Filter: channels in current team (by team_id), DM/GM only if in a built-in category for this team.
        // This matches webapp behavior where DM/GM channels are team-scoped via category membership.
        const builtInChannelIds = allUserChannels.pipe(
            combineLatestWith(customCategoryChannelIds, currentTeamId, builtInCategoryChannelIds),
            map(([channels, customIds, teamId, builtInIds]) => {
                const filtered = channels.filter(ch => {
                    const isDmOrGm = ch.type === 'D' || ch.type === 'G';
                    // Non-DM/GM: match by team_id
                    // DM/GM: only include if in a built-in category for this team
                    const isInTeam = isDmOrGm ? builtInIds.has(ch.id) : ch.teamId === teamId;
                    const notInCustom = !customIds.has(ch.id);
                    return isInTeam && notInCustom;
                });

                return filtered.map(ch => ch.id);
            }),
        );

        // Observe all channels with those IDs
        const channels = builtInChannelIds.pipe(
            switchMap((ids) =>
                ids.length > 0
                    ? queryChannelsById(database, ids).observe()
                    : of$([] as ChannelModel[]),
            ),
        );

        // For GM channels with non-parseable names, observe their memberships
        const gmMemberMap = channels.pipe(
            switchMap((chs) => {
                const gmIds = chs
                    .filter((c) => c.type === 'G' || c.type === 'P')
                    .map((c) => c.id);
                if (gmIds.length === 0) {
                    return of$(new Map<string, string[]>());
                }
                return database.get<ChannelMembershipModel>(CHANNEL_MEMBERSHIP)
                    .query(Q.where('channel_id', Q.oneOf(gmIds)))
                    .observe()
                    .pipe(
                        map((memberships) => buildGmMemberMap(chs, memberships)),
                    );
            }),
        );

        // Observe bot user IDs among channel members
        const botUserIds = channels.pipe(
            switchMap((chs) => {
                const channelIds = chs
                    .filter(c => c.type === 'G' || c.type === 'P' || c.type === 'D')
                    .map(c => c.id);
                if (channelIds.length === 0) {
                    return of$(new Set<string>());
                }
                return database.get<ChannelMembershipModel>(CHANNEL_MEMBERSHIP)
                    .query(Q.where('channel_id', Q.oneOf(channelIds)))
                    .observe()
                    .pipe(
                        switchMap((memberships) => {
                            const userIds = [...new Set(memberships.map(m => m.userId))];
                            if (userIds.length === 0) {
                                return of$(new Set<string>());
                            }
                            return database.get<UserModel>(USER)
                                .query(Q.where('id', Q.oneOf(userIds)))
                                .observe()
                                .pipe(
                                    map((users) => {
                                        const botIds = new Set<string>();
                                        for (const u of users) {
                                            if (u.isBot) {
                                                botIds.add(u.id);
                                            }
                                        }
                                        return botIds;
                                    }),
                                );
                        }),
                    );
            }),
        );

        // Classify channels into internal/external
        const classified = channels.pipe(
            combineLatestWith(gmMemberMap, of$(currentUserId), teamMemberIds$, botUserIds),
            map(([chs, gmMembers, userId, teamMembers, bots]) => {
                const internal: string[] = [];
                const external: string[] = [];

                for (const channel of chs) {
                    const group = classifyChannel(channel, userId, teamMembers, gmMembers, bots);
                    if (group === 'internal') {
                        internal.push(channel.id);
                    } else {
                        external.push(channel.id);
                    }
                }

                return {internal, external};
            }),
            distinctUntilChanged((a, b) => {
                if (a.internal.length !== b.internal.length || a.external.length !== b.external.length) {
                    return false;
                }
                return a.internal.every((id, i) => id != null && b.internal[i] != null && id === b.internal[i]) &&
                       a.external.every((id, i) => id != null && b.external[i] != null && id === b.external[i]);
            }),
        );

        return {
            internalChannelIds: classified.pipe(map((c) => c.internal)),
            externalChannelIds: classified.pipe(map((c) => c.external)),
            locale: of$(locale),
            isTablet: of$(isTablet),
            onChannelSwitch: of$(onChannelSwitch),
        };
    },
);

const BuiltinChannelGroups = withDatabase(enhanced(BuiltinChannelGroupsRenderer));

export default BuiltinChannelGroups;
