// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useMemo} from 'react';
import {type StyleProp, StyleSheet, type ViewStyle} from 'react-native';
import Animated, {type AnimatedStyle} from 'react-native-reanimated';
import {SafeAreaView, type Edge, useSafeAreaInsets} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import PressableOpacity from '@components/pressable_opacity';
import {useDefaultHeaderHeight} from '@hooks/header';

type Props = {
    onClose: () => void;
    style: StyleProp<AnimatedStyle<ViewStyle>>;
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        backgroundColor: 'transparent',
        flexDirection: 'row',
        justifyContent: 'flex-end',
    },
    icon: {
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
    },
});

const edges: Edge[] = [];
const AnimatedSafeAreaView = Animated.createAnimatedComponent(SafeAreaView);

const Header = ({onClose, style}: Props) => {
    const insets = useSafeAreaInsets();
    const height = useDefaultHeaderHeight() - insets.top;
    const topContainerStyle = useMemo(() => [{height: insets.top, backgroundColor: 'transparent'}], [insets.top]);
    const containerStyle = useMemo(() => [styles.container, {height, paddingHorizontal: insets.left / 2 + 8}], [height, insets.left]);
    const iconStyle = useMemo(() => [{width: height}, styles.icon], [height]);

    return (
        <AnimatedSafeAreaView
            edges={edges}
            style={style}
        >
            <Animated.View style={topContainerStyle}/>
            <Animated.View style={containerStyle}>
                <PressableOpacity
                    onPress={onClose}
                    style={iconStyle}
                >
                    <CompassIcon
                        color='white'
                        name='close'
                        size={24}
                    />
                </PressableOpacity>
            </Animated.View>
        </AnimatedSafeAreaView>
    );
};

export default Header;
