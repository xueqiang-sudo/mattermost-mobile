// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Post} from '@constants';

import {getPostTypeMessagesForChannelActivity, getSystemMessagesForLastUsers} from './messages';

describe('combined_user_activity messages selectors', () => {
    it('should use default channel ids for JOIN_CHANNEL when not discussion group copy', () => {
        const m = getPostTypeMessagesForChannelActivity(false);
        expect(m[Post.POST_TYPES.JOIN_CHANNEL].one.id).toBe('combined_system_message.joined_channel.one');
    });

    it('should use discussion ids for JOIN_CHANNEL when discussion group copy', () => {
        const m = getPostTypeMessagesForChannelActivity(true);
        expect(m[Post.POST_TYPES.JOIN_CHANNEL].one.id).toBe('combined_system_message.joined_channel.discussion.one');
    });

    it('should keep JOIN_TEAM ids unchanged when discussion copy', () => {
        const m = getPostTypeMessagesForChannelActivity(true);
        expect(m[Post.POST_TYPES.JOIN_TEAM].one.id).toBe('combined_system_message.joined_team.one');
    });

    it('should switch last_users fragment ids for channel activity when discussion copy', () => {
        const m = getSystemMessagesForLastUsers(true);
        expect(m[Post.POST_TYPES.JOIN_CHANNEL].id).toBe('last_users_message.joined_channel.discussion.type');
    });

    it('should keep default last_users JOIN_CHANNEL id when not discussion copy', () => {
        const m = getSystemMessagesForLastUsers(false);
        expect(m[Post.POST_TYPES.JOIN_CHANNEL].id).toBe('last_users_message.joined_channel.type');
    });
});
