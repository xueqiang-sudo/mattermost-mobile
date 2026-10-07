// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {type StyleProp, StyleSheet, type ViewStyle} from 'react-native';
import Animated, {type AnimatedStyle} from 'react-native-reanimated';
import {SafeAreaView, type Edge, useSafeAreaInsets} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import PressableOpacity from '@components/pressable_opacity';
import {useDefaultHeaderHeight} from '@hooks/header';

import type {GalleryFileType} from '@typings/screens/gallery';

type Props = {
    fileType?: GalleryFileType;
    onClose: () => void;
    style: StyleProp<AnimatedStyle<ViewStyle>>;
}

const CLOSE_BUTTON_SIZE = 48;

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        backgroundColor: 'transparent',
        flexDirection: 'row',
        justifyContent: 'flex-end',
    },
    containerLeft: {
        justifyContent: 'flex-start',
    },
    videoCloseButton: {
        width: CLOSE_BUTTON_SIZE,
        height: CLOSE_BUTTON_SIZE,
        borderRadius: CLOSE_BUTTON_SIZE / 2,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        alignItems: 'center',
        justifyContent: 'center',
    },
});

const edges: Edge[] = [];
const AnimatedSafeAreaView = Animated.createAnimatedComponent(SafeAreaView);

const Header = ({fileType, onClose, style}: Props) => {
    const insets = useSafeAreaInsets();
    const height = useDefaultHeaderHeight() - insets.top;
    const isVideo = fileType === 'video';

    // Image viewer: no close button (single-tap closes the viewer)
    if (!isVideo) {
        return null;
    }

    const topContainerStyle = [{height: insets.top, backgroundColor: 'transparent'}];
    const containerStyle = [styles.container, styles.containerLeft, {height, paddingHorizontal: insets.left / 2 + 12}];

    return (
        <AnimatedSafeAreaView
            edges={edges}
            style={style}
        >
            <Animated.View style={topContainerStyle}/>
            <Animated.View style={containerStyle}>
                <PressableOpacity
                    onPress={onClose}
                    style={styles.videoCloseButton}
                >
                    <CompassIcon
                        color='white'
                        name='close'
                        size={28}
                    />
                </PressableOpacity>
            </Animated.View>
        </AnimatedSafeAreaView>
    );
};

export default Header;
