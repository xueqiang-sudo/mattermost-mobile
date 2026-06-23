// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useMemo} from 'react';
import {useIntl} from 'react-intl';
import {Platform, Pressable, StyleSheet, Text, View} from 'react-native';

import Badge from '@components/badge';
import ChannelIcon from '@components/channel_icon';
import CompassIcon from '@components/compass_icon';

import {General} from '@constants';
import {useTheme} from '@context/theme';
import {useIsTablet} from '@hooks/device';
import {isDMorGM} from '@utils/channel';
import {getChannelListModalRowSurfaceStyle} from '@utils/channel_list_modal_row';
import {getHomeLastPostPreviewText} from '@utils/home_last_post_preview';
import {formatMessagePreview} from '@utils/message_preview';
import {changeOpacity, makeStyleSheetFromTheme, WECHAT_HOME_PADDING_H, WECHAT_HOME_SECONDARY_TEXT_OPACITY} from '@utils/theme';
import {typography} from '@utils/typography';
import {getUserIdFromChannelName} from '@utils/user';
import {formatWeChatPostHeaderTime} from '@utils/wechat_message_time';

import {ChannelBody} from './channel_body';

import type ChannelModel from '@typings/database/models/servers/channel';

type FileInfo = {
    mimeType: string;
    name: string;
};

type Props = {
    channel: ChannelModel | Channel;
    currentUserId: string;
    currentTimezone?: string | null;
    hasDraft: boolean;
    isActive: boolean;
    isFavorite?: boolean;
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

    /** 与 `isOnCenterBg` 配合：奇偶行背景区分 */
    listRowIndex?: number;

    /**
     * 与 `listRowIndex` 同屏用于查找频道、已加入频道等列表：非私聊用展示名前二字替代成员拼图头像。
     */
    useListInitialsForNonDm?: boolean;

    /** 已加入/归档列表等：在标题旁显示群类型角标（与首页标签规则一致）。 */
    showChannelTypeTag?: boolean;
    showChannelName?: boolean;
    isOnHome?: boolean;
    lastPostAt?: number;
    lastPostPreview?: string | {message: string; files: FileInfo[]; header: string; channelType: ChannelType};

    /** Last root post `type` in home list (for localized preview overrides). */
    lastPostType?: string;
    isMilitaryTime: boolean;

    /** 是否为已归档频道列表项 */
    isArchivedItem?: boolean;

    /** 恢复频道的回调函数 */
    onRestore?: (channel: ChannelModel | Channel) => void;

    /** 彻底删除频道的回调函数 */
    onDelete?: (channel: ChannelModel | Channel) => void;
}

export const ROW_HEIGHT = 40;

/** 查找频道 / 已加入列表等：卡片行内区域高度（含上下 padding） */
export const ROW_HEIGHT_CENTER_LIST = 64;
export const ROW_HEIGHT_WITH_TEAM = 58;
export const ROW_HEIGHT_CONVERSATION = 72;

/** 首页私聊圆形头像：角标「骑」在头像右缘，约一半压在圆上一半伸入与标题间留白，避免整块压在圆弧上 */
const HOME_DM_BADGE_TOP = 4;

/** 48px 头像、Small 角标宽约 24–26：left≈32 使角标中心接近头像右缘 */
const HOME_DM_BADGE_LEFT = 32;

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
    iconBadgeHome: {
        borderColor: theme.centerChannelBg,
    },

    // 首页私聊：角标不沿用 iconBadge 的 right:-4（易与圆切线别扭），改用 left 锚定 + 描边/浅阴影分层
    iconBadgeHomeDm: {
        position: 'absolute' as const,
        top: HOME_DM_BADGE_TOP,
        left: HOME_DM_BADGE_LEFT,
        marginLeft: 0,
        borderWidth: 3,
        ...Platform.select({
            ios: {
                shadowColor: '#000000',
                shadowOffset: {width: 0, height: 1},
                shadowOpacity: 0.12,
                shadowRadius: 2,
            },
            default: {
                elevation: 2,
            },
        }),
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
    timestampHome: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, WECHAT_HOME_SECONDARY_TEXT_OPACITY),
        marginLeft: 8,
    },
    subtitleHome: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, WECHAT_HOME_SECONDARY_TEXT_OPACITY),
        marginTop: 2,
    },
    homeRowPressed: {
        backgroundColor: theme.sidebarTextHoverBg,
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

    /** 按下时降低透明度，产生被按下的视觉效果（非首页列表） */
    centerListRowPressed: {
        opacity: 0.85,
    },

    // 已归档频道的操作按钮样式
    archivedActions: {
        flexDirection: 'row',
        gap: 8,
        paddingLeft: 8,
    },
    actionButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    restoreButton: {
        backgroundColor: changeOpacity(theme.buttonBg, 0.08),
    },
    deleteButton: {
        backgroundColor: changeOpacity(theme.errorTextColor, 0.08),
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
    isFavorite = false,
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
    listRowIndex,
    useListInitialsForNonDm = false,
    showChannelTypeTag = false,
    showChannelName = false,
    isOnHome = false,
    lastPostAt = 0,
    lastPostPreview = '',
    lastPostType = '',
    isMilitaryTime,
    isArchivedItem = false,
    onRestore,
    onDelete,
}: Props) => {
    const intl = useIntl();
    const {formatMessage} = intl;
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
        displayName = teamDisplayName || displayName;
    } else if (isOwnDirectMessage) {
        displayName = formatMessage({id: 'channel_header.directchannel.you', defaultMessage: '{displayName} (you)'}, {displayName});
    }

    const deleteAt = 'deleteAt' in channel ? channel.deleteAt : channel.delete_at;
    const channelItemTestId = `${testID}.${channel.name}`;

    const height = useMemo(() => {
        if (isOnHome) {
            return ROW_HEIGHT_CONVERSATION;
        }
        if (isOnCenterBg && listRowIndex !== undefined) {
            return (teamDisplayName && !isTablet) ? ROW_HEIGHT_WITH_TEAM : ROW_HEIGHT_CENTER_LIST;
        }
        return (teamDisplayName && !isTablet) ? ROW_HEIGHT_WITH_TEAM : ROW_HEIGHT;
    }, [teamDisplayName, isTablet, isOnHome, isOnCenterBg, listRowIndex]);

    const handleOnPress = useCallback(() => {
        onPress(channel);
    }, [channel.id]);

    const handleRestore = useCallback(() => {
        if (onRestore) {
            onRestore(channel);
        }
    }, [channel, onRestore]);

    const handleDelete = useCallback(() => {
        if (onDelete) {
            onDelete(channel);
        }
    }, [channel, onDelete]);

    // 置顶频道在首页使用深色背景(sidebarBg)，文字需切换为浅色(sidebarText)以保证可读性，
    // 否则深色文字(centerChannelColor)在深色背景上几乎不可见
    const homeTextColor = isFavorite ? theme.sidebarText : theme.centerChannelColor;
    const textStyles = useMemo(() => [
        isOnHome ?
            (isBolded && !isMuted ? {...textStyle.bold, color: homeTextColor} : {...textStyle.regular, color: homeTextColor}) :
            (isBolded && !isMuted ? textStyle.bold : textStyle.regular),
        isOnHome ? null : styles.text,
        isOnHome ? null : isBolded && styles.highlight,
        isOnHome ? null : showActive && styles.textActive,
        isOnCenterBg ? styles.textOnCenterBg : null,
        isMuted && !isOnHome && styles.muted,
        // 置顶频道的已静音文字也使用浅色(sidebarText)以保持与深色背景的一致性
        isMuted && isOnHome && {color: changeOpacity(homeTextColor, 0.32)},
        isMuted && isOnCenterBg && styles.mutedOnCenterBg,
    ], [isBolded, styles, isMuted, showActive, isOnCenterBg, isOnHome, isFavorite, homeTextColor, theme]);

    const homePadding = useMemo(() => ({
        paddingLeft: WECHAT_HOME_PADDING_H,
        paddingRight: WECHAT_HOME_PADDING_H,
    }), []);

    const containerStyle = useMemo(() => {
        const listSurface =
            isOnCenterBg && listRowIndex !== undefined ? getChannelListModalRowSurfaceStyle(theme) : null;
        return [
            styles.container,
            listSurface,
            isOnHome ? homePadding : null,
            isOnHome && isFavorite && {backgroundColor: theme.sidebarBg},
            showActive && styles.activeItem,
            showActive && isOnHome && {
                paddingLeft: WECHAT_HOME_PADDING_H - styles.activeItem.borderLeftWidth,
            },
            {minHeight: height},
        ];
    }, [height, showActive, styles, isOnHome, isFavorite, isOnCenterBg, listRowIndex, theme, homePadding]);

    const showIconBadge = isOnHome && (mentionsCount > 0 || (isUnread && !isMuted));

    // 传入实际数量，Badge 组件会在 >99 时显示 "99+"
    const badgeValue = mentionsCount > 0 ? mentionsCount : (isUnread && messageCount > 0 ? messageCount : -1);
    const homePreviewSource = useMemo(() => {
        if (!isOnHome) {
            return typeof lastPostPreview === 'string' ? lastPostPreview : lastPostPreview?.message || '';
        }
        return getHomeLastPostPreviewText(
            intl,
            lastPostPreview || '',
            lastPostType || undefined,
            channel.type as ChannelType,
        );
    }, [channel.type, intl, isOnHome, lastPostPreview, lastPostType]);

    const subtitle = formatMessagePreview(homePreviewSource);
    const mutedIndicatorA11yLabel = formatMessage({
        id: 'mobile.channel_list.muted_indicator_a11y',
        defaultMessage: 'Muted',
    });
    const isDmChannel = channel.type === General.DM_CHANNEL;
    const isCenterListCard = isOnCenterBg && listRowIndex !== undefined;

    // 已归档频道的内容 - 参考图2群组样式的简洁布局
    if (isArchivedItem) {
        return (
            <Pressable
                accessibilityRole='button'
                android_disableSound={true}
                android_ripple={
                    isCenterListCard && Platform.OS === 'android' ?{color: '#00000000', borderless: false} :undefined
                }
                onPress={handleOnPress}
                style={({pressed}) => (
                    !isCenterListCard && pressed ?{opacity: 0.92} :undefined
                )}
            >
                {({pressed}) => (
                    <View
                        style={[
                            containerStyle,
                            isCenterListCard && pressed && styles.centerListRowPressed,
                        ]}
                        testID={channelItemTestId}
                    >
                        <View style={[styles.icon, isOnHome && styles.iconWrapper]}>
                            <ChannelIcon
                                channelId={channel.id}
                                hasDraft={hasDraft}
                                initialsSource={displayName}
                                isActive={isTablet && isActive}
                                isOnCenterBg={isOnCenterBg}
                                isOnHome={isOnHome}
                                isUnread={false}
                                isArchived={false}
                                membersCount={membersCount}
                                name={channel.name}
                                shared={channel.shared}
                                promotedListAvatar={listRowIndex !== undefined}
                                size={isOnHome ? 48 : (listRowIndex !== undefined ? 40 : 24)}
                                type={channel.type}
                                isMuted={isMuted}
                                useListInitialsForNonDm={useListInitialsForNonDm}
                                style={!isOnHome ? styles.icon : undefined}
                            />
                        </View>
                        <View style={{flex: 1, minWidth: 0}}>
                            <ChannelBody
                                displayName={displayName}
                                isMuted={isMuted}
                                teamDisplayName={''}
                                teammateId={teammateId}
                                testId={channelItemTestId}
                                textStyles={textStyles}
                                channelName={channelName}
                                channelType={channel.type}
                                channelNameKey={channel.name}
                                isOnHome={isOnHome}
                                showChannelTypeTag={showChannelTypeTag}
                                isOnCenterBg={isOnCenterBg}
                            />
                            {deleteAt > 0 && (
                                <Text style={[styles.subtitle, isOnCenterBg && styles.subtitleOnCenterBg]}>
                                    {intl.formatMessage({id: 'channel.archived.time', defaultMessage: 'Archived at '})}
                                    {formatWeChatPostHeaderTime(intl, deleteAt, currentTimezone ?? undefined, isMilitaryTime)}
                                </Text>
                            )}
                        </View>
                        {(onRestore || onDelete) && (
                            <View style={styles.archivedActions}>
                                {onRestore && (
                                    <Pressable
                                        style={[styles.actionButton, styles.restoreButton]}
                                        onPress={handleRestore}
                                    >
                                        <CompassIcon
                                            name='restore'
                                            size={20}
                                            color={theme.buttonBg}
                                        />
                                    </Pressable>
                                )}
                                {onDelete && (
                                    <Pressable
                                        style={[styles.actionButton, styles.deleteButton]}
                                        onPress={handleDelete}
                                    >
                                        <CompassIcon
                                            name='trash-can-outline'
                                            size={20}
                                            color={theme.errorTextColor}
                                        />
                                    </Pressable>
                                )}
                            </View>
                        )}
                    </View>
                )}
            </Pressable>
        );
    }

    // 普通频道的内容
    return (
        <Pressable
            accessibilityRole='button'
            android_disableSound={true}
            android_ripple={
                isCenterListCard && Platform.OS === 'android' ?{color: '#00000000', borderless: false} :undefined
            }
            onPress={handleOnPress}
            style={({pressed}) => (
                !isCenterListCard && !isOnHome && pressed ? {opacity: 0.92} : undefined
            )}
        >
            {({pressed}) => (
                <View
                    style={[
                        containerStyle,
                        isCenterListCard && pressed && styles.centerListRowPressed,
                        // 置顶频道保持深色背景不变，按下态(homeRowPressed)不应覆盖置顶背景
                        isOnHome && pressed && !isFavorite && styles.homeRowPressed,
                    ]}
                    testID={channelItemTestId}
                >
                    <View style={[styles.icon, isOnHome && styles.iconWrapper]}>
                        <ChannelIcon
                            channelId={channel.id}
                            hasDraft={hasDraft}
                            initialsSource={displayName}
                            isActive={isTablet && isActive}
                            isOnCenterBg={isOnCenterBg}
                            isOnHome={isOnHome}
                            isUnread={isBolded}
                            isArchived={deleteAt > 0}
                            membersCount={membersCount}
                            name={channel.name}
                            shared={channel.shared}
                            promotedListAvatar={listRowIndex !== undefined}
                            size={isOnHome ? 48 : (listRowIndex !== undefined ? 40 : 24)}
                            type={channel.type}
                            isMuted={isMuted}
                            useListInitialsForNonDm={useListInitialsForNonDm}
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
                                backgroundColor={theme.errorTextColor}
                                color={theme.buttonColor}
                                // 置顶频道：徽章边框使用 sidebarBg 融入深色背景，避免白色(centerChannelBg)边框突兀
                                borderColor={isOnHome ? (isFavorite ? theme.sidebarBg : theme.centerChannelBg) : (isOnCenterBg ? theme.centerChannelBg : theme.sidebarBg)}
                                style={[
                                    styles.badge,
                                    isMuted && styles.mutedBadge,
                                    isOnCenterBg && styles.badgeOnCenterBg,
                                    isOnHome && styles.iconBadgeHome,
                                    isDmChannel ? styles.iconBadgeHomeDm : styles.iconBadge,
                                ]}
                            />
                        )}
                    </View>
                    {isOnHome ? (
                        <View style={{flex: 1, minWidth: 0, justifyContent: 'center'}}>
                            <View style={{flexDirection: 'row', alignItems: 'center'}}>
                                <ChannelBody
                                    displayName={displayName}
                                    isMuted={isMuted}
                                    teamDisplayName=''
                                    teammateId={teammateId}
                                    testId={channelItemTestId}
                                    textStyles={textStyles}
                                    channelName={channelName}
                                />
                            </View>
                            {Boolean(subtitle) && (
                                <Text
                                    numberOfLines={1}
                                    ellipsizeMode='tail'
                                    style={[
                                        styles.subtitleHome,
                                        // 置顶频道的消息预览使用浅色(sidebarText)配合深色背景
                                        isFavorite && {color: changeOpacity(theme.sidebarText, WECHAT_HOME_SECONDARY_TEXT_OPACITY)},
                                        isMuted && {color: changeOpacity(isFavorite ? theme.sidebarText : theme.centerChannelColor, 0.32)},
                                        isOnCenterBg && styles.subtitleOnCenterBg,
                                    ]}
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
            )}
        </Pressable>
    );
};

export default ChannelItem;
