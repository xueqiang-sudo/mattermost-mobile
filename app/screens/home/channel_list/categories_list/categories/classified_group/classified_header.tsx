// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {Text, TouchableOpacity, View} from 'react-native';
import Animated, {Easing, useAnimatedStyle, useDerivedValue, withTiming} from 'react-native-reanimated';

import CompassIcon from '@components/compass_icon';
import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        paddingVertical: 8,
        marginTop: 12,
        marginBottom: 2,
        paddingLeft: 2,
        marginLeft: 16,
        flexDirection: 'row',
        alignItems: 'center',
    },
    heading: {
        color: changeOpacity(theme.sidebarText, 0.64),
        ...typography('Body', 200, 'SemiBold'),
    },
    chevron: {
        marginRight: 2,
        color: changeOpacity(theme.sidebarText, 0.64),
        width: 20,
        height: 20,
    },
}));

type Props = {
    title: string;
    collapsed: boolean;
    onToggle: () => void;
}

const AnimatedCompassIcon = Animated.createAnimatedComponent(CompassIcon);

const ClassifiedHeader = ({title, collapsed, onToggle}: Props) => {
    const theme = useTheme();
    const styles = getStyleSheet(theme);

    const rotate = useDerivedValue(() => {
        return withTiming(collapsed ? -90 : 0, {
            duration: 100,
            easing: Easing.linear,
        });
    });

    const animatedStyle = useAnimatedStyle(() => {
        return {
            transform: [{rotate: `${rotate.value}deg`}],
        };
    });

    return (
        <TouchableOpacity onPress={onToggle}>
            <View style={styles.container}>
                <AnimatedCompassIcon
                    name='chevron-down'
                    style={[styles.chevron, animatedStyle]}
                    size={20}
                />
                <Text style={styles.heading}>
                    {title}
                </Text>
            </View>
        </TouchableOpacity>
    );
};

export default ClassifiedHeader;
