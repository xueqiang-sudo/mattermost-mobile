// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {defineMessages, type IntlShape} from 'react-intl';

import {General, Post} from '@constants';

const changeChannelPrivacyPreview = defineMessages({
    toPrivate: {
        id: 'mobile.system_message.change_channel_privacy.to_private',
        defaultMessage: 'This group chat is now invite-only. Only invited members can view it.',
    },
    toPublic: {
        id: 'mobile.system_message.change_channel_privacy.to_public',
        defaultMessage: 'This group chat is now public. Team members can join.',
    },
});

/**
 * Home conversation list: align last-line preview with in-thread system message copy
 * (avoids raw server "channel" wording in previews).
 */
export function getHomeLastPostPreviewText(
    intl: IntlShape,
    rawMessage: string,
    postType: string | undefined,
    channelType: ChannelType,
): string {
    if (postType === Post.POST_TYPES.CHANGE_CHANNEL_PRIVACY) {
        const isNowPrivate = channelType === General.PRIVATE_CHANNEL;
        return intl.formatMessage(
            isNowPrivate ? changeChannelPrivacyPreview.toPrivate : changeChannelPrivacyPreview.toPublic,
        );
    }
    return rawMessage;
}
