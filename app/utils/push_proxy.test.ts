// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {
    PUSH_PROXY_STATUS_VERIFIED,
} from '@constants/push_proxy';
import EphemeralStore from '@store/ephemeral_store';

import {
    canReceiveNotifications,
} from './push_proxy';

import type {IntlShape} from 'react-intl';

jest.mock('@store/ephemeral_store', () => ({
    setPushProxyVerificationState: jest.fn(),
}));

describe('Notification utilities', () => {
    const intl: IntlShape = {
        formatMessage: ({defaultMessage}: { defaultMessage: string }) => defaultMessage,
    } as IntlShape;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('canReceiveNotifications', () => {
        test('always sets verified status (using JPush, no server verification needed)', async () => {
            const serverUrl = 'https://example.com';

            await canReceiveNotifications(serverUrl, 'any_response', intl);

            expect(EphemeralStore.setPushProxyVerificationState).toHaveBeenCalledWith(serverUrl, PUSH_PROXY_STATUS_VERIFIED);
        });
    });
});