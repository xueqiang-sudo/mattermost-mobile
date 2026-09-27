// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {createStackNavigator} from '@react-navigation/stack';
import React, {createContext, useContext} from 'react';

import {Screens} from '@constants';

import AppsScreen from './apps';
import AppWebView from './app_webview';
import {type AppsStackParamList} from './apps_stack_param_list';

import type TeamModel from '@typings/database/models/servers/team';
import type UserModel from '@typings/database/models/servers/user';

const Stack = createStackNavigator<AppsStackParamList>();

export const AppsRnnHomeComponentIdContext = createContext<string | undefined>(undefined);

type AppsStackProps = {
    currentUser?: UserModel;
    currentTeam?: TeamModel;
    rnnHomeComponentId?: string;
};

export function AppsStack({currentUser, currentTeam, rnnHomeComponentId}: AppsStackProps) {
    return (
        <AppsRnnHomeComponentIdContext.Provider value={rnnHomeComponentId}>
            <Stack.Navigator
                screenOptions={{headerShown: false}}
                initialRouteName={Screens.APPS_HOME}
            >
                <Stack.Screen name={Screens.APPS_HOME}>
                    {() => (
                        <AppsScreen
                            currentUser={currentUser}
                            currentTeam={currentTeam}
                            rnnHomeComponentId={rnnHomeComponentId}
                        />
                    )}
                </Stack.Screen>
                <Stack.Screen name={Screens.APPS_WEBVIEW} component={AppWebView}/>
            </Stack.Navigator>
        </AppsRnnHomeComponentIdContext.Provider>
    );
}
