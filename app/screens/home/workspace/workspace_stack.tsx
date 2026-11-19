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
import FinanceScreen from '../apps/erp/finance_screen';
import HotProductsScreen from '../apps/erp/hot_products_screen';
import InventoryScreen from '../apps/erp/inventory_screen';
import WarehouseInoutScreen from '../apps/erp/warehouse_inout_screen';
import MesScreen from '../apps/mes/mes_screen';

const Stack = createStackNavigator();

const WorkspaceStack = () => {
    return (
        <Stack.Navigator
            initialRouteName={Screens.HOME_TAB_WORKSPACE}
            screenOptions={{
                headerStyle: {backgroundColor: '#1B2838'},
                headerTintColor: '#FFFFFF',
                headerTitleStyle: {fontWeight: '600', fontSize: 17},
                headerBackTitleVisible: false,
            }}
        >
            <Stack.Screen
                name={Screens.HOME_TAB_WORKSPACE}
                component={WorkspaceScreen}
                options={{title: '工作台'}}
            />
            <Stack.Screen
                name={Screens.WORKSPACE_ERP}
                component={WorkspaceErpScreen}
                options={{title: 'ERP'}}
            />
            <Stack.Screen
                name={Screens.WORKSPACE_ERP_DESK}
                component={ErpDeskScreen}
                options={{title: 'ERP'}}
            />
            <Stack.Screen
                name={Screens.WORKSPACE_ORDERS}
                component={OrdersScreen}
                options={{title: '我的订单'}}
            />
            <Stack.Screen
                name={Screens.WORKSPACE_PROJECTS}
                component={ProjectsScreen}
                options={{title: '我的项目'}}
            />
            <Stack.Screen
                name={Screens.WORKSPACE_TODOS}
                component={TodosScreen}
                options={{title: '待办事项'}}
            />
            <Stack.Screen
                name={Screens.WORKSPACE_NEWS}
                component={CompanyNewsScreen}
                options={{title: '公司动态'}}
            />
            <Stack.Screen
                name={Screens.APPS_WEBVIEW}
                component={AppWebView}
                options={{headerShown: false}}
            />
            <Stack.Screen
                name={Screens.APPS_HOT_PRODUCTS}
                component={HotProductsScreen}
                options={{title: '热销榜'}}
            />
            <Stack.Screen
                name={Screens.APPS_INVENTORY}
                component={InventoryScreen}
                options={{title: '库存分析'}}
            />
            <Stack.Screen
                name={Screens.APPS_FINANCE}
                component={FinanceScreen}
                options={{title: '流水账'}}
            />
            <Stack.Screen
                name={Screens.APPS_MES}
                component={MesScreen}
                options={{headerShown: false}}
            />
            <Stack.Screen
                name={Screens.APPS_APPROVALS}
                component={ApprovalsScreen}
                options={{title: '审批清单'}}
            />
            <Stack.Screen
                name={Screens.APPS_WAREHOUSE_INOUT}
                component={WarehouseInoutScreen}
                options={{title: '出入库'}}
            />
        </Stack.Navigator>
    );
};

export default WorkspaceStack;
