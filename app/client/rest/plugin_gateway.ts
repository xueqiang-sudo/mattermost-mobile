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
        try {
            const result = await this.doFetch(
                this.getAccountSendCodeRoute(),
                {
                    method: 'post',
                    body: bodyData,
                },
            );
            // 确保返回一个有效的对象
            return result || {};
        } catch (error) {
            // 如果是JSON解析错误，返回空对象而不是抛出异常
            const errMsg = String(error);
            if (errMsg.includes('INCORRECT_TYPE') || errMsg.includes('JSON')) {
                console.warn('sendAccountVerifyCode: JSON parse error, returning empty object', errMsg);
                return {};
            }
            throw error;
        }
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
