// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useHardwareKeyboardEvents} from '@mattermost/hardware-keyboard';
import {createBottomTabNavigator, type BottomTabBarProps} from '@react-navigation/bottom-tabs';
import {NavigationContainer, DefaultTheme} from '@react-navigation/native';
import React, {useCallback, useEffect, useMemo} from 'react';
import {useIntl} from 'react-intl';
import {DeviceEventEmitter, Platform, StyleSheet, View} from 'react-native';
import {enableFreeze, enableScreens} from 'react-native-screens';

import {autoUpdateTimezone} from '@actions/remote/user';
import LeftDrawer from '@components/left_drawer';
import ServerVersion from '@components/server_version';
import TeamMembershipNotice from '@components/team_membership_notice';
import {Events, Launch, Screens} from '@constants';
import {ENABLE_INTERNAL_GROUPS} from '@constants/channel';
import {LeftDrawerProvider} from '@context/left_drawer';
import {useTheme} from '@context/theme';
import {useAppState} from '@hooks/device';
import SecurityManager from '@managers/security_manager';
import {getAllServers} from '@queries/app/servers';
import {findChannels, popToRoot} from '@screens/navigation';
import NavigationStore from '@store/navigation_store';
import {alertInvalidDeepLink, parseAndHandleDeepLink} from '@utils/deep_link';
import {logError} from '@utils/log';
import {alertChannelArchived, alertChannelRemove} from '@utils/navigation';
import {notificationError} from '@utils/notification';

import ChannelList from './channel_list';
import Contacts from './contacts';
import TabBar from './tab_bar';
import AIAgent from './ai_agent';
import MyHomepage from './my_homepage';

import type {DeepLinkWithData, LaunchProps} from '@typings/launch';

if (Platform.OS === 'ios') {
    // We do this on iOS to avoid conflicts betwen ReactNavigation & Wix ReactNativeNavigation
    enableScreens(false);
}

enableFreeze(true);

type HomeProps = LaunchProps & {
    componentId: string;
};

const Tab = createBottomTabNavigator();

const updateTimezoneIfNeeded = async () => {
    try {
        const servers = await getAllServers();
        for (const server of servers) {
            if (server.url && server.lastActiveAt > 0) {
                autoUpdateTimezone(server.url);
            }
        }
    } catch (e) {
        logError('Localize change', e);
    }
};

const styles = StyleSheet.create({
    flex: {flex: 1},
});

export function HomeScreen(props: HomeProps) {
    const theme = useTheme();
    const intl = useIntl();
    const appState = useAppState();

    useEffect(() => {
        SecurityManager.start();
    }, []);

    const handleFindChannels = useCallback(() => {
        if (!NavigationStore.getScreensInStack().includes(Screens.FIND_CHANNELS)) {
            const titleId = ENABLE_INTERNAL_GROUPS ? 'find_channels.title' : 'find_channels.title_no_internal';
            findChannels(
                intl.formatMessage({id: titleId, defaultMessage: 'Search groups, chats & contacts'}),
                theme,
            );
        }
    }, [intl, theme]);

    const events = useMemo(() => ({onFindChannels: handleFindChannels}), [handleFindChannels]);
    useHardwareKeyboardEvents(events);

    useEffect(() => {
        const listener = DeviceEventEmitter.addListener(Events.NOTIFICATION_ERROR, (value: 'Team' | 'Channel' | 'Post' | 'Connection') => {
            notificationError(intl, value);
        });

        return () => {
            listener.remove();
        };
    }, [intl]);

    useEffect(() => {
        const leaveChannelListener = DeviceEventEmitter.addListener(Events.LEAVE_CHANNEL, (displayName: string) => {
            alertChannelRemove(displayName, intl);
        });

        const archivedChannelListener = DeviceEventEmitter.addListener(Events.CHANNEL_ARCHIVED, (displayName: string) => {
            alertChannelArchived(displayName, intl);
        });

        const crtToggledListener = DeviceEventEmitter.addListener(Events.CRT_TOGGLED, (isSameServer: boolean) => {
            if (isSameServer) {
                popToRoot();
            }
        });

        return () => {
            leaveChannelListener.remove();
            archivedChannelListener.remove();
            crtToggledListener.remove();
        };
    }, [intl]);

    useEffect(() => {
        if (appState === 'active') {
            updateTimezoneIfNeeded();
        }
    }, [appState]);

    useEffect(() => {
        if (props.launchType === Launch.DeepLink) {
            if (props.launchError) {
                alertInvalidDeepLink(intl);
                return;
            }

            const deepLink = props.extra as DeepLinkWithData;
            if (deepLink?.url) {
                parseAndHandleDeepLink(deepLink.url, intl, props.componentId, true).then((result) => {
                    if (result.error) {
                        alertInvalidDeepLink(intl);
                    }
                });
            }
        }

    // only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <View
            style={styles.flex}
            nativeID={SecurityManager.getShieldScreenId(Screens.HOME, true)}
        >
            <LeftDrawerProvider>
                <NavigationContainer
                    theme={{
                        ...DefaultTheme,
                        dark: false,
                        colors: {
                            ...DefaultTheme.colors,
                            primary: theme.centerChannelColor,
                            background: 'transparent',
                            card: theme.centerChannelBg,
                            text: theme.centerChannelColor,
                            border: 'white',
                            notification: theme.mentionHighlightBg,
                        },
                    }}
                >
                    <Tab.Navigator
                        screenOptions={{headerShown: false, freezeOnBlur: false, lazy: true}}
                        backBehavior='none'
                        tabBar={(tabProps: BottomTabBarProps) => (
                            <TabBar
                                {...tabProps}
                                theme={theme}
                            />)}
                    >
                        <Tab.Screen
                            name={Screens.HOME_TAB_CHAT}
                            options={{tabBarButtonTestID: 'tab_bar.home.tab', freezeOnBlur: true}}
                        >
                            {() => <ChannelList {...props}/>}
                        </Tab.Screen>
                        <Tab.Screen
                            name={Screens.HOME_TAB_AI_AGENT}
                            options={{tabBarButtonTestID: 'tab_bar.ai_agent.tab', freezeOnBlur: true, lazy: true}}
                        >
                            {() => <AIAgent/>}
                        </Tab.Screen>
                        <Tab.Screen
                            name={Screens.HOME_TAB_MY_HOMEPAGE}
                            options={{tabBarButtonTestID: 'tab_bar.my_homepage.tab', freezeOnBlur: true, lazy: true}}
                        >
                            {() => <MyHomepage/>}
                        </Tab.Screen>
                        <Tab.Screen
                            name={Screens.HOME_TAB_CONTACTS}
                            options={{tabBarButtonTestID: 'tab_bar.contacts.tab', freezeOnBlur: true, lazy: true}}
                        >
                            {() => (
                                <Contacts rnnHomeComponentId={props.componentId}/>
                            )}
                        </Tab.Screen>
                    </Tab.Navigator>
                </NavigationContainer>
                <LeftDrawer/>
                <ServerVersion/>
                <TeamMembershipNotice/>
            </LeftDrawerProvider>
        </View>
    );
}

export default HomeScreen;
