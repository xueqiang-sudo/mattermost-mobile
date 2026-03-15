// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useNavigation, useRoute, type RouteProp} from '@react-navigation/native';
import {createStackNavigator, type StackNavigationProp} from '@react-navigation/stack';
import React from 'react';

import {Screens} from '@constants';

import ContactsScreen from './contacts';
import ContactsDepartmentDetail from './department_detail';

import type UserModel from '@typings/database/models/servers/user';

type ContactsStackParamList = {
    [Screens.CONTACTS]: undefined;
    [Screens.CONTACTS_DEPARTMENT_DETAIL]: {
        departmentId: number;
        departmentName: string;
        breadcrumb: string[];
        companyId: string;
        companyName?: string;
    };
};

const Stack = createStackNavigator<ContactsStackParamList>();

type ContactsStackProps = {
    currentUser?: UserModel;
    currentTeamId?: string;
    database?: import('@nozbe/watermelondb').Database;
};

function DepartmentDetailWrapper() {
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
            departmentId={params.departmentId}
            departmentName={params.departmentName}
            breadcrumb={params.breadcrumb}
            companyId={params.companyId}
            companyName={params.companyName}
            isStackScreen={true}
            onBack={goBack}
            onNavigateToDepartment={(nextParams) => {
                navigation.push(Screens.CONTACTS_DEPARTMENT_DETAIL, {...nextParams});
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

export function ContactsStack({currentUser, currentTeamId, database}: ContactsStackProps) {
    return (
        <Stack.Navigator
            screenOptions={{headerShown: false}}
            initialRouteName={Screens.CONTACTS}
        >
            <Stack.Screen name={Screens.CONTACTS}>
                {() => (
                    <ContactsScreen
                        currentUser={currentUser}
                        currentTeamId={currentTeamId}
                        database={database}
                    />
                )}
            </Stack.Screen>
            <Stack.Screen
                name={Screens.CONTACTS_DEPARTMENT_DETAIL}
                component={DepartmentDetailWrapper}
            />
        </Stack.Navigator>
    );
}
