// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useMemo} from 'react';
import {useIntl} from 'react-intl';

import ProfilePicture from '@components/profile_picture';
import {username2Nickname} from '@utils/user';

import BaseChip from './base_chip';

import type UserModel from '@typings/database/models/servers/user';

type SelectedChipProps = {
    user: UserModel | UserProfile;
    onPress?: (id: string) => void;
    testID?: string;
    teammateNameDisplay: string;
    action?: {
        icon: 'remove' | 'downArrow';
        onPress?: (id: string) => void;
    };
    showAnimation?: boolean;
    avatarBorderRadius?: number;
}

const CHIP_AVATAR_SIZE = 20;

export default function UserChip({
    testID,
    user,
    teammateNameDisplay: _teammateNameDisplay,
    onPress: receivedOnPress,
    action: receivedAction,
    showAnimation,
    avatarBorderRadius,
}: SelectedChipProps) {
    const intl = useIntl();

    const onPress = useMemo(() => {
        if (!receivedOnPress) {
            return undefined;
        }
        return () => receivedOnPress(user.id);
    }, [receivedOnPress, user.id]);

    const action = useMemo(() => {
        if (!receivedAction) {
            return undefined;
        }
        const onActionPress = receivedAction.onPress ? (() => receivedAction.onPress?.(user.id)) : undefined;
        return {icon: receivedAction.icon, onPress: onActionPress};
    }, [receivedAction, user.id]);

    const name = username2Nickname(user, {locale: intl.locale});
    const picture = useMemo(() => (
        <ProfilePicture
            author={user}
            size={CHIP_AVATAR_SIZE}
            iconSize={CHIP_AVATAR_SIZE}
            testID={`${testID}.profile_picture`}
            showStatus={false}
            borderRadius={avatarBorderRadius}
        />
    ), [testID, user, avatarBorderRadius]);

    return (
        <BaseChip
            testID={testID}
            onPress={onPress}
            action={action}
            showAnimation={showAnimation}
            label={name}
            prefix={picture}
        />
    );
}
