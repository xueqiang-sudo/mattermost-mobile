// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {createStackNavigator} from '@react-navigation/stack';
import React from 'react';

import {Screens} from '@constants';

import ChannelList from './channel_list';

const Stack = createStackNavigator();

type Props = {
    componentId?: string;
    [key: string]: any;
};

const ChannelListStack = (props: Props) => {
    return (
        <Stack.Navigator
            screenOptions={{headerShown: false}}
        >
            <Stack.Screen name={Screens.HOME_TAB_CHAT}>
                {() => <ChannelList {...props}/>}
            </Stack.Screen>
        </Stack.Navigator>
    );
};

export default ChannelListStack;
