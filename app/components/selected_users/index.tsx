// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {type LayoutChangeEvent, Platform, ScrollView, StyleSheet, View} from 'react-native';
import Animated, {useAnimatedStyle, useDerivedValue, useSharedValue, withTiming} from 'react-native-reanimated';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import Button from '@components/button';
import {CHIP_HEIGHT} from '@components/chips/constants';
import SelectedUserChipById from '@components/chips/selected_user_chip_by_id';
import Toast from '@components/toast';
import {useTheme} from '@context/theme';
import {useIsTablet, useKeyboardHeightWithDuration} from '@hooks/device';
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
}

const BUTTON_HEIGHT = 48;
const CHIP_GAP = 8;
const CHIP_HEIGHT_WITH_MARGIN = CHIP_HEIGHT + CHIP_GAP;
const EXPOSED_CHIP_HEIGHT = 0.33 * CHIP_HEIGHT;
const MAX_CHIP_ROWS = 2;
const SCROLL_MARGIN_TOP = 20;
const SCROLL_MARGIN_BOTTOM = 12;
const USERS_CHIPS_MAX_HEIGHT = (CHIP_HEIGHT_WITH_MARGIN * MAX_CHIP_ROWS) + EXPOSED_CHIP_HEIGHT;
const SCROLL_MAX_HEIGHT = USERS_CHIPS_MAX_HEIGHT + SCROLL_MARGIN_TOP + SCROLL_MARGIN_BOTTOM;
const PANEL_MAX_HEIGHT = SCROLL_MAX_HEIGHT + BUTTON_HEIGHT;
const MARGIN_BOTTOM = 20;
const TOAST_BOTTOM_MARGIN = 24;

const getStyleFromTheme = makeStyleSheetFromTheme((theme) => {
    return {
        container: {
            backgroundColor: theme.centerChannelBg,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: changeOpacity(theme.centerChannelColor, 0.12),
            maxHeight: PANEL_MAX_HEIGHT,
            overflow: 'hidden',
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: 16,
        },
        toast: {
            backgroundColor: theme.errorTextColor,
        },
        bottomBar: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
        },
        usersScroll: {
            flex: 1,
            marginRight: 12,
        },
        users: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: CHIP_GAP,
            paddingVertical: 4,
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
}: Props) {
    const theme = useTheme();
    const style = getStyleFromTheme(theme);
    const keyboard = useKeyboardHeightWithDuration();
    const isTablet = useIsTablet();
    const insets = useSafeAreaInsets();

    const usersChipsHeight = useSharedValue(0);
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
                />,
            );
        }
        return u;
    }, [selectedIds, teammateNameDisplay, onRemove, testID, avatarBorderRadius]);

    const totalPanelHeight = useDerivedValue(() => (
        isVisible ? usersChipsHeight.value + SCROLL_MARGIN_BOTTOM + SCROLL_MARGIN_TOP + BUTTON_HEIGHT : 0
    ), [isVisible]);

    const handlePress = useCallback(() => {
        onPress();
    }, [onPress]);

    const onLayout = useCallback((e: LayoutChangeEvent) => {
        usersChipsHeight.value = Math.min(
            USERS_CHIPS_MAX_HEIGHT,
            e.nativeEvent.layout.height,
        );
    }, [usersChipsHeight]);

    const androidMaxHeight = Platform.select({
        android: {
            maxHeight: isVisible ? undefined : 0,
        },
    });

    const animatedContainerStyle = useAnimatedStyle(() => ({
        marginBottom: withTiming(keyboardOverlap + ((Platform.OS === 'android' || isTablet) ? MARGIN_BOTTOM : -MARGIN_BOTTOM), {duration: keyboard.duration}),
        backgroundColor: isVisible ? theme.centerChannelBg : 'transparent',
        ...androidMaxHeight,
    }), [keyboardOverlap, keyboard.duration, isVisible, isTablet, theme.centerChannelBg]);

    const animatedToastStyle = useAnimatedStyle(() => {
        return {
            bottom: TOAST_BOTTOM_MARGIN + totalPanelHeight.value + insets.bottom,
            opacity: withTiming(showToast ? 1 : 0, {duration: 250}),
            position: 'absolute',
        };
    }, [showToast, insets.bottom]);

    const animatedViewStyle = useAnimatedStyle(() => ({
        height: withTiming(totalPanelHeight.value, {duration: 250}),
        borderWidth: isVisible ? 1 : 0,
        maxHeight: isVisible ? PANEL_MAX_HEIGHT + BUTTON_HEIGHT : 0,
    }), [isVisible]);

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
            <Animated.View style={[style.container, animatedViewStyle]}>
                <View style={style.bottomBar}>
                    <ScrollView
                        style={style.usersScroll}
                        horizontal
                        showsHorizontalScrollIndicator={false}
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

