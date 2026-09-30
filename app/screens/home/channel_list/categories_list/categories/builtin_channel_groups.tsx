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

const {SERVER: {CHANNEL_MEMBERSHIP}} = MM_TABLES;

type EnhanceProps = {
    builtInCategories: CategoryModel[];
    customCategories: CategoryModel[];
    teamMemberIds: ReadonlySet<string>;
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
    ['builtInCategories', 'customCategories', 'teamMemberIds', 'currentUserId'],
    ({builtInCategories, customCategories, teamMemberIds, currentUserId, database, locale, isTablet, onChannelSwitch}: EnhanceProps) => {
        // Get current team ID
        const currentTeamId = of$(builtInCategories).pipe(
            map(cats => {
                const teamId = cats[0]?.teamId || '';
                return teamId;
            }),
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

        // Filter: only channels in current team, not in custom categories
        const builtInChannelIds = allUserChannels.pipe(
            combineLatestWith(customCategoryChannelIds, currentTeamId),
            map(([channels, customIds, teamId]) => {
                const filtered = channels.filter(ch => {
                    // Include if:
                    // 1. It's a DM/GM (team_id might be empty or different)
                    // 2. OR it belongs to the current team
                    // AND it's not in a custom category
                    const isInTeam = ch.type === 'D' || ch.type === 'G' || ch.teamId === teamId;
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

        // Classify channels into internal/external
        const classified = channels.pipe(
            combineLatestWith(gmMemberMap, of$(currentUserId), of$(teamMemberIds)),
            map(([chs, gmMembers, userId, teamMembers]) => {
                const internal: string[] = [];
                const external: string[] = [];

                for (const channel of chs) {
                    const group = classifyChannel(channel, userId, teamMembers, gmMembers);
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
