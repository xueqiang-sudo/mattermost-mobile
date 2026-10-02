// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {General} from '@constants';
import {parseUserIdsFromGroupedChannelName} from '@queries/servers/channel';
import {getUserIdFromChannelName} from '@utils/user';

import type ChannelModel from '@typings/database/models/servers/channel';
import type ChannelMembershipModel from '@typings/database/models/servers/channel_membership';

/**
 * Classify a single channel as 'internal' or 'external' based on team membership.
 *
 * Rules (aligned with webapp classifyChannel):
 * - Public channels are always internal.
 * - DM: internal if the other user is a bot (always internal) or belongs to the current team.
 * - GM / Private: internal if ALL human (non-bot) members (excluding self) belong to the current team.
 * - Fallback: external.
 */
export function classifyChannel(
    channel: ChannelModel,
    currentUserId: string,
    teamMemberIds: ReadonlySet<string>,
    gmMemberIds: ReadonlyMap<string, string[]>,
    botUserIds: ReadonlySet<string>,
): 'internal' | 'external' {
    // Public channels always internal
    if (channel.type === General.OPEN_CHANNEL) {
        return 'internal';
    }

    // DM: check if the other user is in the current team.
    // Bot users are always internal (aligned with webapp).
    if (channel.type === General.DM_CHANNEL) {
        const otherUserId = getUserIdFromChannelName(currentUserId, channel.name);
        if (!otherUserId) {
            return 'external';
        }
        if (botUserIds.has(otherUserId)) {
            return 'internal';
        }
        return teamMemberIds.has(otherUserId) ? 'internal' : 'external';
    }

    // GM / Private: check if ALL human (non-bot) members (excluding self) are in the current team
    if (channel.type === General.GM_CHANNEL || channel.type === General.PRIVATE_CHANNEL) {
        let memberIds = parseUserIdsFromGroupedChannelName(channel.name);
        if (!memberIds) {
            memberIds = gmMemberIds.get(channel.id) ?? [];
        }

        if (memberIds.length === 0) {
            return 'external';
        }

        // ALL members (excluding self and bots) must be in the team for it to be internal
        for (const memberId of memberIds) {
            if (memberId === currentUserId) {
                continue;
            }
            if (botUserIds.has(memberId)) {
                continue;
            }
            if (!teamMemberIds.has(memberId)) {
                return 'external';
            }
        }
        return 'internal';
    }

    return 'external';
}

/**
 * Build a map of channelId → member userId[] for GM channels whose names
 * cannot be parsed by parseUserIdsFromGroupedChannelName.
 * Only includes channels that need the fallback (non-parseable GM names).
 */
export function buildGmMemberMap(
    channels: ChannelModel[],
    allMemberships: ChannelMembershipModel[],
): Map<string, string[]> {
    // Find GM channels with non-parseable names
    const needsFallback = new Set<string>();
    for (const ch of channels) {
        if (ch.type === General.GM_CHANNEL || ch.type === General.PRIVATE_CHANNEL) {
            if (!parseUserIdsFromGroupedChannelName(ch.name)) {
                needsFallback.add(ch.id);
            }
        }
    }

    if (needsFallback.size === 0) {
        return new Map();
    }

    const map = new Map<string, string[]>();
    for (const m of allMemberships) {
        if (needsFallback.has(m.channelId)) {
            const arr = map.get(m.channelId) ?? [];
            arr.push(m.userId);
            map.set(m.channelId, arr);
        }
    }
    return map;
}
