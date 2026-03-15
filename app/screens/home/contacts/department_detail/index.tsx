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
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import {usePreventDoubleTap} from '@hooks/utils';
import {dismissAllModalsAndPopToScreen, dismissModal, dismissModals, goToScreen, popScreens, popToRoot, popTopScreen, showModal, showModalWithBackButton} from '@screens/navigation';
import {mergeNavigationOptions} from '@utils/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import {type ContactDepartment, type ContactEmployee} from '@client/rest/contact';
import type {AvailableScreens} from '@typings/screens/navigation';

const CLOSE_BUTTON_ID = 'close-contacts-department-detail';
const DEPT_SEARCH_BUTTON_ID = 'contacts-department-detail-search';
const DEPT_MANAGE_BUTTON_ID = 'contacts-department-detail-manage';

type Props = {
    componentId: AvailableScreens;
    closeButtonId?: string;
    departmentId: number;
    departmentName: string;
    breadcrumb?: string[];
    companyId: string;
    companyName?: string;
    /** 从通讯录栈 push 进入时为 true，返回用 pop；否则为 modal，返回用 dismiss */
    isStackScreen?: boolean;
    /** React Navigation 栈内时由 wrapper 传入，替代 RNN 的返回/子部门/面包屑 */
    onBack?: () => void;
    onNavigateToDepartment?: (params: {
        departmentId: number;
        departmentName: string;
        breadcrumb: string[];
        companyId: string;
        companyName?: string;
    }) => void;
    onBreadcrumbPress?: (toDismiss: number) => void;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    flex: {flex: 1},
    stackHeaderBar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: theme.sidebarBg,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    stackHeaderBack: {
        padding: 4,
        marginRight: 8,
        zIndex: 1,
    },
    stackHeaderTitleWrap: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 48,
    },
    stackHeaderTitle: {
        ...typography('Heading', 600, 'SemiBold'),
        color: theme.sidebarHeaderTextColor,
        textAlign: 'center',
    },
    stackHeaderSpacer: {
        flex: 1,
        minWidth: 8,
    },
    stackHeaderActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        zIndex: 1,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    breadcrumb: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        flex: 1,
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
        backgroundColor: changeOpacity(theme.linkColor, 0.12),
        borderRadius: 10,
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
    isStackScreen = false,
    onBack,
    onNavigateToDepartment,
    onBreadcrumbPress,
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
        if (onBack) {
            onBack();
            return;
        }
        if (isStackScreen) {
            popTopScreen(componentId);
        } else {
            dismissModal({componentId});
        }
    }, [componentId, isStackScreen, onBack]);

    const effectiveCloseButtonId = closeButtonId ?? CLOSE_BUTTON_ID;

    useNavButtonPressed(effectiveCloseButtonId, componentId, handleClose, [handleClose]);
    useAndroidHardwareBackHandler(componentId, handleClose);

    useEffect(() => {
        if (isStackScreen) {
            return;
        }
        const listener = Navigation.events().registerNavigationButtonPressedListener(
            ({buttonId}: {buttonId: string}) => {
                if (buttonId === effectiveCloseButtonId) {
                    dismissModal({componentId});
                }
            },
        );
        return () => listener.remove();
    }, [effectiveCloseButtonId, componentId, isStackScreen]);

    const handleSearch = useCallback(() => {
        dismissAllModalsAndPopToScreen(Screens.SEARCH, '');
    }, []);

    const handleDepartmentPress = usePreventDoubleTap(useCallback((dept: ContactDepartment) => {
        const newBreadcrumb = [...baseBreadcrumb, dept.name];
        if (onNavigateToDepartment) {
            onNavigateToDepartment({
                departmentId: dept.id,
                departmentName: dept.name,
                breadcrumb: newBreadcrumb,
                companyId,
                companyName,
            });
            return;
        }
        const title = dept.name;
        if (isStackScreen) {
            goToScreen(
                Screens.CONTACTS_DEPARTMENT_DETAIL,
                title,
                {
                    departmentId: dept.id,
                    departmentName: dept.name,
                    breadcrumb: newBreadcrumb,
                    companyId,
                    companyName,
                    isStackScreen: true,
                },
            );
        } else {
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
        }
    }, [baseBreadcrumb, companyId, companyName, intl, isStackScreen, onNavigateToDepartment]));

    const depth = baseBreadcrumb.length - 1;

    const handleBreadcrumbPress = usePreventDoubleTap(useCallback((index: number) => {
        const toDismiss = depth - index;
        if (toDismiss <= 0) {
            return;
        }
        if (onBreadcrumbPress) {
            onBreadcrumbPress(toDismiss);
            return;
        }
        if (isStackScreen) {
            if (index === 0) {
                popToRoot();
            } else {
                popScreens(toDismiss);
            }
        } else {
            dismissModals(toDismiss);
        }
    }, [depth, isStackScreen, onBreadcrumbPress]));

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

    const handleOpenManage = usePreventDoubleTap(useCallback(() => {
        const manageCloseButtonId = `close-contacts-manage-dept-${departmentId}`;
        showModal(
            Screens.CONTACTS_MANAGE,
            '',
            {
                companyId,
                companyName,
                departmentId,
                departmentName,
                breadcrumb: baseBreadcrumb,
                closeButtonId: manageCloseButtonId,
            },
            {topBar: {visible: false}, componentId: manageCloseButtonId},
        );
    }, [baseBreadcrumb, companyId, companyName, departmentId, departmentName]));

    useNavButtonPressed(DEPT_SEARCH_BUTTON_ID, effectiveCloseButtonId, handleSearch, [handleSearch]);
    useNavButtonPressed(DEPT_MANAGE_BUTTON_ID, effectiveCloseButtonId, handleOpenManage, [handleOpenManage]);

    useEffect(() => {
        if (onBack) {
            return;
        }
        const searchIcon = CompassIcon.getImageSourceSync('magnify', 24, theme.sidebarHeaderTextColor);
        const manageIcon = CompassIcon.getImageSourceSync('format-list-bulleted', 24, theme.sidebarHeaderTextColor);
        mergeNavigationOptions(effectiveCloseButtonId, {
            topBar: {
                rightButtons: [
                    {
                        id: DEPT_MANAGE_BUTTON_ID,
                        icon: manageIcon,
                        testID: 'contacts.department_detail.manage.button',
                    },
                    {
                        id: DEPT_SEARCH_BUTTON_ID,
                        icon: searchIcon,
                        testID: 'contacts.department_detail.search.button',
                    },
                ],
            },
        });
    }, [effectiveCloseButtonId, onBack, theme.sidebarHeaderTextColor]);

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
            {onBack ? (
                <View style={styles.stackHeaderBar}>
                    <TouchableOpacity
                        onPress={handleClose}
                        style={styles.stackHeaderBack}
                        hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
                        testID='contacts.department_detail.back'
                    >
                        <CompassIcon
                            name='arrow-left'
                            size={24}
                            color={theme.sidebarHeaderTextColor}
                        />
                    </TouchableOpacity>
                    <View
                        style={styles.stackHeaderTitleWrap}
                        pointerEvents='box-none'
                    >
                        <Text
                            style={styles.stackHeaderTitle}
                            numberOfLines={1}
                        >
                            {departmentName}
                        </Text>
                    </View>
                    <View style={styles.stackHeaderSpacer}/>
                    <View style={styles.stackHeaderActions}>
                        <TouchableOpacity
                            onPress={handleSearch}
                            style={styles.stackHeaderBack}
                            testID='contacts.department_detail.search.button'
                        >
                            <CompassIcon
                                name='magnify'
                                size={24}
                                color={theme.sidebarHeaderTextColor}
                            />
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={handleOpenManage}
                            style={styles.stackHeaderBack}
                            testID='contacts.department_detail.manage.button'
                        >
                            <CompassIcon
                                name='format-list-bulleted'
                                size={24}
                                color={theme.sidebarHeaderTextColor}
                            />
                        </TouchableOpacity>
                    </View>
                </View>
            ) : null}
            <View style={styles.headerRow}>
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
