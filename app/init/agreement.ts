// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import * as KeyChain from 'react-native-keychain';

const SERVICE = 'launch_agreement_accepted';

export async function hasAcceptedAgreement(): Promise<boolean> {
    try {
        const result = await KeyChain.getGenericPassword({service: SERVICE});
        return result !== false;
    } catch {
        return false;
    }
}

export async function setAcceptedAgreement(): Promise<void> {
    try {
        await KeyChain.setGenericPassword(SERVICE, '1', {service: SERVICE});
    } catch {
        // ignore
    }
}
