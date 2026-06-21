// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {Text, TouchableOpacity, View} from 'react-native';

import ProfilePicture from '@components/profile_picture';
import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';
import {displayUsername} from '@utils/user';

import type UserModel from '@typings/database/models/servers/user';

type Props = {
    user: UserModel;
    onPress: (userId: string) => void;
}

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
    },
    avatar: {
        marginRight: 12,
    },
    name: {
        flex: 1,
        color: theme.centerChannelColor,
        ...typography('Body', 200),
    },
    username: {
        color: changeOpacity(theme.centerChannelColor, 0.48),
        marginLeft: 8,
        ...typography('Body', 100),
    },
}));

const MemberListItem = ({user, onPress}: Props) => {
    const theme = useTheme();
    const styles = getStyleSheet(theme);

    const name = displayUsername(user);

    return (
        <TouchableOpacity
            style={styles.container}
            onPress={() => onPress(user.id)}
            activeOpacity={0.6}
        >
            <View style={styles.avatar}>
                <ProfilePicture
                    author={user}
                    size={36}
                    showStatus={false}
                />
            </View>
            <Text style={styles.name} numberOfLines={1}>{name}</Text>
            {user.username !== name && (
                <Text style={styles.username} numberOfLines={1}>@{user.username}</Text>
            )}
        </TouchableOpacity>
    );
};

export default MemberListItem;
