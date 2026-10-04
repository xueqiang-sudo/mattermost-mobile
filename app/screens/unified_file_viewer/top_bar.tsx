// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {type ReactNode, useCallback} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

type TopBarProps = {
    title: string;
    onBack: () => void;
    onMenuPress: () => void;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        backgroundColor: theme.sidebarHeaderBg,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.2),
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 56,
        paddingHorizontal: 8,
    },
    left: {
        width: 48,
        alignItems: 'flex-start',
    },
    title: {
        flex: 1,
        ...typography('Heading', 500, 'SemiBold'),
        color: theme.sidebarHeaderTextColor,
        textAlign: 'center',
        marginHorizontal: 8,
    },
    right: {
        width: 48,
        alignItems: 'flex-end',
    },
    button: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
}));

const TopBar = ({title, onBack, onMenuPress}: TopBarProps) => {
    const theme = useTheme();
    const styles = getStyleSheet(theme);

    const handleBackPress = useCallback(() => {
        onBack();
    }, [onBack]);

    const handleMenuButtonPress = useCallback(() => {
        onMenuPress();
    }, [onMenuPress]);

    return (
        <SafeAreaView edges={['top']} style={styles.container}>
            <View style={styles.content}>
                <View style={styles.left}>
                    <Pressable
                        style={styles.button}
                        onPress={handleBackPress}
                    >
                        <CompassIcon
                            name='arrow-left'
                            size={24}
                            color={theme.sidebarHeaderTextColor}
                        />
                    </Pressable>
                </View>
                <Text
                    style={styles.title}
                    numberOfLines={1}
                    ellipsizeMode='middle'
                >
                    {title}
                </Text>
                <View style={styles.right}>
                    <Pressable
                        style={styles.button}
                        onPress={handleMenuButtonPress}
                    >
                        <CompassIcon
                            name='dots-horizontal'
                            size={24}
                            color={theme.sidebarHeaderTextColor}
                        />
                    </Pressable>
                </View>
            </View>
        </SafeAreaView>
    );
};

export default TopBar;
