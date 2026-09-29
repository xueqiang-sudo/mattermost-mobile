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
        // Collect unique channel IDs from all built-in categories
        const builtInChannelIds = of$(builtInCategories).pipe(
            switchMap(async (cats) => {
                const ids = new Set<string>();
                for (const cat of cats) {
                    const cc = await cat.categoryChannels.fetch();
                    for (const c of cc) {
                        ids.add(c.channelId);
                    }
                }
                return Array.from(ids);
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
                return a.internal.every((id, i) => id === b.internal[i]) &&
                       a.external.every((id, i) => id === b.external[i]);
            }),
        );

        return {
            internalChannelIds: classified.pipe(map((c) => c.internal)),
            externalChannelIds: classified.pipe(map((c) => c.external)),
            locale,
            isTablet,
            onChannelSwitch,
        };
    },
);

const BuiltinChannelGroups = withDatabase(enhanced(BuiltinChannelGroupsRenderer));

export default BuiltinChannelGroups;
