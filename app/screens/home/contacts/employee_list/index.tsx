// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {ScrollView, Text, View} from 'react-native';
import {type Edge, SafeAreaView} from 'react-native-safe-area-context';

import {fetchEmployeesOfCompaniesByType} from '@actions/remote/contact';
import ContactAvatar from '@components/contact_avatar';
import Loading from '@components/loading';
import {Screens} from '@constants';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import {dismissModal} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {ContactCompanyType} from '@actions/remote/contact';
import type {ContactEmployee} from '@client/rest/contact';
import type {AvailableScreens} from '@typings/screens/navigation';

const CLOSE_BUTTON_ID = 'close-contacts-employee-list';

const SAFE_AREA_EDGES: Edge[] = ['top', 'bottom', 'left', 'right'];

type Props = {
    componentId: AvailableScreens;
    closeButtonId?: string;
    type: ContactCompanyType;
    title: string;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    flex: {flex: 1},
    listItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.06),
    },
    listItemAvatar: {marginRight: 14},
    listItemName: {
        ...typography('Body', 200),
        color: theme.centerChannelColor,
        flex: 1,
    },
    emptyMessage: {
        ...typography('Body', 100),
        color: changeOpacity(theme.centerChannelColor, 0.64),
        paddingVertical: 24,
        paddingHorizontal: 20,
        textAlign: 'center',
    },
    serviceError: {
        ...typography('Body', 100),
        color: changeOpacity(theme.centerChannelColor, 0.64),
        paddingVertical: 24,
        paddingHorizontal: 20,
        textAlign: 'center',
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 24,
    },
}));

const ContactsEmployeeList = ({componentId, closeButtonId, type, title}: Props) => {
    const theme = useTheme();
    const intl = useIntl();
    const mounted = useRef(false);
    const styles = getStyleSheet(theme);

    const [employees, setEmployees] = useState<ContactEmployee[]>([]);
    const [loading, setLoading] = useState(true);
    const [serviceError, setServiceError] = useState(false);

    const handleClose = useCallback(() => {
        dismissModal({componentId});
    }, [componentId]);

    useNavButtonPressed(closeButtonId ?? CLOSE_BUTTON_ID, componentId, handleClose, [handleClose]);
    useAndroidHardwareBackHandler(componentId, handleClose);

    useEffect(() => {
        mounted.current = true;
        setLoading(true);
        setServiceError(false);

        const fetchData = async () => {
            const res = await fetchEmployeesOfCompaniesByType(type);
            if (!mounted.current) {
                return;
            }
            if (res.error) {
                setServiceError(true);
            } else {
                setEmployees(res.data ?? []);
            }
            setLoading(false);
        };

        fetchData();
        return () => {
            mounted.current = false;
        };
    }, [type]);

    const renderContent = () => {
        if (serviceError) {
            return (
                <Text style={styles.serviceError}>
                    {intl.formatMessage({id: 'contacts.service_unavailable', defaultMessage: 'Contact service is not available'})}
                </Text>
            );
        }
        if (loading) {
            return (
                <View style={styles.loadingContainer}>
                    <Loading
                        color={theme.centerChannelColor}
                        size='small'
                    />
                    <Text style={[styles.emptyMessage, {marginTop: 8}]}>
                        {intl.formatMessage({id: 'contacts.loading', defaultMessage: 'Loading...'})}
                    </Text>
                </View>
            );
        }
        if (employees.length === 0) {
            const emptyId = type === 'customer' ? 'contacts.no_customers' : 'contacts.no_suppliers';
            const emptyDefault = type === 'customer' ? 'No customers' : 'No suppliers';
            return (
                <Text style={styles.emptyMessage}>
                    {intl.formatMessage({id: emptyId, defaultMessage: emptyDefault})}
                </Text>
            );
        }
        return (
            <>
                {employees.map((item) => (
                    <View
                        key={item.id}
                        style={styles.listItem}
                    >
                        <View style={styles.listItemAvatar}>
                            <ContactAvatar
                                employee={item}
                                size={40}
                            />
                        </View>
                        <Text
                            style={styles.listItemName}
                            numberOfLines={1}
                        >
                            {item.name}
                        </Text>
                    </View>
                ))}
                <Text style={[styles.emptyMessage, {paddingTop: 8}]}>
                    {intl.formatMessage(
                        {id: 'contacts.member_count', defaultMessage: 'Total {count} members'},
                        {count: employees.length},
                    )}
                </Text>
            </>
        );
    };

    return (
        <SafeAreaView
            edges={SAFE_AREA_EDGES}
            style={[styles.flex, {backgroundColor: theme.centerChannelBg}]}
            testID='contacts.employee_list.screen'
        >
            <ScrollView
                style={styles.flex}
                contentContainerStyle={{paddingBottom: 24}}
                showsVerticalScrollIndicator={false}
            >
                {renderContent()}
            </ScrollView>
        </SafeAreaView>
    );
};

export default ContactsEmployeeList;
