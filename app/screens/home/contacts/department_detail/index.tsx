// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {ScrollView, Text, TouchableOpacity, View} from 'react-native';
import {Navigation} from 'react-native-navigation';
import {SafeAreaView} from 'react-native-safe-area-context';

import {fetchContactDirectoryContent, fetchDepartmentDetail, fetchEmployeeCountOfDepartment} from '@actions/remote/contact';
import {type ContactDepartment, type ContactEmployee} from '@client/rest/contact';
import CompassIcon from '@components/compass_icon';
import ContactAvatar from '@components/contact_avatar';
import Loading from '@components/loading';
import SlideUpPanelItem, {ITEM_HEIGHT} from '@components/slide_up_panel_item';
import {Screens} from '@constants';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import {useOnComponentWillAppear} from '@hooks/use_on_component_will_appear';
import {usePreventDoubleTap} from '@hooks/utils';
import {bottomSheet, dismissAllModalsAndPopToScreen, dismissBottomSheet, dismissModal, dismissModals, goToScreen, popScreens, popToRoot, popTopScreen, showModal, showModalWithBackButton} from '@screens/navigation';
import {getNavigationalPathView, NAV_PATH_MAX_VISIBLE} from '@utils/department_path';
import {bottomSheetSnapPoint} from '@utils/helpers';
import {mergeNavigationOptions} from '@utils/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {AvailableScreens} from '@typings/screens/navigation';

const CLOSE_BUTTON_ID = 'close-contacts-department-detail';
const DEPT_SEARCH_BUTTON_ID = 'contacts-department-detail-search';
const DEPT_MANAGE_BUTTON_ID = 'contacts-department-detail-manage';

type Props = {
    componentId: AvailableScreens;
    closeButtonId?: string;

    /** null 表示根目录（企业通讯录） */
    departmentId: number | null;
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

    /** 从个人信息页部门浏览 Wrapper 内嵌时为 true：不渲染顶栏与搜索/管理按钮，由 Wrapper 提供返回/关闭 */
    fromEmployeeProfile?: boolean;

    /** 通讯录 Tab 所在 RNN Home；关管理弹窗后 Home willAppear，栈内部门页据此刷新 */
    rnnHomeComponentId?: string;
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
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    breadcrumb: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        flex: 1,
        gap: 8,
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
    breadcrumbEllipsis: {
        paddingVertical: 6,
        paddingHorizontal: 8,
        marginHorizontal: -4,
        justifyContent: 'center',
        alignItems: 'center',
    },
    breadcrumbEllipsisText: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.linkColor,
        marginTop: -5,
    },
    pathSheetRow: {
        height: ITEM_HEIGHT,
        marginHorizontal: -20,
        paddingHorizontal: 20,
        flexDirection: 'row',
        alignItems: 'center',
    },
    pathSheetIcon: {
        height: ITEM_HEIGHT,
        justifyContent: 'center',
        marginRight: 10,
    },
    pathSheetText: {
        flex: 1,
        ...typography('Body', 200, 'Regular'),
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
    fromEmployeeProfile = false,
    rnnHomeComponentId,
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

    const pathView = React.useMemo(
        () => getNavigationalPathView(baseBreadcrumb, NAV_PATH_MAX_VISIBLE),
        [baseBreadcrumb],
    );

    const handleEllipsisPress = useCallback(() => {
        if (pathView.middleSegments.length === 0) {
            return;
        }
        const fullSegments = pathView.fullSegments;
        bottomSheet({
            closeButtonId: 'close-contacts-department-path-middle',
            renderContent: () => (
                <>
                    {fullSegments.map((label, i) => {
                        const isCurrent = i === depth;
                        if (isCurrent) {
                            return (
                                <View
                                    key={i}
                                    style={[
                                        styles.pathSheetRow,
                                        {opacity: 0.6},
                                    ]}
                                    testID={`contacts.department_detail.path_middle.${i}.disabled`}
                                >
                                    <View style={styles.pathSheetIcon}>
                                        <CompassIcon
                                            name='folder-outline'
                                            size={24}
                                            color={changeOpacity(theme.centerChannelColor, 0.56)}
                                        />
                                    </View>
                                    <Text
                                        style={[styles.pathSheetText, {color: changeOpacity(theme.centerChannelColor, 0.64)}]}
                                        numberOfLines={1}
                                    >
                                        {label}
                                    </Text>
                                </View>
                            );
                        }
                        return (
                            <SlideUpPanelItem
                                key={i}
                                leftIcon='folder-outline'
                                text={label}
                                onPress={() => {
                                    dismissBottomSheet();
                                    handleBreadcrumbPress(i);
                                }}
                                testID={`contacts.department_detail.path_middle.${i}`}
                            />
                        );
                    })}
                </>
            ),
            snapPoints: [1, bottomSheetSnapPoint(fullSegments.length, ITEM_HEIGHT)],
            theme,
            title: intl.formatMessage({id: 'contacts.department_path_middle', defaultMessage: 'Department path'}),
        });
    }, [pathView, handleBreadcrumbPress, depth, theme, intl]);

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
                companyId,
                closeButtonId: `close-employee-${employee.id}`,
            },
            {useBackIcon: true},
        );
    }, [baseBreadcrumb, companyId, departmentName, companyName, intl]));

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
        if (onBack || fromEmployeeProfile) {
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
    }, [effectiveCloseButtonId, onBack, fromEmployeeProfile, theme.sidebarHeaderTextColor]);

    const fetchData = useCallback(async () => {
        if (!mounted.current) {
            return;
        }

        setLoading(true);

        if (departmentId == null) {
            const res = await fetchContactDirectoryContent(companyId, undefined);
            if (!mounted.current) {
                return;
            }
            if (!res.error && res.data) {
                setSubDepartments(res.data.departments);
                setEmployees(res.data.employees);
                setMemberCount(res.data.memberCount ?? 0);
            }
        } else {
            const [detailRes, countRes] = await Promise.all([
                fetchDepartmentDetail(companyId, departmentId),
                fetchEmployeeCountOfDepartment(companyId, departmentId),
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
        }

        if (mounted.current) {
            setLoading(false);
        }
    }, [companyId, departmentId]);

    useEffect(() => {
        mounted.current = true;
        fetchData();
        return () => {
            mounted.current = false;
        };
    }, [fetchData]);

    useOnComponentWillAppear(componentId, fetchData);
    useOnComponentWillAppear(rnnHomeComponentId, fetchData);

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
            {onBack && !fromEmployeeProfile ? (
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
                    {pathView.items.map((pathItem, idx) => (
                        <React.Fragment key={idx}>
                            {idx > 0 && (
                                <Text style={styles.breadcrumbSeparator}>
                                    {intl.formatMessage({id: 'contacts.breadcrumb_separator', defaultMessage: '>'})}
                                </Text>
                            )}
                            {pathItem.type === 'segment' ? (
                                <TouchableOpacity
                                    style={styles.breadcrumbLink}
                                    onPress={() => handleBreadcrumbPress(pathItem.originalIndex)}
                                    activeOpacity={0.7}
                                    disabled={pathItem.originalIndex === depth}
                                    testID={`contacts.department_detail.breadcrumb.${pathItem.originalIndex}`}
                                >
                                    <Text
                                        style={[
                                            styles.breadcrumbText,
                                            pathItem.originalIndex === depth && {color: theme.linkColor},
                                        ]}
                                        numberOfLines={1}
                                    >
                                        {pathItem.label}
                                    </Text>
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity
                                    style={styles.breadcrumbEllipsis}
                                    onPress={handleEllipsisPress}
                                    activeOpacity={0.7}
                                    testID='contacts.department_detail.breadcrumb.ellipsis'
                                >
                                    <Text
                                        style={styles.breadcrumbEllipsisText}
                                        numberOfLines={1}
                                    >
                                        {pathItem.label}
                                    </Text>
                                </TouchableOpacity>
                            )}
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
