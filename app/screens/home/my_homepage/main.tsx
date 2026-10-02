// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * 我的主页主界面
 */

import {useIsFocused} from '@react-navigation/native';
import React from 'react';
import {Freeze} from 'react-freeze';
import {useIntl} from 'react-intl';
import {
    ScrollView,
    Text,
    View,
} from 'react-native';
import Animated, {useAnimatedStyle, withTiming} from 'react-native-reanimated';
import {type Edge, SafeAreaView} from 'react-native-safe-area-context';

import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';
import {username2Nickname} from '@utils/user';

import type UserModel from '@typings/database/models/servers/user';

type Props = {
    currentUser?: UserModel;
};

/** 与通讯录 Tab 一致：不用手动 topInset 条带，由 SafeAreaView 统一处理四边，避免双倍顶部留白 */
const edges: Edge[] = ['top', 'bottom', 'left', 'right'];

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    flex: {
        flex: 1,
    },
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
        paddingVertical: 2,
        backgroundColor: theme.sidebarBg,
        flexShrink: 0,
    },
    headerTitle: {
        ...typography('Heading', 600, 'SemiBold'),
        color: theme.sidebarText,
        textAlign: 'center',
        flexShrink: 1,
        minWidth: 0,
    },
    scrollContent: {
        flexGrow: 1,
    },
    body: {
        marginTop: 12,
        marginHorizontal: 16,
    },
}));

const MyHomepageMain = ({currentUser}: Props) => {
    const theme = useTheme();
    const intl = useIntl();
    const isFocused = useIsFocused();
    const styles = getStyleSheet(theme);

    const headerTitleText = React.useMemo(() => {
        const fallback = intl.formatMessage({id: 'tab_bar.my_homepage.label', defaultMessage: 'My Homepage'});
        const name = username2Nickname(currentUser, {
            includeFullName: false,
            locale: intl.locale,
            useFallbackUsername: false,
        }).trim();
        return name || fallback;
    }, [currentUser, intl]);

    const animated = useAnimatedStyle(() => ({
        opacity: withTiming(1, {duration: 150}),
        transform: [{translateX: withTiming(0, {duration: 150})}],
    }), []);

    const content = (
        <View style={styles.container}>
            <View style={{backgroundColor: theme.sidebarBg}}>
                <View style={styles.header}>
                    <Text
                        style={styles.headerTitle}
                        numberOfLines={1}
                        ellipsizeMode='tail'
                    >
                        {headerTitleText}
                    </Text>
                </View>
            </View>
            <ScrollView
                style={[styles.flex, {backgroundColor: theme.centerChannelBg}]}
                contentContainerStyle={[styles.scrollContent, {paddingBottom: 24}]}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.body}>
                </View>
            </ScrollView>
        </View>
    );

    return (
        <Freeze freeze={!isFocused}>
            <SafeAreaView
                edges={edges}
                style={[styles.flex, {backgroundColor: theme.sidebarBg}]}
            >
                <Animated.View style={[styles.flex, animated]}>
                    {content}
                </Animated.View>
            </SafeAreaView>
        </Freeze>
    );
};

export default MyHomepageMain;
