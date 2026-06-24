// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
/* eslint-disable max-lines */

import React, {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {Alert, ScrollView, Text, TouchableOpacity, View} from 'react-native';
import {Navigation} from 'react-native-navigation';
import {type Edge, SafeAreaView} from 'react-native-safe-area-context';

import {
    createSubDepartment,
    deleteContactDepartmentForce,
    fetchContactDepartment,
    fetchContactDirectoryContent,
    fetchDepartmentDetail,
    fetchEmployeeCountOfDepartment,
    updateContactDepartment,
} from '@actions/remote/contact_new';
import {fetchTeamById, getTeamMembersByIds} from '@actions/remote/team';
import AdaptiveTitleText from '@components/adaptive_title_text';
import CompassIcon from '@components/compass_icon';
import ContactAvatar from '@components/contact_avatar';
import {CustomInputModal, useCustomInputModal} from '@components/custom_input_modal';
import Loading from '@components/loading';
import SlideUpPanelItem, {ITEM_HEIGHT} from '@components/slide_up_panel_item';
import TeamManagerModal from '@components/team_manager_modal';
import {Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import {useOnComponentWillAppear} from '@hooks/use_on_component_will_appear';
import {usePreventDoubleTap} from '@hooks/utils';
import NetworkManager from '@managers/network_manager';
import {QR_SCAN_CONTEXT_JOIN_ENTERPRISE, showQrScannerModal} from '@screens/qr_scanner/show_modal';
import {bottomSheet, dismissBottomSheet, dismissModal, dismissModals, goToScreen, popScreens, popToRoot, popTopScreen, showModal, showModalWithBackButton} from '@screens/navigation';
import {getContactListDisplayName} from '@utils/contact_section';
import {getNavigationalPathView, NAV_PATH_MAX_VISIBLE} from '@utils/department_path';
import {buildEnterpriseUserTagKeys, type EnterpriseUserTagKey} from '@utils/enterprise_user_tags';
import {bottomSheetSnapPoint} from '@utils/helpers';
import {mergeNavigationOptions} from '@utils/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {MMDepartment} from '@client/rest/team_department';
import type {AvailableScreens} from '@typings/screens/navigation';

const CLOSE_BUTTON_ID = 'close-contacts-department-detail';
const DEPT_SEARCH_BUTTON_ID = 'contacts-department-detail-search';
const DEPT_MANAGE_BUTTON_ID = 'contacts-department-detail-manage';
const DEPT_EXIT_MANAGE_BUTTON_ID = 'contacts-department-detail-exit-manage';

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

        /** 标签相关 */
        managerIds?: string[];
        ownerId?: string;
        currentUserId?: string;
    }) => void;
    onBreadcrumbPress?: (toDismiss: number) => void;

    /** 从个人信息页部门浏览 Wrapper 内嵌时为 true：不渲染顶栏与搜索/管理按钮，由 Wrapper 提供返回/关闭 */
    fromEmployeeProfile?: boolean;

    /** 通讯录栈内：由 Wrapper 传入，打开通讯录搜索屏 */
    onSearchPress?: () => void;

    /** 通讯录 Tab 所在 RNN Home；关管理弹窗后 Home willAppear，栈内部门页据此刷新 */
    rnnHomeComponentId?: string;

    /** 管理员用户 ID 列表（序列化数组，非 Set） */
    managerIds?: string[];

    /** 企业所有者用户 ID */
    ownerId?: string;

    /** 当前登录用户 ID */
    currentUserId?: string;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    flex: {flex: 1},
    stackHeaderBar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 10,
        backgroundColor: theme.sidebarBg,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    stackHeaderBack: {
        padding: 4,
        width: 40,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    stackHeaderTitleSlot: {
        flex: 1,
        minWidth: 0,
        marginHorizontal: 4,
    },
    stackHeaderTitle: {
        ...typography('Heading', 300, 'SemiBold'),
        color: theme.sidebarHeaderTextColor,
    },
    stackHeaderActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        flexShrink: 0,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: theme.sidebarBg,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },

    /** 单行横向滚动，避免长路径折成多行 */
    breadcrumbScroll: {
        flex: 1,
        minWidth: 0,
    },
    breadcrumbRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'nowrap',
        gap: 8,
        paddingVertical: 2,
        paddingRight: 8,
    },
    breadcrumbText: {
        ...typography('Body', 75),

        /** 条带在 sidebarBg 上，须用 sidebar 前景色而非 centerChannelColor */
        color: changeOpacity(theme.sidebarText, 0.88),
    },
    breadcrumbSeparator: {
        ...typography('Body', 75),
        color: changeOpacity(theme.sidebarText, 0.45),
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
        flexShrink: 1,
        minWidth: 0,
    },
    listItemMain: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        minWidth: 0,
        gap: 6,
    },
    userTagsWrap: {
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        marginLeft: 'auto',
    },
    userTag: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 8,
        borderWidth: 1,
        backgroundColor: changeOpacity(theme.buttonBg, 0.14),
        borderColor: changeOpacity(theme.buttonBg, 0.35),
    },
    userTagText: {
        ...typography('Body', 50, 'SemiBold'),
        color: theme.buttonBg,
    },
    selfTag: {
        backgroundColor: changeOpacity(theme.onlineIndicator, 0.12),
        borderColor: changeOpacity(theme.onlineIndicator, 0.35),
    },
    selfTagText: {
        color: theme.onlineIndicator,
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
        flex: 2,
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
    onSearchPress,
    rnnHomeComponentId,
    managerIds,
    ownerId,
    currentUserId,
}: Props) => {
    const theme = useTheme();
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const mounted = useRef(false);
    const breadcrumbScrollRef = useRef<ScrollView>(null);
    const styles = getStyleSheet(theme);

    const [subDepartments, setSubDepartments] = useState<MMDepartment[]>([]);
    const [employees, setEmployees] = useState<UserProfile[]>([]);
    const [memberCount, setMemberCount] = useState<number>(0);
    const [loading, setLoading] = useState(true);
    const [manageMode, setManageMode] = useState(false);

    /** 标签数据：优先使用 props 传入，否则组件内部加载 */
    const [localOwnerId, setLocalOwnerId] = useState<string | undefined>();
    const [localCurrentUserId, setLocalCurrentUserId] = useState<string | undefined>();
    const [localManagerIds, setLocalManagerIds] = useState<string[]>([]);

    const resolvedOwnerId = ownerId ?? localOwnerId;
    const resolvedCurrentUserId = currentUserId ?? localCurrentUserId;
    const resolvedManagerIds = managerIds ?? localManagerIds;
    const isCurrentUserOwner = Boolean(resolvedOwnerId && resolvedCurrentUserId && resolvedOwnerId === resolvedCurrentUserId);

    /** 管理模式底部栏所需的输入弹窗与管理员弹窗状态 */
    const subDeptInput = useCustomInputModal();
    const modifyDeptNameInput = useCustomInputModal();
    const modifyEnterpriseNameInput = useCustomInputModal();
    const [managerVisible, setManagerVisible] = useState(false);
    const [enterpriseDisplayName, setEnterpriseDisplayName] = useState<string | undefined>(companyName);

    const baseBreadcrumb = React.useMemo(
        () => (breadcrumb.length > 0 ? breadcrumb : [
            intl.formatMessage({id: 'contacts.enterprise', defaultMessage: 'Enterprise Contacts'}),
            departmentName,
        ]),
        [breadcrumb, departmentName, intl],
    );

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
        if (onSearchPress) {
            onSearchPress();
            return;
        }
        const t = intl.formatMessage({id: 'contacts.search.title', defaultMessage: 'Search contacts'});
        const closeId = `close-contacts-search-${companyId}-${departmentId ?? 'all'}`;
        showModalWithBackButton(
            Screens.CONTACTS_SEARCH,
            t,
            closeId,
            {
                companyId,
                companyName,
                ...(departmentId != null ?{
                    departmentId,
                    departmentName,
                    departmentBreadcrumb: baseBreadcrumb,
                } :{}),
                closeButtonId: closeId,
            },
            {useBackIcon: true},
        );
    }, [baseBreadcrumb, companyId, companyName, departmentId, departmentName, intl, onSearchPress]);

    const handleDepartmentPress = usePreventDoubleTap(useCallback((dept: MMDepartment) => {
        const newBreadcrumb = [...baseBreadcrumb, dept.name];
        if (onNavigateToDepartment) {
            onNavigateToDepartment({
                departmentId: dept.id,
                departmentName: dept.name,
                breadcrumb: newBreadcrumb,
                companyId,
                companyName,
                managerIds: resolvedManagerIds,
                ownerId: resolvedOwnerId,
                currentUserId: resolvedCurrentUserId,
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
                    managerIds: resolvedManagerIds,
                    ownerId: resolvedOwnerId,
                    currentUserId: resolvedCurrentUserId,
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
                    managerIds: resolvedManagerIds,
                    ownerId: resolvedOwnerId,
                    currentUserId: resolvedCurrentUserId,
                },
                {useBackIcon: true},
            );
        }
    }, [baseBreadcrumb, companyId, companyName, intl, isStackScreen, onNavigateToDepartment, resolvedManagerIds, resolvedOwnerId, resolvedCurrentUserId]));

    const depth = baseBreadcrumb.length - 1;

    const pathView = React.useMemo(
        () => getNavigationalPathView(baseBreadcrumb, NAV_PATH_MAX_VISIBLE),
        [baseBreadcrumb],
    );

    /** 路径变化或首屏布局后滚到最右侧，默认露出当前层级（路径末尾） */
    const breadcrumbPathSignature = React.useMemo(
        () => baseBreadcrumb.join('\u0001'),
        [baseBreadcrumb],
    );

    const scrollBreadcrumbToEnd = useCallback(() => {
        requestAnimationFrame(() => {
            breadcrumbScrollRef.current?.scrollToEnd({animated: false});
        });
    }, []);

    useLayoutEffect(() => {
        scrollBreadcrumbToEnd();
    }, [breadcrumbPathSignature, scrollBreadcrumbToEnd]);

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

    const handleEmployeePress = usePreventDoubleTap(useCallback((employee: UserProfile) => {
        const title = intl.formatMessage({id: 'contacts.employee_info', defaultMessage: 'Employee Info'});
        const departmentParentPath = baseBreadcrumb.length > 1? baseBreadcrumb.slice(0, -1).join('/'): undefined;
        showModalWithBackButton(
            Screens.CONTACTS_EMPLOYEE_PROFILE,
            title,
            `close-employee-${employee.id}`,
            {
                employee,
                departmentName: departmentId != null ? departmentName : undefined,
                departmentParentPath,
                companyName,
                companyId,
                fromManage: manageMode,
                closeButtonId: `close-employee-${employee.id}`,
            },
            {useBackIcon: true},
        );
    }, [baseBreadcrumb, companyId, departmentId, departmentName, companyName, intl, manageMode]));

    const handleEnterManage = usePreventDoubleTap(useCallback(() => {
        setManageMode(true);
    }, []));

    const handleExitManage = usePreventDoubleTap(useCallback(() => {
        setManageMode(false);
    }, []));

    const openManagerModal = usePreventDoubleTap(useCallback(async () => {
        await dismissBottomSheet();
        setManagerVisible(true);
    }, []));

    const handleAddMember = usePreventDoubleTap(useCallback(() => {
        const targetDepartmentId: number | null = departmentId ?? null;
        const renderContent = () => (
            <>
                <SlideUpPanelItem
                    leftIcon='camera-outline'
                    text={intl.formatMessage({id: 'contacts.add_member_scan_qr', defaultMessage: 'Scan QR code'})}
                    onPress={async () => {
                        await dismissBottomSheet();
                        showQrScannerModal(intl, {
                            scanContext: QR_SCAN_CONTEXT_JOIN_ENTERPRISE,
                            extra: {
                                contactTargetDepartmentId: targetDepartmentId,
                            },
                        });
                    }}
                    testID='contacts.department_detail.manage.add_member.scan_qr'
                />
                <SlideUpPanelItem
                    leftIcon='account-plus-outline'
                    text={intl.formatMessage({id: 'contacts.add_member_invite', defaultMessage: 'Invite to join'})}
                    onPress={async () => {
                        await dismissBottomSheet();
                        showModal(
                            Screens.INVITE,
                            intl.formatMessage({id: 'invite.title', defaultMessage: 'Invite'}),
                            {
                                contactTargetDepartmentId: targetDepartmentId,
                            },
                        );
                    }}
                    testID='contacts.department_detail.manage.add_member.invite'
                />
            </>
        );
        bottomSheet({
            closeButtonId: 'close-contacts-manage-add-member',
            renderContent,
            snapPoints: [1, bottomSheetSnapPoint(2, ITEM_HEIGHT)],
            theme,
            title: intl.formatMessage({id: 'contacts.add_member', defaultMessage: 'Add Member'}),
        });
    }, [departmentId, intl, theme]));

    const handleAddSubDepartment = usePreventDoubleTap(useCallback(async () => {
        const name = await subDeptInput.showModal({
            title: intl.formatMessage({id: 'contacts.add_sub_department', defaultMessage: 'Add Sub-department'}),
            placeholder: intl.formatMessage({id: 'contacts.sub_department_name_placeholder', defaultMessage: 'Enter department name'}),
            confirmContent: intl.formatMessage({id: 'common.confirm', defaultMessage: 'Confirm'}),
            cancelContent: intl.formatMessage({id: 'common.cancel', defaultMessage: 'Cancel'}),
        });
        if (!name) {
            return;
        }
        const res = await createSubDepartment(serverUrl, companyId, name, departmentId ?? undefined);
        if (res.error) {
            Alert.alert(
                intl.formatMessage({id: 'contacts.add_sub_department', defaultMessage: 'Add Sub-department'}),
                intl.formatMessage({id: 'contacts.add_sub_department_failed', defaultMessage: 'Failed to create sub-department. Please try again.'}),
            );
        } else {
            fetchData();
        }
    }, [companyId, departmentId, intl, fetchData, serverUrl, subDeptInput]));

    const handleModifyDepartmentName = useCallback(async () => {
        if (departmentId == null || departmentName == null) {
            Alert.alert(
                intl.formatMessage({id: 'contacts.more_management', defaultMessage: 'More Management'}),
                intl.formatMessage({id: 'contacts.enter_sub_department_first', defaultMessage: 'Please enter a sub-department first'}),
            );
            return;
        }
        const name = await modifyDeptNameInput.showModal({
            title: intl.formatMessage({id: 'contacts.modify_department_name', defaultMessage: 'Modify department name'}),
            placeholder: intl.formatMessage({id: 'contacts.department_name_placeholder', defaultMessage: 'Department name'}),
            defaultValue: departmentName,
            confirmContent: intl.formatMessage({id: 'common.confirm', defaultMessage: 'Confirm'}),
            cancelContent: intl.formatMessage({id: 'common.cancel', defaultMessage: 'Cancel'}),
        });
        if (!name) {
            return;
        }
        const deptRes = await fetchContactDepartment(serverUrl, companyId, departmentId);
        if (deptRes.error || !deptRes.data) {
            Alert.alert(
                intl.formatMessage({id: 'contacts.more_management', defaultMessage: 'More Management'}),
                intl.formatMessage({id: 'contacts.update_department_failed', defaultMessage: 'Failed to update department. Please try again.'}),
            );
            return;
        }
        const res = await updateContactDepartment(
            serverUrl,
            companyId,
            departmentId,
            name,
            deptRes.data.parent_id,
        );
        if (res.error) {
            Alert.alert(
                intl.formatMessage({id: 'contacts.more_management', defaultMessage: 'More Management'}),
                intl.formatMessage({id: 'contacts.update_department_failed', defaultMessage: 'Failed to update department. Please try again.'}),
            );
        } else {
            fetchData();
        }
    }, [companyId, departmentId, departmentName, intl, modifyDeptNameInput, fetchData, serverUrl]);

    const handleModifyEnterpriseName = useCallback(async () => {
        if (departmentId != null) {
            return;
        }
        const currentName = enterpriseDisplayName ?? companyName ?? '';
        const name = await modifyEnterpriseNameInput.showModal({
            title: intl.formatMessage({id: 'contacts.modify_enterprise_name', defaultMessage: 'Modify enterprise name'}),
            placeholder: intl.formatMessage({id: 'contacts.enterprise_name_placeholder', defaultMessage: 'Enterprise name'}),
            defaultValue: currentName,
            confirmContent: intl.formatMessage({id: 'common.confirm', defaultMessage: 'Confirm'}),
            cancelContent: intl.formatMessage({id: 'common.cancel', defaultMessage: 'Cancel'}),
        });
        if (!name) {
            return;
        }
        try {
            const client = NetworkManager.getClient(serverUrl);
            await client.patchTeam({id: companyId, display_name: name.trim()});
            setEnterpriseDisplayName(name.trim());
            fetchData();
        } catch {
            Alert.alert(
                intl.formatMessage({id: 'contacts.more_management', defaultMessage: 'More Management'}),
                intl.formatMessage({id: 'contacts.update_enterprise_failed', defaultMessage: 'Failed to update enterprise. Please try again.'}),
            );
        }
    }, [companyId, intl, modifyEnterpriseNameInput, fetchData, enterpriseDisplayName, companyName, departmentId, serverUrl]);

    const handleMore = usePreventDoubleTap(useCallback(() => {
        const managerMenuText = isCurrentUserOwner ?
            intl.formatMessage({id: 'contacts.manager_management', defaultMessage: 'Manager management'}) :
            intl.formatMessage({id: 'contacts.manager_list', defaultMessage: 'Manager list'});

        const renderContent = () => (
            <>
                <SlideUpPanelItem
                    leftIcon='pencil-outline'
                    text={departmentId == null ?
                        intl.formatMessage({id: 'contacts.modify_enterprise_name', defaultMessage: 'Modify enterprise name'}) :
                        intl.formatMessage({id: 'contacts.modify_department_name', defaultMessage: 'Modify department name'})}
                    onPress={async () => {
                        await dismissBottomSheet();
                        if (departmentId == null) {
                            handleModifyEnterpriseName();
                        } else {
                            handleModifyDepartmentName();
                        }
                    }}
                    testID='contacts.department_detail.manage.more.modify_name'
                />
                <SlideUpPanelItem
                    leftIcon='crown-outline'
                    text={managerMenuText}
                    onPress={openManagerModal}
                    testID='contacts.department_detail.manage.more.manager_management'
                />
                {departmentId != null && memberCount === 0 && (
                    <SlideUpPanelItem
                        leftIcon='trash-can-outline'
                        text={intl.formatMessage({id: 'contacts.delete_department', defaultMessage: 'Delete department'})}
                        onPress={async () => {
                            await dismissBottomSheet();
                            const deptId = departmentId;
                            const deptName = departmentName ?? '';
                            const ok = await new Promise<boolean>((resolve) => {
                                Alert.alert(
                                    intl.formatMessage({id: 'contacts.delete_department', defaultMessage: 'Delete department'}),
                                    intl.formatMessage(
                                        {id: 'contacts.delete_department_confirm', defaultMessage: 'Delete department "{name}"? This cannot be undone.'},
                                        {name: deptName},
                                    ),
                                    [
                                        {text: intl.formatMessage({id: 'common.cancel', defaultMessage: 'Cancel'}), onPress: () => resolve(false)},
                                        {text: intl.formatMessage({id: 'common.confirm', defaultMessage: 'Confirm'}), onPress: () => resolve(true)},
                                    ],
                                );
                            });
                            if (!ok || deptId == null) {
                                return;
                            }
                            const countRes = await fetchEmployeeCountOfDepartment(serverUrl, companyId, deptId);
                            if (countRes.error || (countRes.data ?? 0) > 0) {
                                Alert.alert(
                                    intl.formatMessage({id: 'contacts.more_management', defaultMessage: 'More Management'}),
                                    intl.formatMessage({id: 'contacts.delete_department_has_members', defaultMessage: 'This department has members and cannot be deleted.'}),
                                );
                                return;
                            }
                            const delRes = await deleteContactDepartmentForce(serverUrl, companyId, deptId);
                            if (delRes.error) {
                                Alert.alert(
                                    intl.formatMessage({id: 'contacts.more_management', defaultMessage: 'More Management'}),
                                    intl.formatMessage({id: 'contacts.delete_department_failed', defaultMessage: 'Failed to delete department. Please try again.'}),
                                );
                                return;
                            }
                            setManageMode(false);
                            handleClose();
                        }}
                        testID='contacts.department_detail.manage.more.delete_department'
                    />
                )}
                <SlideUpPanelItem
                    leftIcon='close'
                    text={intl.formatMessage({id: 'common.cancel', defaultMessage: 'Cancel'})}
                    onPress={async () => {
                        await dismissBottomSheet();
                    }}
                    testID='contacts.department_detail.manage.more.cancel'
                />
            </>
        );
        const itemCount = 3 + (departmentId != null && memberCount === 0 ? 1 : 0);
        bottomSheet({
            closeButtonId: 'close-contacts-manage-more',
            renderContent,
            snapPoints: [1, bottomSheetSnapPoint(itemCount, ITEM_HEIGHT)],
            theme,
            title: intl.formatMessage({id: 'contacts.more_management', defaultMessage: 'More Management'}),
        });
    }, [companyId, departmentId, departmentName, intl, isCurrentUserOwner, memberCount, fetchData, serverUrl, theme, handleClose, handleModifyDepartmentName, handleModifyEnterpriseName, openManagerModal]));

    useNavButtonPressed(DEPT_SEARCH_BUTTON_ID, effectiveCloseButtonId, handleSearch, [handleSearch]);
    useNavButtonPressed(DEPT_MANAGE_BUTTON_ID, effectiveCloseButtonId, handleEnterManage, [handleEnterManage]);
    useNavButtonPressed(DEPT_EXIT_MANAGE_BUTTON_ID, effectiveCloseButtonId, handleExitManage, [handleExitManage]);

    useEffect(() => {
        if (onBack || fromEmployeeProfile) {
            return;
        }
        const searchIcon = CompassIcon.getImageSourceSync('magnify', 24, theme.sidebarHeaderTextColor);

        if (manageMode) {
            const closeIcon = CompassIcon.getImageSourceSync('close', 24, theme.sidebarHeaderTextColor);
            mergeNavigationOptions(effectiveCloseButtonId, {
                topBar: {
                    rightButtons: [
                        {
                            id: DEPT_EXIT_MANAGE_BUTTON_ID,
                            icon: closeIcon,
                            testID: 'contacts.department_detail.exit_manage.button',
                        },
                        {
                            id: DEPT_SEARCH_BUTTON_ID,
                            icon: searchIcon,
                            testID: 'contacts.department_detail.search.button',
                        },
                    ],
                },
            });
        } else {
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
        }
    }, [effectiveCloseButtonId, manageMode, onBack, fromEmployeeProfile, theme.sidebarHeaderTextColor]);

    const fetchData = useCallback(async () => {
        if (!mounted.current) {
            return;
        }

        setLoading(true);

        if (!serverUrl) {
            if (mounted.current) {
                setLoading(false);
            }
            return;
        }

        if (departmentId == null) {
            const res = await fetchContactDirectoryContent(serverUrl, companyId, undefined);
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
                fetchDepartmentDetail(serverUrl, companyId, departmentId),
                fetchEmployeeCountOfDepartment(serverUrl, companyId, departmentId),
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
    }, [companyId, departmentId, serverUrl]);

    useEffect(() => {
        mounted.current = true;
        fetchData();
        return () => {
            mounted.current = false;
        };
    }, [fetchData]);

    useOnComponentWillAppear(componentId, fetchData);
    useOnComponentWillAppear(rnnHomeComponentId, fetchData);

    /** 当调用方未传入标签数据时，组件内部加载 ownerId 和 currentUserId */
    useEffect(() => {
        if (ownerId !== undefined && currentUserId !== undefined) {
            return;
        }
        if (!serverUrl || !companyId) {
            return;
        }
        let cancelled = false;
        const load = async () => {
            try {
                const [teamResult, meResult] = await Promise.all([
                    fetchTeamById(serverUrl, companyId),
                    NetworkManager.getClient(serverUrl).getMe(),
                ]);
                if (cancelled) {
                    return;
                }
                if (ownerId === undefined) {
                    setLocalOwnerId(teamResult.team?.creator_id);
                }
                if (currentUserId === undefined) {
                    setLocalCurrentUserId(meResult?.id);
                }
            } catch {
                // 标签降级展示，忽略错误
            }
        };
        load();
        return () => {
            cancelled = true;
        };
    }, [companyId, currentUserId, ownerId, serverUrl]);

    /** 当调用方未传入 managerIds 时，从当前员工列表中加载管理员信息 */
    useEffect(() => {
        if (managerIds !== undefined) {
            return;
        }
        if (!serverUrl || !companyId || employees.length === 0) {
            setLocalManagerIds([]);
            return;
        }
        let cancelled = false;
        const load = async () => {
            const memberIds = employees.map((e) => e.id);
            const result = await getTeamMembersByIds(serverUrl, companyId, memberIds, true);
            if (cancelled || result.error || !result.members) {
                return;
            }
            const mgrIds = result.members.
                filter((m) => m.roles.split(' ').includes('team_admin')).
                map((m) => m.user_id);
            setLocalManagerIds(mgrIds);
        };
        load();
        return () => {
            cancelled = true;
        };
    }, [companyId, employees, managerIds, serverUrl]);

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
                            <View style={styles.listItemMain}>
                                <Text
                                    style={styles.listItemName}
                                    numberOfLines={1}
                                >
                                    {getContactListDisplayName(emp)}
                                </Text>
                                <View style={styles.userTagsWrap}>
                                    {buildEnterpriseUserTagKeys({
                                        userId: emp.id,
                                        ownerId: resolvedOwnerId,
                                        currentUserId: resolvedCurrentUserId,
                                        managerIds: resolvedManagerIds.length > 0 ? new Set(resolvedManagerIds) : undefined,
                                    }).map((tagKey: EnterpriseUserTagKey) => {
                                        const isSelf = tagKey === 'self';
                                        return (
                                            <View
                                                key={`${emp.id}-${tagKey}`}
                                                style={[styles.userTag, isSelf && styles.selfTag]}
                                            >
                                                <Text style={[styles.userTagText, isSelf && styles.selfTagText]}>
                                                    {tagKey === 'owner' ?
                                                        intl.formatMessage({id: 'contacts.owner_tag', defaultMessage: 'Owner'}) :
                                                        tagKey === 'manager' ?
                                                            intl.formatMessage({id: 'contacts.manager_tag', defaultMessage: 'Manager'}) :
                                                            intl.formatMessage({id: 'contacts.self_tag', defaultMessage: 'Self'})
                                                    }
                                                </Text>
                                            </View>
                                        );
                                    })}
                                </View>
                            </View>
                            {manageMode && (
                                <CompassIcon
                                    name='pencil-outline'
                                    size={18}
                                    color={changeOpacity(theme.centerChannelColor, 0.48)}
                                    style={{marginLeft: 8}}
                                />
                            )}
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

    const safeAreaEdges: Edge[] = fromEmployeeProfile? ['bottom']: ['top', 'bottom', 'left', 'right'];

    return (
        <SafeAreaView
            edges={safeAreaEdges}
            style={[
                styles.flex,
                fromEmployeeProfile ? undefined : {backgroundColor: theme.sidebarBg},
            ]}
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
                    <View style={styles.stackHeaderTitleSlot}>
                        <AdaptiveTitleText
                            text={departmentName}
                            textStyle={styles.stackHeaderTitle}
                            testID='contacts.department_detail.header_title'
                        />
                    </View>
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
                        {manageMode ? (
                            <TouchableOpacity
                                onPress={handleExitManage}
                                style={styles.stackHeaderBack}
                                testID='contacts.department_detail.exit_manage.button'
                            >
                                <CompassIcon
                                    name='close'
                                    size={24}
                                    color={theme.sidebarHeaderTextColor}
                                />
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity
                                onPress={handleEnterManage}
                                style={styles.stackHeaderBack}
                                testID='contacts.department_detail.manage.button'
                            >
                                <CompassIcon
                                    name='format-list-bulleted'
                                    size={24}
                                    color={theme.sidebarHeaderTextColor}
                                />
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            ) : null}
            {departmentId !== null && (
            <View style={styles.headerRow}>
                <ScrollView
                    ref={breadcrumbScrollRef}
                    horizontal={true}
                    showsHorizontalScrollIndicator={false}
                    style={styles.breadcrumbScroll}
                    contentContainerStyle={styles.breadcrumbRow}
                    keyboardShouldPersistTaps='handled'
                    onContentSizeChange={scrollBreadcrumbToEnd}
                >
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
                </ScrollView>
            </View>
            )}
            <ScrollView
                style={[styles.flex, {backgroundColor: theme.centerChannelBg}]}
                contentContainerStyle={{paddingBottom: 24}}
                showsVerticalScrollIndicator={false}
            >
                {renderContent()}
            </ScrollView>
            {manageMode && (
                <View style={styles.bottomBar}>
                    <TouchableOpacity
                        style={styles.bottomButton}
                        onPress={handleAddMember}
                        activeOpacity={0.7}
                        testID='contacts.department_detail.manage.add_member'
                    >
                        <Text style={styles.bottomButtonText}>
                            {intl.formatMessage({id: 'contacts.add_member', defaultMessage: 'Add Member'})}
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.bottomButton, {flex: 3}]}
                        onPress={handleAddSubDepartment}
                        activeOpacity={0.7}
                        testID='contacts.department_detail.manage.add_sub_department'
                    >
                        <Text style={styles.bottomButtonText}>
                            {intl.formatMessage({id: 'contacts.add_sub_department', defaultMessage: 'Add Sub-department'})}
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.bottomButton, {flex: 1}]}
                        onPress={handleMore}
                        activeOpacity={0.7}
                        testID='contacts.department_detail.manage.more'
                    >
                        <Text style={styles.bottomButtonText}>
                            {intl.formatMessage({id: 'contacts.more_management', defaultMessage: 'More'})}
                        </Text>
                    </TouchableOpacity>
                </View>
            )}
            <CustomInputModal
                key={subDeptInput.visible ? 'subdept-open' : 'subdept-closed'}
                visible={subDeptInput.visible}
                title={subDeptInput.options.title}
                placeholder={subDeptInput.options.placeholder}
                defaultValue={subDeptInput.options.defaultValue}
                confirmContent={subDeptInput.options.confirmContent}
                showCancelButton={subDeptInput.options.showCancelButton}
                cancelContent={subDeptInput.options.cancelContent}
                onConfirm={subDeptInput.handleConfirm}
                onCancel={subDeptInput.handleCancel}
            />
            <CustomInputModal
                key={modifyDeptNameInput.visible ? 'modify-dept-open' : 'modify-dept-closed'}
                visible={modifyDeptNameInput.visible}
                title={modifyDeptNameInput.options.title}
                placeholder={modifyDeptNameInput.options.placeholder}
                defaultValue={modifyDeptNameInput.options.defaultValue}
                confirmContent={modifyDeptNameInput.options.confirmContent}
                showCancelButton={modifyDeptNameInput.options.showCancelButton}
                cancelContent={modifyDeptNameInput.options.cancelContent}
                onConfirm={modifyDeptNameInput.handleConfirm}
                onCancel={modifyDeptNameInput.handleCancel}
            />
            <CustomInputModal
                key={modifyEnterpriseNameInput.visible ? 'modify-enterprise-open' : 'modify-enterprise-closed'}
                visible={modifyEnterpriseNameInput.visible}
                title={modifyEnterpriseNameInput.options.title}
                placeholder={modifyEnterpriseNameInput.options.placeholder}
                defaultValue={modifyEnterpriseNameInput.options.defaultValue}
                confirmContent={modifyEnterpriseNameInput.options.confirmContent}
                showCancelButton={modifyEnterpriseNameInput.options.showCancelButton}
                cancelContent={modifyEnterpriseNameInput.options.cancelContent}
                onConfirm={modifyEnterpriseNameInput.handleConfirm}
                onCancel={modifyEnterpriseNameInput.handleCancel}
            />
            <TeamManagerModal
                visible={managerVisible}
                companyId={companyId}
                onClose={() => setManagerVisible(false)}
                onChanged={fetchData}
                testIDPrefix='contacts.department_detail.manager_modal'
            />
        </SafeAreaView>
    );
};

export default ContactsDepartmentDetail;
