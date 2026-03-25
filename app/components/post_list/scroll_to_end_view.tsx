// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useRef} from 'react';
import {useIntl} from 'react-intl';
import {Platform, Text, useWindowDimensions, View, type ViewStyle} from 'react-native';
import {Pressable} from 'react-native-gesture-handler';
import Animated, {useAnimatedStyle, withTiming} from 'react-native-reanimated';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import {useTheme} from '@context/theme';
import {useIsTablet, useKeyboardHeight, useViewPosition} from '@hooks/device';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

const getStyleFromTheme = makeStyleSheetFromTheme((theme) => {
    const commonButtonStyle: ViewStyle = {
        height: 40,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
    };
    return {
        guidingWrap: {
            ...Platform.select({
                ios: {zIndex: 50},
                default: {elevation: 50, zIndex: 50},
            }),
            pointerEvents: 'box-none',
        },
        buttonStyle: {
            position: 'absolute',
            alignSelf: 'center',
            bottom: -100,
            flexDirection: 'row',
        },
        shadow: {
            elevation: 4,
            shadowOpacity: 0.2,
            shadowOffset: {width: 0, height: 4},
            shadowRadius: 4,
        },
        scrollToEndButton: {
            ...commonButtonStyle,
            width: 40,
            borderRadius: 32,
            backgroundColor: theme.centerChannelBg,
            borderColor: changeOpacity(theme.centerChannelColor, 0.16),
            borderWidth: 1,
        },
        scrollToEndBadge: {
            ...commonButtonStyle,
            borderRadius: 8,
            paddingHorizontal: 12,
            backgroundColor: theme.buttonBg,
        },
        newMessagesText: {
            color: theme.buttonColor,
            paddingHorizontal: 8,
            overflow: 'hidden',
            ...typography('Body', 200, 'SemiBold'),
        },
    };
});

type Props = {
    onPress: () => void;
    isNewMessage: boolean;
    showScrollToEndBtn: boolean;
    location: string;

    /** Inline thread in channel: use thread wording and tablet inset behavior */
    isThreadReply?: boolean;
    testID?: string;
};

const ScrollToEndView = ({
    onPress,
    isNewMessage,
    showScrollToEndBtn,
    location,
    isThreadReply = false,
    testID = 'scroll-to-end-view',
}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const isTablet = useIsTablet();
    const styles = getStyleFromTheme(theme);

    // On iOS we have to take account of the keyboard.
    // We cannot use `useKeyboardOverlap` here because of the positioning of the element.
    const guidingViewRef = useRef<View>(null);
    const keyboardHeight = useKeyboardHeight();
    const viewPosition = useViewPosition(guidingViewRef, []);
    const dimensions = useWindowDimensions();
    const bottomSpace = (dimensions.height - viewPosition);
    const keyboardOverlap = Platform.select({ios: Math.max(0, keyboardHeight - bottomSpace), default: 0});

    // Inline thread on iPad: account for safe area when keyboard is hidden
    const insets = useSafeAreaInsets();
    const shouldAdjustBottom = (Platform.OS === 'ios') && isTablet && isThreadReply && !keyboardHeight;
    const bottomAdjustment = shouldAdjustBottom ? insets.bottom : 0;

    const message = isThreadReply ? intl.formatMessage({id: 'postList.scrollToBottom.newReplies', defaultMessage: 'New replies'}) : intl.formatMessage({id: 'postList.scrollToBottom.newMessages', defaultMessage: 'New messages'});

    // 显示时缓入；隐藏时 duration 0，避免点击回到底部后列表已就位但按钮仍缓慢消失
    const animatedStyle = useAnimatedStyle(
        () => {
            const ms = showScrollToEndBtn ? 300 : 0;
            return {
                transform: [
                    {
                        translateY: withTiming(showScrollToEndBtn ? -100 - keyboardOverlap - bottomAdjustment : -15, {
                            duration: ms,
                        }),
                    },
                ],
                maxWidth: withTiming(isNewMessage ? 169 : 40, {duration: ms}),
                opacity: withTiming(showScrollToEndBtn ? 1 : 0, {duration: ms}),
            };
        },
        [showScrollToEndBtn, isNewMessage, keyboardOverlap, bottomAdjustment],
    );

    const scrollButtonStyles = isNewMessage ? styles.scrollToEndBadge : styles.scrollToEndButton;

    return (
        <View
            ref={guidingViewRef}
            style={styles.guidingWrap}
            testID={testID}
            collapsable={false}
        >
            <Animated.View style={[animatedStyle, styles.buttonStyle]}>
                <Pressable
                    onPress={onPress}
                    delayPressIn={0}
                    style={[scrollButtonStyles, styles.shadow]}
                >
                    <CompassIcon
                        size={18}
                        name='arrow-down'
                        color={isNewMessage ? theme.buttonColor : changeOpacity(theme.centerChannelColor, 0.56)}
                    />
                    {isNewMessage && (
                        <Text style={styles.newMessagesText}>{message}</Text>
                    )}
                </Pressable>
            </Animated.View>
        </View>
    );
};

export default React.memo(ScrollToEndView);
