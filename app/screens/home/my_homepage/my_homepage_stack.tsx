// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {createStackNavigator} from '@react-navigation/stack';
import React from 'react';

import {Screens} from '@constants';

import MyHomepageMain from './main';

import type {MyHomepageStackParamList} from './stack_param_list';
import type UserModel from '@typings/database/models/servers/user';

const Stack = createStackNavigator<MyHomepageStackParamList>();

type MyHomepageStackProps = {
    currentUser?: UserModel;
};

export function MyHomepageStack({currentUser}: MyHomepageStackProps) {
    return (
        <Stack.Navigator
            screenOptions={{headerShown: false}}
            initialRouteName={Screens.MY_HOMEPAGE}
        >
            <Stack.Screen name={Screens.MY_HOMEPAGE}>
                {() => (
                    <MyHomepageMain currentUser={currentUser}/>
                )}
            </Stack.Screen>
        </Stack.Navigator>
    );
}
