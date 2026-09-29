// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {useIntl} from 'react-intl';
import {Alert} from 'react-native';
import {Q} from '@nozbe/watermelondb';
import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import {of as of$} from 'rxjs';
import {switchMap, combineLatestWith, distinctUntilChanged, map} from 'rxjs/operators';

import {MM_TABLES} from '@constants/database';
import {queryChannelsById} from '@queries/servers/channel';
import {buildGmMemberMap, classifyChannel} from '@utils/channel_classification';

import ClassifiedGroup from './classified_group';

import type {WithDatabaseArgs} from '@typings/database/database';
import type CategoryModel from '@typings/database/models/servers/category';
import type ChannelModel from '@typings/database/models/servers/channel';
import type ChannelMembershipModel from '@typings/database/models/servers/channel_membership';

const {SERVER: {CHANNEL_MEMBERSHIP}} = MM_TABLES;

type EnhanceProps = {
    builtInCategories: CategoryModel[];
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

    // Debug: Show alert with counts (temporary for debugging on real device)
    React.useEffect(() => {
        console.log('[BuiltinChannelGroups] Rendering with Internal:', internalChannelIds.length, 'External:', externalChannelIds.length);
        // Show alert on device for debugging
        Alert.alert('群组统计', `内部群: ${internalChannelIds.length}\n外部群: ${externalChannelIds.length}`);
    }, [internalChannelIds.length, externalChannelIds.length]);

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
    ['builtInCategories', 'teamMemberIds', 'currentUserId'],
    ({builtInCategories, teamMemberIds, currentUserId, database, locale, isTablet, onChannelSwitch}: EnhanceProps) => {
        // Get current team ID
        const currentTeamId = of$(builtInCategories).pipe(
            map(cats => cats[0]?.teamId || ''),
        );

        // Collect channel IDs from custom categories (to exclude them)
        const customCategoryChannelIds = currentTeamId.pipe(
            switchMap(async (teamId) => {
                const customIds = new Set<string>();
                if (!teamId) return customIds;

                // Get all custom categories for this team
                const allCategories = await database.get<CategoryModel>('category')
                    .query(Q.where('team_id', teamId))
                    .fetch();
                for (const cat of allCategories) {
                    if (cat.type === 'custom') {
                        const cc = await cat.categoryChannels.fetch();
                        for (const c of cc) {
                            customIds.add(c.channelId);
                        }
                    }
                }
                return customIds;
            }),
        );

        // Get ALL channels the user is a member of (including GM, DM, public, private)
        const allUserChannels = database.get<ChannelMembershipModel>(CHANNEL_MEMBERSHIP)
            .query()
            .observe()
            .pipe(
                switchMap((memberships) => {
                    const channelIds = memberships.map(m => m.channelId);
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
                return channels
                    .filter(ch => {
                        // Include if:
                        // 1. It's a DM/GM (team_id might be empty or different)
                        // 2. OR it belongs to the current team
                        // AND it's not in a custom category
                        const isInTeam = ch.type === 'D' || ch.type === 'G' || ch.teamId === teamId;
                        const notInCustom = !customIds.has(ch.id);
                        return isInTeam && notInCustom;
                    })
                    .map(ch => ch.id);
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

                console.log('[BuiltinChannelGroups] Classifying', chs.length, 'channels');
                console.log('[BuiltinChannelGroups] Team members:', teamMembers.size);

                for (const channel of chs) {
                    const group = classifyChannel(channel, userId, teamMembers, gmMembers);
                    if (group === 'internal') {
                        internal.push(channel.id);
                    } else {
                        external.push(channel.id);
                    }
                }

                console.log('[BuiltinChannelGroups] Result: Internal:', internal.length, 'External:', external.length);

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
