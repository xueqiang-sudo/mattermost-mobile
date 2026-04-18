// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {General} from '@constants';

import {channelBelongsToTeamScopedConversations, parseUserIdsFromGroupedChannelName} from './channel';

import type ChannelModel from '@typings/database/models/servers/channel';

/** Mattermost-style 26-char lowercase ids */
const TID_USER_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaa';
const TID_USER_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbb';
const TID_USER_C = 'cccccccccccccccccccccccccc';
const TID_USER_ME = 'mmmmmmmmmmmmmmmmmmmmmmmmmm';
const TID_TEAM = 'tttttttttttttttttttttttttt';

function fakeCh(partial: Partial<ChannelModel>): ChannelModel {
    return partial as ChannelModel;
}

describe('parseUserIdsFromGroupedChannelName', () => {
    it('should parse DM-style names with two ids', () => {
        const name = `${TID_USER_A}__${TID_USER_ME}`;
        expect(parseUserIdsFromGroupedChannelName(name)).toEqual([TID_USER_A, TID_USER_ME]);
    });

    it('should parse GM-style names with three ids', () => {
        const name = `${TID_USER_A}__${TID_USER_B}__${TID_USER_ME}`;
        expect(parseUserIdsFromGroupedChannelName(name)).toEqual([TID_USER_A, TID_USER_B, TID_USER_ME]);
    });

    it('should return undefined for UUID-style ids with hyphens', () => {
        const name = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa__bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
        expect(parseUserIdsFromGroupedChannelName(name)).toBeUndefined();
    });

    it('should return undefined for fewer than two segments', () => {
        expect(parseUserIdsFromGroupedChannelName('onlyone')).toBeUndefined();
    });
});

describe('channelBelongsToTeamScopedConversations', () => {
    const teamMembers = new Set([TID_USER_ME, TID_USER_A, TID_USER_B]);

    it('should include team-bound open channel', () => {
        const ch = fakeCh({teamId: TID_TEAM, type: General.OPEN_CHANNEL, id: 'ch1', name: 'town-square'});
        expect(channelBelongsToTeamScopedConversations(ch, TID_TEAM, TID_USER_ME, teamMembers, new Map())).toBe(true);
    });

    it('should include DM when teammate is in team', () => {
        const name = TID_USER_A < TID_USER_ME ? `${TID_USER_A}__${TID_USER_ME}` : `${TID_USER_ME}__${TID_USER_A}`;
        const ch = fakeCh({teamId: '', type: General.DM_CHANNEL, id: 'dm1', name});
        expect(channelBelongsToTeamScopedConversations(ch, TID_TEAM, TID_USER_ME, teamMembers, new Map())).toBe(true);
    });

    it('should include DM without team when teammate is not in team roster', () => {
        const name = TID_USER_C < TID_USER_ME ? `${TID_USER_C}__${TID_USER_ME}` : `${TID_USER_ME}__${TID_USER_C}`;
        const ch = fakeCh({teamId: '', type: General.DM_CHANNEL, id: 'dm2', name});
        expect(channelBelongsToTeamScopedConversations(ch, TID_TEAM, TID_USER_ME, teamMembers, new Map())).toBe(true);
    });

    it('should include GM when all members from name are in team', () => {
        const name = `${TID_USER_A}__${TID_USER_B}__${TID_USER_ME}`;
        const ch = fakeCh({teamId: '', type: General.GM_CHANNEL, id: 'gm1', name});
        expect(channelBelongsToTeamScopedConversations(ch, TID_TEAM, TID_USER_ME, teamMembers, new Map())).toBe(true);
    });

    it('should include GM without team when a member from name is not in team roster', () => {
        const name = `${TID_USER_A}__${TID_USER_B}__${TID_USER_C}__${TID_USER_ME}`;
        const ch = fakeCh({teamId: '', type: General.GM_CHANNEL, id: 'gm2', name});
        expect(channelBelongsToTeamScopedConversations(ch, TID_TEAM, TID_USER_ME, teamMembers, new Map())).toBe(true);
    });

    it('should use membership map when GM name is not parseable', () => {
        const gmId = 'gmchan1';
        const ch = fakeCh({teamId: '', type: General.GM_CHANNEL, id: gmId, name: 'legacy-gm-name'});
        const memberships = new Map<string, string[]>([[gmId, [TID_USER_A, TID_USER_B, TID_USER_ME]]]);
        expect(channelBelongsToTeamScopedConversations(ch, TID_TEAM, TID_USER_ME, teamMembers, memberships)).toBe(true);
    });

    it('should include GM without team even when membership map lists a user outside team roster', () => {
        const gmId = 'gmchan2';
        const ch = fakeCh({teamId: '', type: General.GM_CHANNEL, id: gmId, name: 'legacy-gm-name'});
        const memberships = new Map<string, string[]>([[gmId, [TID_USER_A, TID_USER_C, TID_USER_ME]]]);
        expect(channelBelongsToTeamScopedConversations(ch, TID_TEAM, TID_USER_ME, teamMembers, memberships)).toBe(true);
    });
});
