// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import NetworkManager from '@managers/network_manager';

export const sendAccountCode = async (serverUrl: string, phoneOrEmail: string) => {
    const client = await NetworkManager.getAndCreateClient(serverUrl);
    return client.sendAccountVerifyCode(phoneOrEmail);
};

export const verifyAccountCode = async (serverUrl: string, phoneOrEmail: string, code: string) => {
    const client = await NetworkManager.getAndCreateClient(serverUrl);
    return client.verifyAccountCode(phoneOrEmail, code);
};
