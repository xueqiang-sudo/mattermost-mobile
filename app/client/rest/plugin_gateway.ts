// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {formatEmail, formatPhone, isPhoneNumber} from '@utils/form-rule';

import type ClientBase from './base';

export interface ClientGatewayMix {
    sendAccountVerifyCode: (phoneOrEmail: string) => Promise<VerifyCodeGen>;
    verifyAccountCode: (phoneOrEmail: string, code: string) => Promise<VerifyCodeCheck>;
}

const ClientGateway = <TBase extends Constructor<ClientBase>>(superclass: TBase) => class extends superclass {
    sendAccountVerifyCode = async (phoneOrEmail: string) => {
        const fmAccount = isPhoneNumber(phoneOrEmail) ? formatPhone(phoneOrEmail) : formatEmail(phoneOrEmail);
        return this.doFetch(
            this.getAccountSendCodeRoute(),
            {
                method: 'post',
                body: {account: fmAccount},
            },
        );
    };

    verifyAccountCode = async (phoneOrEmail: string, code: string) => {
        const fmAccount = isPhoneNumber(phoneOrEmail) ? formatPhone(phoneOrEmail) : formatEmail(phoneOrEmail);
        return this.doFetch(
            this.getAccountVerifyCodeRoute(),
            {
                method: 'post',
                body: {account: fmAccount, code},
            },
        );
    };
};

export default ClientGateway;
