// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {formatPhone} from '@utils/form-rule';

import type ClientBase from './base';

export interface ClientGatewayMix {
    sendSmsVerificationCode: (phoneNumber: string) => Promise<VerifyCodeGen>;
    verifySmsCode: (phoneNumber: string, code: string) => Promise<VerifyCodeCheck>;
}

const ClientGateway = <TBase extends Constructor<ClientBase>>(superclass: TBase) => class extends superclass {
    sendSmsVerificationCode = async (phoneNumber: string) => {
        return this.doFetch(
            this.getSendCodeRoute(),
            {
                method: 'post',
                body: {
                    phone_number: formatPhone(phoneNumber),
                },
            },
        );
    };

    verifySmsCode = async (phoneNumber: string, code: string) => {
        return this.doFetch(
            this.getVerifyCodeRoute(),
            {
                method: 'post',
                body: {
                    phone_number: formatPhone(phoneNumber),
                    code,
                },
            },
        );
    };
};

export default ClientGateway;
