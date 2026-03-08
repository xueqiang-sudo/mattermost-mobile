// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useIsFocused, useNavigation} from '@react-navigation/native';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Freeze} from 'react-freeze';
import {useIntl} from 'react-intl';
import {Alert, ScrollView, Text, TouchableOpacity, View} from 'react-native';
import Animated, {useAnimatedStyle, withTiming} from 'react-native-reanimated';
import {type Edge, SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';

import {fetchEmployeesByCompanyType} from '@actions/remote/contact';
import CompassIcon from '@components/compass_icon';
import ContactAvatar from '@components/contact_avatar';
import Loading from '@components/loading';
import {Screens} from '@constants';
import {useTheme} from '@context/theme';
import {usePreventDoubleTap} from '@hooks/utils';
import {TITLE_HEIGHT} from '@screens/bottom_sheet/content';
import {bottomSheet, showModal} from '@screens/navigation';
import {bottomSheetSnapPoint} from '@utils/helpers';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {ContactEmployee} from '@client/rest/contact';
import type UserModel from '@typings/database/models/servers/user';

const edges: Edge[] = ['left', 'right'];
const LIST_ITEM_HEIGHT = 56;

type Props = {
    currentUser?: UserModel;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    flex: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
        paddingVertical: 4,
        backgroundColor: theme.sidebarBg,
    },
    headerUser: {
        position: 'absolute',
        left: 0,
        right: 0,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        ...typography('Heading', 600, 'SemiBold'),
        color: theme.sidebarText,
        textAlign: 'center',
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        marginLeft: 'auto',
        zIndex: 1,
        gap: 12,
    },
    headerIconButton: {
        padding: 4,
    },
    section: {
        marginTop: 12,
        marginHorizontal: 16,
    },
    sectionTitle: {
        ...typography('Body', 75, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.64),
        paddingHorizontal: 16,
        paddingTop: 4,
        paddingBottom: 6,
    },
    businessRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 5,
        paddingHorizontal: 16,
        backgroundColor: theme.centerChannelBg,
        borderRadius: 12,
        marginBottom: 2,
    },
    businessRowLast: {
        marginBottom: 0,
    },
    iconBox: {
        width: 40,
        height: 40,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
    },
    iconBoxCustomer: {
        backgroundColor: changeOpacity('#34C759', 0.15),
    },
    iconBoxSupplier: {
        backgroundColor: changeOpacity('#007AFF', 0.12),
    },
    sectionRowText: {
        ...typography('Body', 200),
        color: theme.centerChannelColor,
        flex: 1,
    },
    addButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    addButtonCustomer: {
        backgroundColor: changeOpacity('#34C759', 0.15),
    },
    addButtonSupplier: {
        backgroundColor: changeOpacity('#007AFF', 0.12),
    },
    sectionDivider: {
        height: 1,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
        marginHorizontal: 16,
        marginTop: 8,
        marginBottom: 8,
    },
    enterpriseSection: {
        marginTop: 0,
        marginHorizontal: 16,
        backgroundColor: theme.centerChannelBg,
        borderRadius: 12,
        overflow: 'hidden',
    },
    enterpriseHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 4,
    },
    enterpriseTitle: {
        ...typography('Body', 75, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.64),
    },
    memberCount: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.64),
    },
    listItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.06),
    },
    listItemAvatar: {
        marginRight: 14,
    },
    listItemName: {
        ...typography('Body', 200),
        color: theme.centerChannelColor,
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        paddingBottom: 32,
    },
    bottomSheetItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 20,
        minHeight: LIST_ITEM_HEIGHT,
    },
    bottomSheetList: {
        paddingBottom: 24,
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
}));

const ContactsScreen = ({currentUser}: Props) => {
    const theme = useTheme();
    const intl = useIntl();
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();
    const isFocused = useIsFocused();
    const mounted = useRef(false);

    const [customerEmployees, setCustomerEmployees] = useState<ContactEmployee[]>([]);
    const [supplierEmployees, setSupplierEmployees] = useState<ContactEmployee[]>([]);
    const [enterpriseEmployees, setEnterpriseEmployees] = useState<ContactEmployee[]>([]);
    const [loading, setLoading] = useState(true);
    const [serviceError, setServiceError] = useState(false);

    const styles = getStyleSheet(theme);

    const openAccount = usePreventDoubleTap(useCallback(() => {
        showModal(
            Screens.ACCOUNT_MODAL,
            intl.formatMessage({id: 'account.modal_title', defaultMessage: 'Account'}),
        );
    }, [intl]));

    const handleSearch = usePreventDoubleTap(useCallback(() => {
        navigation.navigate(Screens.SEARCH as never);
    }, [navigation]));

    const handleManageContacts = usePreventDoubleTap(useCallback(() => {
        Alert.alert(
            intl.formatMessage({id: 'contacts.manage_contacts', defaultMessage: 'Manage Contacts'}),
            intl.formatMessage({id: 'contacts.add_feature_coming', defaultMessage: 'Feature coming soon'}),
        );
    }, [intl]));

    const handleAddCustomer = usePreventDoubleTap(useCallback(() => {
        Alert.alert(
            intl.formatMessage({id: 'contacts.add_feature_coming', defaultMessage: 'Feature coming soon'}),
        );
    }, [intl]));

    const handleAddSupplier = usePreventDoubleTap(useCallback(() => {
        Alert.alert(
            intl.formatMessage({id: 'contacts.add_feature_coming', defaultMessage: 'Feature coming soon'}),
        );
    }, [intl]));

    const renderEmployeeList = useCallback((
        employees: ContactEmployee[],
        emptyMessageId: string,
        emptyMessageDefault: string,
    ) => (
        <View style={styles.bottomSheetList}>
            {employees.length > 0 ? employees.map((item) => (
                <View
                    key={item.id}
                    style={styles.bottomSheetItem}
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
            )) : (
                <Text style={[styles.memberCount, {paddingHorizontal: 20, paddingTop: 12}]}>
                    {intl.formatMessage({id: emptyMessageId, defaultMessage: emptyMessageDefault})}
                </Text>
            )}
            <Text style={[styles.memberCount, {paddingHorizontal: 20, paddingTop: 12}]}>
                {intl.formatMessage(
                    {id: 'contacts.member_count', defaultMessage: 'Total {count} members'},
                    {count: employees.length},
                )}
            </Text>
        </View>
    ), [intl, styles.bottomSheetList, styles.bottomSheetItem, styles.listItemAvatar, styles.listItemName, styles.memberCount]);

    const handleOpenCustomersList = usePreventDoubleTap(useCallback(() => {
        const renderContent = () => renderEmployeeList(
            customerEmployees,
            'contacts.no_customers',
            'No customers',
        );

        const count = Math.max(customerEmployees.length, 1);
        const snapPoints: Array<string | number> = [
            1,
            Math.min(bottomSheetSnapPoint(count, LIST_ITEM_HEIGHT) + TITLE_HEIGHT + 80, 420),
        ];
        if (count > 4) {
            snapPoints.push('70%');
        }

        bottomSheet({
            closeButtonId: 'close-customers-list',
            renderContent,
            snapPoints,
            title: intl.formatMessage({id: 'contacts.my_customers', defaultMessage: 'My Customers'}),
            theme,
            scrollable: true,
        });
    }, [intl, theme, customerEmployees, renderEmployeeList]));

    const handleOpenSuppliersList = usePreventDoubleTap(useCallback(() => {
        const renderContent = () => renderEmployeeList(
            supplierEmployees,
            'contacts.no_suppliers',
            'No suppliers',
        );

        const count = Math.max(supplierEmployees.length, 1);
        const snapPoints: Array<string | number> = [
            1,
            Math.min(bottomSheetSnapPoint(count, LIST_ITEM_HEIGHT) + TITLE_HEIGHT + 80, 420),
        ];
        if (count > 4) {
            snapPoints.push('70%');
        }

        bottomSheet({
            closeButtonId: 'close-suppliers-list',
            renderContent,
            snapPoints,
            title: intl.formatMessage({id: 'contacts.my_suppliers', defaultMessage: 'My Suppliers'}),
            theme,
            scrollable: true,
        });
    }, [intl, theme, supplierEmployees, renderEmployeeList]));

    useEffect(() => {
        mounted.current = true;
        setLoading(true);
        setServiceError(false);

        const fetchAll = async () => {
            const [customersRes, suppliersRes, enterpriseRes] = await Promise.all([
                fetchEmployeesByCompanyType('customer'),
                fetchEmployeesByCompanyType('supplier'),
                fetchEmployeesByCompanyType('team'),
            ]);

            if (!mounted.current) {
                return;
            }

            const hasError = customersRes.error || suppliersRes.error || enterpriseRes.error;
            if (hasError) {
                setServiceError(true);
            } else {
                setCustomerEmployees(customersRes.data ?? []);
                setSupplierEmployees(suppliersRes.data ?? []);
                setEnterpriseEmployees(enterpriseRes.data ?? []);
            }
            setLoading(false);
        };

        fetchAll();

        return () => {
            mounted.current = false;
        };
    }, []);

    const renderEmployeeItem = useCallback((employee: ContactEmployee) => (
        <View
            key={employee.id}
            style={styles.listItem}
        >
            <View style={styles.listItemAvatar}>
                <ContactAvatar
                    employee={employee}
                    size={40}
                />
            </View>
            <Text
                style={styles.listItemName}
                numberOfLines={1}
            >
                {employee.name}
            </Text>
        </View>
    ), [styles.listItem, styles.listItemAvatar, styles.listItemName]);

    const animated = useAnimatedStyle(() => ({
        opacity: withTiming(1, {duration: 150}),
        transform: [{translateX: withTiming(0, {duration: 150})}],
    }), []);

    const renderEnterpriseContent = () => {
        if (serviceError) {
            return (
                <Text style={styles.serviceError}>
                    {intl.formatMessage({id: 'contacts.service_unavailable', defaultMessage: 'Contact service is not available'})}
                </Text>
            );
        }
        if (loading) {
            return (
                <View style={[styles.listItem, {justifyContent: 'center', paddingVertical: 24}]}>
                    <Loading
                        color={theme.centerChannelColor}
                        size='small'
                    />
                    <Text style={[styles.memberCount, {marginTop: 8}]}>
                        {intl.formatMessage({id: 'contacts.loading', defaultMessage: 'Loading...'})}
                    </Text>
                </View>
            );
        }
        if (enterpriseEmployees.length === 0) {
            return (
                <Text style={styles.emptyMessage}>
                    {intl.formatMessage({id: 'contacts.no_enterprise_contacts', defaultMessage: 'No enterprise contacts'})}
                </Text>
            );
        }
        return enterpriseEmployees.map(renderEmployeeItem);
    };

    const content = (
        <ScrollView
            style={styles.flex}
            contentContainerStyle={[styles.scrollContent, {paddingBottom: insets.bottom + 24}]}
            showsVerticalScrollIndicator={false}
        >
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.headerUser}
                    onPress={openAccount}
                    activeOpacity={0.7}
                    testID='contacts.header.account'
                >
                    <Text
                        style={styles.headerTitle}
                        numberOfLines={1}
                    >
                        {currentUser
                            ? ((currentUser.nickname?.trim()) || currentUser.username || intl.formatMessage({id: 'contacts.title', defaultMessage: 'Contacts'}))
                            : intl.formatMessage({id: 'contacts.title', defaultMessage: 'Contacts'})}
                    </Text>
                </TouchableOpacity>
                <View style={styles.headerActions}>
                    <TouchableOpacity
                        style={styles.headerIconButton}
                        onPress={handleSearch}
                        hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                        testID='contacts.header.search'
                    >
                        <CompassIcon
                            name='magnify'
                            size={24}
                            color={theme.sidebarText}
                        />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.headerIconButton}
                        onPress={handleManageContacts}
                        hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                        testID='contacts.header.manage'
                    >
                        <CompassIcon
                            name='format-list-bulleted'
                            size={24}
                            color={theme.sidebarText}
                        />
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                    {intl.formatMessage({id: 'contacts.business_contacts', defaultMessage: 'Business Contacts'})}
                </Text>
                <TouchableOpacity
                    style={styles.businessRow}
                    onPress={handleOpenCustomersList}
                    activeOpacity={0.7}
                    testID='contacts.my_customers.row'
                >
                    <View style={[styles.iconBox, styles.iconBoxCustomer]}>
                        <CompassIcon
                            name='account-multiple-outline'
                            size={22}
                            color='#34C759'
                        />
                    </View>
                    <Text style={styles.sectionRowText}>
                        {intl.formatMessage({id: 'contacts.my_customers', defaultMessage: 'My Customers'})}
                    </Text>
                    <TouchableOpacity
                        style={[styles.addButton, styles.addButtonCustomer]}
                        onPress={handleAddCustomer}
                        hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                        testID='contacts.add_customer'
                    >
                        <CompassIcon
                            name='plus'
                            size={18}
                            color='#34C759'
                        />
                    </TouchableOpacity>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.businessRow, styles.businessRowLast]}
                    onPress={handleOpenSuppliersList}
                    activeOpacity={0.7}
                    testID='contacts.my_suppliers.row'
                >
                    <View style={[styles.iconBox, styles.iconBoxSupplier]}>
                        <CompassIcon
                            name='account-multiple-outline'
                            size={22}
                            color='#007AFF'
                        />
                    </View>
                    <Text style={styles.sectionRowText}>
                        {intl.formatMessage({id: 'contacts.my_suppliers', defaultMessage: 'My Suppliers'})}
                    </Text>
                    <TouchableOpacity
                        style={[styles.addButton, styles.addButtonSupplier]}
                        onPress={handleAddSupplier}
                        hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                        testID='contacts.add_supplier'
                    >
                        <CompassIcon
                            name='plus'
                            size={18}
                            color='#007AFF'
                        />
                    </TouchableOpacity>
                </TouchableOpacity>
            </View>

            <View style={styles.sectionDivider}/>

            <View style={styles.enterpriseSection}>
                <View style={styles.enterpriseHeader}>
                    <Text style={styles.enterpriseTitle}>
                        {intl.formatMessage({id: 'contacts.enterprise', defaultMessage: 'Enterprise Contacts'})}
                    </Text>
                    <Text style={styles.memberCount}>
                        {intl.formatMessage(
                            {id: 'contacts.member_count', defaultMessage: 'Total {count} members'},
                            {count: enterpriseEmployees.length},
                        )}
                    </Text>
                </View>
                {renderEnterpriseContent()}
            </View>
        </ScrollView>
    );

    return (
        <Freeze freeze={!isFocused}>
            <SafeAreaView
                edges={edges}
                style={styles.flex}
                testID='contacts.screen'
            >
                <View style={[{height: insets.top, backgroundColor: theme.sidebarBg}]}/>
                <Animated.View style={[styles.flex, animated]}>
                    {content}
                </Animated.View>
            </SafeAreaView>
        </Freeze>
    );
};

export default ContactsScreen;
