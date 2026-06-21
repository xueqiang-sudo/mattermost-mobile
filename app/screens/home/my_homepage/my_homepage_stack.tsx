// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useNavigation, useRoute, type RouteProp} from '@react-navigation/native';
import {createStackNavigator, type StackNavigationProp} from '@react-navigation/stack';
import React from 'react';

import {MMEmployeeContactTypes} from '@client/rest/team_department';
import {Screens} from '@constants';

import SupplierCustomerFormScreen from '../supplier_customer/supplier_customer_form';
import SupplierCustomerListScreen from '../supplier_customer/supplier_customer_list';

import MyHomepageMain from './main';

import type {MyHomepageStackParamList} from './stack_param_list';
import type UserModel from '@typings/database/models/servers/user';

const Stack = createStackNavigator<MyHomepageStackParamList>();

type MyHomepageStackProps = {
    currentUser?: UserModel;
};

function SupplierCustomerFormWrapper() {
    const route = useRoute<RouteProp<MyHomepageStackParamList, typeof Screens.SUPPLIER_CUSTOMER_FORM>>();
    const navigation = useNavigation<StackNavigationProp<MyHomepageStackParamList, typeof Screens.SUPPLIER_CUSTOMER_FORM>>();
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
    );
}
