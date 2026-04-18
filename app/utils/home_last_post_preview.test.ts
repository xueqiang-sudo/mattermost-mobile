// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {createIntl, type IntlShape} from 'react-intl';

import {General, Post} from '@constants';

import {getHomeLastPostPreviewText} from './home_last_post_preview';

function makeTestIntl(): IntlShape {
    return createIntl({
        locale: 'en',
        messages: {
            'mobile.system_message.change_channel_privacy.to_private': 'Now private preview',
            'mobile.system_message.change_channel_privacy.to_public': 'Now public preview',
        },
    });
}

describe('getHomeLastPostPreviewText', () => {
    const intl = makeTestIntl();

    it('returns localized privacy message for change_channel_privacy when channel is private', () => {
        const text = getHomeLastPostPreviewText(
            intl,
            'raw server text',
            Post.POST_TYPES.CHANGE_CHANNEL_PRIVACY,
            General.PRIVATE_CHANNEL,
        );
        expect(text).toBe('Now private preview');
    });

    it('returns localized public message when channel is open', () => {
        const text = getHomeLastPostPreviewText(
            intl,
            'raw',
            Post.POST_TYPES.CHANGE_CHANNEL_PRIVACY,
            General.OPEN_CHANNEL,
        );
        expect(text).toBe('Now public preview');
    });

    it('returns raw message for normal posts', () => {
        expect(getHomeLastPostPreviewText(intl, 'hello', '', General.PRIVATE_CHANNEL)).toBe('hello');
        expect(getHomeLastPostPreviewText(intl, 'hello', 'system_join_channel', General.PRIVATE_CHANNEL)).toBe('hello');
    });
});
