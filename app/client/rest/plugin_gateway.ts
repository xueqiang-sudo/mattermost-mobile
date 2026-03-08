// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {isPhoneNumber, splitPhone} from '@utils/form-rule';

import type ClientBase from './base';

export interface ClientGatewayMix {
    sendAccountVerifyCode: (phoneOrEmail: string) => Promise<VerifyCodeGen>;
    verifyAccountCode: (phoneOrEmail: string, code: string) => Promise<VerifyCodeCheck>;
}

const ClientGateway = <TBase extends Constructor<ClientBase>>(superclass: TBase) => class extends superclass {
    sendAccountVerifyCode = async (phoneOrEmail: string) => {
        const bodyData: {account: string; country_code?: string} = {account: phoneOrEmail};
        if (isPhoneNumber(phoneOrEmail)) {
            const [countryCode, phone] = splitPhone(phoneOrEmail, {isDelSymbol: true});
            Object.assign(bodyData, {account: phone, country_code: countryCode});
        } else {
            bodyData.account = phoneOrEmail;
        }
        return this.doFetch(
            this.getAccountSendCodeRoute(),
            {
                method: 'post',
                body: bodyData,
            },
        );
    };

    verifyAccountCode = async (phoneOrEmail: string, code: string) => {
        const bodyData: {code: string; account: string; country_code?: string} = {code, account: phoneOrEmail};
        if (isPhoneNumber(phoneOrEmail)) {
            const [countryCode, phone] = splitPhone(phoneOrEmail, {isDelSymbol: true});
            Object.assign(bodyData, {account: phone, country_code: countryCode});
        } else {
            bodyData.account = phoneOrEmail;
        }
        return this.doFetch(
            this.getAccountVerifyCodeRoute(),
            {
                method: 'post',
                body: bodyData,
            },
        );
    };
};

export default ClientGateway;
