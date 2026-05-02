// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';
import {useIntl} from 'react-intl';
import {Platform, Text, TouchableOpacity, useWindowDimensions, View} from 'react-native';

import CustomStatusEmoji from '@components/custom_status/custom_status_emoji';
import FormattedText from '@components/formatted_text';
import {usePreventDoubleTap} from '@hooks/utils';
import {openUserProfileModal} from '@screens/navigation';
import {makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {AvailableScreens} from '@typings/screens/navigation';

type HeaderDisplayNameProps = {
    channelId: string;
    commentCount: number;
    displayName?: string;

    /** 微信频道/线程：放宽昵称容器宽度，减少过早省略 */
    wideDisplayName?: boolean;
    location: AvailableScreens;
    rootPostAuthor?: string;
    shouldRenderReplyButton?: boolean;
    theme: Theme;
    userIconOverride?: string;
    userId: string;
    usernameOverride?: string;
    showCustomStatusEmoji: boolean;
    customStatus: UserCustomStatus;
}

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => {
    return {
        displayName: {
            color: theme.centerChannelColor,
            flexGrow: 1,
            ...typography('Body', 200, 'SemiBold'),
            ...Platform.select({
                android: {
                    includeFontPadding: false,
                },
                default: {},
            }),
        },
        displayNameCustomEmojiWidth: {
            maxWidth: '90%',
        },
        displayNameContainer: {
            maxWidth: '60%',
            flexDirection: 'row',
            alignItems: 'center',
        },
        displayNameContainerWeChat: {
            maxWidth: '92%',
            flexDirection: 'row',
            alignItems: 'flex-start',
            flexShrink: 1,
            minWidth: 0,
        },

        /** 微信：Body/200 默认 lineHeight 24，行上方留白多；收紧行高以贴近头像顶边（略大于 16px 字号以免裁切） */
        displayNameWeChat: {
            lineHeight: 18,
            paddingTop: 0,
            paddingBottom: 0,
        },
        displayNameContainerBotReplyWidth: {
            maxWidth: '50%',
        },
        displayNameContainerLandscape: {
            maxWidth: '80%',
        },
        displayNameContainerLandscapeBotReplyWidth: {
            maxWidth: '70%',
        },
        customStatusEmoji: {
            color: theme.centerChannelColor,
            marginRight: 4,
        },
    };
});

const HeaderDisplayName = ({
    channelId, commentCount, displayName,
    location, rootPostAuthor,
    shouldRenderReplyButton, theme,
    userIconOverride, userId, usernameOverride,
    showCustomStatusEmoji, customStatus,
    wideDisplayName = false,
}: HeaderDisplayNameProps) => {
    const dimensions = useWindowDimensions();
    const intl = useIntl();
    const style = getStyleSheet(theme);

    const onPress = usePreventDoubleTap(useCallback(() => {
        openUserProfileModal(intl, theme, {
            location,
            userId,
            channelId,
            userIconOverride,
            usernameOverride,
        });
    }, [intl, userId, channelId, location, userIconOverride, usernameOverride, theme]));

    const calcNameWidth = () => {
        const isLandscape = dimensions.width > dimensions.height;

        const showReply = shouldRenderReplyButton || (!rootPostAuthor && commentCount > 0);

        if (showReply && isLandscape) {
            return style.displayNameContainerLandscapeBotReplyWidth;
        } else if (isLandscape) {
            return style.displayNameContainerLandscape;
        } else if (showReply) {
            return style.displayNameContainerBotReplyWidth;
        }
        return undefined;
    };

    const displayNameWidth = wideDisplayName ? undefined : calcNameWidth();
    const displayNameContainerStyle = [
        wideDisplayName ? style.displayNameContainerWeChat : style.displayNameContainer,
        displayNameWidth,
    ];

    const displayNameStyle = showCustomStatusEmoji ? style.displayNameCustomEmojiWidth : null;

    if (displayName) {
        return (
            <TouchableOpacity
                style={displayNameContainerStyle}
                onPress={onPress}
            >
                <View style={displayNameStyle}>
                    <Text
                        style={[style.displayName, wideDisplayName && style.displayNameWeChat]}
                        ellipsizeMode={'tail'}
                        numberOfLines={1}
                        testID='post_header.display_name'
                    >
                        {displayName}
                    </Text>
                </View>
                {showCustomStatusEmoji && (
                    <CustomStatusEmoji
                        customStatus={customStatus!}
                        style={[style.customStatusEmoji]}
                    />
                )}
            </TouchableOpacity>
        );
    }

    return (
        <View style={wideDisplayName ? style.displayNameContainerWeChat : style.displayNameContainer}>
            <FormattedText
                id='channel_loader.someone'
                defaultMessage='Someone'
                style={[style.displayName, wideDisplayName && style.displayNameWeChat]}
                testID='post_header.display_name'
            />
        </View>
    );
};

export default HeaderDisplayName;
