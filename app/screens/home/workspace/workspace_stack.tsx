// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {createStackNavigator} from '@react-navigation/stack';
import React from 'react';

import {Screens} from '@constants';
import {useTheme} from '@context/theme';
import {getChatListBackdropColor} from '@utils/theme';

import CompanyNewsScreen from './company_news_screen';
import ErpDeskScreen from './erp_desk_screen';
import ErpModulesScreen from './erp_modules_screen';
import SchedulesScreen from './schedules_screen';
import OrdersScreen from './orders_screen';
import ProjectsScreen from './projects_screen';
import TodosScreen from './todos_screen';
import WorkspaceScreen from './workspace_screen';
import {
    CustomersScreen, SuppliersScreen, SalesOrdersScreen,
    PurchaseOrdersScreen, WorkOrdersScreen, ProjectsScreen as ErpProjectsScreen,
    StockScreen,
} from './erp_screens';
import AppWebView from '../apps/app_webview';
import ApprovalsScreen from '../apps/erp/approvals_screen';
import FinanceScreen from '../apps/erp/finance_screen';
import HotProductsScreen from '../apps/erp/hot_products_screen';
import InventoryScreen from '../apps/erp/inventory_screen';
import WarehouseInoutScreen from '../apps/erp/warehouse_inout_screen';
import MesScreen from '../apps/mes/mes_screen';

const Stack = createStackNavigator();

const WorkspaceStack = () => {
    const theme = useTheme();
    const headerBg = getChatListBackdropColor(theme);

    return (
        <Stack.Navigator
            initialRouteName={Screens.HOME_TAB_WORKSPACE}
            screenOptions={{
                headerStyle: {backgroundColor: headerBg},
                headerTintColor: theme.centerChannelColor,
                headerTitleStyle: {fontWeight: '600', fontSize: 17, color: theme.centerChannelColor},
                headerBackTitleVisible: false,
            }}
        >
            <Stack.Screen
                name={Screens.HOME_TAB_WORKSPACE}
                component={WorkspaceScreen}
                options={{title: '工作台'}}
            />
            <Stack.Screen
                name={Screens.WORKSPACE_ERP_DESK}
                component={ErpDeskScreen}
                options={{headerShown: false}}
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
                name={Screens.WORKSPACE_SCHEDULES}
                component={SchedulesScreen}
                options={{title: '日程安排'}}
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
            <Stack.Screen
                name={Screens.WORKSPACE_ERP_MODULES}
                component={ErpModulesScreen}
                options={{title: 'ERP 模块'}}
            />
            <Stack.Screen
                name={Screens.ERP_CUSTOMERS}
                component={CustomersScreen}
                options={{title: '客户管理'}}
            />
            <Stack.Screen
                name={Screens.ERP_SUPPLIERS}
                component={SuppliersScreen}
                options={{title: '供应商管理'}}
            />
            <Stack.Screen
                name={Screens.ERP_SALES_ORDERS}
                component={SalesOrdersScreen}
                options={{title: '销售订单'}}
            />
            <Stack.Screen
                name={Screens.ERP_PURCHASE_ORDERS}
                component={PurchaseOrdersScreen}
                options={{title: '采购订单'}}
            />
            <Stack.Screen
                name={Screens.ERP_WORK_ORDERS}
                component={WorkOrdersScreen}
                options={{title: '生产管理'}}
            />
            <Stack.Screen
                name={Screens.ERP_PROJECTS}
                component={ErpProjectsScreen}
                options={{title: '项目管理'}}
            />
            <Stack.Screen
                name={Screens.ERP_STOCK}
                component={StockScreen}
                options={{title: '库存查询'}}
            />
        </Stack.Navigator>
    );
};

export default WorkspaceStack;
