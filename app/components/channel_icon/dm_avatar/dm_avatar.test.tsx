// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import ServerUrlProvider from '@context/server';
import {renderWithIntlAndTheme} from '@test/intl-test-helper';

import DmAvatar from './dm_avatar';

import type UserModel from '@typings/database/models/servers/user';

const mockProfilePicture = jest.fn(() => null);

jest.mock('@components/profile_picture', () => ({
    __esModule: true,
    default: (props: unknown) => {
        mockProfilePicture(props);
        return null;
    },
}));

jest.mock('@actions/remote/user', () => ({
    fetchUserByIdBatched: jest.fn(),
}));

describe('components/channel_icon/dm_avatar/DmAvatar', () => {
    const author = {
        id: 'user1',
        deleteAt: 0,
        is_bot: false,
        status: 'online',
    } as unknown as UserModel;

    beforeEach(() => {
        mockProfilePicture.mockClear();
    });

    it('should pass circular avatar (undefined borderRadius) when isOnHome', () => {
        renderWithIntlAndTheme(
            <ServerUrlProvider server={{displayName: 'Test', url: 'https://example.com'}}>
                <DmAvatar
                    authorId='user1'
                    author={author}
                    isOnHome={true}
                    size={48}
                    style={{}}
                />
            </ServerUrlProvider>,
        );

        expect(mockProfilePicture).toHaveBeenCalledWith(
            expect.objectContaining({
                borderRadius: undefined,
                size: 48,
                showStatus: false,
            }),
        );
    });

    it('should pass half-size borderRadius when isOnCenterBg and not on home', () => {
        renderWithIntlAndTheme(
            <ServerUrlProvider server={{displayName: 'Test', url: 'https://example.com'}}>
                <DmAvatar
                    authorId='user1'
                    author={author}
                    isOnCenterBg={true}
                    isOnHome={false}
                    size={40}
                    style={{}}
                />
            </ServerUrlProvider>,
        );

        expect(mockProfilePicture).toHaveBeenCalledWith(
            expect.objectContaining({
                borderRadius: 20,
                size: 40,
                showStatus: true,
            }),
        );
    });
});
