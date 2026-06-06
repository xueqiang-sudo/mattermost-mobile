// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';

import UserItem from '@components/user_item';
import {username2Nickname} from '@utils/user';

import type UserModel from '@typings/database/models/servers/user';

type AtMentionItemProps = {
    user: UserProfile | UserModel;
    onPress?: (username: string) => void;
    testID?: string;
}

const AtMentionItem = ({
    user,
    onPress,
    testID,
}: AtMentionItemProps) => {
    /** 使用名字（昵称/姓名）替代账号插入 @提及 */
    const completeMention = useCallback((u: UserModel | UserProfile) => {
        const displayName = username2Nickname(u, {includeFullName: false, useFallbackUsername: true});
        onPress?.(displayName);
    }, [onPress]);

    return (
        <UserItem
            user={user}
            testID={testID}
            onUserPress={completeMention}
            showCurrentUserSuffix={false}
        />
    );
};

export default AtMentionItem;
