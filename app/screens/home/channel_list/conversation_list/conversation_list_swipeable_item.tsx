// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useRef, useState} from 'react';
import {defineMessages, useIntl} from 'react-intl';
import {Alert} from 'react-native';
import {GestureHandlerRootView, RectButton} from 'react-native-gesture-handler';
import ReanimatedSwipeable, {type SwipeableMethods} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Reanimated, {useAnimatedStyle, useSharedValue, type SharedValue} from 'react-native-reanimated';
import {useDatabase} from '@nozbe/watermelondb/react';

import {markChannelAsUnread} from '@actions/local/channel';
import {clearChannelHistory} from '@actions/remote/channel';
import {setDirectChannelVisible} from '@actions/remote/preference';
import ChannelItem from '@components/channel_item';
import CompassIcon from '@components/compass_icon';
import FormattedText from '@components/formatted_text';
import {General} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {getMyChannel} from '@queries/servers/channel';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type ChannelModel from '@typings/database/models/servers/channel';

type SwipeableRegistrar = {
    current: React.RefObject<SwipeableMethods> | null;
};

type Props = {
    channel: ChannelModel;
    onPress: (channel: ChannelModel) => void;
    swipeableRegistrar: SwipeableRegistrar;
    shouldHighlightActive: boolean;
    shouldHighlightState: boolean;
    isOnHome: boolean;
};

const messages = defineMessages({
    closeDirectMessage: {
        id: 'channel_info.close_dm',
        defaultMessage: 'Close direct message',
    },
    closeGroupMessage: {
        id: 'channel_info.close_gm',
        defaultMessage: 'Close discussion group',
    },
    closeDirectMessageChannel: {
        id: 'channel_info.close_dm_channel',
        defaultMessage: 'Are you sure you want to close this direct message? This will remove it from your home screen, but you can always open it again.',
    },
    closeGroupMessageChannel: {
        id: 'channel_info.close_gm_channel',
        defaultMessage: 'Are you sure you want to close this discussion group? This will remove it from your home screen, but you can always open it again.',
    },
    cancel: {
        id: 'common.cancel',
        defaultMessage: 'Cancel',
    },
    close: {
        id: 'channel_info.close',
        defaultMessage: 'Close',
    },
    markUnread: {
        id: 'mobile.post_info.mark_unread',
        defaultMessage: 'Mark as Unread',
    },
    hide: {
        id: 'conversation_list.swipe.hide',
        defaultMessage: 'Hide',
    },
    delete: {
        id: 'conversation_list.swipe.delete',
        defaultMessage: 'Delete',
    },
    // 删除确认框：清空记录 + 不显示聊天
    clearHistoryTitle: {
        id: 'conversation_list.swipe.clear_history_title',
        defaultMessage: 'Clear history and hide chat',
    },
    clearHistoryMessage: {
        id: 'conversation_list.swipe.clear_history_message',
        defaultMessage: 'Chat history will be cleared and this chat will be hidden. Messages will no longer be visible to you, but other members can still see them.',
    },
    clearHistoryConfirm: {
        id: 'conversation_list.swipe.clear_history_confirm',
        defaultMessage: 'Clear and Hide',
    },
    // 不显示确认框：仅隐藏聊天
    hideChatTitle: {
        id: 'conversation_list.swipe.hide_chat_title',
        defaultMessage: 'Hide this chat',
    },
    hideChatMessage: {
        id: 'conversation_list.swipe.hide_chat_message',
        defaultMessage: 'This chat will be hidden from your list. It will reappear when there are new messages.',
    },
    hideChatConfirm: {
        id: 'conversation_list.swipe.hide_chat_confirm',
        defaultMessage: 'Hide',
    },
});

/** 与服务器列表滑动操作 OPTION_SIZE 一致 */
const ACTION_WIDTH = 72;

/** 三个滑动操作按钮的背景色（微信风格） */
const MARK_UNREAD_COLOR = '#4A90D9';   // 浅蓝色 — 标为未读
const HIDE_COLOR = '#F5A623';          // 橙色 — 不显示
const DELETE_COLOR = '#D0021B';        // 红色 — 删除

const getStyles = makeStyleSheetFromTheme((theme: Theme) => ({
    actionButton: {
        width: ACTION_WIDTH,
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionLabel: {
        color: '#FFFFFF',
        marginTop: 4,
        fontSize: 11,
        ...typography('Body', 75, 'SemiBold'),
    },
    // 设为透明：置顶频道的深色背景(sidebarBg)需要穿透到可见层，
    // 非置顶条目由 FlatList 自身的 centerChannelBg 背景提供底色
    channelItemWrapper: {
        backgroundColor: 'transparent',
    },
}));

type RightActionsProps = {
    drag: SharedValue<number>;
    onMarkUnread: () => void;
    onHide: () => void;
    onDelete: () => void;
};

/**
 * 微信风格三按钮左滑操作：
 * 标为未读（浅蓝）| 不显示（橙色）| 删除（红色）
 *
 * 动画原理：三个按钮水平排列，整体容器通过 translateX 从右侧滑入。
 * 初始 translateX = totalWidth(216) 使按钮完全在屏幕外，
 * 随用户左滑 drag.value 变为负值，translateX = drag + totalWidth 逐步归零，
 * 主内容（聊天条目）作为遮罩逐步揭示后面的按钮。
 */
function RightActions({drag, onMarkUnread, onHide, onDelete}: RightActionsProps) {
    const theme = useTheme();
    const styles = getStyles(theme);
    const totalWidth = ACTION_WIDTH * 3;
    const containerWidth = useSharedValue(totalWidth);
    const [isReady, setIsReady] = useState(false);

    // 整体容器动画：随 drag 值从右侧滑入
    const styleAnimation = useAnimatedStyle(() => ({
        transform: [{translateX: drag.value + containerWidth.value}],
        opacity: isReady ? 1 : 0,
    }));

    const handleLayout = (event: {nativeEvent: {layout: {width: number}}}) => {
        const width = event.nativeEvent.layout.width;
        if (width > 0) {
            containerWidth.value = width;
            setIsReady(true);
        }
    };

    return (
        <Reanimated.View
            style={[{flexDirection: 'row', height: '100%'}, styleAnimation]}
            onLayout={handleLayout}
        >
            {/* 标为未读 — 浅蓝色背景 */}
            <RectButton
                onPress={onMarkUnread}
                style={[styles.actionButton, {backgroundColor: MARK_UNREAD_COLOR}]}
                underlayColor={changeOpacity('#000000', 0.1)}
                rippleColor={changeOpacity('#FFFFFF', 0.2)}
            >
                <CompassIcon
                    color='#FFFFFF'
                    name='mark-as-unread'
                    size={22}
                />
                <FormattedText
                    id='mobile.post_info.mark_unread'
                    defaultMessage='Mark as Unread'
                    style={styles.actionLabel}
                />
            </RectButton>

            {/* 不显示 — 橙色背景 */}
            <RectButton
                onPress={onHide}
                style={[styles.actionButton, {backgroundColor: HIDE_COLOR}]}
                underlayColor={changeOpacity('#000000', 0.1)}
                rippleColor={changeOpacity('#FFFFFF', 0.2)}
            >
                <CompassIcon
                    color='#FFFFFF'
                    name='close'
                    size={22}
                />
                <FormattedText
                    id='conversation_list.swipe.hide'
                    defaultMessage='Hide'
                    style={styles.actionLabel}
                />
            </RectButton>

            {/* 删除 — 红色背景 */}
            <RectButton
                onPress={onDelete}
                style={[styles.actionButton, {backgroundColor: DELETE_COLOR}]}
                underlayColor={changeOpacity('#000000', 0.1)}
                rippleColor={changeOpacity('#FFFFFF', 0.2)}
            >
                <CompassIcon
                    color='#FFFFFF'
                    name='trash-can-outline'
                    size={22}
                />
                <FormattedText
                    id='conversation_list.swipe.delete'
                    defaultMessage='Delete'
                    style={styles.actionLabel}
                />
            </RectButton>
        </Reanimated.View>
    );
}

const ConversationListSwipeableItem = ({
    channel,
    onPress,
    swipeableRegistrar,
    shouldHighlightActive,
    shouldHighlightState,
    isOnHome,
}: Props) => {
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const database = useDatabase();
    const styles = getStyles(useTheme());
    const swipeableRef = useRef<SwipeableMethods>(null);

    const dismissSwipe = useCallback(() => {
        swipeableRef.current?.close();
    }, []);

    const onSwipeableOpenStartDrag = useCallback(() => {
        if (swipeableRegistrar.current && swipeableRegistrar.current !== swipeableRef) {
            swipeableRegistrar.current.current?.close();
        }
        swipeableRegistrar.current = swipeableRef;
    }, [swipeableRegistrar]);

    /** 标为未读：本地设置 manuallyUnread=true，UI 立即显示未读状态 */
    const handleMarkUnreadPress = useCallback(async () => {
        dismissSwipe();
        try {
            const myChannel = await getMyChannel(database, channel.id);
            if (myChannel) {
                // 使用 lastPostAt 作为 lastViewed 时间戳，使频道显示为未读
                await markChannelAsUnread(
                    serverUrl,
                    channel.id,
                    Math.max(myChannel.messageCount, 1), // 确保至少有 1 条未读
                    myChannel.mentionsCount,
                    myChannel.lastPostAt || Date.now(),
                );
            }
        } catch (error) {
            // 静默处理：标记未读失败不影响用户体验
        }
    }, [channel.id, database, dismissSwipe, serverUrl]);

    /** 不显示：弹出确认框后隐藏聊天，有新消息时将重新出现 */
    const handleHidePress = useCallback(() => {
        const title = intl.formatMessage(messages.hideChatTitle);
        const message = intl.formatMessage(messages.hideChatMessage);

        Alert.alert(
            title,
            message,
            [{
                text: intl.formatMessage(messages.cancel),
                style: 'cancel',
                onPress: dismissSwipe,
            }, {
                text: intl.formatMessage(messages.hideChatConfirm),
                onPress: () => {
                    dismissSwipe();
                    setDirectChannelVisible(serverUrl, channel.id, false);
                },
            }],
            {
                cancelable: true,
                onDismiss: dismissSwipe,
            },
        );
    }, [channel.id, dismissSwipe, intl, serverUrl]);

    /**
     * 删除：清空聊天记录 + 隐藏聊天
     * 调用 clearChannelHistory 在服务器端设置 cleared_at 时间戳（仅影响当前用户），
     * 然后隐藏频道。其他成员不受影响，仍可查看完整聊天记录。
     * 重新打开聊天时，cleared_at 之前的历史消息不再显示。
     */
    const handleDeletePress = useCallback(() => {
        const title = intl.formatMessage(messages.clearHistoryTitle);
        const message = intl.formatMessage(messages.clearHistoryMessage);

        Alert.alert(
            title,
            message,
            [{
                text: intl.formatMessage(messages.cancel),
                style: 'cancel',
                onPress: dismissSwipe,
            }, {
                text: intl.formatMessage(messages.clearHistoryConfirm),
                style: 'destructive',
                onPress: async () => {
                    dismissSwipe();
                    // 先清空聊天记录（服务器端设置 cleared_at，仅影响当前用户）
                    await clearChannelHistory(serverUrl, channel.id);
                    // 再隐藏频道
                    setDirectChannelVisible(serverUrl, channel.id, false);
                },
            }],
            {
                cancelable: true,
                onDismiss: dismissSwipe,
            },
        );
    }, [channel.id, dismissSwipe, intl, serverUrl]);

    const isDirectOrGroup = channel.type === General.DM_CHANNEL || channel.type === General.GM_CHANNEL;

    const renderRightActions = useCallback(
        (_: unknown, drag: SharedValue<number>) => (
            isDirectOrGroup ? (
                <RightActions
                    drag={drag}
                    onMarkUnread={handleMarkUnreadPress}
                    onHide={handleHidePress}
                    onDelete={handleDeletePress}
                />
            ) : null
        ),
        [handleMarkUnreadPress, handleHidePress, handleDeletePress, isDirectOrGroup],
    );

    return (
        <GestureHandlerRootView>
            <ReanimatedSwipeable
                ref={swipeableRef}
                childrenContainerStyle={styles.channelItemWrapper}
                rightThreshold={ACTION_WIDTH * 1.5}
                friction={2}
                overshootRight={false}
                leftThreshold={0}
                renderRightActions={renderRightActions}
                onSwipeableOpenStartDrag={onSwipeableOpenStartDrag}
                testID='conversation_list.swipeable_item'
            >
                <ChannelItem
                    channel={channel}
                    onPress={onPress}
                    testID='channel_list.conversation.channel_item'
                    shouldHighlightActive={shouldHighlightActive}
                    shouldHighlightState={shouldHighlightState}
                    isOnHome={isOnHome}
                />
            </ReanimatedSwipeable>
        </GestureHandlerRootView>
    );
};

export default ConversationListSwipeableItem;
