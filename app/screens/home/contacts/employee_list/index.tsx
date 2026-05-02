// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useDatabase} from '@nozbe/watermelondb/react';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {ScrollView, Text, View} from 'react-native';
import {type Edge, SafeAreaView} from 'react-native-safe-area-context';

import {fetchEmployeeContacts} from '@actions/remote/employee_contact_new';
import ContactAvatar from '@components/contact_avatar';
import Loading from '@components/loading';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import {getCurrentUserId} from '@queries/servers/system';
import {dismissModal} from '@screens/navigation';
import {getContactListDisplayName} from '@utils/contact_section';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {MMEmployeeContactType} from '@client/rest/team_department';
import type {AvailableScreens} from '@typings/screens/navigation';

const CLOSE_BUTTON_ID = 'close-contacts-employee-list';

const SAFE_AREA_EDGES: Edge[] = ['top', 'bottom', 'left', 'right'];

type Props = {
    componentId: AvailableScreens;
    closeButtonId?: string;
    type: MMEmployeeContactType;
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
    const database = useDatabase();
    const serverUrl = useServerUrl();
    const mounted = useRef(false);
    const styles = getStyleSheet(theme);

    const [employees, setEmployees] = useState<SimpleUserProfile[]>([]);
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
            if (!serverUrl) {
                if (!mounted.current) {
                    return;
                }
                setServiceError(true);
                setLoading(false);
                return;
            }
            const userId = await getCurrentUserId(database);
            if (!userId) {
                if (!mounted.current) {
                    return;
                }
                setServiceError(true);
                setLoading(false);
                return;
            }
            const res = await fetchEmployeeContacts(serverUrl, userId, type, {granularity: 2});
            if (!mounted.current) {
                return;
            }
            if (res.error) {
                setServiceError(true);
            } else {
                setEmployees((res.data ?? []).map((row) => row.contact as SimpleUserProfile));
            }
            setLoading(false);
        };

        fetchData();
        return () => {
            mounted.current = false;
        };
    }, [database, serverUrl, type]);

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
                            {getContactListDisplayName(item)}
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
