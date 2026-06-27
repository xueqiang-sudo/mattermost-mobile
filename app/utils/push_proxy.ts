// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {PUSH_PROXY_STATUS_VERIFIED} from '@constants/push_proxy';
import EphemeralStore from '@store/ephemeral_store';

import type {IntlShape} from 'react-intl';

export async function canReceiveNotifications(serverUrl: string, verification: string, intl: IntlShape) {
    EphemeralStore.setPushProxyVerificationState(serverUrl, PUSH_PROXY_STATUS_VERIFIED);
}
