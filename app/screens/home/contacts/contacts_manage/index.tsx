// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {Alert, ScrollView, Text, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Navigation} from 'react-native-navigation';

import {
    createSubDepartment,
    deleteContactDepartment,
    fetchContactDepartment,
    fetchContactDirectoryContent,
    fetchEmployeeCountOfDepartment,
    updateContactCompany,
    updateContactDepartment,
} from '@actions/remote/contact';
import {type ContactDepartment, type ContactEmployee} from '@client/rest/contact';
import CompassIcon from '@components/compass_icon';
import ContactDirectoryList from '@components/contact_directory_list';
import {CustomInputModal, useCustomInputModal} from '@components/custom_input_modal';
import SlideUpPanelItem, {ITEM_HEIGHT} from '@components/slide_up_panel_item';
import {Screens} from '@constants';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import {usePreventDoubleTap} from '@hooks/utils';
import {bottomSheet, dismissBottomSheet, dismissModals, showModal, showModalWithBackButton} from '@screens/navigation';
import {QR_SCAN_CONTEXT_JOIN_ENTERPRISE, showQrScannerModal} from '@screens/qr_scanner/show_modal';
import {bottomSheetSnapPoint} from '@utils/helpers';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {AvailableScreens} from '@typings/screens/navigation';

const CLOSE_BUTTON_ID = 'close-contacts-manage';

type ManageLevel = {
    departmentId: number | null;
    departmentName?: string;
    breadcrumb: string[];
};

type Props = {
    componentId: AvailableScreens;
    closeButtonId?: string;
    companyId: string;
    companyName?: string;
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
    headerBackWrap: {
        position: 'absolute',
        left: 12,
        top: 0,
        bottom: 0,
        justifyContent: 'center',
        zIndex: 1,
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

const loadContent = async (
    companyIdArg: string,
    departmentIdArg: number | undefined,
    setDepartmentsArg: React.Dispatch<React.SetStateAction<ContactDepartment[]>>,
    setEmployeesArg: React.Dispatch<React.SetStateAction<ContactEmployee[]>>,
    setMemberCountArg: React.Dispatch<React.SetStateAction<number>>,
    setErrorArg: React.Dispatch<React.SetStateAction<boolean>>,
    setLoadingArg: React.Dispatch<React.SetStateAction<boolean>>,
    mounted: React.MutableRefObject<boolean>,
) => {
    setLoadingArg(true);
    setErrorArg(false);
    const res = await fetchContactDirectoryContent(companyIdArg, departmentIdArg);
    if (!mounted.current) {
        return;
    }
    if (res.error) {
        setErrorArg(true);
        setDepartmentsArg([]);
        setEmployeesArg([]);
        setMemberCountArg(0);
    } else if (res.data) {
        setDepartmentsArg(res.data.departments);
        setEmployeesArg(res.data.employees);
        setMemberCountArg(res.data.memberCount);
    }
    setLoadingArg(false);
};

const ContactsManage = ({
    componentId,
    closeButtonId,
    companyId,
    companyName,
    departmentId: initialDepartmentId,
    departmentName: initialDepartmentName,
    breadcrumb: initialBreadcrumb = [],
}: Props) => {
    const theme = useTheme();
    const intl = useIntl();
    const mounted = useRef(false);
    const currentDeptIdRef = useRef<number | null | undefined>(initialDepartmentId ?? null);
    const styles = getStyleSheet(theme);
    const subDeptInput = useCustomInputModal();
    const modifyDeptNameInput = useCustomInputModal();
    const modifyEnterpriseNameInput = useCustomInputModal();

    const [manageStack, setManageStack] = useState<ManageLevel[]>(() => [{
        departmentId: initialDepartmentId ?? null,
        departmentName: initialDepartmentName,
        breadcrumb: initialBreadcrumb,
    }]);
    const [departments, setDepartments] = useState<ContactDepartment[]>([]);
    const [employees, setEmployees] = useState<ContactEmployee[]>([]);
    const [memberCount, setMemberCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [enterpriseDisplayName, setEnterpriseDisplayName] = useState<string | undefined>(companyName);

    const currentLevel = manageStack[manageStack.length - 1];
    const currentDepartmentId = currentLevel?.departmentId ?? null;
    const currentDepartmentName = currentLevel?.departmentName;
    currentDeptIdRef.current = currentDepartmentId;

    const effectiveCloseButtonId = closeButtonId ?? CLOSE_BUTTON_ID;
    const subtitle = currentDepartmentId == null ? (enterpriseDisplayName ?? companyName) : currentDepartmentName;

    const handleClose = useCallback(() => {
        dismissModals(1);
    }, []);

    const handleBack = useCallback(() => {
        if (manageStack.length > 1) {
            setManageStack((prev) => prev.slice(0, -1));
            return;
        }
        if (currentDepartmentId != null) {
            setManageStack([{departmentId: null, departmentName: undefined, breadcrumb: []}]);
        }
    }, [manageStack.length, currentDepartmentId]);

    const refetch = useCallback(() => {
        loadContent(
            companyId,
            currentDeptIdRef.current ?? undefined,
            setDepartments,
            setEmployees,
            setMemberCount,
            setError,
            setLoading,
            mounted,
        );
    }, [companyId]);

    useNavButtonPressed(effectiveCloseButtonId, componentId, handleClose, [handleClose]);
    const handleHardwareBack = useCallback(() => {
        if (currentDepartmentId == null && manageStack.length <= 1) {
            handleClose();
        } else {
            handleBack();
        }
    }, [currentDepartmentId, handleBack, handleClose, manageStack.length]);
    useAndroidHardwareBackHandler(componentId, handleHardwareBack);

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    useEffect(() => {
        const listener = Navigation.events().registerComponentWillAppearListener(({componentId: appearedId}) => {
            if (appearedId === componentId) {
                refetch();
            }
        });

        return () => listener.remove();
    }, [componentId, refetch]);

    useEffect(() => {
        const top = manageStack[manageStack.length - 1];
        if (!top) {
            return;
        }
        loadContent(
            companyId,
            top.departmentId ?? undefined,
            setDepartments,
            setEmployees,
            setMemberCount,
            setError,
            setLoading,
            mounted,
        );
    }, [companyId, manageStack]);

    useEffect(() => {
        if (currentDepartmentId == null && companyName != null) {
            setEnterpriseDisplayName(companyName);
        }
    }, [currentDepartmentId, companyName]);

    const handleDepartmentPress = usePreventDoubleTap(useCallback((dept: ContactDepartment) => {
        const top = manageStack[manageStack.length - 1];
        const prevBreadcrumb = top?.breadcrumb ?? [];
        const prevDeptName = top?.departmentName;
        const newBreadcrumb = prevBreadcrumb.length > 0 ? [...prevBreadcrumb, dept.name] : [
            intl.formatMessage({id: 'contacts.enterprise', defaultMessage: 'Enterprise Contacts'}),
            prevDeptName ?? dept.name,
            dept.name,
        ];
        setManageStack((prev) => [...prev, {
            departmentId: dept.id,
            departmentName: dept.name,
            breadcrumb: newBreadcrumb,
        }]);
    }, [manageStack, intl]));

    const handleEmployeePress = usePreventDoubleTap(useCallback((employee: ContactEmployee) => {
        const title = intl.formatMessage({id: 'contacts.personal_info', defaultMessage: 'Personal Information'});
        const deptName = currentDepartmentName ?? intl.formatMessage({id: 'contacts.default_department', defaultMessage: 'Default Department'});
        showModalWithBackButton(
            Screens.CONTACTS_EMPLOYEE_PROFILE,
            title,
            `close-employee-${employee.id}`,
            {
                employee,
                departmentName: deptName,
                companyName,
                departmentId: currentDepartmentId ?? undefined,
                companyId,
                fromManage: true,
                closeButtonId: `close-employee-${employee.id}`,
            },
            {useBackIcon: true},
        );
    }, [companyId, companyName, currentDepartmentId, currentDepartmentName, intl]));

    const handleAddMember = usePreventDoubleTap(useCallback(() => {
        const targetDepartmentId: number | null = currentDepartmentId ?? null;
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
                    testID='contacts.manage.add_member.scan_qr'
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
                    testID='contacts.manage.add_member.invite'
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
    }, [intl, theme]));

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
        const res = await createSubDepartment(companyId, name, currentDepartmentId ?? undefined);
        if (res.error) {
            Alert.alert(
                intl.formatMessage({id: 'contacts.add_sub_department', defaultMessage: 'Add Sub-department'}),
                intl.formatMessage({id: 'contacts.add_sub_department_failed', defaultMessage: 'Failed to create sub-department. Please try again.'}),
            );
        } else {
            refetch();
        }
    }, [companyId, currentDepartmentId, intl, refetch, subDeptInput]));

    const handleModifyDepartmentName = useCallback(async () => {
        if (currentDepartmentId == null || currentDepartmentName == null) {
            Alert.alert(
                intl.formatMessage({id: 'contacts.more_management', defaultMessage: 'More Management'}),
                intl.formatMessage({id: 'contacts.enter_sub_department_first', defaultMessage: 'Please enter a sub-department first'}),
            );
            return;
        }
        const name = await modifyDeptNameInput.showModal({
            title: intl.formatMessage({id: 'contacts.modify_department_name', defaultMessage: 'Modify department name'}),
            placeholder: intl.formatMessage({id: 'contacts.department_name_placeholder', defaultMessage: 'Department name'}),
            defaultValue: currentDepartmentName,
            confirmContent: intl.formatMessage({id: 'common.confirm', defaultMessage: 'Confirm'}),
            cancelContent: intl.formatMessage({id: 'common.cancel', defaultMessage: 'Cancel'}),
        });
        if (!name) {
            return;
        }
        const deptRes = await fetchContactDepartment(companyId, currentDepartmentId);
        if (deptRes.error || !deptRes.data) {
            Alert.alert(
                intl.formatMessage({id: 'contacts.more_management', defaultMessage: 'More Management'}),
                intl.formatMessage({id: 'contacts.update_department_failed', defaultMessage: 'Failed to update department. Please try again.'}),
            );
            return;
        }
        const res = await updateContactDepartment(
            currentDepartmentId,
            companyId,
            name,
            deptRes.data.parent_id,
        );
        if (res.error) {
            Alert.alert(
                intl.formatMessage({id: 'contacts.more_management', defaultMessage: 'More Management'}),
                intl.formatMessage({id: 'contacts.update_department_failed', defaultMessage: 'Failed to update department. Please try again.'}),
            );
        } else {
            refetch();
        }
    }, [companyId, currentDepartmentId, currentDepartmentName, intl, modifyDeptNameInput, refetch]);

    const handleModifyEnterpriseName = useCallback(async () => {
        if (currentDepartmentId != null) {
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
        const res = await updateContactCompany(companyId, name);
        if (res.error) {
            Alert.alert(
                intl.formatMessage({id: 'contacts.more_management', defaultMessage: 'More Management'}),
                intl.formatMessage({id: 'contacts.update_enterprise_failed', defaultMessage: 'Failed to update enterprise. Please try again.'}),
            );
        } else {
            setEnterpriseDisplayName(name);
            refetch();
        }
    }, [companyId, intl, modifyEnterpriseNameInput, refetch, enterpriseDisplayName, companyName, currentDepartmentId]);

    const handleMore = usePreventDoubleTap(useCallback(() => {
        /* 批量设置成员信息暂不启用，enterSubFirst 仅该功能使用
        const enterSubFirst = () => {
            Alert.alert(
                intl.formatMessage({id: 'contacts.more_management', defaultMessage: 'More Management'}),
                intl.formatMessage({id: 'contacts.enter_sub_department_first', defaultMessage: 'Please enter a sub-department first'}),
            );
        };
        */
        const renderContent = () => (
            <>
                <SlideUpPanelItem
                    leftIcon='pencil-outline'
                    text={currentDepartmentId == null ? intl.formatMessage({id: 'contacts.modify_enterprise_name', defaultMessage: 'Modify enterprise name'}) : intl.formatMessage({id: 'contacts.modify_department_name', defaultMessage: 'Modify department name'})}
                    onPress={async () => {
                        await dismissBottomSheet();
                        if (currentDepartmentId == null) {
                            handleModifyEnterpriseName();
                        } else {
                            handleModifyDepartmentName();
                        }
                    }}
                    testID='contacts.manage.more.modify_name'
                />
                <SlideUpPanelItem
                    leftIcon='account-multiple-outline'
                    text={intl.formatMessage({id: 'contacts.batch_move_members', defaultMessage: 'Batch move members'})}
                    onPress={async () => {
                        await dismissBottomSheet();
                        let sourceId: number | null;
                        let sourceName: string;
                        if (currentDepartmentId == null) {
                            // 根目录：浏览从根开始，源部门 ID 交由弹窗内部按默认部门处理
                            sourceId = null;
                            sourceName = intl.formatMessage({id: 'contacts.root_default_department', defaultMessage: 'Root (default department)'});
                        } else {
                            sourceId = currentDepartmentId;
                            sourceName = currentDepartmentName ?? '';
                        }
                        showModalWithBackButton(
                            Screens.CONTACTS_BATCH_MOVE_MEMBERS,
                            intl.formatMessage({id: 'contacts.move_members', defaultMessage: 'Move members'}),
                            'close-contacts-batch-move',
                            {
                                companyId,
                                sourceDepartmentId: sourceId,
                                sourceDepartmentName: sourceName,
                                onSuccess: refetch,
                            },
                            {useBackIcon: true, topBar: {visible: false}},
                        );
                    }}
                    testID='contacts.manage.more.batch_move'
                />
                {/* 批量设置成员信息 - 暂不启用
                <SlideUpPanelItem
                    leftIcon='table-settings'
                    text={intl.formatMessage({id: 'contacts.batch_set_member_info', defaultMessage: 'Batch set member info'})}
                    onPress={async () => {
                        await dismissBottomSheet();
                        if (currentDepartmentId == null) {
                            enterSubFirst();
                        } else {
                            showModalWithBackButton(
                                Screens.CONTACTS_BATCH_SET_MEMBER_INFO,
                                intl.formatMessage({id: 'contacts.batch_set_member_info', defaultMessage: 'Batch set member info'}),
                                'close-contacts-batch-set-info',
                                {
                                    companyId,
                                    departmentId: currentDepartmentId,
                                    departmentName: currentDepartmentName ?? '',
                                    initialEmployees: employees,
                                    onSuccess: refetch,
                                },
                                {useBackIcon: true, topBar: {visible: false}},
                            );
                        }
                    }}
                    testID='contacts.manage.more.batch_set'
                />
                */}
                {currentDepartmentId != null && memberCount === 0 && (
                    <SlideUpPanelItem
                        leftIcon='trash-can-outline'
                        text={intl.formatMessage({id: 'contacts.delete_department', defaultMessage: 'Delete department'})}
                        onPress={async () => {
                            await dismissBottomSheet();
                            const deptId = currentDepartmentId;
                            const deptName = currentDepartmentName ?? '';
                            const ok = await new Promise<boolean>((resolve) => {
                                Alert.alert(
                                    intl.formatMessage({id: 'contacts.delete_department', defaultMessage: 'Delete department'}),
                                    intl.formatMessage(
                                        {id: 'contacts.delete_department_confirm', defaultMessage: 'Delete department "{name}"? This cannot be undone.'},
                                        {name: deptName},
                                    ),
                                    [
                                        {text: intl.formatMessage({id: 'contacts.cancel', defaultMessage: 'Cancel'}), onPress: () => resolve(false)},
                                        {text: intl.formatMessage({id: 'common.confirm', defaultMessage: 'Confirm'}), onPress: () => resolve(true)},
                                    ],
                                );
                            });
                            if (!ok || deptId == null) {
                                return;
                            }
                            const countRes = await fetchEmployeeCountOfDepartment(companyId, deptId);
                            if (countRes.error || (countRes.data ?? 0) > 0) {
                                Alert.alert(
                                    intl.formatMessage({id: 'contacts.more_management', defaultMessage: 'More Management'}),
                                    intl.formatMessage({id: 'contacts.delete_department_has_members', defaultMessage: 'This department has members and cannot be deleted.'}),
                                );
                                return;
                            }
                            const delRes = await deleteContactDepartment(companyId, deptId);
                            if (delRes.error) {
                                Alert.alert(
                                    intl.formatMessage({id: 'contacts.more_management', defaultMessage: 'More Management'}),
                                    intl.formatMessage({id: 'contacts.delete_department_failed', defaultMessage: 'Failed to delete department. Please try again.'}),
                                );
                                return;
                            }
                            refetch();
                            handleBack();
                        }}
                        testID='contacts.manage.more.delete_department'
                    />
                )}
                <SlideUpPanelItem
                    leftIcon='close'
                    text={intl.formatMessage({id: 'contacts.cancel', defaultMessage: 'Cancel'})}
                    onPress={async () => {
                        await dismissBottomSheet();
                    }}
                    testID='contacts.manage.more.cancel'
                />
            </>
        );
        const itemCount = 3 + (currentDepartmentId != null && memberCount === 0 ? 1 : 0);
        bottomSheet({
            closeButtonId: 'close-contacts-manage-more',
            renderContent,
            snapPoints: [1, bottomSheetSnapPoint(itemCount, ITEM_HEIGHT)],
            theme,
            title: intl.formatMessage({id: 'contacts.more_management', defaultMessage: 'More Management'}),
        });
    }, [companyId, currentDepartmentId, currentDepartmentName, employees, intl, memberCount, refetch, theme, handleBack, handleModifyDepartmentName, handleModifyEnterpriseName]));

    return (
        <SafeAreaView
            edges={['bottom']}
            style={styles.flex}
            testID='contacts.manage.screen'
        >
            <View style={styles.header}>
                {(manageStack.length > 1 || currentDepartmentId != null) ? (
                    <TouchableOpacity
                        style={styles.headerBackWrap}
                        onPress={handleBack}
                        hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                        testID='contacts.manage.back'
                    >
                        <CompassIcon
                            name='arrow-left'
                            size={24}
                            color={theme.sidebarText}
                        />
                    </TouchableOpacity>
                ) : null}
                <View style={styles.headerCenter}>
                    <Text
                        style={styles.headerTitle}
                        numberOfLines={1}
                    >
                        {intl.formatMessage({id: 'contacts.manage_contacts', defaultMessage: 'Manage Contacts'})}
                    </Text>
                    {subtitle ? (
                        <Text
                            style={styles.headerSubtitle}
                            numberOfLines={1}
                        >
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
            <CustomInputModal
                key={subDeptInput.visible ? 'subdept-open' : 'subdept-closed'}
                visible={subDeptInput.visible}
                title={subDeptInput.options.title}
                placeholder={subDeptInput.options.placeholder}
                defaultValue={subDeptInput.options.defaultValue}
                confirmContent={subDeptInput.options.confirmContent}
                showCancelButton={subDeptInput.options.showCancelButton}
                cancelContent={subDeptInput.options.cancelContent}
                theme={theme}
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
                theme={theme}
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
                theme={theme}
                onConfirm={modifyEnterpriseNameInput.handleConfirm}
                onCancel={modifyEnterpriseNameInput.handleCancel}
            />
        </SafeAreaView>
    );
};

export default ContactsManage;
