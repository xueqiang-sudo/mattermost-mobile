// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {createStackNavigator} from '@react-navigation/stack';
import React from 'react';

import {Screens} from '@constants';

import CompanyNewsScreen from './company_news_screen';
import ErpDeskScreen from './erp_desk_screen';
import OrdersScreen from './orders_screen';
import ProjectsScreen from './projects_screen';
import TodosScreen from './todos_screen';
import WorkspaceErpScreen from './workspace_erp_screen';
import WorkspaceScreen from './workspace_screen';
import AppWebView from '../apps/app_webview';
import ApprovalsScreen from '../apps/erp/approvals_screen';
import HotProductsScreen from '../apps/erp/hot_products_screen';
import InventoryScreen from '../apps/erp/inventory_screen';
import WarehouseInoutScreen from '../apps/erp/warehouse_inout_screen';
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
                name={Screens.WORKSPACE_ERP}
                component={WorkspaceErpScreen}
            />
            <Stack.Screen
                name={Screens.WORKSPACE_ERP_DESK}
                component={ErpDeskScreen}
            />
            <Stack.Screen
                name={Screens.WORKSPACE_ORDERS}
                component={OrdersScreen}
            />
            <Stack.Screen
                name={Screens.WORKSPACE_PROJECTS}
                component={ProjectsScreen}
            />
            <Stack.Screen
                name={Screens.WORKSPACE_TODOS}
                component={TodosScreen}
            />
            <Stack.Screen
                name={Screens.WORKSPACE_NEWS}
                component={CompanyNewsScreen}
            />
            <Stack.Screen
                name={Screens.APPS_WEBVIEW}
                component={AppWebView}
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
            <Stack.Screen
                name={Screens.APPS_WAREHOUSE_INOUT}
                component={WarehouseInoutScreen}
            />
        </Stack.Navigator>
    );
};

export default WorkspaceStack;
