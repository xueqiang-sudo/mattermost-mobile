// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {ScrollView, Text, TouchableOpacity, View} from 'react-native';
import {Navigation} from 'react-native-navigation';
import {SafeAreaView} from 'react-native-safe-area-context';

import {fetchDepartmentDetail, fetchEmployeeCountOfDepartment} from '@actions/remote/contact';
import CompassIcon from '@components/compass_icon';
import ContactAvatar from '@components/contact_avatar';
import Loading from '@components/loading';
import {Screens} from '@constants';
import {useTheme} from '@context/theme';
import {usePreventDoubleTap} from '@hooks/utils';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import {dismissModal, dismissModals, showModalWithBackButton} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import {type ContactDepartment, type ContactEmployee} from '@client/rest/contact';
import type {AvailableScreens} from '@typings/screens/navigation';

const CLOSE_BUTTON_ID = 'close-contacts-department-detail';

type Props = {
    componentId: AvailableScreens;
    closeButtonId?: string;
    departmentId: number;
    departmentName: string;
    breadcrumb?: string[];
    companyId: string;
    companyName?: string;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    flex: {flex: 1},
    breadcrumb: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        gap: 4,
    },
    breadcrumbText: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.64),
    },
    breadcrumbSeparator: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.48),
    },
    breadcrumbLink: {
        paddingVertical: 2,
        paddingHorizontal: 2,
    },
    memberCountFooter: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.64),
        textAlign: 'center',
        paddingVertical: 16,
    },
    listItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 16,
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
    folderIcon: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
    },
    listItemAvatar: {
        marginRight: 14,
    },
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
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 24,
    },
}));

const ContactsDepartmentDetail = ({
    componentId,
    closeButtonId,
    departmentId,
    departmentName,
    breadcrumb = [],
    companyId,
    companyName,
}: Props) => {
    const theme = useTheme();
    const intl = useIntl();
    const mounted = useRef(false);
    const styles = getStyleSheet(theme);

    const [subDepartments, setSubDepartments] = useState<ContactDepartment[]>([]);
    const [employees, setEmployees] = useState<ContactEmployee[]>([]);
    const [memberCount, setMemberCount] = useState<number>(0);
    const [loading, setLoading] = useState(true);

    const baseBreadcrumb = breadcrumb.length > 0 ? breadcrumb : [
        intl.formatMessage({id: 'contacts.enterprise', defaultMessage: 'Enterprise Contacts'}),
        departmentName,
    ];

    const handleClose = useCallback(() => {
        dismissModal({componentId});
    }, [componentId]);

    const effectiveCloseButtonId = closeButtonId ?? CLOSE_BUTTON_ID;

    useNavButtonPressed(effectiveCloseButtonId, componentId, handleClose, [handleClose]);
    useAndroidHardwareBackHandler(componentId, handleClose);

    useEffect(() => {
        const listener = Navigation.events().registerNavigationButtonPressedListener(
            ({buttonId}: {buttonId: string}) => {
                if (buttonId === effectiveCloseButtonId) {
                    dismissModal({componentId});
                }
            },
        );
        return () => listener.remove();
    }, [effectiveCloseButtonId, componentId]);

    const handleDepartmentPress = usePreventDoubleTap(useCallback((dept: ContactDepartment) => {
        const title = dept.name;
        const newBreadcrumb = [...baseBreadcrumb, dept.name];
        showModalWithBackButton(
            Screens.CONTACTS_DEPARTMENT_DETAIL,
            title,
            `close-department-${dept.id}`,
            {
                departmentId: dept.id,
                departmentName: dept.name,
                breadcrumb: newBreadcrumb,
                companyId,
                companyName,
                closeButtonId: `close-department-${dept.id}`,
            },
            {useBackIcon: true},
        );
    }, [baseBreadcrumb, companyId, companyName, intl]));

    const depth = baseBreadcrumb.length - 1;

    const handleBreadcrumbPress = usePreventDoubleTap(useCallback((index: number) => {
        const toDismiss = depth - index;
        if (toDismiss > 0) {
            dismissModals(toDismiss);
        }
    }, [depth]));

    const handleEmployeePress = usePreventDoubleTap(useCallback((employee: ContactEmployee) => {
        const title = intl.formatMessage({id: 'contacts.personal_info', defaultMessage: 'Personal Information'});
        const departmentParentPath = baseBreadcrumb.length > 1
            ? baseBreadcrumb.slice(0, -1).join('/')
            : undefined;
        showModalWithBackButton(
            Screens.CONTACTS_EMPLOYEE_PROFILE,
            title,
            `close-employee-${employee.id}`,
            {
                employee,
                departmentName,
                departmentParentPath,
                companyName,
                closeButtonId: `close-employee-${employee.id}`,
            },
            {useBackIcon: true},
        );
    }, [baseBreadcrumb, departmentName, companyName, intl]));

    useEffect(() => {
        mounted.current = true;
        setLoading(true);

        const fetchData = async () => {
            const [detailRes, countRes] = await Promise.all([
                fetchDepartmentDetail(departmentId, companyId),
                fetchEmployeeCountOfDepartment(departmentId),
            ]);

            if (!mounted.current) {
                return;
            }

            if (!detailRes.error && detailRes.data) {
                setSubDepartments(detailRes.data.subDepartments);
                setEmployees(detailRes.data.employees);
            }
            if (!countRes.error && countRes.data !== undefined) {
                setMemberCount(countRes.data);
            }

            setLoading(false);
        };

        fetchData();
        return () => {
            mounted.current = false;
        };
    }, [companyId, departmentId]);

    const renderContent = () => {
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

        const hasSubDepts = subDepartments.length > 0;
        const hasEmps = employees.length > 0;

        if (!hasSubDepts && !hasEmps) {
            return (
                <Text style={styles.emptyMessage}>
                    {intl.formatMessage({id: 'contacts.no_members', defaultMessage: 'No members'})}
                </Text>
            );
        }

        return (
            <>
                {subDepartments.map((dept, deptIdx) => (
                    <React.Fragment key={dept.id}>
                        <TouchableOpacity
                            style={styles.departmentRow}
                            onPress={() => handleDepartmentPress(dept)}
                            activeOpacity={0.7}
                            testID={`contacts.department_detail.department.${dept.id}`}
                        >
                            <View style={styles.folderIcon}>
                                <CompassIcon
                                    name='folder-outline'
                                    size={24}
                                    color={theme.linkColor}
                                />
                            </View>
                            <Text
                                style={styles.listItemName}
                                numberOfLines={1}
                            >
                                {dept.name}
                            </Text>
                        </TouchableOpacity>
                        {deptIdx < subDepartments.length - 1 || employees.length > 0 ? (
                            <View style={styles.insetDivider}/>
                        ) : null}
                    </React.Fragment>
                ))}
                {employees.map((emp, empIdx) => (
                    <React.Fragment key={emp.id}>
                        <TouchableOpacity
                            style={styles.listItem}
                            onPress={() => handleEmployeePress(emp)}
                            activeOpacity={0.7}
                            testID={`contacts.department_detail.employee.${emp.id}`}
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
                        {empIdx < employees.length - 1 ? (
                            <View style={styles.insetDivider}/>
                        ) : null}
                    </React.Fragment>
                ))}
                {(hasSubDepts || hasEmps) && (
                    <Text style={styles.memberCountFooter}>
                        {intl.formatMessage(
                            {id: 'contacts.member_count', defaultMessage: 'Total {count} members'},
                            {count: memberCount},
                        )}
                    </Text>
                )}
            </>
        );
    };

    return (
        <SafeAreaView
            edges={['bottom']}
            style={styles.flex}
            testID='contacts.department_detail.screen'
        >
            <View style={styles.breadcrumb}>
                {baseBreadcrumb.map((item, idx) => (
                    <React.Fragment key={idx}>
                        {idx > 0 && (
                            <Text style={styles.breadcrumbSeparator}>
                                {intl.formatMessage({id: 'contacts.breadcrumb_separator', defaultMessage: '>'})}
                            </Text>
                        )}
                        <TouchableOpacity
                            style={styles.breadcrumbLink}
                            onPress={() => handleBreadcrumbPress(idx)}
                            activeOpacity={0.7}
                            disabled={idx === depth}
                            testID={`contacts.department_detail.breadcrumb.${idx}`}
                        >
                            <Text
                                style={[
                                    styles.breadcrumbText,
                                    idx === depth && {color: theme.linkColor},
                                ]}
                                numberOfLines={1}
                            >
                                {item}
                            </Text>
                        </TouchableOpacity>
                    </React.Fragment>
                ))}
            </View>
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

export default ContactsDepartmentDetail;
