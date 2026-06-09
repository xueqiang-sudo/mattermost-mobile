// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useRef, useState} from 'react';
import {defineMessages, useIntl} from 'react-intl';
import {Alert} from 'react-native';
import {GestureHandlerRootView, RectButton} from 'react-native-gesture-handler';
import ReanimatedSwipeable, {type SwipeableMethods} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Reanimated, {useAnimatedStyle, useSharedValue, type SharedValue} from 'react-native-reanimated';

import {setDirectChannelVisible} from '@actions/remote/preference';
import ChannelItem from '@components/channel_item';
import CompassIcon from '@components/compass_icon';
import FormattedText from '@components/formatted_text';
import {General} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
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
});

/** 与服务器列表滑动操作 OPTION_SIZE 一致 */
const ACTION_WIDTH = 72;

const getStyles = makeStyleSheetFromTheme((theme: Theme) => ({
    actionContainer: {
        width: ACTION_WIDTH,
        height: '100%',
        backgroundColor: theme.sidebarTextHoverBg,
    },
    actionContent: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionLabel: {
        color: theme.sidebarText,
        marginTop: 4,
        ...typography('Body', 75, 'SemiBold'),
    },
    channelItemWrapper: {
        backgroundColor: theme.sidebarBg,
    },
}));

type RightActionProps = {
    drag: SharedValue<number>;
    onClosePress: () => void;
};

function RightAction({drag, onClosePress}: RightActionProps) {
    const theme = useTheme();
    const styles = getStyles(theme);
    const containerWidth = useSharedValue(ACTION_WIDTH);
    const [isReady, setIsReady] = useState(false);

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
            style={styleAnimation}
            onLayout={handleLayout}
        >
            <RectButton
                onPress={onClosePress}
                style={[styles.actionContainer, styles.actionContent]}
                underlayColor={theme.sidebarTeamBarBg}
                rippleColor={changeOpacity(theme.sidebarText, 0.12)}
            >
                <CompassIcon
                    color={theme.sidebarText}
                    name='close'
                    size={22}
                />
                <FormattedText
                    id='channel_info.close'
                    defaultMessage='Close'
                    style={styles.actionLabel}
                />
            </RectButton>
        </Reanimated.View>
    );
}

/**
 * 左滑关闭：仅用侧边栏主题色（hover / text / teamBar），与列表行同色系、随主题切换。
 */
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

    const handleClosePress = useCallback(() => {
        const isGroup = channel.type === General.GM_CHANNEL;
        const title = intl.formatMessage(isGroup ? messages.closeGroupMessage : messages.closeDirectMessage);
        const message = intl.formatMessage(isGroup ? messages.closeGroupMessageChannel : messages.closeDirectMessageChannel);

        Alert.alert(
            title,
            message,
            [{
                text: intl.formatMessage(messages.cancel),
                style: 'cancel',
                onPress: dismissSwipe,
            }, {
                text: intl.formatMessage(messages.close),
                style: 'destructive',
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
    }, [channel.id, channel.type, dismissSwipe, intl, serverUrl]);

    const isDirectOrGroup = channel.type === General.DM_CHANNEL || channel.type === General.GM_CHANNEL;

    const renderRightActions = useCallback(
        (_: unknown, drag: SharedValue<number>) => (
            isDirectOrGroup ? (
                <RightAction
                    drag={drag}
                    onClosePress={handleClosePress}
                />
            ) : null
        ),
        [handleClosePress, isDirectOrGroup],
    );

    return (
        <GestureHandlerRootView>
            <ReanimatedSwipeable
                ref={swipeableRef}
                childrenContainerStyle={styles.channelItemWrapper}
                rightThreshold={ACTION_WIDTH / 2}
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
