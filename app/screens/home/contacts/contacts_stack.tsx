// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useNavigation, useRoute, type RouteProp} from '@react-navigation/native';
import {createStackNavigator, type StackNavigationProp} from '@react-navigation/stack';
import React, {createContext, useContext} from 'react';
import {useIntl} from 'react-intl';

import {MMEmployeeContactTypes} from '@client/rest/team_department';
import {Screens} from '@constants';
import SupplierCustomerFormScreen from '@screens/home/supplier_customer/supplier_customer_form';
import SupplierCustomerListScreen from '@screens/home/supplier_customer/supplier_customer_list';

import ContactsScreen from './contacts';
import ContactsSearchScreen from './contacts_search';
import {type ContactsStackParamList} from './contacts_stack_param_list';
import ContactsDepartmentDetail from './department_detail';

import type TeamModel from '@typings/database/models/servers/team';
import type UserModel from '@typings/database/models/servers/user';

const Stack = createStackNavigator<ContactsStackParamList>();

/** 通讯录 Tab 所在 RNN Home 的 componentId；关管理弹窗等会触发 Home 的 componentWillAppear */
export const ContactsRnnHomeComponentIdContext = createContext<string | undefined>(undefined);

type ContactsStackProps = {
    currentUser?: UserModel;
    currentTeam?: TeamModel;
    isEnterpriseManager: boolean;
    rnnHomeComponentId?: string;
};

function DepartmentDetailWrapper({currentUserId}: {currentUserId?: string}) {
    const intl = useIntl();
    const rnnHomeComponentId = useContext(ContactsRnnHomeComponentIdContext);
    const route = useRoute<RouteProp<ContactsStackParamList, typeof Screens.CONTACTS_DEPARTMENT_DETAIL>>();
    const navigation = useNavigation<StackNavigationProp<ContactsStackParamList, typeof Screens.CONTACTS_DEPARTMENT_DETAIL>>();
    const params = route.params;
    if (!params) {
        return null;
    }
    const goBack = navigation.goBack.bind(navigation);
    return (
        <ContactsDepartmentDetail
            componentId={Screens.CONTACTS_DEPARTMENT_DETAIL}
            rnnHomeComponentId={rnnHomeComponentId}
            departmentId={params.departmentId}
            departmentName={params.departmentName}
            breadcrumb={params.breadcrumb}
            companyId={params.companyId}
            companyName={params.companyName}
            isStackScreen={true}
            managerIds={params.managerIds}
            ownerId={params.ownerId}
            currentUserId={params.currentUserId ?? currentUserId}
            onBack={goBack}
            onNavigateToDepartment={(nextParams) => {
                navigation.push(Screens.CONTACTS_DEPARTMENT_DETAIL, {
                    ...nextParams,
                    managerIds: nextParams.managerIds ?? params.managerIds,
                    ownerId: nextParams.ownerId ?? params.ownerId,
                    currentUserId: nextParams.currentUserId ?? params.currentUserId ?? currentUserId,
                });
            }}
            onSearchPress={() => {
                const enterpriseLabel = intl.formatMessage({
                    id: 'contacts.enterprise',
                    defaultMessage: 'Enterprise Contacts',
                });
                const departmentBreadcrumb =
                    params.breadcrumb && params.breadcrumb.length > 0 ?params.breadcrumb :[enterpriseLabel, params.departmentName];
                navigation.navigate(Screens.CONTACTS_SEARCH, {
                    companyId: params.companyId,
                    companyName: params.companyName,
                    departmentId: params.departmentId,
                    departmentName: params.departmentName,
                    departmentBreadcrumb,
                    currentUserId,
                });
            }}
            onBreadcrumbPress={(toDismiss) => {
                if (toDismiss <= 0) {
                    return;
                }
                for (let i = 0; i < toDismiss; i++) {
                    navigation.goBack();
                }
            }}
        />
    );
}

function ContactsSearchWrapper({currentUserId}: {currentUserId?: string}) {
    const route = useRoute<RouteProp<ContactsStackParamList, typeof Screens.CONTACTS_SEARCH>>();
    const navigation = useNavigation<StackNavigationProp<ContactsStackParamList, typeof Screens.CONTACTS_SEARCH>>();
    const params = route.params;
    if (!params) {
        return null;
    }
    return (
        <ContactsSearchScreen
            componentId={Screens.CONTACTS_SEARCH}
            companyId={params.companyId}
            companyName={params.companyName}
            departmentId={params.departmentId}
            departmentName={params.departmentName}
            departmentBreadcrumb={params.departmentBreadcrumb}
            currentUserId={params.currentUserId ?? currentUserId}
            onBack={() => navigation.goBack()}
        />
    );
}

function SupplierCustomerFormWrapper() {
    const route = useRoute<RouteProp<ContactsStackParamList, typeof Screens.SUPPLIER_CUSTOMER_FORM>>();
    const navigation = useNavigation<StackNavigationProp<ContactsStackParamList, typeof Screens.SUPPLIER_CUSTOMER_FORM>>();
    const params = route.params;
    if (!params) {
        return null;
    }
    return (
        <SupplierCustomerFormScreen
            kind={params.kind}
            ownerId={params.ownerId}
            existingContactId={params.existingContactId}
            initialContactName={params.initialContactName}
            initialDescription={params.initialDescription}
            initialRemark={params.initialRemark}
            initialContactEmail={params.initialContactEmail}
            initialContactPhone={params.initialContactPhone}
            initialContactPosition={params.initialContactPosition}
            initialContactUsername={params.initialContactUsername}
            mattermostUserIdForAvatar={params.mattermostUserIdForAvatar}
            readOnly={params.readOnly}
            onBack={() => navigation.goBack()}
        />
    );
}

export function ContactsStack({currentUser, currentTeam, isEnterpriseManager, rnnHomeComponentId}: ContactsStackProps) {
    return (
        <ContactsRnnHomeComponentIdContext.Provider value={rnnHomeComponentId}>
            <Stack.Navigator
                screenOptions={{headerShown: false}}
                initialRouteName={Screens.CONTACTS}
            >
                <Stack.Screen name={Screens.CONTACTS}>
                    {() => (
                        <ContactsScreen
                            currentUser={currentUser}
                            currentTeam={currentTeam}
                            isEnterpriseManager={isEnterpriseManager}
                            rnnHomeComponentId={rnnHomeComponentId}
                        />
                    )}
                </Stack.Screen>
                <Stack.Screen name={Screens.CONTACTS_DEPARTMENT_DETAIL}>
                    {() => <DepartmentDetailWrapper currentUserId={currentUser?.id}/>}
                </Stack.Screen>
                <Stack.Screen name={Screens.CONTACTS_SEARCH}>
                    {() => <ContactsSearchWrapper currentUserId={currentUser?.id}/>}
                </Stack.Screen>
                <Stack.Screen name={Screens.MY_SUPPLIERS}>
                    {() => (
                        <SupplierCustomerListScreen
                            kind={MMEmployeeContactTypes.Supplier}
                            currentUser={currentUser}
                        />
                    )}
                </Stack.Screen>
                <Stack.Screen name={Screens.MY_CUSTOMERS}>
                    {() => (
                        <SupplierCustomerListScreen
                            kind={MMEmployeeContactTypes.Customer}
                            currentUser={currentUser}
                        />
                    )}
                </Stack.Screen>
                <Stack.Screen name={Screens.SUPPLIER_CUSTOMER_FORM}>
                    {() => <SupplierCustomerFormWrapper/>}
                </Stack.Screen>
            </Stack.Navigator>
        </ContactsRnnHomeComponentIdContext.Provider>
    );
}
