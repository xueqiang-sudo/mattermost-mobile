// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {DeviceEventEmitter, Text, TouchableOpacity, View} from 'react-native';
import Animated, {useAnimatedStyle, withTiming} from 'react-native-reanimated';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {Events, Navigation as NavigationConstants, Screens, View as ViewConstants} from '@constants';
import NavigationStore from '@store/navigation_store';
import {
    changeOpacity,
    makeStyleSheetFromTheme,
    WECHAT_HOME_DIVIDER_OPACITY,
    WECHAT_HOME_SECONDARY_TEXT_OPACITY,
} from '@utils/theme';

import AIAgent from './ai_agent';
import Contacts from './contacts';
import Home from './home';
import Me from './me';

import type {BottomTabBarProps} from '@react-navigation/bottom-tabs';

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        backgroundColor: theme.sidebarBg,
        alignContent: 'center',
        flexDirection: 'row',
        height: ViewConstants.BOTTOM_TAB_HEIGHT,
        justifyContent: 'center',
    },
    item: {
        alignItems: 'center',
        flex: 1,
        justifyContent: 'center',
    },
    label: {
        fontSize: 11,
        marginTop: 2,
    },
    separator: {
        borderTopColor: changeOpacity(theme.centerChannelColor, WECHAT_HOME_DIVIDER_OPACITY),
        borderTopWidth: 0.5,
    },
}));

const TabComponents: Record<string, any> = {
    [Screens.HOME_TAB_AI_AGENT]: AIAgent,
    [Screens.HOME_TAB_CHAT]: Home,
    [Screens.HOME_TAB_CONTACTS]: Contacts,
    [Screens.HOME_TAB_ME]: Me,
};

const TAB_LABELS: Record<string, {id: string; defaultMessage: string}> = {
    [Screens.HOME_TAB_AI_AGENT]: {id: 'tab_bar.ai_agent.label', defaultMessage: 'Assistant'},
    [Screens.HOME_TAB_CHAT]: {id: 'tab_bar.home.label', defaultMessage: 'Chat'},
    [Screens.HOME_TAB_CONTACTS]: {id: 'tab_bar.contacts.label', defaultMessage: 'Contacts'},
    [Screens.HOME_TAB_ME]: {id: 'tab_bar.me.label', defaultMessage: 'Me'},
};

function TabBar({state, descriptors, navigation, theme}: BottomTabBarProps & {theme: Theme}) {
    const intl = useIntl();
    const [visible, setVisible] = useState<boolean|undefined>();
    const style = getStyleSheet(theme);
    const safeareaInsets = useSafeAreaInsets();

    useEffect(() => {
        const event = DeviceEventEmitter.addListener(Events.TAB_BAR_VISIBLE, (show) => {
            setVisible(show);
        });

        return () => event.remove();
    }, []);

    useEffect(() => {
        const listner = DeviceEventEmitter.addListener(NavigationConstants.NAVIGATION_HOME, () => {
            NavigationStore.setVisibleTap(Screens.HOME_TAB_CHAT);
            navigation.navigate(Screens.HOME_TAB_CHAT);
        });

        return () => listner.remove();
    });

    useEffect(() => {
        const listner = DeviceEventEmitter.addListener(NavigationConstants.NAVIGATE_TO_TAB, ({screen, params = {}}: {screen: string; params: any}) => {
            const lastTab = state.history[state.history.length - 1];
            // eslint-disable-next-line max-nested-callbacks
            const routeIndex = state.routes.findIndex((r) => r.name === screen);
            const route = state.routes[routeIndex];
            // eslint-disable-next-line max-nested-callbacks
            const lastIndex = state.routes.findIndex((r) => r.key === lastTab.key);
            const direction = lastIndex < routeIndex ? 'right' : 'left';
            const event = navigation.emit({
                type: 'tabPress',
                target: screen,
                canPreventDefault: true,
            });

            if (!event.defaultPrevented) {
                // The `merge: true` option makes sure that the params inside the tab screen are preserved
                navigation.navigate({params: {direction, ...params}, name: route.name, merge: false});
                NavigationStore.setVisibleTap(route.name);
            }
        });

        return () => listner.remove();
    }, [state]);

    const animatedStyle = useAnimatedStyle(() => {
        if (visible === undefined) {
            return {transform: [{translateY: -safeareaInsets.bottom}]};
        }

        const height = visible ? withTiming(-safeareaInsets.bottom, {duration: 200}) : withTiming(ViewConstants.BOTTOM_TAB_HEIGHT + safeareaInsets.bottom, {duration: 150});
        return {
            transform: [{translateY: height}],
        };
    }, [visible, safeareaInsets.bottom]);

    return (
        <Animated.View style={[style.container, style.separator, animatedStyle]}>
            {state.routes.map((route, index) => {
                const {options} = descriptors[route.key];

                const isFocused = state.index === index;

                const onPress = () => {
                    const lastTab = state.history[state.history.length - 1];
                    const lastIndex = state.routes.findIndex((r) => r.key === lastTab.key);
                    const direction = lastIndex < index ? 'right' : 'left';
                    const event = navigation.emit({
                        type: 'tabPress',
                        target: route.key,
                        canPreventDefault: true,
                    });
                    DeviceEventEmitter.emit('tabPress');
                    if (!isFocused && !event.defaultPrevented) {
                        // The `merge: true` option makes sure that the params inside the tab screen are preserved
                        navigation.navigate({params: {direction}, name: route.name, merge: false});
                        NavigationStore.setVisibleTap(route.name);
                    }
                };

                const onLongPress = () => {
                    navigation.emit({
                        type: 'tabLongPress',
                        target: route.key,
                    });
                };

                const renderOption = () => {
                    const Component = TabComponents[route.name];
                    const props = {isFocused, theme};
                    if (Component) {
                        return <Component {...props}/>;
                    }

                    return null;
                };

                const tabLabel = TAB_LABELS[route.name];
                const labelColor = isFocused ? theme.buttonBg : changeOpacity(theme.centerChannelColor, WECHAT_HOME_SECONDARY_TEXT_OPACITY);

                return (
                    <TouchableOpacity
                        key={route.name}
                        accessibilityRole='button'
                        accessibilityState={isFocused ? {selected: true} : {}}
                        accessibilityLabel={options.tabBarAccessibilityLabel}
                        testID={options.tabBarButtonTestID}
                        onPress={onPress}
                        onLongPress={onLongPress}
                        style={style.item}
                    >
                        <View style={{alignItems: 'center'}}>
                            {renderOption()}
                            {tabLabel ? (
                                <Text
                                    style={[style.label, {color: labelColor}]}
                                    numberOfLines={1}
                                >
                                    {intl.formatMessage(tabLabel)}
                                </Text>
                            ) : null}
                        </View>
                    </TouchableOpacity>
                );
            })}
        </Animated.View>
    );
}

export default TabBar;
