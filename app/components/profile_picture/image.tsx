// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {type ImageSource} from 'expo-image';
import React, {useMemo} from 'react';
import {Platform, Text, View} from 'react-native';

import {buildAbsoluteUrl} from '@actions/remote/file';
import {buildDefaultProfileImageUrl, buildProfileImageUrlFromUser} from '@actions/remote/user';
import CompassIcon from '@components/compass_icon';
import {ExpoImageAnimated} from '@components/expo_image';
import {ACCOUNT_OUTLINE_IMAGE} from '@constants/profile';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';
import {getInitialsForAvatar, getLastPictureUpdate} from '@utils/user';

import type UserModel from '@typings/database/models/servers/user';

type Props = {
    author?: UserModel | UserProfile;
    forwardRef?: React.RefObject<any>;
    iconSize?: number;
    size: number;
    source?: ImageSource | string;
    url?: string;

    /** When set, uses this instead of size/2 for a rounded-square shape. Omit for circular. */
    borderRadius?: number;
    /** Sidebar scenes (e.g. home conversation list) use sidebar palette for fallback avatar colors. */
    useSidebarPalette?: boolean;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => {
    return {
        icon: {
            color: changeOpacity(theme.centerChannelColor, 0.48),
        },
    };
});

const Image = ({author, forwardRef, iconSize, size, source, url, borderRadius, useSidebarPalette = false}: Props) => {
    const theme = useTheme();
    let serverUrl = useServerUrl();
    serverUrl = url || serverUrl;

    const style = getStyleSheet(theme);
    const lastPictureUpdateAt = author ? getLastPictureUpdate(author) : 0;
    const fallbackBackground = useSidebarPalette ?
        changeOpacity(theme.sidebarText, 0.16) :
        changeOpacity(theme.centerChannelColor, 0.12);
    const fallbackTextColor = useSidebarPalette ? theme.sidebarText : theme.centerChannelColor;

    const fIStyle = useMemo(() => ({
        borderRadius: borderRadius ?? size / 2,
        backgroundColor: fallbackBackground,
        height: size,
        width: size,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
    }), [size, borderRadius, fallbackBackground]);

    const initialsTextStyle = useMemo(() => ({
        ...typography('Body', 100, 'SemiBold'),
        fontSize: size * 0.4,
        lineHeight: size * 0.48,
        color: fallbackTextColor,
        ...(Platform.OS === 'android' && {includeFontPadding: false}),
    }), [size, fallbackTextColor]);

    const imgSource = useMemo(() => {
        if (!author || typeof source === 'string') {
            return undefined;
        }

        if (source) {
            return source;
        }

        // 用户从未上传过头像 → 请求服务端生成的默认头像（彩色剪影）
        if (lastPictureUpdateAt === 0) {
            const defaultUrl = buildDefaultProfileImageUrl(serverUrl, author.id);
            return defaultUrl ? {uri: buildAbsoluteUrl(serverUrl, defaultUrl)} : undefined;
        }

        const pictureUrl = buildProfileImageUrlFromUser(serverUrl, author);
        return {uri: buildAbsoluteUrl(serverUrl, pictureUrl)};

    // We need to pass the lastPictureUpdateAt, because changes in this
    // value are used internally, and may not be followed by a change
    // in the containing object (author).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [author, serverUrl, source, lastPictureUpdateAt]);
    const id = useMemo(() => {
        if (author) {
            return lastPictureUpdateAt === 0
                ? `user-${author.id}-default`
                : `user-${author.id}-${lastPictureUpdateAt}`;
        }

        return undefined;
    }, [author, lastPictureUpdateAt]);

    if (typeof source === 'string') {
        return (
            <CompassIcon
                name={source}
                size={iconSize || size}
                style={style.icon}
            />
        );
    }

    if (imgSource?.uri?.startsWith('file://')) {
        return (
            <ExpoImageAnimated
                id={id}
                key={id}
                ref={forwardRef}
                style={fIStyle}
                source={{uri: imgSource.uri}}
            />
        );
    }

    if (imgSource) {
        return (
            <ExpoImageAnimated
                id={id}
                key={id}
                ref={forwardRef}
                style={fIStyle}
                source={imgSource}
            />
        );
    }

    if (author) {
        const initials = getInitialsForAvatar(author);
        if (initials) {
            return (
                <View style={fIStyle}>
                    <Text
                        style={initialsTextStyle}
                        numberOfLines={1}
                    >
                        {initials}
                    </Text>
                </View>
            );
        }
    }

    return (
        <CompassIcon
            name={ACCOUNT_OUTLINE_IMAGE}
            size={iconSize || size}
            style={style.icon}
        />
    );
};

export default Image;
