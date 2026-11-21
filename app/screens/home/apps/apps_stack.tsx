// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {createStackNavigator} from '@react-navigation/stack';
import React, {createContext, useContext} from 'react';

import {Screens} from '@constants';
import {useTheme} from '@context/theme';
import {getChatListBackdropColor} from '@utils/theme';

import AppsScreen from './apps';
import AppWebView from './app_webview';
import CloudDriveScreen from './cloud_drive/cloud_drive_screen';
import ConversationsScreen from './conversations/conversations_screen';
import ApprovalsScreen from './erp/approvals_screen';
import FinanceScreen from './erp/finance_screen';
import HotProductsScreen from './erp/hot_products_screen';
import InventoryScreen from './erp/inventory_screen';
import SalesScreen from './erp/sales_screen';
import WarehouseInoutScreen from './erp/warehouse_inout_screen';
import KnowledgeBaseScreen from './knowledge_base/knowledge_base_screen';
import KbAddScreen from './knowledge_base/kb_add_screen';
import KbDetailScreen from './knowledge_base/kb_detail_screen';
import KbEditScreen from './knowledge_base/kb_edit_screen';
import MesScreen from './mes/mes_screen';
import NoteAddScreen from './notebook/note_add_screen';
import NoteDetailScreen from './notebook/note_detail_screen';
import NotebookScreen from './notebook/notebook_screen';
import SmartNotebookScreen from './smart_notebook/smart_notebook_screen';
import SmartNoteDetailScreen from './smart_notebook/smart_note_detail_screen';
import QuickNoteDetailScreen from './smart_notebook/quick_note_detail_screen';
import PriceListScreen from './price_list/price_list_screen';
import PromotionScreen from './promotion/promotion_screen';
import RoleManagementScreen from './role_management/role_management_screen';
import MySuppliersScreen from './my_suppliers_screen';
import SupplierDetailScreen from './supplier_detail_screen';
import TodosScreen from '../workspace/todos_screen';
import SchedulesScreen from '../workspace/schedules_screen';
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
    const theme = useTheme();
    const headerBg = getChatListBackdropColor(theme);

    return (
        <AppsRnnHomeComponentIdContext.Provider value={rnnHomeComponentId}>
            <Stack.Navigator
                screenOptions={{
                    headerStyle: {backgroundColor: headerBg},
                    headerTintColor: theme.centerChannelColor,
                    headerTitleStyle: {fontWeight: '600', fontSize: 17, color: theme.centerChannelColor},
                    headerBackTitleVisible: false,
                }}
                initialRouteName={Screens.APPS_HOME}
            >
                <Stack.Screen name={Screens.APPS_HOME} options={{title: '应用中心'}}>
                    {() => (
                        <AppsScreen
                            currentUser={currentUser}
                            currentTeam={currentTeam}
                            rnnHomeComponentId={rnnHomeComponentId}
                        />
                    )}
                </Stack.Screen>
                <Stack.Screen name={Screens.APPS_WEBVIEW} component={AppWebView} options={{headerShown: false}}/>
                <Stack.Screen name={Screens.APPS_CLOUD_DRIVE} component={CloudDriveScreen} options={{title: '企业云盘'}}/>
                <Stack.Screen name={Screens.APPS_CONVERSATIONS} component={ConversationsScreen} options={{title: '会话查询'}}/>
                <Stack.Screen name={Screens.APPS_KNOWLEDGE_BASE} component={KnowledgeBaseScreen} options={{title: '知识库'}}/>
                <Stack.Screen name={Screens.KB_DETAIL} component={KbDetailScreen} options={{title: '文档详情'}}/>
                <Stack.Screen name={Screens.KB_ADD} component={KbAddScreen} options={{title: '新建文档'}}/>
                <Stack.Screen name={Screens.KB_EDIT} component={KbEditScreen} options={{title: '编辑文档'}}/>
                <Stack.Screen name={Screens.APPS_MES} component={MesScreen} options={{title: '排产'}}/>
                <Stack.Screen name={Screens.APPS_NOTEBOOK} component={NotebookScreen} options={{title: '记事本'}}/>
                <Stack.Screen name={Screens.NOTE_DETAIL} component={NoteDetailScreen} options={{title: '笔记详情'}}/>
                <Stack.Screen name={Screens.NOTE_ADD} component={NoteAddScreen} options={{title: '新建笔记'}}/>
                <Stack.Screen name={Screens.APPS_SMART_NOTEBOOK} component={SmartNotebookScreen} options={{headerShown: false}}/>
                <Stack.Screen name={Screens.SMART_NOTE_DETAIL} component={SmartNoteDetailScreen} options={{title: '笔记详情'}}/>
                <Stack.Screen name={Screens.QUICK_NOTE_DETAIL} component={QuickNoteDetailScreen} options={{title: '快速笔记'}}/>
                <Stack.Screen name={Screens.APPS_PRICE_LIST} component={PriceListScreen} options={{title: '价格表'}}/>
                <Stack.Screen name={Screens.APPS_PROMOTION} component={PromotionScreen} options={{title: '推广'}}/>
                <Stack.Screen name={Screens.APPS_ROLE_MANAGEMENT} component={RoleManagementScreen} options={{title: '角色管理'}}/>
                <Stack.Screen name={Screens.APPS_APPROVALS} component={ApprovalsScreen} options={{title: '审批清单'}}/>
                <Stack.Screen name={Screens.APPS_FINANCE} component={FinanceScreen} options={{title: '流水账'}}/>
                <Stack.Screen name={Screens.APPS_HOT_PRODUCTS} component={HotProductsScreen} options={{title: '热销榜'}}/>
                <Stack.Screen name={Screens.APPS_INVENTORY} component={InventoryScreen} options={{title: '库存分析'}}/>
                <Stack.Screen name={Screens.APPS_SALES} component={SalesScreen} options={{title: '销售统计'}}/>
                <Stack.Screen name={Screens.APPS_WAREHOUSE_INOUT} component={WarehouseInoutScreen} options={{title: '出入库'}}/>
                <Stack.Screen name={Screens.MY_SUPPLIERS} component={MySuppliersScreen} options={{title: '我的供应商'}}/>
                <Stack.Screen name={'SupplierDetail' as any} component={SupplierDetailScreen} options={{title: '供应商详情' as any}}/>
                <Stack.Screen name={Screens.WORKSPACE_TODOS} component={TodosScreen} options={{title: '待办事项'}}/>
                <Stack.Screen name={Screens.WORKSPACE_SCHEDULES} component={SchedulesScreen} options={{title: '日程安排'}}/>
            </Stack.Navigator>
        </AppsRnnHomeComponentIdContext.Provider>
    );
}
