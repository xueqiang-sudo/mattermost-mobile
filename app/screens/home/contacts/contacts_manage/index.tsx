// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {Alert, ScrollView, Text, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {fetchContactDirectoryContent} from '@actions/remote/contact';
import {type ContactDepartment, type ContactEmployee} from '@client/rest/contact';
import ContactDirectoryList from '@components/contact_directory_list';
import CompassIcon from '@components/compass_icon';
import {Screens} from '@constants';
import {useTheme} from '@context/theme';
import {usePreventDoubleTap} from '@hooks/utils';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import {dismissModal, showModal, showModalWithBackButton} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {AvailableScreens} from '@typings/screens/navigation';

const CLOSE_BUTTON_ID = 'close-contacts-manage';

type Props = {
    componentId: AvailableScreens;
    closeButtonId?: string;
    companyId: string;
    companyName?: string;
    displayName?: string;
    departmentId?: number;
    departmentName?: string;
    breadcrumb?: string[];
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    flex: {flex: 1},
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: theme.sidebarBg,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    headerCenter: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        ...typography('Heading', 600, 'SemiBold'),
        color: theme.sidebarText,
        textAlign: 'center',
    },
    headerSubtitle: {
        ...typography('Body', 100),
        color: changeOpacity(theme.sidebarText, 0.85),
        marginTop: 2,
        textAlign: 'center',
    },
    headerCloseWrap: {
        position: 'absolute',
        right: 12,
        top: 0,
        bottom: 0,
        justifyContent: 'center',
    },
    headerClose: {
        padding: 4,
    },
    scrollContent: {
        paddingBottom: 16,
    },
    bottomBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
        paddingHorizontal: 16,
        paddingVertical: 8,
        paddingBottom: 16,
        backgroundColor: theme.centerChannelBg,
        borderTopWidth: 1,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.08),
        gap: 8,
    },
    bottomButton: {
        flex: 1,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        backgroundColor: changeOpacity(theme.linkColor, 0.15),
        alignItems: 'center',
        justifyContent: 'center',
    },
    bottomButtonText: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.linkColor,
    },
}));

const ContactsManage = ({
    componentId,
    closeButtonId,
    companyId,
    companyName,
    displayName,
    departmentId,
    departmentName,
    breadcrumb = [],
}: Props) => {
    const theme = useTheme();
    const intl = useIntl();
    const mounted = useRef(false);
    const styles = getStyleSheet(theme);

    const [departments, setDepartments] = useState<ContactDepartment[]>([]);
    const [employees, setEmployees] = useState<ContactEmployee[]>([]);
    const [memberCount, setMemberCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    const effectiveCloseButtonId = closeButtonId ?? CLOSE_BUTTON_ID;
    const subtitle = departmentId != null ? departmentName : displayName;

    const handleClose = useCallback(() => {
        dismissModal({componentId});
    }, [componentId]);

    useNavButtonPressed(effectiveCloseButtonId, componentId, handleClose, [handleClose]);
    useAndroidHardwareBackHandler(componentId, handleClose);

    useEffect(() => {
        mounted.current = true;
        setLoading(true);
        setError(false);

        const load = async () => {
            const res = await fetchContactDirectoryContent(companyId, departmentId);
            if (!mounted.current) {
                return;
            }
            if (res.error) {
                setError(true);
                setDepartments([]);
                setEmployees([]);
                setMemberCount(0);
            } else if (res.data) {
                setDepartments(res.data.departments);
                setEmployees(res.data.employees);
                setMemberCount(res.data.memberCount);
            }
            setLoading(false);
        };

        load();
        return () => {
            mounted.current = false;
        };
    }, [companyId, departmentId]);

    const handleDepartmentPress = usePreventDoubleTap(useCallback((dept: ContactDepartment) => {
        const closeButtonId = `close-contacts-manage-${dept.id}`;
        const newBreadcrumb = breadcrumb.length > 0 ? [...breadcrumb, dept.name] : [
            intl.formatMessage({id: 'contacts.enterprise', defaultMessage: 'Enterprise Contacts'}),
            departmentName ?? dept.name,
            dept.name,
        ];
        showModal(
            Screens.CONTACTS_MANAGE,
            '',
            {
                companyId,
                companyName,
                departmentId: dept.id,
                departmentName: dept.name,
                breadcrumb: newBreadcrumb,
                closeButtonId,
            },
            {topBar: {visible: false}, componentId: closeButtonId},
        );
    }, [breadcrumb, companyId, companyName, departmentName, intl]));

    const handleEmployeePress = usePreventDoubleTap(useCallback((employee: ContactEmployee) => {
        const title = intl.formatMessage({id: 'contacts.personal_info', defaultMessage: 'Personal Information'});
        const deptName = departmentName ?? intl.formatMessage({id: 'contacts.default_department', defaultMessage: 'Default Department'});
        showModalWithBackButton(
            Screens.CONTACTS_EMPLOYEE_PROFILE,
            title,
            `close-employee-${employee.id}`,
            {
                employee,
                departmentName: deptName,
                companyName,
                closeButtonId: `close-employee-${employee.id}`,
            },
            {useBackIcon: true},
        );
    }, [companyName, departmentName, intl]));

    const handleAddMember = usePreventDoubleTap(useCallback(() => {
        Alert.alert(
            intl.formatMessage({id: 'contacts.add_member', defaultMessage: 'Add Member'}),
            intl.formatMessage({id: 'contacts.add_feature_coming', defaultMessage: 'Feature coming soon'}),
        );
    }, [intl]));

    const handleAddSubDepartment = usePreventDoubleTap(useCallback(() => {
        Alert.alert(
            intl.formatMessage({id: 'contacts.add_sub_department', defaultMessage: 'Add Sub-department'}),
            intl.formatMessage({id: 'contacts.add_feature_coming', defaultMessage: 'Feature coming soon'}),
        );
    }, [intl]));

    const handleMore = usePreventDoubleTap(useCallback(() => {
        Alert.alert(
            intl.formatMessage({id: 'contacts.more_management', defaultMessage: 'More Management'}),
            intl.formatMessage({id: 'contacts.add_feature_coming', defaultMessage: 'Feature coming soon'}),
        );
    }, [intl]));

    return (
        <SafeAreaView
            edges={['bottom']}
            style={styles.flex}
            testID='contacts.manage.screen'
        >
            <View style={styles.header}>
                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle} numberOfLines={1}>
                        {intl.formatMessage({id: 'contacts.manage_contacts', defaultMessage: 'Manage Contacts'})}
                    </Text>
                    {subtitle ? (
                        <Text style={styles.headerSubtitle} numberOfLines={1}>
                            {subtitle}
                        </Text>
                    ) : null}
                </View>
                <View style={styles.headerCloseWrap}>
                    <TouchableOpacity
                        style={styles.headerClose}
                        onPress={handleClose}
                        hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                        testID='contacts.manage.close'
                    >
                        <CompassIcon
                            name='close'
                            size={24}
                            color={theme.sidebarText}
                        />
                    </TouchableOpacity>
                </View>
            </View>
            <ScrollView
                style={styles.flex}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                <ContactDirectoryList
                    departments={departments}
                    employees={employees}
                    memberCount={memberCount}
                    onDepartmentPress={handleDepartmentPress}
                    onEmployeePress={handleEmployeePress}
                    loading={loading}
                    error={error}
                    testIDPrefix='contacts.manage.directory'
                />
            </ScrollView>
            <View style={styles.bottomBar}>
                <TouchableOpacity
                    style={styles.bottomButton}
                    onPress={handleAddMember}
                    activeOpacity={0.7}
                    testID='contacts.manage.add_member'
                >
                    <Text style={styles.bottomButtonText}>
                        {intl.formatMessage({id: 'contacts.add_member', defaultMessage: 'Add Member'})}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.bottomButton}
                    onPress={handleAddSubDepartment}
                    activeOpacity={0.7}
                    testID='contacts.manage.add_sub_department'
                >
                    <Text style={styles.bottomButtonText}>
                        {intl.formatMessage({id: 'contacts.add_sub_department', defaultMessage: 'Add Sub-department'})}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.bottomButton}
                    onPress={handleMore}
                    activeOpacity={0.7}
                    testID='contacts.manage.more'
                >
                    <Text style={styles.bottomButtonText}>
                        {intl.formatMessage({id: 'contacts.more_management', defaultMessage: 'More Management'})}
                    </Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
};

export default ContactsManage;
