// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {createStackNavigator} from '@react-navigation/stack';
import React from 'react';

import {Screens} from '@constants';

import WorkspaceScreen from './workspace_screen';
import ApprovalsScreen from '../apps/erp/approvals_screen';
import HotProductsScreen from '../apps/erp/hot_products_screen';
import InventoryScreen from '../apps/erp/inventory_screen';
import MesScreen from '../apps/mes/mes_screen';

const Stack = createStackNavigator();

const WorkspaceStack = () => {
    return (
        <Stack.Navigator
            initialRouteName={Screens.HOME_TAB_WORKSPACE}
            screenOptions={{headerShown: false}}
        >
            <Stack.Screen
                name={Screens.HOME_TAB_WORKSPACE}
                component={WorkspaceScreen}
            />
            <Stack.Screen
                name={Screens.APPS_HOT_PRODUCTS}
                component={HotProductsScreen}
            />
            <Stack.Screen
                name={Screens.APPS_INVENTORY}
                component={InventoryScreen}
            />
            <Stack.Screen
                name={Screens.APPS_MES}
                component={MesScreen}
            />
            <Stack.Screen
                name={Screens.APPS_APPROVALS}
                component={ApprovalsScreen}
            />
        </Stack.Navigator>
    );
};

export default WorkspaceStack;
