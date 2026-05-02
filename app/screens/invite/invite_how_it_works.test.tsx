// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import {renderWithIntlAndTheme} from '@test/intl-test-helper';

import InviteHowItWorks from './invite_how_it_works';

describe('InviteHowItWorks', () => {
    it('should render title and members-only body when email invitations disabled', () => {
        const {getByTestId, getByText} = renderWithIntlAndTheme(
            <InviteHowItWorks emailInvitationsEnabled={false}/>,
        );

        expect(getByTestId('invite.how_it_works')).toBeTruthy();
        expect(getByText('How invitations work')).toBeTruthy();
        expect(getByText(/no separate in-app approval step/i)).toBeTruthy();
    });

    it('should append email body when email invitations enabled', () => {
        const {getByText} = renderWithIntlAndTheme(
            <InviteHowItWorks emailInvitationsEnabled={true}/>,
        );

        expect(getByText(/invitation link by email/i)).toBeTruthy();
    });
});
