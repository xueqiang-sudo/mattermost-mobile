// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {defineMessages} from 'react-intl';

import {General, Post} from '@constants';
import {usesDiscussionGroupChannelCopy} from '@utils/channel';

const {
    JOIN_CHANNEL, ADD_TO_CHANNEL, REMOVE_FROM_CHANNEL, LEAVE_CHANNEL,
    JOIN_TEAM, ADD_TO_TEAM, REMOVE_FROM_TEAM, LEAVE_TEAM,
} = Post.POST_TYPES;

export const postTypeMessages = {
    [JOIN_CHANNEL]: defineMessages({
        one: {
            id: 'combined_system_message.joined_channel.one',
            defaultMessage: '{firstUser} **joined the channel**.',
        },
        one_you: {
            id: 'combined_system_message.joined_channel.one_you',
            defaultMessage: 'You **joined the channel**.',
        },
        two: {
            id: 'combined_system_message.joined_channel.two',
            defaultMessage: '{firstUser} and {secondUser} **joined the channel**.',
        },
        many_expanded: {
            id: 'combined_system_message.joined_channel.many_expanded',
            defaultMessage: '{users} and {lastUser} **joined the channel**.',
        },
    }),
    [ADD_TO_CHANNEL]: defineMessages({
        one: {
            id: 'combined_system_message.added_to_channel.one',
            defaultMessage: '{firstUser} **added to the channel** by {actor}.',
        },
        one_you: {
            id: 'combined_system_message.added_to_channel.one_you',
            defaultMessage: 'You were **added to the channel** by {actor}.',
        },
        two: {
            id: 'combined_system_message.added_to_channel.two',
            defaultMessage: '{firstUser} and {secondUser} **added to the channel** by {actor}.',
        },
        many_expanded: {
            id: 'combined_system_message.added_to_channel.many_expanded',
            defaultMessage: '{users} and {lastUser} were **added to the channel** by {actor}.',
        },
    }),
    [REMOVE_FROM_CHANNEL]: defineMessages({
        one: {
            id: 'combined_system_message.removed_from_channel.one',
            defaultMessage: '{firstUser} was **removed from the channel**.',
        },
        one_you: {
            id: 'combined_system_message.removed_from_channel.one_you',
            defaultMessage: 'You were **removed from the channel**.',
        },
        two: {
            id: 'combined_system_message.removed_from_channel.two',
            defaultMessage: '{firstUser} and {secondUser} were **removed from the channel**.',
        },
        many_expanded: {
            id: 'combined_system_message.removed_from_channel.many_expanded',
            defaultMessage: '{users} and {lastUser} were **removed from the channel**.',
        },
    }),
    [LEAVE_CHANNEL]: defineMessages({
        one: {
            id: 'combined_system_message.left_channel.one',
            defaultMessage: '{firstUser} **left the channel**.',
        },
        one_you: {
            id: 'combined_system_message.left_channel.one_you',
            defaultMessage: 'You **left the channel**.',
        },
        two: {
            id: 'combined_system_message.left_channel.two',
            defaultMessage: '{firstUser} and {secondUser} **left the channel**.',
        },
        many_expanded: {
            id: 'combined_system_message.left_channel.many_expanded',
            defaultMessage: '{users} and {lastUser} **left the channel**.',
        },
    }),
    [JOIN_TEAM]: defineMessages({
        one: {
            id: 'combined_system_message.joined_team.one',
            defaultMessage: '{firstUser} **joined the enterprise**.',
        },
        one_you: {
            id: 'combined_system_message.joined_team.one_you',
            defaultMessage: 'You **joined the enterprise**.',
        },
        two: {
            id: 'combined_system_message.joined_team.two',
            defaultMessage: '{firstUser} and {secondUser} **joined the enterprise**.',
        },
        many_expanded: {
            id: 'combined_system_message.joined_team.many_expanded',
            defaultMessage: '{users} and {lastUser} **joined the enterprise**.',
        },
    }),
    [ADD_TO_TEAM]: defineMessages({
        one: {
            id: 'combined_system_message.added_to_team.one',
            defaultMessage: '{firstUser} **added to the enterprise** by {actor}.',
        },
        one_you: {
            id: 'combined_system_message.added_to_team.one_you',
            defaultMessage: 'You were **added to the enterprise** by {actor}.',
        },
        two: {
            id: 'combined_system_message.added_to_team.two',
            defaultMessage: '{firstUser} and {secondUser} **added to the enterprise** by {actor}.',
        },
        many_expanded: {
            id: 'combined_system_message.added_to_team.many_expanded',
            defaultMessage: '{users} and {lastUser} were **added to the enterprise** by {actor}.',
        },
    }),
    [REMOVE_FROM_TEAM]: defineMessages({
        one: {
            id: 'combined_system_message.removed_from_team.one',
            defaultMessage: '{firstUser} was **removed from the enterprise**.',
        },
        one_you: {
            id: 'combined_system_message.removed_from_team.one_you',
            defaultMessage: 'You were **removed from the enterprise**.',
        },
        two: {
            id: 'combined_system_message.removed_from_team.two',
            defaultMessage: '{firstUser} and {secondUser} were **removed from the enterprise**.',
        },
        many_expanded: {
            id: 'combined_system_message.removed_from_team.many_expanded',
            defaultMessage: '{users} and {lastUser} were **removed from the enterprise**.',
        },
    }),
    [LEAVE_TEAM]: defineMessages({
        one: {
            id: 'combined_system_message.left_team.one',
            defaultMessage: '{firstUser} **left the enterprise**.',
        },
        one_you: {
            id: 'combined_system_message.left_team.one_you',
            defaultMessage: 'You **left the enterprise**.',
        },
        two: {
            id: 'combined_system_message.left_team.two',
            defaultMessage: '{firstUser} and {secondUser} **left the enterprise**.',
        },
        many_expanded: {
            id: 'combined_system_message.left_team.many_expanded',
            defaultMessage: '{users} and {lastUser} **left the enterprise**.',
        },
    }),
};

/** Join/add/remove/leave channel — discussion group wording（仅 GM；P 类型内部群走「内部群」文案） */
const postTypeMessagesDiscussionChannel = {
    [JOIN_CHANNEL]: defineMessages({
        one: {
            id: 'combined_system_message.joined_channel.discussion.one',
            defaultMessage: '{firstUser} **joined the discussion group**.',
        },
        one_you: {
            id: 'combined_system_message.joined_channel.discussion.one_you',
            defaultMessage: 'You **joined the discussion group**.',
        },
        two: {
            id: 'combined_system_message.joined_channel.discussion.two',
            defaultMessage: '{firstUser} and {secondUser} **joined the discussion group**.',
        },
        many_expanded: {
            id: 'combined_system_message.joined_channel.discussion.many_expanded',
            defaultMessage: '{users} and {lastUser} **joined the discussion group**.',
        },
    }),
    [ADD_TO_CHANNEL]: defineMessages({
        one: {
            id: 'combined_system_message.added_to_channel.discussion.one',
            defaultMessage: '{firstUser} **added to the discussion group** by {actor}.',
        },
        one_you: {
            id: 'combined_system_message.added_to_channel.discussion.one_you',
            defaultMessage: 'You were **added to the discussion group** by {actor}.',
        },
        two: {
            id: 'combined_system_message.added_to_channel.discussion.two',
            defaultMessage: '{firstUser} and {secondUser} **added to the discussion group** by {actor}.',
        },
        many_expanded: {
            id: 'combined_system_message.added_to_channel.discussion.many_expanded',
            defaultMessage: '{users} and {lastUser} were **added to the discussion group** by {actor}.',
        },
    }),
    [REMOVE_FROM_CHANNEL]: defineMessages({
        one: {
            id: 'combined_system_message.removed_from_channel.discussion.one',
            defaultMessage: '{firstUser} was **removed from the discussion group**.',
        },
        one_you: {
            id: 'combined_system_message.removed_from_channel.discussion.one_you',
            defaultMessage: 'You were **removed from the discussion group**.',
        },
        two: {
            id: 'combined_system_message.removed_from_channel.discussion.two',
            defaultMessage: '{firstUser} and {secondUser} were **removed from the discussion group**.',
        },
        many_expanded: {
            id: 'combined_system_message.removed_from_channel.discussion.many_expanded',
            defaultMessage: '{users} and {lastUser} were **removed from the discussion group**.',
        },
    }),
    [LEAVE_CHANNEL]: defineMessages({
        one: {
            id: 'combined_system_message.left_channel.discussion.one',
            defaultMessage: '{firstUser} **left the discussion group**.',
        },
        one_you: {
            id: 'combined_system_message.left_channel.discussion.one_you',
            defaultMessage: 'You **left the discussion group**.',
        },
        two: {
            id: 'combined_system_message.left_channel.discussion.two',
            defaultMessage: '{firstUser} and {secondUser} **left the discussion group**.',
        },
        many_expanded: {
            id: 'combined_system_message.left_channel.discussion.many_expanded',
            defaultMessage: '{users} and {lastUser} **left the discussion group**.',
        },
    }),
} as const;

/** Join/add/remove/leave in a direct message (private chat) — avoids “channel/group chat” wording in DM system lines. */
const postTypeMessagesDmChannel = {
    [JOIN_CHANNEL]: defineMessages({
        one: {
            id: 'combined_system_message.joined_channel.dm.one',
            defaultMessage: '{firstUser} **joined the private chat**.',
        },
        one_you: {
            id: 'combined_system_message.joined_channel.dm.one_you',
            defaultMessage: 'You **joined the private chat**.',
        },
        two: {
            id: 'combined_system_message.joined_channel.dm.two',
            defaultMessage: '{firstUser} and {secondUser} **joined the private chat**.',
        },
        many_expanded: {
            id: 'combined_system_message.joined_channel.dm.many_expanded',
            defaultMessage: '{users} and {lastUser} **joined the private chat**.',
        },
    }),
    [ADD_TO_CHANNEL]: defineMessages({
        one: {
            id: 'combined_system_message.added_to_channel.dm.one',
            defaultMessage: '{firstUser} **was added to the private chat** by {actor}.',
        },
        one_you: {
            id: 'combined_system_message.added_to_channel.dm.one_you',
            defaultMessage: 'You were **added to the private chat** by {actor}.',
        },
        two: {
            id: 'combined_system_message.added_to_channel.dm.two',
            defaultMessage: '{firstUser} and {secondUser} **were added to the private chat** by {actor}.',
        },
        many_expanded: {
            id: 'combined_system_message.added_to_channel.dm.many_expanded',
            defaultMessage: '{users} and {lastUser} were **added to the private chat** by {actor}.',
        },
    }),
    [REMOVE_FROM_CHANNEL]: defineMessages({
        one: {
            id: 'combined_system_message.removed_from_channel.dm.one',
            defaultMessage: '{firstUser} was **removed from the private chat**.',
        },
        one_you: {
            id: 'combined_system_message.removed_from_channel.dm.one_you',
            defaultMessage: 'You were **removed from the private chat**.',
        },
        two: {
            id: 'combined_system_message.removed_from_channel.dm.two',
            defaultMessage: '{firstUser} and {secondUser} were **removed from the private chat**.',
        },
        many_expanded: {
            id: 'combined_system_message.removed_from_channel.dm.many_expanded',
            defaultMessage: '{users} and {lastUser} were **removed from the private chat**.',
        },
    }),
    [LEAVE_CHANNEL]: defineMessages({
        one: {
            id: 'combined_system_message.left_channel.dm.one',
            defaultMessage: '{firstUser} **left the private chat**.',
        },
        one_you: {
            id: 'combined_system_message.left_channel.dm.one_you',
            defaultMessage: 'You **left the private chat**.',
        },
        two: {
            id: 'combined_system_message.left_channel.dm.two',
            defaultMessage: '{firstUser} and {secondUser} **left the private chat**.',
        },
        many_expanded: {
            id: 'combined_system_message.left_channel.dm.many_expanded',
            defaultMessage: '{users} and {lastUser} **left the private chat**.',
        },
    }),
} as const;

export const systemMessages = defineMessages({
    [ADD_TO_CHANNEL]: {
        id: 'last_users_message.added_to_channel.type',
        defaultMessage: 'were **added to the channel** by {actor}.',
    },
    [JOIN_CHANNEL]: {
        id: 'last_users_message.joined_channel.type',
        defaultMessage: '**joined the channel**.',
    },
    [LEAVE_CHANNEL]: {
        id: 'last_users_message.left_channel.type',
        defaultMessage: '**left the channel**.',
    },
    [REMOVE_FROM_CHANNEL]: {
        id: 'last_users_message.removed_from_channel.type',
        defaultMessage: 'were **removed from the channel**.',
    },
    [ADD_TO_TEAM]: {
        id: 'last_users_message.added_to_team.type',
        defaultMessage: 'were **added to the enterprise** by {actor}.',
    },
    [JOIN_TEAM]: {
        id: 'last_users_message.joined_team.type',
        defaultMessage: '**joined the enterprise**.',
    },
    [LEAVE_TEAM]: {
        id: 'last_users_message.left_team.type',
        defaultMessage: '**left the enterprise**.',
    },
    [REMOVE_FROM_TEAM]: {
        id: 'last_users_message.removed_from_team.type',
        defaultMessage: 'were **removed from the enterprise**.',
    },
});

const systemMessagesDiscussionChannel = defineMessages({
    [ADD_TO_CHANNEL]: {
        id: 'last_users_message.added_to_channel.discussion.type',
        defaultMessage: 'were **added to the discussion group** by {actor}.',
    },
    [JOIN_CHANNEL]: {
        id: 'last_users_message.joined_channel.discussion.type',
        defaultMessage: '**joined the discussion group**.',
    },
    [LEAVE_CHANNEL]: {
        id: 'last_users_message.left_channel.discussion.type',
        defaultMessage: '**left the discussion group**.',
    },
    [REMOVE_FROM_CHANNEL]: {
        id: 'last_users_message.removed_from_channel.discussion.type',
        defaultMessage: 'were **removed from the discussion group**.',
    },
});

type PostTypeMessagesMap = typeof postTypeMessages;
type PostTypeKey = keyof PostTypeMessagesMap;

type ChannelMemberPostTypeKey =
    typeof JOIN_CHANNEL |
    typeof ADD_TO_CHANNEL |
    typeof REMOVE_FROM_CHANNEL |
    typeof LEAVE_CHANNEL;

const CHANNEL_MEMBER_KEYS: ChannelMemberPostTypeKey[] = [
    JOIN_CHANNEL,
    ADD_TO_CHANNEL,
    REMOVE_FROM_CHANNEL,
    LEAVE_CHANNEL,
];

/**
 * Merged post type messages for combined user activity: team messages unchanged;
 * channel member join/add/remove/leave use discussion wording when `useDiscussionGroupCopy` is true.
 */
export function getPostTypeMessagesForChannelActivity(useDiscussionGroupCopy: boolean): PostTypeMessagesMap {
    if (!useDiscussionGroupCopy) {
        return postTypeMessages;
    }
    const out = {...postTypeMessages} as PostTypeMessagesMap;
    const overrides = postTypeMessagesDiscussionChannel as Pick<PostTypeMessagesMap, ChannelMemberPostTypeKey>;
    for (const key of CHANNEL_MEMBER_KEYS) {
        out[key] = overrides[key];
    }
    return out;
}

/**
 * Combined join/add/remove/leave lines for system messages: DM uses private-chat wording;
 * otherwise same as {@link getPostTypeMessagesForChannelActivity} from discussion vs channel.
 */
export function getPostTypeMessagesForSystemActivity(channelType: ChannelType | undefined): PostTypeMessagesMap {
    if (channelType === General.DM_CHANNEL) {
        const out = {...postTypeMessages} as PostTypeMessagesMap;
        const overrides = postTypeMessagesDmChannel as Pick<PostTypeMessagesMap, ChannelMemberPostTypeKey>;
        for (const key of CHANNEL_MEMBER_KEYS) {
            out[key] = overrides[key];
        }
        return out;
    }
    return getPostTypeMessagesForChannelActivity(usesDiscussionGroupChannelCopy(channelType));
}

type SystemMessagesMap = typeof systemMessages;

/**
 * Last-users line fragments for expanded "N others" view — channel member types only switch to discussion wording.
 */
export function getSystemMessagesForLastUsers(useDiscussionGroupCopy: boolean): SystemMessagesMap {
    if (!useDiscussionGroupCopy) {
        return systemMessages;
    }
    return {
        ...systemMessages,
        ...systemMessagesDiscussionChannel,
    };
}
