// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {StyleSheet, type StyleProp, Text, type TextStyle, View, type ViewStyle} from 'react-native';

import CompassIcon from '@components/compass_icon';
import General from '@constants/general';
import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import DmAvatar from './dm_avatar';
import GmAvatarGrid from './gm_avatar_grid';
import ListInitialsAvatar from './list_initials_avatar';

const ROUNDED_SQUARE_RATIO = 0.1;

/** 居中背景列表（查找频道、已加入列表等）：列表头标尺寸（圆角矩形） */
const LIST_MODAL_AVATAR_SIZE = 40;
const LIST_MODAL_AVATAR_RADIUS = 10;
const LIST_MODAL_INNER_ICON = 22;

type ChannelIconProps = {
    channelId?: string;
    hasDraft?: boolean;
    isActive?: boolean;
    isArchived?: boolean;
    isOnCenterBg?: boolean;
    isOnHome?: boolean;
    /** 与 `isOnCenterBg` 配合：查找/已加入等列表的大号圆形头像 */
    promotedListAvatar?: boolean;
    /** 与 `promotedListAvatar` 配合：非私聊用 `initialsSource` 前两字替代成员拼图 */
    useListInitialsForNonDm?: boolean;
    /** 用于前两字头像的展示名（与列表主标题一致） */
    initialsSource?: string;
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
        listModalShell: {
            alignItems: 'center',
            justifyContent: 'center',
            width: 40,
            height: 40,
            borderRadius: 10,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: changeOpacity(theme.centerChannelColor, 0.1),
            backgroundColor: changeOpacity(theme.centerChannelColor, 0.06),
        },
        listModalShellTown: {
            backgroundColor: changeOpacity(theme.linkColor, 0.12),
        },
        listModalShellNeutral: {
            backgroundColor: changeOpacity(theme.centerChannelColor, 0.06),
        },
    };
});

const ChannelIcon = ({
    channelId,
    hasDraft = false, isActive = false, isArchived = false,
    isOnCenterBg = false, isOnHome = false, isUnread = false, isMuted = false,
    membersCount = 0, name,
    promotedListAvatar = false,
    useListInitialsForNonDm = false,
    initialsSource = '',
    shared, size = 12, style, testID, type,
}: ChannelIconProps) => {
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const isEnterpriseMainGroup = name === General.DEFAULT_CHANNEL && type === General.OPEN_CHANNEL;

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

    const listModalAvatar = isOnCenterBg && !isOnHome && promotedListAvatar;
    const useInitialsInsteadOfMemberGrid = Boolean(
        listModalAvatar &&
        useListInitialsForNonDm &&
        type !== General.DM_CHANNEL &&
        initialsSource.trim(),
    );
    const roundedSquareRadius = isOnHome ? Math.round(size * ROUNDED_SQUARE_RATIO) : undefined;
    const iconGlyphSize = listModalAvatar ? LIST_MODAL_INNER_ICON : size;

    const commonStyles: StyleProp<Intersection<TextStyle, ViewStyle>> = [
        style,
        mutedStyle,
    ];

    const commonIconStyles: StyleProp<TextStyle> = [
        styles.icon,
        unreadIcon,
        activeIcon,
        commonStyles,
        {fontSize: iconGlyphSize},
    ];

    const wrapListModalShell = (iconElement: React.ReactNode, shellVariant: 'town_square' | 'neutral') => (
        <View
            style={[
                styles.listModalShell,
                shellVariant === 'town_square' ? styles.listModalShellTown : styles.listModalShellNeutral,
                isMuted && styles.muted,
                style,
            ]}
        >
            {iconElement}
        </View>
    );

    const wrapIconInBox = (iconElement: React.ReactNode, variant?: 'town_square' | 'channel') => {
        if (isOnHome) {
            const variantStyle = variant === 'town_square' ? styles.townSquareBox : variant === 'channel' ? styles.channelBox : null;
            return (
                <View style={[styles.iconBox, variantStyle, unreadGroupBox, activeGroupBox, commonStyles, {width: size, height: size, borderRadius: roundedSquareRadius}]}>
                    {iconElement}
                </View>
            );
        }
        if (listModalAvatar) {
            const shellVariant = variant === 'town_square' ? 'town_square' : 'neutral';
            return wrapListModalShell(iconElement, shellVariant);
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
    } else if (hasDraft && !(isOnHome && type === General.OPEN_CHANNEL && name === General.DEFAULT_CHANNEL) && !(isOnHome && type === General.GM_CHANNEL)) {
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
        if (channelId && listModalAvatar) {
            const boxSize = LIST_MODAL_AVATAR_SIZE;
            const boxRadius = LIST_MODAL_AVATAR_RADIUS;
            if (useInitialsInsteadOfMemberGrid) {
                icon = (
                    <ListInitialsAvatar
                        channelId={channelId}
                        displayName={initialsSource}
                        isEnterpriseMainGroup={isEnterpriseMainGroup}
                        isMuted={isMuted}
                        isUnread={isUnread}
                        size={boxSize}
                        testID={`${testID}.list_initials`}
                    />
                );
            } else {
                icon = (
                    <View style={[commonStyles, {width: boxSize, height: boxSize, borderRadius: boxRadius, overflow: 'hidden'}]}>
                        <GmAvatarGrid
                            channelId={channelId}
                            channelName={name}
                            expectedCount={Math.max(0, membersCount)}
                            size={boxSize}
                            isOnCenterBg={isOnCenterBg}
                            isOnHome={isOnHome}
                            isUnread={isUnread && !isMuted}
                            isMuted={isMuted}
                            style={style}
                        />
                    </View>
                );
            }
        } else {
            icon = wrapIconInBox(
                <CompassIcon
                    name='globe'
                    style={[commonIconStyles, {left: 1}]}
                    testID={`${testID}.${isTownSquare ? 'town_square' : 'public'}`}
                />,
                isTownSquare ? 'town_square' : 'channel',
            );
        }
    } else if (type === General.PRIVATE_CHANNEL) {
        if (channelId && (isOnHome || listModalAvatar)) {
            const boxSize = isOnHome ? size : LIST_MODAL_AVATAR_SIZE;
            const boxRadius = listModalAvatar ? LIST_MODAL_AVATAR_RADIUS : roundedSquareRadius;
            if (useInitialsInsteadOfMemberGrid) {
                icon = (
                    <ListInitialsAvatar
                        channelId={channelId}
                        displayName={initialsSource}
                        isEnterpriseMainGroup={isEnterpriseMainGroup}
                        isMuted={isMuted}
                        isUnread={isUnread}
                        size={boxSize}
                        testID={`${testID}.list_initials`}
                    />
                );
            } else {
                icon = (
                    <View style={[commonStyles, {width: boxSize, height: boxSize, borderRadius: boxRadius, overflow: 'hidden'}]}>
                        <GmAvatarGrid
                            channelId={channelId}
                            channelName={name}
                            expectedCount={Math.max(0, membersCount)}
                            size={boxSize}
                            isOnCenterBg={isOnCenterBg}
                            isOnHome={isOnHome}
                            isUnread={isUnread && !isMuted}
                            isMuted={isMuted}
                            style={style}
                        />
                    </View>
                );
            }
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
        const groupBoxBorderRadius = isOnHome ? roundedSquareRadius : (listModalAvatar ? LIST_MODAL_AVATAR_RADIUS : 4);
        if (channelId && (isOnHome || listModalAvatar)) {
            const boxSize = isOnHome ? size : LIST_MODAL_AVATAR_SIZE;
            if (useInitialsInsteadOfMemberGrid) {
                icon = (
                    <ListInitialsAvatar
                        channelId={channelId}
                        displayName={initialsSource}
                        isEnterpriseMainGroup={isEnterpriseMainGroup}
                        isMuted={isMuted}
                        isUnread={isUnread}
                        size={boxSize}
                        testID={`${testID}.list_initials`}
                    />
                );
            } else {
                icon = (
                    <View style={[commonStyles, {width: boxSize, height: boxSize, borderRadius: groupBoxBorderRadius, overflow: 'hidden'}]}>
                        <GmAvatarGrid
                            channelId={channelId}
                            channelName={name}
                            expectedCount={Math.max(0, membersCount)}
                            size={boxSize}
                            isOnCenterBg={isOnCenterBg}
                            isOnHome={isOnHome}
                            isUnread={isUnread && !isMuted}
                            isMuted={isMuted}
                            style={style}
                        />
                    </View>
                );
            }
        } else if (listModalAvatar && useInitialsInsteadOfMemberGrid) {
            icon = (
                <ListInitialsAvatar
                    channelId={channelId}
                    displayName={initialsSource}
                    isEnterpriseMainGroup={isEnterpriseMainGroup}
                    isMuted={isMuted}
                    isUnread={isUnread}
                    size={LIST_MODAL_AVATAR_SIZE}
                    testID={`${testID}.list_initials`}
                />
            );
        } else if (listModalAvatar) {
            icon = wrapListModalShell(
                <Text
                    style={[styles.group, unreadGroup, activeGroup, typography('Caption', 200, 'SemiBold')]}
                    testID={`${testID}.gm_member_count`}
                >
                    {membersCount - 1}
                </Text>,
                'neutral',
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
