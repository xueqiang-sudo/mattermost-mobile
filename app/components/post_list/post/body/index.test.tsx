// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {type ComponentProps} from 'react';

import {Screens} from '@constants';
import {getDefaultThemeByAppearance} from '@context/theme';
import {renderWithIntlAndTheme} from '@test/intl-test-helper';
import TestHelper from '@test/test_helper';

import Body from './index';
import Message from './message';

import type PostModel from '@typings/database/models/servers/post';

jest.mock('./message');
jest.mock('./content', () => 'Content');
jest.mock('@components/files', () => 'Files');
jest.mock('./acknowledgements', () => 'Acknowledgements');
jest.mock('./add_members', () => 'AddMembers');
jest.mock('./failed', () => 'Failed');
jest.mock('./reactions', () => 'Reactions');

function getBaseProps(post: PostModel): ComponentProps<typeof Body> {
    return {
        appsEnabled: false,
        hasFiles: false,
        hasReactions: false,
        highlight: false,
        highlightReplyBar: false,
        isEphemeral: false,
        isJumboEmoji: false,
        isPendingOrFailed: false,
        isPostAddChannelMember: false,
        location: Screens.CHANNEL,
        post,
        showAddReaction: false,
        theme: getDefaultThemeByAppearance(),
    };
}

describe('components/post_list/post/body', () => {
    it('should render message when post.message is empty but messageSource has content', () => {
        const post = TestHelper.fakePostModel({
            message: '',
            messageSource: 'priority fallback body',
        });

        renderWithIntlAndTheme(<Body {...getBaseProps(post)}/>);

        expect(Message).toHaveBeenCalled();
    });
});
