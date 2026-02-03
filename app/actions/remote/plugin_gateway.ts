// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import NetworkManager from '@managers/network_manager';

export const sendSmsCode = async (serverUrl: string, phoneNumber: string) => {
    const client = await NetworkManager.getAndCreateClient(serverUrl);
    return client.sendSmsVerificationCode(phoneNumber);
};

export const verifySmsCode = async (serverUrl: string, phoneNumber: string, code: string) => {
    const client = await NetworkManager.getAndCreateClient(serverUrl);
    return client.verifySmsCode(phoneNumber, code);
};
