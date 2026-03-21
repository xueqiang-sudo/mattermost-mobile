// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {type StyleProp, Text, type TextStyle, View, type ViewStyle} from 'react-native';

import CompassIcon from '@components/compass_icon';
import General from '@constants/general';
import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import DmAvatar from './dm_avatar';
import GmAvatarGrid from './gm_avatar_grid';

const ROUNDED_SQUARE_RATIO = 0.1;

type ChannelIconProps = {
    channelId?: string;
    hasDraft?: boolean;
    isActive?: boolean;
    isArchived?: boolean;
    isOnCenterBg?: boolean;
    isOnHome?: boolean;
    isUnread?: boolean;
    isMuted?: boolean;
    membersCount?: number;
    name: string;
    shared: boolean;
    size?: number;
    style?: StyleProp<Intersection<TextStyle, ViewStyle>>;
    testID?: string;
    type: string;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => {
    return {
        container: {
            alignItems: 'center',
            justifyContent: 'center',
        },
        icon: {
            color: changeOpacity(theme.sidebarText, 0.4),
        },
        iconActive: {
            color: theme.sidebarText,
        },
        iconUnread: {
            color: theme.sidebarUnreadText,
        },
        iconOnCenterBg: {
            color: changeOpacity(theme.centerChannelColor, 0.72),
        },
        iconUnreadOnCenterBg: {
            color: theme.centerChannelColor,
        },
        groupBox: {
            alignItems: 'center',
            backgroundColor: changeOpacity(theme.sidebarText, 0.16),
            borderRadius: 4,
            justifyContent: 'center',
        },
        iconBox: {
            alignItems: 'center',
            backgroundColor: changeOpacity(theme.sidebarText, 0.16),
            justifyContent: 'center',
        },
        groupBoxActive: {
            backgroundColor: changeOpacity(theme.sidebarText, 0.3),
        },
        groupBoxUnread: {
            backgroundColor: changeOpacity(theme.sidebarUnreadText, 0.3),
        },
        groupBoxOnCenterBg: {
            backgroundColor: changeOpacity(theme.centerChannelColor, 0.3),
        },
        townSquareBox: {
            backgroundColor: changeOpacity(theme.sidebarTextActiveBorder || theme.linkColor, 0.2),
        },
        channelBox: {
            backgroundColor: changeOpacity(theme.sidebarText, 0.2),
        },
        group: {
            color: theme.sidebarText,
            ...typography('Body', 75, 'SemiBold'),
        },
        groupActive: {
            color: theme.sidebarText,
        },
        groupUnread: {
            color: theme.sidebarUnreadText,
        },
        groupOnCenterBg: {
            color: changeOpacity(theme.centerChannelColor, 0.72),
        },
        groupUnreadOnCenterBg: {
            color: theme.centerChannelColor,
        },
        muted: {
            opacity: 0.4,
        },
    };
});

const ChannelIcon = ({
    channelId,
    hasDraft = false, isActive = false, isArchived = false,
    isOnCenterBg = false, isOnHome = false, isUnread = false, isMuted = false,
    membersCount = 0, name,
    shared, size = 12, style, testID, type,
}: ChannelIconProps) => {
    const theme = useTheme();
    const styles = getStyleSheet(theme);

    let activeIcon;
    let unreadIcon;
    let activeGroupBox;
    let unreadGroupBox;
    let activeGroup;
    let unreadGroup;
    let mutedStyle;

    if (isUnread && !isMuted) {
        unreadIcon = styles.iconUnread;
        unreadGroupBox = styles.groupBoxUnread;
        unreadGroup = styles.groupUnread;
    }

    if (isActive) {
        activeIcon = styles.iconActive;
        activeGroupBox = styles.groupBoxActive;
        activeGroup = styles.groupActive;
    }

    if (isOnCenterBg) {
        activeIcon = isUnread && !isMuted ? styles.iconUnreadOnCenterBg : styles.iconOnCenterBg;
        activeGroupBox = styles.groupBoxOnCenterBg;
        activeGroup = isUnread ? styles.groupUnreadOnCenterBg : styles.groupOnCenterBg;
    }

    if (isMuted) {
        mutedStyle = styles.muted;
    }

    const roundedSquareRadius = isOnHome ? Math.round(size * ROUNDED_SQUARE_RATIO) : undefined;

    const commonStyles: StyleProp<Intersection<TextStyle, ViewStyle>> = [
        style,
        mutedStyle,
    ];

    const commonIconStyles: StyleProp<TextStyle> = [
        styles.icon,
        unreadIcon,
        activeIcon,
        commonStyles,
        {fontSize: size},
    ];

    const wrapIconInBox = (iconElement: React.ReactNode, variant?: 'town_square' | 'channel') => {
        if (isOnHome) {
            const variantStyle = variant === 'town_square' ? styles.townSquareBox : variant === 'channel' ? styles.channelBox : null;
            return (
                <View style={[styles.iconBox, variantStyle, unreadGroupBox, activeGroupBox, commonStyles, {width: size, height: size, borderRadius: roundedSquareRadius}]}>
                    {iconElement}
                </View>
            );
        }
        return iconElement;
    };

    let icon = null;
    if (isArchived) {
        icon = wrapIconInBox(
            <CompassIcon
                name='archive-outline'
                style={[
                    commonIconStyles,
                    {left: 1},
                ]}
                testID={`${testID}.archive`}
            />,
        );
    } else if (hasDraft) {
        icon = wrapIconInBox(
            <CompassIcon
                name='pencil-outline'
                style={[
                    commonIconStyles,
                    {left: 2},
                ]}
                testID={`${testID}.draft`}
            />,
        );
    } else if (shared) {
        const iconName = type === General.PRIVATE_CHANNEL ? 'circle-multiple-outline-lock' : 'circle-multiple-outline';
        const sharedTestID = type === General.PRIVATE_CHANNEL ? 'channel_icon.shared_private' : 'channel_icon.shared_open';
        icon = wrapIconInBox(
            <CompassIcon
                name={iconName}
                style={[
                    commonIconStyles,
                    {left: 0.5},
                ]}
                testID={sharedTestID}
            />,
        );
    } else if (type === General.OPEN_CHANNEL) {
        const isTownSquare = name === General.DEFAULT_CHANNEL;
        if (channelId && isOnHome) {
            icon = (
                <View style={[commonStyles, {width: size, height: size, borderRadius: roundedSquareRadius, overflow: 'hidden'}]}>
                    <GmAvatarGrid
                        channelId={channelId}
                        size={size}
                        isOnCenterBg={isOnCenterBg}
                        isUnread={isUnread && !isMuted}
                        isMuted={isMuted}
                        style={style}
                    />
                </View>
            );
        } else {
            icon = wrapIconInBox(
                <CompassIcon
                    name={isTownSquare ? 'home-variant-outline' : 'pound'}
                    style={[commonIconStyles, {left: 1}]}
                    testID={`${testID}.${isTownSquare ? 'town_square' : 'public'}`}
                />,
                isTownSquare ? 'town_square' : 'channel',
            );
        }
    } else if (type === General.PRIVATE_CHANNEL) {
        if (channelId && isOnHome) {
            icon = (
                <View style={[commonStyles, {width: size, height: size, borderRadius: roundedSquareRadius, overflow: 'hidden'}]}>
                    <GmAvatarGrid
                        channelId={channelId}
                        size={size}
                        isOnCenterBg={isOnCenterBg}
                        isUnread={isUnread && !isMuted}
                        isMuted={isMuted}
                        style={style}
                    />
                </View>
            );
        } else {
            icon = wrapIconInBox(
                <CompassIcon
                    name='lock-outline'
                    style={[
                        commonIconStyles,
                        {left: 0.5},
                    ]}
                    testID={`${testID}.private`}
                />,
            );
        }
    } else if (type === General.GM_CHANNEL) {
        const groupBoxBorderRadius = isOnHome ? roundedSquareRadius : 4;
        if (channelId && isOnHome) {
            icon = (
                <View style={[commonStyles, {width: size, height: size, borderRadius: groupBoxBorderRadius, overflow: 'hidden'}]}>
                    <GmAvatarGrid
                        channelId={channelId}
                        size={size}
                        isOnCenterBg={isOnCenterBg}
                        isUnread={isUnread && !isMuted}
                        isMuted={isMuted}
                        style={style}
                    />
                </View>
            );
        } else {
            const fontSize = size - 12;
            icon = (
                <View
                    style={[styles.groupBox, unreadGroupBox, activeGroupBox, commonStyles, {width: size, height: size, borderRadius: groupBoxBorderRadius}]}
                >
                    <Text
                        style={[styles.group, unreadGroup, activeGroup, {fontSize}]}
                        testID={`${testID}.gm_member_count`}
                    >
                        {membersCount - 1}
                    </Text>
                </View>
            );
        }
    } else if (type === General.DM_CHANNEL) {
        icon = (
            <DmAvatar
                channelName={name}
                isOnCenterBg={isOnCenterBg}
                isOnHome={isOnHome}
                style={commonStyles}
                size={size}
            />
        );
    }

    return icon;
};

export default React.memo(ChannelIcon);
