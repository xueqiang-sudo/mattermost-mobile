// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {createStackNavigator} from '@react-navigation/stack';
import React from 'react';

import {Screens} from '@constants';
import {useTheme} from '@context/theme';
import {getChatListBackdropColor} from '@utils/theme';

import CompanyNewsScreen from './company_news_screen';
import ErpModulesScreen from './erp_modules_screen';
import SchedulesScreen from './schedules_screen';
import TodosScreen from './todos_screen';
import WorkspaceScreen from './workspace_screen';
import {
    CustomersScreen, SuppliersScreen, SalesOrdersScreen,
    PurchaseOrdersScreen, WorkOrdersScreen, ProjectsScreen as ErpProjectsScreen,
    StockScreen,
} from './erp_screens';
import {
    CustomerDetailScreen, CustomerFormScreen,
    SupplierDetailScreen, SupplierFormScreen,
    SalesOrderDetailScreen, SalesOrderFormScreen,
    PurchaseOrderDetailScreen,
    WorkOrderDetailScreen, WorkOrderFormScreen,
    ProjectDetailScreen,
    ItemStockScreen,
} from './erp_screens/detail_and_form_screens';
import AppWebView from '../apps/app_webview';
import ApprovalsScreen from '../apps/erp/approvals_screen';
import FinanceScreen from '../apps/erp/finance_screen';
import HotProductsScreen from '../apps/erp/hot_products_screen';
import InventoryScreen from '../apps/erp/inventory_screen';
import WarehouseInoutScreen from '../apps/erp/warehouse_inout_screen';
import SalesScreen from '../apps/erp/sales_screen';
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
            {/* ── Workspace screens ── */}
            <Stack.Screen name={Screens.HOME_TAB_WORKSPACE} component={WorkspaceScreen} options={{title: '工作台'}}/>
            <Stack.Screen name={Screens.WORKSPACE_ERP_MODULES} component={ErpModulesScreen} options={{title: 'ERP'}}/>
            <Stack.Screen name={Screens.WORKSPACE_TODOS} component={TodosScreen} options={{title: 'Todos'}}/>
            <Stack.Screen name={Screens.WORKSPACE_NEWS} component={CompanyNewsScreen} options={{title: 'News'}}/>
            <Stack.Screen name={Screens.WORKSPACE_SCHEDULES} component={SchedulesScreen} options={{title: 'Schedules'}}/>

            {/* ── ERP module screens ── */}
            <Stack.Screen name={Screens.ERP_CUSTOMERS} component={CustomersScreen} options={{title: 'Customers'}}/>
            <Stack.Screen name={Screens.ERP_SUPPLIERS} component={SuppliersScreen} options={{title: 'Suppliers'}}/>
            <Stack.Screen name={Screens.ERP_SALES_ORDERS} component={SalesOrdersScreen} options={{title: 'Sales Orders'}}/>
            <Stack.Screen name={Screens.ERP_PURCHASE_ORDERS} component={PurchaseOrdersScreen} options={{title: 'Purchase Orders'}}/>
            <Stack.Screen name={Screens.ERP_WORK_ORDERS} component={WorkOrdersScreen} options={{title: 'Manufacturing'}}/>
            <Stack.Screen name={Screens.ERP_PROJECTS} component={ErpProjectsScreen} options={{title: 'Projects'}}/>
            <Stack.Screen name={Screens.ERP_STOCK} component={StockScreen} options={{title: 'Stock'}}/>

            {/* ── ERP detail/form screens ── */}
            <Stack.Screen name={Screens.ERP_CUSTOMER_DETAIL} component={CustomerDetailScreen} options={{title: 'Customer Detail'}}/>
            <Stack.Screen name={Screens.ERP_CUSTOMER_FORM} component={CustomerFormScreen} options={{title: 'Edit Customer'}}/>
            <Stack.Screen name={Screens.ERP_SUPPLIER_DETAIL} component={SupplierDetailScreen} options={{title: 'Supplier Detail'}}/>
            <Stack.Screen name={Screens.ERP_SUPPLIER_FORM} component={SupplierFormScreen} options={{title: 'Edit Supplier'}}/>
            <Stack.Screen name={Screens.ERP_SALES_ORDER_DETAIL} component={SalesOrderDetailScreen} options={{title: 'Order Detail'}}/>
            <Stack.Screen name={Screens.ERP_SALES_ORDER_DETAIL + 'Form'} component={SalesOrderFormScreen} options={{title: 'Edit Order'}}/>
            <Stack.Screen name={Screens.ERP_PURCHASE_ORDER_DETAIL} component={PurchaseOrderDetailScreen} options={{title: 'PO Detail'}}/>
            <Stack.Screen name={Screens.ERP_WORK_ORDER_DETAIL} component={WorkOrderDetailScreen} options={{title: 'Work Order Detail'}}/>
            <Stack.Screen name={Screens.ERP_WORK_ORDER_DETAIL + 'Form'} component={WorkOrderFormScreen} options={{title: 'Edit Work Order'}}/>
            <Stack.Screen name={Screens.ERP_PROJECT_DETAIL} component={ProjectDetailScreen} options={{title: 'Project Detail'}}/>
            <Stack.Screen name={Screens.ERP_ITEM_STOCK} component={ItemStockScreen} options={{title: 'Stock Detail'}}/>

            {/* ── Shared app screens (used by both workspace cards & ERP modules) ── */}
            <Stack.Screen name={Screens.APPS_WEBVIEW} component={AppWebView} options={{headerShown: false}}/>
            <Stack.Screen name={Screens.APPS_HOT_PRODUCTS} component={HotProductsScreen} options={{title: 'Hot Products'}}/>
            <Stack.Screen name={Screens.APPS_INVENTORY} component={InventoryScreen} options={{title: 'Inventory'}}/>
            <Stack.Screen name={Screens.APPS_FINANCE} component={FinanceScreen} options={{title: 'Finance'}}/>
            <Stack.Screen name={Screens.APPS_SALES} component={SalesScreen} options={{title: 'Sales'}}/>
            <Stack.Screen name={Screens.APPS_APPROVALS} component={ApprovalsScreen} options={{title: 'Approvals'}}/>
            <Stack.Screen name={Screens.APPS_WAREHOUSE_INOUT} component={WarehouseInoutScreen} options={{title: 'Stock In/Out'}}/>
            <Stack.Screen name={Screens.APPS_MES} component={MesScreen} options={{headerShown: false}}/>
        </Stack.Navigator>
    );
};

export default WorkspaceStack;
