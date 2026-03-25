// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, type ReactNode} from 'react';
import {useIntl} from 'react-intl';
import {DeviceEventEmitter, Platform, StyleSheet, TouchableOpacity, View} from 'react-native';

import {buildAbsoluteUrl} from '@actions/remote/file';
import CompassIcon from '@components/compass_icon';
import ExpoImage from '@components/expo_image';
import ProfilePicture from '@components/profile_picture';
import {Events, Screens, View as ViewConstant} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {usePreventDoubleTap} from '@hooks/utils';
import {openUserProfileModal} from '@screens/navigation';
import {ensureString} from '@utils/types';

import type PostModel from '@typings/database/models/servers/post';
import type UserModel from '@typings/database/models/servers/user';
import type {AvailableScreens} from '@typings/screens/navigation';

type AvatarProps = {
    author?: UserModel;
    enablePostIconOverride?: boolean;
    isAutoReponse: boolean;
    location: AvailableScreens;
    post: PostModel;

    /** When true, use rounded square (WeChat/WeCom style) instead of circle */
    useRoundedSquare?: boolean;
}

const style = StyleSheet.create({
    buffer: {
        marginRight: Platform.select({android: 2, ios: 3}),
    },
});

const CHAT_AVATAR_BORDER_RADIUS = 6;

/** 微信风格：状态指示器也用方角 */
const CHAT_STATUS_BORDER_RADIUS = 4;

const Avatar = ({author, enablePostIconOverride, isAutoReponse, location, post, useRoundedSquare}: AvatarProps) => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();

    const fromWebHook = post.props?.from_webhook === 'true';
    const iconOverride = enablePostIconOverride && post.props?.use_user_icon !== 'true';
    const propsIconUrl = ensureString(post.props?.override_icon_url);
    const propsUsername = ensureString(post.props?.override_username);

    if (fromWebHook && iconOverride) {
        const isEmoji = Boolean(post.props?.override_icon_emoji);
        const frameSize = ViewConstant.PROFILE_PICTURE_SIZE;
        const pictureSize = isEmoji ? ViewConstant.PROFILE_PICTURE_EMOJI_SIZE : ViewConstant.PROFILE_PICTURE_SIZE;
        const borderRadius = isEmoji ? 0 : ViewConstant.PROFILE_PICTURE_SIZE / 2;
        const overrideIconUrl = buildAbsoluteUrl(serverUrl, propsIconUrl);

        let iconComponent: ReactNode;
        if (overrideIconUrl) {
            const source = {uri: overrideIconUrl};
            iconComponent = (
                <ExpoImage
                    id={`user-override-icon-${post.id}`}
                    source={source}
                    style={{
                        height: pictureSize,
                        width: pictureSize,
                    }}
                />
            );
        } else {
            iconComponent = (
                <CompassIcon
                    name='webhook'
                    size={32}
                />
            );
        }

        return (
            <View
                style={[{
                    borderRadius,
                    overflow: 'hidden',
                    justifyContent: 'center',
                    alignItems: 'center',
                    height: frameSize,
                    width: frameSize,
                }, style.buffer]}
            >
                {iconComponent}
            </View>
        );
    }

    const openUserProfile = usePreventDoubleTap(useCallback(() => {
        if (!author) {
            return;
        }
        openUserProfileModal(intl, theme, {
            location,
            userId: author.id,
            channelId: post.channelId,
            userIconOverride: propsIconUrl,
            usernameOverride: propsUsername,
        });
    }, [author, intl, location, post.channelId, propsIconUrl, propsUsername, theme]));

    const canMentionOnAvatarLongPress = Boolean(author?.username) && (

        // 仅在聊天列表（CHANNEL）里长按头像@对方
        location === Screens.CHANNEL

        // 自己头像不需要@自己
        && author.id !== post.userId

        // Webhook icon 不支持用户引用
        && !fromWebHook
    );

    const mentionUser = usePreventDoubleTap(useCallback(() => {
        if (!canMentionOnAvatarLongPress) {
            return;
        }

        const rawUsername = ensureString(author?.username);
        if (!rawUsername) {
            return;
        }

        const mention = rawUsername.startsWith('@') ? rawUsername : `@${rawUsername}`;
        DeviceEventEmitter.emit(Events.SEND_TO_POST_DRAFT, {location: Screens.CHANNEL, text: mention});
    }, [author?.username, canMentionOnAvatarLongPress]));

    let component = (
        <ProfilePicture
            author={author}
            borderRadius={useRoundedSquare ? CHAT_AVATAR_BORDER_RADIUS : undefined}
            size={ViewConstant.PROFILE_PICTURE_SIZE}
            iconSize={24}
            showStatus={false}
            statusStyle={useRoundedSquare ? {borderRadius: CHAT_STATUS_BORDER_RADIUS} : undefined}
            testID={`post_avatar.${author?.id}.profile_picture`}
        />
    );

    if (!fromWebHook) {
        component = (
            <TouchableOpacity
                onPress={openUserProfile}
                onLongPress={mentionUser}
            >
                {component}
            </TouchableOpacity>
        );
    }

    return component;
};

export default Avatar;
