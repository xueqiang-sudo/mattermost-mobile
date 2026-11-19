// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {createStackNavigator} from '@react-navigation/stack';
import React from 'react';

import {Screens} from '@constants';
import {useTheme} from '@context/theme';
import {getChatListBackdropColor} from '@utils/theme';

import Me from './me';

const Stack = createStackNavigator();

const MeStack = () => {
    const theme = useTheme();
    const headerBg = getChatListBackdropColor(theme);

    return (
        <Stack.Navigator
            screenOptions={{
                headerStyle: {backgroundColor: headerBg},
                headerTintColor: theme.centerChannelColor,
                headerTitleStyle: {fontWeight: '600', fontSize: 17, color: theme.centerChannelColor},
                headerBackTitleVisible: false,
            }}
        >
            <Stack.Screen
                name={Screens.HOME_TAB_ME}
                component={Me}
                options={{title: '我的'}}
            />
        </Stack.Navigator>
    );
};

export default MeStack;
