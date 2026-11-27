// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import React, {useCallback} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';

import ProfilePicture from '@components/profile_picture';
import {ACCOUNT_OUTLINE_IMAGE} from '@constants/profile';
import {useTheme} from '@context/theme';
import {observeUser} from '@queries/servers/user';
import {displayUsername, getLastPictureUpdate} from '@utils/user';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type UserModel from '@typings/database/models/servers/user';
import type {WithDatabaseArgs} from '@typings/database/database';

type Props = {
    user?: UserModel;
    nickname?: string;
    onPress?: (userId: string) => void;
}

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    avatar: {
        marginRight: 16,
    },
    info: {
        flex: 1,
    },
    name: {
        color: theme.centerChannelColor,
        ...typography('Body', 200, 'SemiBold'),
    },
    username: {
        color: changeOpacity(theme.centerChannelColor, 0.64),
        ...typography('Body', 75, 'Regular'),
        marginTop: 2,
    },
}));

const MemberItemBody = ({user, nickname, onPress}: Props) => {
    const theme = useTheme();
    const styles = getStyleSheet(theme);

    const handlePress = useCallback(() => {
        if (user && onPress) {
            onPress(user.id);
        }
    }, [user, onPress]);

    if (!user) {
        return null;
    }

    const hasCustomAvatar = getLastPictureUpdate(user) > 0;
    const profileSource = hasCustomAvatar ? undefined : ACCOUNT_OUTLINE_IMAGE;

    return (
        <TouchableOpacity
            style={styles.container}
            onPress={handlePress}
            disabled={!onPress}
        >
            <View style={styles.avatar}>
                <ProfilePicture
                    author={hasCustomAvatar ? user : undefined}
                    size={40}
                    showStatus={false}
                    source={profileSource}
                />
            </View>
            <View style={styles.info}>
                <Text style={styles.name} numberOfLines={1}>
                    {nickname || displayUsername(user)}
                </Text>
                {user.username && (
                    <Text style={styles.username} numberOfLines={1}>
                        @{user.username}
                    </Text>
                )}
            </View>
        </TouchableOpacity>
    );
};

type OwnProps = WithDatabaseArgs & {
    userId: string;
    nickname?: string;
    onPress?: (userId: string) => void;
}

const enhanced = withObservables(['userId'], ({userId, database}: OwnProps) => ({
    user: observeUser(database, userId),
}));

const MemberItem = withDatabase(enhanced(MemberItemBody));

export default MemberItem;
