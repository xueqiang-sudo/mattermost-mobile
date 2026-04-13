// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useMemo} from 'react';
import {useIntl} from 'react-intl';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';

import Badge from '@components/badge';
import ChannelIcon from '@components/channel_icon';
import CompassIcon from '@components/compass_icon';
import FormattedConversationTime from '@components/formatted_conversation_time';
import {General} from '@constants';
import {HOME_PADDING} from '@constants/view';
import {useTheme} from '@context/theme';
import {useIsTablet} from '@hooks/device';
import {isDMorGM} from '@utils/channel';
import {formatMessagePreview} from '@utils/message_preview';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';
import {getUserIdFromChannelName} from '@utils/user';

import {ChannelBody} from './channel_body';

import type ChannelModel from '@typings/database/models/servers/channel';

type Props = {
    channel: ChannelModel | Channel;
    currentUserId: string;
    currentTimezone?: string | null;
    hasDraft: boolean;
    isActive: boolean;
    isMuted: boolean;
    membersCount: number;
    isUnread: boolean;
    mentionsCount: number;
    messageCount?: number;
    onPress: (channel: ChannelModel | Channel) => void;
    teamDisplayName?: string;
    testID?: string;
    hasCall: boolean;
    isOnCenterBg?: boolean;
    showChannelName?: boolean;
    isOnHome?: boolean;
    lastPostAt?: number;
    lastPostPreview?: string;
}

export const ROW_HEIGHT = 40;
export const ROW_HEIGHT_WITH_TEAM = 58;
export const ROW_HEIGHT_CONVERSATION = 72;

export const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    icon: {
        marginRight: 12,
    },
    text: {
        color: changeOpacity(theme.sidebarText, 0.72),
    },
    highlight: {
        color: theme.sidebarUnreadText,
    },
    textOnCenterBg: {
        color: theme.centerChannelColor,
    },
    muted: {
        color: changeOpacity(theme.sidebarText, 0.32),
    },
    mutedOnCenterBg: {
        color: changeOpacity(theme.centerChannelColor, 0.32),
    },
    badge: {
        borderColor: theme.sidebarBg,
        marginLeft: 4,

        //Overwrite default badge styles
        position: undefined,
        top: undefined,
        left: undefined,
        alignSelf: undefined,
    },
    badgeOnCenterBg: {
        color: theme.buttonColor,
        backgroundColor: theme.buttonBg,
        borderColor: theme.centerChannelBg,
    },
    mutedBadge: {
        opacity: 0.32,
    },
    iconWrapper: {
        position: 'relative' as const,
    },

    // 未读徽章：右上角叠加显示，圆形，>99 显示 99+，参考微信/企微
    iconBadge: {
        position: 'absolute' as const,
        top: -4,
        right: -4,
        left: undefined,
        borderColor: theme.sidebarBg,
        marginLeft: 0,
    },

    // 已静音：头像角标（群/频道右下；私聊左下，避免与在线状态点重叠）
    muteIndicator: {
        position: 'absolute' as const,
        bottom: -2,
        right: -2,
        width: 18,
        height: 18,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.buttonBg,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.buttonColor, 0.2),
    },
    muteIndicatorDm: {
        right: undefined,
        left: -2,
    },
    muteIndicatorIcon: {
        color: theme.buttonColor,
    },
    timestamp: {
        ...typography('Body', 75),
        color: changeOpacity(theme.sidebarText, 0.64),
        marginLeft: 8,
    },
    timestampOnCenterBg: {
        color: changeOpacity(theme.centerChannelColor, 0.64),
    },
    subtitle: {
        ...typography('Body', 75),
        color: changeOpacity(theme.sidebarText, 0.64),
        marginTop: 2,
    },
    subtitleOnCenterBg: {
        color: changeOpacity(theme.centerChannelColor, 0.64),
    },
    activeItem: {
        backgroundColor: changeOpacity(theme.sidebarTextActiveColor, 0.1),
        borderLeftColor: theme.sidebarTextActiveBorder,
        borderLeftWidth: 5,
    },
    textActive: {
        color: theme.sidebarText,
    },
    hasCall: {
        textAlign: 'right',
    },
    filler: {
        flex: 1,
    },
}));

export const textStyle = StyleSheet.create({
    bold: typography('Body', 200, 'SemiBold'),
    regular: typography('Body', 200, 'Regular'),
});

const ChannelItem = ({
    channel,
    currentUserId,
    currentTimezone,
    hasDraft,
    isActive,
    isMuted,
    membersCount,
    isUnread,
    mentionsCount,
    messageCount = 0,
    onPress,
    teamDisplayName = '',
    testID,
    hasCall,
    isOnCenterBg = false,
    showChannelName = false,
    isOnHome = false,
    lastPostAt = 0,
    lastPostPreview = '',
}: Props) => {
    const {formatMessage} = useIntl();
    const theme = useTheme();
    const isTablet = useIsTablet();
    const styles = getStyleSheet(theme);

    const channelName = (showChannelName && !isDMorGM(channel)) ? channel.name : '';

    // Make it bolded if it has unreads or mentions
    const isBolded = isUnread || mentionsCount > 0;
    const showActive = isActive && isTablet;

    const teammateId = (channel.type === General.DM_CHANNEL) ? getUserIdFromChannelName(currentUserId, channel.name) : undefined;
    const isOwnDirectMessage = (channel.type === General.DM_CHANNEL) && currentUserId === teammateId;

    let displayName = 'displayName' in channel ? channel.displayName : channel.display_name;
    if (channel.name === General.DEFAULT_CHANNEL) {
        /** 列表统一「企业总群」；会话内顶栏仅 town-square 显示企业名（getChannelTitleDisplayName） */
        const townSquareLabel = formatMessage({
            id: 'channel_list.town_square.display_name',
            defaultMessage: 'Enterprise main channel',
        });
        displayName = townSquareLabel;
    } else if (isOwnDirectMessage) {
        displayName = formatMessage({id: 'channel_header.directchannel.you', defaultMessage: '{displayName} (you)'}, {displayName});
    }

    const deleteAt = 'deleteAt' in channel ? channel.deleteAt : channel.delete_at;
    const channelItemTestId = `${testID}.${channel.name}`;

    const height = useMemo(() => {
        if (isOnHome) {
            return ROW_HEIGHT_CONVERSATION;
        }
        return (teamDisplayName && !isTablet) ? ROW_HEIGHT_WITH_TEAM : ROW_HEIGHT;
    }, [teamDisplayName, isTablet, isOnHome]);

    const handleOnPress = useCallback(() => {
        onPress(channel);
    }, [channel.id]);

    const textStyles = useMemo(() => [
        isBolded && !isMuted ? textStyle.bold : textStyle.regular,
        styles.text,
        isBolded && styles.highlight,
        showActive ? styles.textActive : null,
        isOnCenterBg ? styles.textOnCenterBg : null,
        isMuted && styles.muted,
        isMuted && isOnCenterBg && styles.mutedOnCenterBg,
    ], [isBolded, styles, isMuted, showActive, isOnCenterBg]);

    const containerStyle = useMemo(() => [
        styles.container,
        isOnHome && HOME_PADDING,
        showActive && styles.activeItem,
        showActive && isOnHome && {
            paddingLeft: HOME_PADDING.paddingLeft - styles.activeItem.borderLeftWidth,
        },
        {minHeight: height},
    ], [height, showActive, styles, isOnHome]);

    const showIconBadge = isOnHome && (mentionsCount > 0 || (isUnread && !isMuted));

    // 传入实际数量，Badge 组件会在 >99 时显示 "99+"
    const badgeValue = mentionsCount > 0 ? mentionsCount : (isUnread && messageCount > 0 ? messageCount : -1);
    const subtitle = formatMessagePreview(lastPostPreview);
    const mutedIndicatorA11yLabel = formatMessage({
        id: 'mobile.channel_list.muted_indicator_a11y',
        defaultMessage: 'Muted',
    });
    const isDmChannel = channel.type === General.DM_CHANNEL;

    return (
        <TouchableOpacity onPress={handleOnPress}>
            <View
                style={containerStyle}
                testID={channelItemTestId}
            >
                <View style={[styles.icon, isOnHome && styles.iconWrapper]}>
                    <ChannelIcon
                        channelId={channel.id}
                        hasDraft={hasDraft}
                        isActive={isTablet && isActive}
                        isOnCenterBg={isOnCenterBg}
                        isOnHome={isOnHome}
                        isUnread={isBolded}
                        isArchived={deleteAt > 0}
                        membersCount={membersCount}
                        name={channel.name}
                        shared={channel.shared}
                        size={isOnHome ? 48 : 24}
                        type={channel.type}
                        isMuted={isMuted}
                        style={!isOnHome ? styles.icon : undefined}
                    />
                    {isOnHome && isMuted && (
                        <View
                            accessibilityLabel={mutedIndicatorA11yLabel}
                            accessibilityRole='image'
                            accessible={true}
                            style={[styles.muteIndicator, isDmChannel && styles.muteIndicatorDm]}
                            testID={`${channelItemTestId}.muted_indicator`}
                        >
                            <CompassIcon
                                name='bell-off-outline'
                                size={11}
                                style={styles.muteIndicatorIcon}
                            />
                        </View>
                    )}
                    {showIconBadge && (
                        <Badge
                            visible={true}
                            value={badgeValue}
                            type='Small'
                            backgroundColor='#FF3B30'
                            color='#FFFFFF'
                            borderColor={isOnCenterBg ? theme.centerChannelBg : theme.sidebarBg}
                            style={[styles.badge, isMuted && styles.mutedBadge, isOnCenterBg && styles.badgeOnCenterBg, styles.iconBadge]}
                        />
                    )}
                </View>
                {isOnHome ? (
                    <View style={{flex: 1, minWidth: 0, justifyContent: 'center'}}>
                        <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
                            <ChannelBody
                                displayName={displayName}
                                isMuted={isMuted}
                                teamDisplayName=''
                                teammateId={teammateId}
                                testId={channelItemTestId}
                                textStyles={textStyles}
                                channelName={channelName}
                                channelType={channel.type}
                                channelNameKey={channel.name}
                                isOnHome={true}
                                isOnCenterBg={isOnCenterBg}
                            />
                            {lastPostAt > 0 ? (
                                <FormattedConversationTime
                                    timestamp={lastPostAt}
                                    timeZone={currentTimezone ?? undefined}
                                    style={[styles.timestamp, isOnCenterBg && styles.timestampOnCenterBg]}
                                />
                            ) : (
                                <View style={{minWidth: 24}}/>
                            )}
                        </View>
                        {Boolean(subtitle) && (
                            <Text
                                numberOfLines={1}
                                ellipsizeMode='tail'
                                style={[styles.subtitle, isMuted && styles.muted, isOnCenterBg && styles.subtitleOnCenterBg]}
                            >
                                {subtitle}
                            </Text>
                        )}
                    </View>
                ) : (
                    <>
                        <ChannelBody
                            displayName={displayName}
                            isMuted={isMuted}
                            teamDisplayName={teamDisplayName}
                            teammateId={teammateId}
                            testId={channelItemTestId}
                            textStyles={textStyles}
                            channelName={channelName}
                            channelType={channel.type}
                            channelNameKey={channel.name}
                            isOnHome={isOnHome}
                            isOnCenterBg={isOnCenterBg}
                        />
                        <View style={styles.filler}/>
                        <Badge
                            visible={mentionsCount > 0}
                            value={mentionsCount}
                            style={[styles.badge, isMuted && styles.mutedBadge, isOnCenterBg && styles.badgeOnCenterBg]}
                        />
                        {hasCall && (
                            <CompassIcon
                                name='phone-in-talk'
                                size={16}
                                style={[textStyles, styles.hasCall]}
                            />
                        )}
                    </>
                )}
            </View>
        </TouchableOpacity>
    );
};

export default ChannelItem;
