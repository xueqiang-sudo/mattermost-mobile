// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useRef, useState} from 'react';
import {Dimensions, StyleSheet, View} from 'react-native';
import {Gesture, GestureDetector, GestureHandlerRootView} from 'react-native-gesture-handler';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
    runOnJS,
} from 'react-native-reanimated';

import {ExpoImage} from '@components/expo_image';

type ImagePreviewProps = {
    uri: string;
    onClose: () => void;
};

const {width: SCREEN_WIDTH, height: SCREEN_HEIGHT} = Dimensions.get('window');

const ImagePreview = ({uri, onClose}: ImagePreviewProps) => {
    const scale = useSharedValue(1);
    const savedScale = useSharedValue(1);
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const savedTranslateX = useSharedValue(0);
    const savedTranslateY = useSharedValue(0);
    const [isZoomed, setIsZoomed] = useState(false);

    // Double tap to zoom
    const doubleTap = Gesture.Tap()
        .numberOfTaps(2)
        .onStart(() => {
            if (scale.value === 1) {
                scale.value = withSpring(2);
                setIsZoomed(true);
            } else {
                scale.value = withSpring(1);
                translateX.value = withSpring(0);
                translateY.value = withSpring(0);
                savedScale.value = 1;
                savedTranslateX.value = 0;
                savedTranslateY.value = 0;
                setIsZoomed(false);
            }
        });

    // Pinch to zoom
    const pinch = Gesture.Pinch()
        .onStart(() => {
            savedScale.value = scale.value;
        })
        .onUpdate((event) => {
            scale.value = savedScale.value * event.scale;
        })
        .onEnd(() => {
            if (scale.value < 1) {
                scale.value = withSpring(1);
                savedScale.value = 1;
                setIsZoomed(false);
            } else if (scale.value > 3) {
                scale.value = withSpring(3);
                savedScale.value = 3;
            } else {
                savedScale.value = scale.value;
                setIsZoomed(true);
            }
        });

    // Pan to move (when zoomed) or swipe down to close
    const pan = Gesture.Pan()
        .onStart(() => {
            savedTranslateX.value = translateX.value;
            savedTranslateY.value = translateY.value;
        })
        .onUpdate((event) => {
            if (isZoomed) {
                // Move image when zoomed
                translateX.value = savedTranslateX.value + event.translationX;
                translateY.value = savedTranslateY.value + event.translationY;
            } else {
                // Only vertical movement for swipe to close
                translateY.value = event.translationY;
            }
        })
        .onEnd((event) => {
            if (!isZoomed) {
                // Swipe down to close
                if (event.translationY > 100) {
                    runOnJS(onClose)();
                } else {
                    // Spring back
                    translateX.value = withSpring(0);
                    translateY.value = withSpring(0);
                }
            }
        });

    // Single tap to close
    const singleTap = Gesture.Tap()
        .numberOfTaps(1)
        .onStart(() => {
            runOnJS(onClose)();
        });

    const animatedStyle = useAnimatedStyle(() => {
        return {
            transform: [
                {translateX: translateX.value},
                {translateY: translateY.value},
                {scale: scale.value},
            ],
        };
    });

    const composedGestures = Gesture.Simultaneous(pinch, pan, doubleTap, singleTap);

    return (
        <GestureHandlerRootView style={styles.container}>
            <View style={styles.container}>
                <GestureDetector gesture={composedGestures}>
                    <Animated.View style={[styles.imageContainer, animatedStyle]}>
                        <ExpoImage
                            source={{uri}}
                            style={styles.image}
                            contentFit='contain'
                        />
                    </Animated.View>
                </GestureDetector>
            </View>
        </GestureHandlerRootView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    imageContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    image: {
        width: SCREEN_WIDTH,
        height: SCREEN_HEIGHT,
    },
});

export default ImagePreview;
