// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import Animated, {useAnimatedStyle, withTiming, type SharedValue} from 'react-native-reanimated';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import {GALLERY_FOOTER_HEIGHT} from '@constants/gallery';
import {translateYConfig} from '@hooks/gallery';
import {useLightboxSharedValues} from '@screens/gallery/lightbox_swipeout/context';
import {formatTime} from '@utils/datetime';
import {typography} from '@utils/typography';

import {useStateFromSharedValue} from '../hooks';

import ProgressBar from './progress_bar';

import type {VideoControlAction} from './types';

interface BottomControlsProps extends VideoControlAction {
    currentTime: SharedValue<number>;
    duration: number;
    isFullscreen: boolean;
    onSeek: (time: number) => void;
    onFullscreen: () => void;
    onPlay: () => void;
    onPause: () => void;
    paused: boolean;
    paddingBottom: number;
}

const styles = StyleSheet.create({
    bottomControls: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 3,
    },
    container: {
        paddingTop: 8,
        paddingHorizontal: 8,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 8,
    },
    time: {
        color: 'white',
        ...typography('Body', 75),
    },
    button: {
        padding: 8,
    },
    fullscreenIcon: {
        transform: [{rotate: '90deg'}],
    },
});

const BottomControls: React.FC<BottomControlsProps> = ({
    currentTime,
    duration,
    handleControlAction,
    isFullscreen,
    onSeek,
    onFullscreen,
    onPlay,
    onPause,
    paused,
    paddingBottom,
}) => {
    const currentTimeValue = useStateFromSharedValue(currentTime, 0);
    const insets = useSafeAreaInsets();
    const {headerAndFooterHidden} = useLightboxSharedValues();

    const progress = duration > 0 ? currentTimeValue / duration : 0;

    const onSeekHandler = useCallback((time: number) => {
        handleControlAction('seek', () => {
            onSeek(time);
        });
    }, [handleControlAction, onSeek]);

    const handlePlayPause = useCallback(() => {
        if (paused) {
            handleControlAction('play', onPlay);
        } else {
            handleControlAction('pause', onPause);
        }
    }, [paused, handleControlAction, onPlay, onPause]);

    const handleFullscreen = useCallback(() => {
        handleControlAction('fullscreen', onFullscreen);
    }, [handleControlAction, onFullscreen]);

    const animatedStyle = useAnimatedStyle(() => ({
        marginBottom: withTiming(headerAndFooterHidden.value ? insets.bottom : GALLERY_FOOTER_HEIGHT, translateYConfig),
    }));

    return (
        <Animated.View
            pointerEvents='auto'
            style={[styles.bottomControls, animatedStyle]}
        >
            <View style={[styles.container, styles.row, {paddingBottom}]}>
                <Pressable style={styles.button} onPress={handlePlayPause}>
                    <CompassIcon
                        name={paused ? 'play' : 'pause'}
                        size={24}
                        color='white'
                    />
                </Pressable>

                <Text style={styles.time}>
                    {formatTime(currentTimeValue)}
                </Text>

                <ProgressBar
                    progress={progress}
                    duration={duration}
                    onSeek={onSeekHandler}
                />

                <Text style={styles.time}>
                    {formatTime(duration)}
                </Text>

                <Pressable style={styles.button} onPress={handleFullscreen}>
                    <CompassIcon
                        name={isFullscreen ? 'arrow-collapse' : 'arrow-expand'}
                        size={24}
                        color='white'
                        style={styles.fullscreenIcon}
                    />
                </Pressable>
            </View>
        </Animated.View>
    );
};

export default BottomControls;
