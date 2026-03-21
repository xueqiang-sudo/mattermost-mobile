// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {View} from 'react-native';

import CompassIcon from '@components/compass_icon';
import ProfilePicture from '@components/profile_picture';
import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';

import type UserModel from '@typings/database/models/servers/user';
import type {StyleProp, ViewStyle} from 'react-native';

const MAX_AVATARS = 9;
const GRID_COLS = 3;

type Props = {
    users: UserModel[];
    size: number;
    isOnCenterBg?: boolean;
    isUnread?: boolean;
    isMuted?: boolean;
    style?: StyleProp<ViewStyle>;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: changeOpacity(theme.sidebarText, 0.12),
    },
    containerOnCenterBg: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.12),
    },
    containerUnread: {
        backgroundColor: changeOpacity(theme.sidebarUnreadText, 0.2),
    },
    containerUnreadOnCenterBg: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.2),
    },
    avatar: {
        backgroundColor: changeOpacity(theme.sidebarText, 0.24),
    },
    avatarOnCenterBg: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.24),
    },
    placeholder: {
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: changeOpacity(theme.sidebarText, 0.2),
    },
    placeholderIcon: {
        color: changeOpacity(theme.sidebarText, 0.5),
    },
}));

const GmAvatarGrid = ({users, size, isOnCenterBg, isUnread, isMuted, style}: Props) => {
    const theme = useTheme();
    const styles = getStyleSheet(theme);

    const displayUsers = users.slice(0, MAX_AVATARS);
    const gridCols = displayUsers.length <= 4 ? 2 : GRID_COLS;
    const cellSize = size / gridCols;
    const gap = 1;
    const avatarSize = Math.max(4, cellSize - gap);

    const containerStyle = [
        styles.container,
        isOnCenterBg && styles.containerOnCenterBg,
        isUnread && !isMuted && (isOnCenterBg ? styles.containerUnreadOnCenterBg : styles.containerUnread),
    ];

    if (displayUsers.length === 0) {
        return (
            <View style={[containerStyle, styles.placeholder, style, {width: size, height: size}]}>
                <CompassIcon
                    name="account-group-outline"
                    size={size * 0.5}
                    style={[styles.placeholderIcon, {left: 0}]}
                />
            </View>
        );
    }

    return (
        <View style={[containerStyle, style, {width: size, height: size}]}>
            {displayUsers.map((user, index) => {
                const row = Math.floor(index / gridCols);
                const col = index % gridCols;
                const borderRadius = Math.max(2, avatarSize * 0.1);

                return (
                    <View
                        key={user.id}
                        style={{
                            position: 'absolute',
                            left: col * cellSize + gap / 2,
                            top: row * cellSize + gap / 2,
                            width: avatarSize,
                            height: avatarSize,
                            overflow: 'hidden',
                        }}
                    >
                        <ProfilePicture
                            author={user}
                            size={avatarSize}
                            showStatus={false}
                            borderRadius={borderRadius}
                        />
                    </View>
                );
            })}
        </View>
    );
};

export default React.memo(GmAvatarGrid);
