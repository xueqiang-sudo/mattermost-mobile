// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect} from 'react';
import {BackHandler, Platform, Pressable, StyleSheet} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Animated, {runOnJS, useAnimatedStyle, useSharedValue, withTiming} from 'react-native-reanimated';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {TABLET_SIDEBAR_WIDTH} from '@constants/view';
import {useLeftDrawer} from '@context/left_drawer';
import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';

import DrawerContent from './drawer_content';

const DRAWER_WIDTH = TABLET_SIDEBAR_WIDTH;

const SWIPE_THRESHOLD = 30;
const SWIPE_VELOCITY_THRESHOLD = 150;

export default function LeftDrawer() {
    const {isOpen, closeDrawer} = useLeftDrawer();
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const translateX = useSharedValue(-DRAWER_WIDTH);
    const backdropOpacity = useSharedValue(0);

    useEffect(() => {
        if (isOpen) {
            translateX.value = withTiming(0, {duration: 250});
            backdropOpacity.value = withTiming(1, {duration: 250});
        } else {
            translateX.value = withTiming(-DRAWER_WIDTH, {duration: 250});
            backdropOpacity.value = withTiming(0, {duration: 250});
        }
    }, [isOpen, translateX, backdropOpacity]);

    useEffect(() => {
        if (!isOpen || Platform.OS !== 'android') {
            return;
        }
        const back = BackHandler.addEventListener('hardwareBackPress', () => {
            closeDrawer();
            return true;
        });
        return () => back.remove();
    }, [isOpen, closeDrawer]);

    const panGesture = Gesture.Pan().
        minDistance(15).
        activeOffsetX([-15, 15]).
        onEnd((e) => {
            'worklet';
            if (Math.abs(e.translationX) > SWIPE_THRESHOLD || Math.abs(e.velocityX) > SWIPE_VELOCITY_THRESHOLD) {
                runOnJS(closeDrawer)();
            }
        });

    const panelStyle = useAnimatedStyle(() => ({
        transform: [{translateX: translateX.value}],
    }));

    const backdropStyle = useAnimatedStyle(() => ({
        opacity: backdropOpacity.value,
    }));

    const styles = getStyleSheet(theme);

    return (
        <>
            <Animated.View
                style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}
                pointerEvents={isOpen ? 'auto' : 'none'}
            >
                <GestureDetector gesture={panGesture}>
                    <Pressable
                        style={StyleSheet.absoluteFill}
                        onPress={closeDrawer}
                    />
                </GestureDetector>
            </Animated.View>
            <Animated.View
                style={[
                    styles.panel,
                    {width: DRAWER_WIDTH, paddingTop: insets.top},
                    panelStyle,
                ]}
                pointerEvents={isOpen ? 'auto' : 'none'}
            >
                <DrawerContent onClose={closeDrawer}/>
            </Animated.View>
        </>
    );
}

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    backdrop: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.5),
        zIndex: 1000,
    },
    panel: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        backgroundColor: theme.sidebarBg,
        zIndex: 1001,
        overflow: 'hidden',
    },
}));
