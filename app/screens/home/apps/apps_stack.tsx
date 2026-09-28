// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {createStackNavigator} from '@react-navigation/stack';
import React, {createContext, useContext} from 'react';

import {Screens} from '@constants';

import AppsScreen from './apps';
import AppWebView from './app_webview';
import CloudDriveScreen from './cloud_drive/cloud_drive_screen';
import KnowledgeBaseScreen from './knowledge_base/knowledge_base_screen';
import MesScreen from './mes/mes_screen';
import NotebookScreen from './notebook/notebook_screen';
import PriceListScreen from './price_list/price_list_screen';
import PromotionScreen from './promotion/promotion_screen';
import RoleManagementScreen from './role_management/role_management_screen';
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
                <Stack.Screen name={Screens.APPS_CLOUD_DRIVE} component={CloudDriveScreen}/>
                <Stack.Screen name={Screens.APPS_KNOWLEDGE_BASE} component={KnowledgeBaseScreen}/>
                <Stack.Screen name={Screens.APPS_MES} component={MesScreen}/>
                <Stack.Screen name={Screens.APPS_NOTEBOOK} component={NotebookScreen}/>
                <Stack.Screen name={Screens.APPS_PRICE_LIST} component={PriceListScreen}/>
                <Stack.Screen name={Screens.APPS_PROMOTION} component={PromotionScreen}/>
                <Stack.Screen name={Screens.APPS_ROLE_MANAGEMENT} component={RoleManagementScreen}/>
            </Stack.Navigator>
        </AppsRnnHomeComponentIdContext.Provider>
    );
}
