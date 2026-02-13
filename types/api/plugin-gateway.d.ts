// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

type VerifyCodeGen = {
    test_code?: string;
    expires_in: number;
    phone_number: string;
}

type VerifyCodeCheck = {
    token: string;
    phone_number: string;
    expires_in: number;
    token_type: string;
}
