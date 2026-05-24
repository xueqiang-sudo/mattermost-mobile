// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect} from 'react';

import {fetchUserByIdBatched} from '@actions/remote/user';
import CompassIcon from '@components/compass_icon';
import ProfilePicture from '@components/profile_picture';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';

import type UserModel from '@typings/database/models/servers/user';
import type {StyleProp, TextStyle, ViewStyle} from 'react-native';

type Props = {
    authorId: string;
    author?: UserModel;
    isOnCenterBg?: boolean;
    isOnHome?: boolean;
    style: StyleProp<Intersection<TextStyle, ViewStyle>>;
    size: number;
}

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    status: {
        backgroundColor: theme.sidebarBg,
        borderWidth: 0,
    },
    statusOnCenterBg: {
        backgroundColor: theme.centerChannelBg,
    },
    icon: {
        color: changeOpacity(theme.sidebarText, 0.4),
        left: 1,
    },
    iconOnCenterBg: {
        color: changeOpacity(theme.centerChannelColor, 0.72),
    },
}));

const DmAvatar = ({
    authorId,
    author,
    isOnCenterBg,
    isOnHome = false,
    style,
    size,
}: Props) => {
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const styles = getStyleSheet(theme);

    useEffect(() => {
        if (authorId && !author) {
            fetchUserByIdBatched(serverUrl, authorId);
        }
    }, [author, authorId, serverUrl]);
    if (author?.deleteAt) {
        return (
            <CompassIcon
                name='archive-outline'
                style={[styles.icon, style, isOnCenterBg && styles.iconOnCenterBg]}
                size={24}
            />
        );
    }

    // isOnHome：圆形头像 + 列表行空间紧凑；右下角状态点（负偏移）易落在圆外空白角，观感差，故列表不展示状态（会话内仍可见）
    const borderRadius = !isOnHome && isOnCenterBg ? Math.round(size / 2) : undefined;
    return (
        <ProfilePicture
            author={author}
            size={size}
            showStatus={!isOnHome}
            statusSize={12}
            statusStyle={[styles.status, isOnCenterBg && styles.statusOnCenterBg]}
            containerStyle={style}
            borderRadius={borderRadius}
            useSidebarPalette={isOnHome}
        />
    );
};

export default DmAvatar;
