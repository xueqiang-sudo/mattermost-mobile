// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useIsFocused, useNavigation} from '@react-navigation/native';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Freeze} from 'react-freeze';
import {useIntl} from 'react-intl';
import {Alert, ScrollView, Text, TouchableOpacity, View} from 'react-native';
import Animated, {useAnimatedStyle, withTiming} from 'react-native-reanimated';
import {type Edge, SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';

import {
    ensureTeamCompany,
    fetchDepartmentsOfCompany,
    fetchEmployeeCountOfCompany,
    fetchEmployeesOfDefaultDepartment,
    fetchCompany,
} from '@actions/remote/contact';
import {DEFAULT_DEPARTMENT_NAME, type ContactDepartment, type ContactEmployee} from '@client/rest/contact';
import CompassIcon from '@components/compass_icon';
import ContactAvatar from '@components/contact_avatar';
import Loading from '@components/loading';
import {Screens} from '@constants';
import {useTheme} from '@context/theme';
import {usePreventDoubleTap} from '@hooks/utils';
import {getTeamById} from '@queries/servers/team';
import {showModal, showModalWithBackButton} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';
import type {Database} from '@nozbe/watermelondb';
import type UserModel from '@typings/database/models/servers/user';


const edges: Edge[] = ['left', 'right'];
const CLOSE_CUSTOMERS = 'close-contacts-customers';
const CLOSE_SUPPLIERS = 'close-contacts-suppliers';

type Props = {
    currentUser?: UserModel;
    currentTeamId?: string;
    database?: Database;
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
    memberCountFooter: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
    },
    listItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 16,
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
    departmentRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 16,
    },
    insetDivider: {
        height: 1,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        marginLeft: 56,
        marginRight: 16,
    },
    departmentFolderIcon: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
        backgroundColor: changeOpacity(theme.linkColor, 0.12),
        borderRadius: 6,
    },
    departmentRowName: {
        ...typography('Body', 200),
        color: theme.centerChannelColor,
        flex: 1,
    },
    subSection: {},
}));

const ContactsScreen = ({currentUser, currentTeamId, database}: Props) => {
    const theme = useTheme();
    const intl = useIntl();
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();
    const isFocused = useIsFocused();
    const mounted = useRef(false);

    const [topLevelDepartments, setTopLevelDepartments] = useState<ContactDepartment[]>([]);
    const [defaultDepartmentEmployees, setDefaultDepartmentEmployees] = useState<ContactEmployee[]>([]);
    const [companyEmployeeCount, setCompanyEmployeeCount] = useState<number>(0);
    const [companyName, setCompanyName] = useState<string | undefined>();
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
        const closeButtonId = 'close-contacts-manage';
        showModal(
            Screens.CONTACTS_MANAGE,
            '',
            {
                companyId: currentTeamId ?? '',
                companyName,
                closeButtonId,
            },
            {topBar: {visible: false}, componentId: closeButtonId},
        );
    }, [companyName, currentTeamId]));

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

    const handleOpenCustomersList = usePreventDoubleTap(useCallback(() => {
        const title = intl.formatMessage({id: 'contacts.my_customers', defaultMessage: 'My Customers'});
        showModalWithBackButton(Screens.CONTACTS_EMPLOYEE_LIST, title, CLOSE_CUSTOMERS, {type: 'customer', closeButtonId: CLOSE_CUSTOMERS}, {useBackIcon: true});
    }, [intl]));

    const handleOpenSuppliersList = usePreventDoubleTap(useCallback(() => {
        const title = intl.formatMessage({id: 'contacts.my_suppliers', defaultMessage: 'My Suppliers'});
        showModalWithBackButton(Screens.CONTACTS_EMPLOYEE_LIST, title, CLOSE_SUPPLIERS, {type: 'supplier', closeButtonId: CLOSE_SUPPLIERS}, {useBackIcon: true});
    }, [intl]));

    useEffect(() => {
        mounted.current = true;
        setLoading(true);
        setServiceError(false);

        const fetchEnterprise = async () => {
            if (!currentTeamId) {
                setLoading(false);
                return;
            }

            const getRes = await fetchCompany(currentTeamId);
            if (getRes.error && mounted.current && database) {
                const team = await getTeamById(database, currentTeamId);
                const teamName = team?.displayName?.trim();
                if (teamName) {
                    const ensureRes = await ensureTeamCompany(currentTeamId, teamName);
                    if (ensureRes.error && mounted.current) {
                        setServiceError(true);
                        setLoading(false);
                        return;
                    }
                    if (mounted.current) {
                        setCompanyName(teamName);
                    }
                } else {
                    setLoading(false);
                    return;
                }
            } else if (getRes.data?.name && mounted.current) {
                setCompanyName(getRes.data.name);
            }

            const deptRes = await fetchDepartmentsOfCompany(currentTeamId, {parentDepartmentId: -1});
            if (!mounted.current) {
                return;
            }
            if (deptRes.error) {
                setServiceError(true);
                setLoading(false);
                return;
            }
            setTopLevelDepartments((deptRes.data || []).filter((d) => d.name !== DEFAULT_DEPARTMENT_NAME));

            const [defaultEmpRes, countRes] = await Promise.all([
                fetchEmployeesOfDefaultDepartment(currentTeamId),
                fetchEmployeeCountOfCompany(currentTeamId),
            ]);

            if (!mounted.current) {
                return;
            }
            if (defaultEmpRes.error) {
                setServiceError(true);
            } else {
                setDefaultDepartmentEmployees(defaultEmpRes.data ?? []);
            }
            if (!countRes.error && countRes.data !== undefined) {
                setCompanyEmployeeCount(countRes.data);
            }
            setLoading(false);
        };

        fetchEnterprise();

        return () => {
            mounted.current = false;
        };
    }, [currentTeamId, database]);

    const handleDepartmentPress = usePreventDoubleTap(useCallback((department: ContactDepartment) => {
        const breadcrumb = [
            intl.formatMessage({id: 'contacts.enterprise', defaultMessage: 'Enterprise Contacts'}),
            department.name,
        ];
        navigation.navigate(Screens.CONTACTS_DEPARTMENT_DETAIL, {
            departmentId: department.id,
            departmentName: department.name,
            breadcrumb,
            companyId: currentTeamId ?? '',
            companyName,
        });
    }, [companyName, intl, currentTeamId, navigation]));

    const handleEmployeePress = usePreventDoubleTap(useCallback((employee: ContactEmployee, deptName?: string) => {
        const title = intl.formatMessage({id: 'contacts.personal_info', defaultMessage: 'Personal Information'});
        showModalWithBackButton(
            Screens.CONTACTS_EMPLOYEE_PROFILE,
            title,
            `close-employee-${employee.id}`,
            {
                employee,
                departmentName: deptName,
                companyName,
                companyId: currentTeamId ?? undefined,
                closeButtonId: `close-employee-${employee.id}`,
            },
            {useBackIcon: true},
        );
    }, [companyName, currentTeamId, intl]));

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
        if (topLevelDepartments.length === 0) {
            return (
                <Text style={styles.emptyMessage}>
                    {intl.formatMessage({id: 'contacts.no_enterprise_contacts', defaultMessage: 'No enterprise contacts'})}
                </Text>
            );
        }
        return (
            <View style={styles.subSection}>
                {topLevelDepartments.map((dept, deptIdx) => (
                    <React.Fragment key={dept.id}>
                        <TouchableOpacity
                            style={styles.departmentRow}
                            onPress={() => handleDepartmentPress(dept)}
                            activeOpacity={0.7}
                            testID={`contacts.department.${dept.id}`}
                        >
                            <View style={styles.departmentFolderIcon}>
                                <CompassIcon
                                    name='folder-outline'
                                    size={24}
                                    color={theme.linkColor}
                                />
                            </View>
                            <Text
                                style={styles.departmentRowName}
                                numberOfLines={1}
                            >
                                {dept.name}
                            </Text>
                        </TouchableOpacity>
                        {deptIdx < topLevelDepartments.length - 1 || defaultDepartmentEmployees.length > 0 ? (
                            <View style={styles.insetDivider}/>
                        ) : null}
                    </React.Fragment>
                ))}
                {defaultDepartmentEmployees.map((emp, empIdx) => (
                    <React.Fragment key={emp.id}>
                        <TouchableOpacity
                            style={styles.listItem}
                            onPress={() => handleEmployeePress(emp, intl.formatMessage({id: 'contacts.default_department', defaultMessage: 'Default Department'}))}
                            activeOpacity={0.7}
                            testID={`contacts.employee.${emp.id}`}
                        >
                            <View style={styles.listItemAvatar}>
                                <ContactAvatar
                                    employee={emp}
                                    size={40}
                                />
                            </View>
                            <Text
                                style={styles.listItemName}
                                numberOfLines={1}
                            >
                                {emp.name}
                            </Text>
                        </TouchableOpacity>
                        {empIdx < defaultDepartmentEmployees.length - 1 ? (
                            <View style={styles.insetDivider}/>
                        ) : null}
                    </React.Fragment>
                ))}
                <View style={styles.memberCountFooter}>
                    <Text style={styles.memberCount}>
                        {intl.formatMessage(
                            {id: 'contacts.member_count', defaultMessage: 'Total {count} members'},
                            {count: companyEmployeeCount},
                        )}
                    </Text>
                </View>
            </View>
        );
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
                        {(companyName?.trim()) || intl.formatMessage({id: 'contacts.title', defaultMessage: 'Contacts'})}
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

            {/* <View style={styles.section}>
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

            <View style={styles.sectionDivider}/> */}

            <View style={styles.enterpriseSection}>
                <View style={styles.enterpriseHeader}>
                    <Text style={styles.enterpriseTitle}>
                        {intl.formatMessage({id: 'contacts.enterprise', defaultMessage: 'Enterprise Contacts'})}
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
