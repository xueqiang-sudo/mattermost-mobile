// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {type LayoutChangeEvent, Platform, StyleSheet, View} from 'react-native';
import {ScrollView} from 'react-native-gesture-handler';
import Animated, {useAnimatedStyle, useDerivedValue, useSharedValue, withTiming} from 'react-native-reanimated';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import Button from '@components/button';
import {CHIP_HEIGHT} from '@components/chips/constants';
import SelectedUserChipById from '@components/chips/selected_user_chip_by_id';
import Toast from '@components/toast';
import {useTheme} from '@context/theme';
import {useKeyboardHeightWithDuration, useWindowDimensions} from '@hooks/device';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';

type Props = {

    /**
     * Name of the button Icon
     */
    buttonIcon: string;

    /*
     * Text displayed on the action button
     */
    buttonText: string;

    /**
     * the overlap of the keyboard with this list
     */
    keyboardOverlap?: number;

    /**
     * A handler function that will trigger when the button is pressed.
     */
    onPress: () => void;

    /**
     * A handler function that will deselect a user when clicked on.
     */
    onRemove: (id: string) => void;

    /**
     * A set of the selected user ids.
     */
    selectedIds: Set<string>;

    /**
     * callback to set the value of showToast
     */
    setShowToast?: (show: boolean) => void;

    /**
     * show the toast
     */
    showToast?: boolean;

    /**
    * How to display the names of users.
    */
    teammateNameDisplay: string;

    /**
     * test ID
     */
    testID?: string;

    /**
     * toast Icon
     */
    toastIcon?: string;

    /**
     * toast Message
     */
    toastMessage?: string;

    /**
     * Max number of users in the list
     */
    maxUsers?: number;

    /**
     * When set, avatar is a rounded square. Omit for circular.
     */
    avatarBorderRadius?: number;

    /**
     * 已选用户 chip 内显示名的最大宽度；不传则沿用 BaseChip 默认（约屏宽的 70%）。
     */
    chipLabelMaxWidth?: number;
}

const BUTTON_HEIGHT = 48;
const CHIP_GAP = 8;
const CHIP_HEIGHT_WITH_MARGIN = CHIP_HEIGHT + CHIP_GAP;
const EXPOSED_CHIP_HEIGHT = 0.33 * CHIP_HEIGHT;
const MAX_CHIP_ROWS = 2;
const USERS_CHIPS_MAX_HEIGHT = (CHIP_HEIGHT_WITH_MARGIN * MAX_CHIP_ROWS) + EXPOSED_CHIP_HEIGHT;

/** 与 `container` 样式中的 paddingTop / paddingBottom 一致；总高度 = 上边距 + bottomBar + 下边距 */
const CONTAINER_PADDING_TOP = 12;
const CONTAINER_PADDING_BOTTOM = 12;

/** bottomBar 为单行：chip 区与按钮并排，高度取二者较大值 */
const PANEL_MAX_TOTAL_HEIGHT =
    CONTAINER_PADDING_TOP + Math.max(USERS_CHIPS_MAX_HEIGHT, BUTTON_HEIGHT) + CONTAINER_PADDING_BOTTOM;
const TOAST_BOTTOM_MARGIN = 24;

/** Single-row chip strip: chip 24px + vertical padding on allowed scale */
const CHIPS_STRIP_MIN_HEIGHT = CHIP_HEIGHT + 8 + 8;

const getStyleFromTheme = makeStyleSheetFromTheme((theme) => {
    return {
        container: {
            backgroundColor: theme.centerChannelBg,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: changeOpacity(theme.centerChannelColor, 0.12),
            maxHeight: PANEL_MAX_TOTAL_HEIGHT,
            overflow: 'hidden',
            paddingHorizontal: 16,
            paddingTop: CONTAINER_PADDING_TOP,
            paddingBottom: CONTAINER_PADDING_BOTTOM,
        },
        toast: {
            backgroundColor: theme.errorTextColor,
        },
        bottomBar: {
            flexDirection: 'row',
            alignItems: 'center',
        },
        usersScroll: {
            flex: 1,
            marginRight: 12,
            backgroundColor: theme.centerChannelBg,
        },
        usersScrollContent: {
            flexGrow: 0,
        },
        users: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: CHIP_GAP,
            paddingVertical: 8,
            minHeight: CHIPS_STRIP_MIN_HEIGHT,
            overflow: 'hidden',
        },
        message: {
            color: theme.centerChannelBg,
            fontSize: 12,
            marginRight: 5,
            marginTop: 10,
            marginBottom: 2,
        },
    };
});

export default function SelectedUsers({
    buttonIcon,
    buttonText,
    keyboardOverlap = 0,
    onPress,
    onRemove,
    selectedIds,
    setShowToast,
    showToast = false,
    teammateNameDisplay,
    testID,
    toastIcon,
    toastMessage,
    maxUsers,
    avatarBorderRadius,
    chipLabelMaxWidth,
}: Props) {
    const theme = useTheme();
    const {width: windowWidth} = useWindowDimensions();
    const resolvedChipLabelMaxWidth = useMemo(() => {
        if (chipLabelMaxWidth !== undefined) {
            return chipLabelMaxWidth;
        }
        return Math.min(200, Math.max(96, Math.round((windowWidth - 32 - 140) / 2)));
    }, [chipLabelMaxWidth, windowWidth]);
    const style = getStyleFromTheme(theme);
    const keyboard = useKeyboardHeightWithDuration();
    const insets = useSafeAreaInsets();

    const usersChipsHeight = useSharedValue(CHIPS_STRIP_MIN_HEIGHT);
    const [isVisible, setIsVisible] = useState(false);
    const numberSelectedIds = selectedIds.size;

    const users = useMemo(() => {
        const u = [];
        for (const userId of selectedIds) {
            const userItemTestID = `${testID}.${userId}`;

            u.push(
                <SelectedUserChipById
                    key={userId}
                    userId={userId}
                    onPress={onRemove}
                    teammateNameDisplay={teammateNameDisplay}
                    testID={userItemTestID}
                    avatarBorderRadius={avatarBorderRadius}
                    labelMaxWidth={resolvedChipLabelMaxWidth}
                />,
            );
        }
        return u;
    }, [selectedIds, teammateNameDisplay, onRemove, testID, avatarBorderRadius, resolvedChipLabelMaxWidth]);

    const bottomInset = insets.bottom;

    const totalPanelHeight = useDerivedValue(() => {
        if (!isVisible) {
            return 0;
        }
        const barHeight = Math.max(usersChipsHeight.value, BUTTON_HEIGHT);
        return CONTAINER_PADDING_TOP + barHeight + CONTAINER_PADDING_BOTTOM + bottomInset;
    }, [isVisible, bottomInset]);

    const handlePress = useCallback(() => {
        onPress();
    }, [onPress]);

    const onLayout = useCallback((e: LayoutChangeEvent) => {
        const h = Math.max(CHIPS_STRIP_MIN_HEIGHT, e.nativeEvent.layout.height);
        usersChipsHeight.value = Math.min(USERS_CHIPS_MAX_HEIGHT, h);
    }, [usersChipsHeight]);

    const androidMaxHeight = Platform.select({
        android: {
            maxHeight: isVisible ? undefined : 0,
        },
    });

    const animatedContainerStyle = useAnimatedStyle(() => {
        return {
            marginBottom: withTiming(Math.max(0, keyboardOverlap), {duration: keyboard.duration}),
            backgroundColor: isVisible ? theme.centerChannelBg : 'transparent',
            ...androidMaxHeight,
        };
    }, [keyboardOverlap, keyboard.duration, isVisible, theme.centerChannelBg]);

    const animatedToastStyle = useAnimatedStyle(() => {
        return {
            bottom: TOAST_BOTTOM_MARGIN + totalPanelHeight.value,
            opacity: withTiming(showToast ? 1 : 0, {duration: 250}),
            position: 'absolute',
        };
    }, [showToast]);

    const animatedViewStyle = useAnimatedStyle(() => ({
        height: withTiming(totalPanelHeight.value, {duration: 250}),
        maxHeight: isVisible ? PANEL_MAX_TOTAL_HEIGHT + bottomInset : 0,
        overflow: 'hidden',
    }), [isVisible, bottomInset]);

    const animatedButtonStyle = useAnimatedStyle(() => ({
        opacity: withTiming(isVisible ? 1 : 0, {duration: isVisible ? 500 : 100}),
    }), [isVisible]);

    useEffect(() => {
        setIsVisible(numberSelectedIds > 0);
    }, [numberSelectedIds]);

    // This effect hides the toast after 4 seconds
    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (showToast) {
            timer = setTimeout(() => {
                setShowToast?.(false);
            }, 4000);
        }

        return () => clearTimeout(timer);
    }, [showToast, setShowToast]);

    const isDisabled = Boolean(maxUsers && (numberSelectedIds > maxUsers));
    return (
        <Animated.View style={animatedContainerStyle}>
            {showToast &&
            <Toast
                animatedStyle={animatedToastStyle}
                iconName={toastIcon}
                style={style.toast}
                message={toastMessage}
            />
            }
            <Animated.View
                style={[
                    style.container,
                    {paddingBottom: CONTAINER_PADDING_BOTTOM + bottomInset},
                    animatedViewStyle,
                ]}
            >
                <View style={style.bottomBar}>
                    <ScrollView
                        style={style.usersScroll}
                        contentContainerStyle={style.usersScrollContent}
                        horizontal={true}
                        showsHorizontalScrollIndicator={false}
                        showsVerticalScrollIndicator={false}
                        {...Platform.select({
                            android: {
                                fadingEdgeLength: 0,
                                overScrollMode: 'never' as const,
                            },
                        })}
                    >
                        <View
                            style={style.users}
                            onLayout={onLayout}
                        >
                            {users}
                        </View>
                    </ScrollView>
                    <Animated.View style={animatedButtonStyle}>
                        <Button
                            onPress={handlePress}
                            iconName={buttonIcon}
                            text={buttonText}
                            theme={theme}
                            emphasis={'primary'}
                            size={'lg'}
                            testID={`${testID}.start.button`}
                            disabled={isDisabled}
                        />
                    </Animated.View>
                </View>
            </Animated.View>
        </Animated.View>
    );
}

