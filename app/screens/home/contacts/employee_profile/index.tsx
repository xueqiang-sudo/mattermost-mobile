// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import Clipboard from '@react-native-clipboard/clipboard';
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useIntl} from 'react-intl';
import {Alert, DeviceEventEmitter, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {type Edge, SafeAreaView} from 'react-native-safe-area-context';

import {makeGroupChannel} from '@actions/remote/channel';
import {removeEmployeeContact, updateEmployeeContact} from '@actions/remote/employee_contact_new';
import {fetchTeamById, getTeamMembersByIds, removeUserFromTeam} from '@actions/remote/team';
import Button from '@components/button';
import CompassIcon from '@components/compass_icon';
import ContactAvatar from '@components/contact_avatar';
import CustomInputModal from '@components/custom_input_modal/custom_input_modal';
import {useCustomInputModal} from '@components/custom_input_modal/use_custom_input_modal';
import {MESSAGE_TYPE, SNACK_BAR_TYPE} from '@constants/snack_bar';
import {Events, Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import {usePreventDoubleTap} from '@hooks/utils';
import NetworkManager from '@managers/network_manager';
import {dismissModal, showModalWithBackButton} from '@screens/navigation';
import {getContactListDisplayName} from '@utils/contact_section';
import {buildClipboardTextFromLines} from '@utils/contact_profile_clipboard';
import {buildEnterpriseUserTagKeys, type EnterpriseUserTagKey} from '@utils/enterprise_user_tags';
import {DEPARTMENT_PATH_DISPLAY_MAX_LENGTH, formatPathForDisplay} from '@utils/department_path';
import {showSnackBar} from '@utils/snack_bar';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {MMEmployeeContactType, TeamBusinessRole, BusinessRoleDef} from '@client/rest/team_department';
import type {AvailableScreens} from '@typings/screens/navigation';

const CLOSE_BUTTON_ID = 'close-contacts-employee-profile';

const SAFE_AREA_EDGES: Edge[] = ['top', 'bottom', 'left', 'right'];

type Props = {
    componentId: AvailableScreens;
    closeButtonId?: string;
    employee: UserProfile;
    departmentName?: string;
    departmentParentPath?: string;
    currentUserId?: string;

    /** 从管理界面进入时用于「设置部门」：每人只能属于一个部门 */
    departmentId?: number;
    companyId?: string;
    companyName?: string;

    /** 从管理界面进入时为 true，显示「设置部门」入口 */
    fromManage?: boolean;

    /** 供应商/客户关系描述 */
    description?: string;

    /** 供应商/客户备注名；列表与详情优先于对方昵称展示 */
    remark?: string;

    /** 供应商/客户关系类型 */
    relationType?: string;

    /** 供应商/客户关系来源 (manual | erp) */
    relationSource?: string;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    flex: {flex: 1},
    scrollContent: {
        paddingHorizontal: 0,
        paddingBottom: 32,
    },
    avatarSection: {
        alignItems: 'center',
        paddingVertical: 24,
    },
    avatar: {},
    detailGrid: {
        paddingHorizontal: 16,
        marginBottom: 20,
    },
    detailRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    detailLabel: {
        ...typography('Body', 100),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        width: 72,
    },
    detailValue: {
        ...typography('Body', 200),
        color: theme.centerChannelColor,
        flex: 1,
    },
    detailValueDisabled: {
        color: changeOpacity(theme.centerChannelColor, 0.4),
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
    },
    detailInput: {
        ...typography('Body', 200),
        color: theme.centerChannelColor,
        flex: 1,
        padding: 0,
    },
    sectionTitle: {
        ...typography('Body', 100, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.72),
        marginBottom: 12,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    sectionTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
        gap: 8,
    },
    sectionTitleInRow: {
        ...typography('Body', 100, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.72),
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        flex: 1,
        marginBottom: 0,
    },
    copyInfoButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 8,
        backgroundColor: changeOpacity(theme.linkColor, 0.08),
        flexShrink: 0,
    },
    copyInfoButtonText: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.linkColor,
        marginLeft: 6,
    },
    card: {
        backgroundColor: theme.centerChannelBg,
        borderRadius: 12,
        padding: 0,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.08),
        overflow: 'hidden',
    },
    cardRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.04),
    },
    cardRowLast: {
        borderBottomWidth: 0,
    },
    cardLabel: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        width: 90,
    },
    cardValue: {
        ...typography('Body', 200),
        color: theme.centerChannelColor,
        flex: 1,
    },
    cardValueWrap: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    cardValueColumn: {
        flex: 1,
        flexDirection: 'column',
    },
    cardValueSecondary: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.64),
        flex: 1,
        marginTop: 2,
    },
    cardValueSingleLineWrap: {
        flex: 1,
        justifyContent: 'center',
        alignSelf: 'stretch',
    },
    departmentValueWithAction: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        minWidth: 0,
    },
    departmentValueWrap: {
        flex: 1,
        minWidth: 0,
    },
    changeDepartmentInline: {
        flexDirection: 'row',
        alignItems: 'center',
        marginLeft: 12,
        paddingVertical: 6,
        paddingHorizontal: 8,
        borderRadius: 6,
        backgroundColor: changeOpacity(theme.linkColor, 0.08),
    },
    changeDepartmentText: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.linkColor,
        marginRight: 4,
    },
    relationBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        marginTop: 8,
    },
    relationBadgeText: {
        ...typography('Body', 100, 'SemiBold'),
        marginLeft: 6,
    },
    selfTag: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        backgroundColor: changeOpacity(theme.onlineIndicator, 0.12),
    },
    selfTagText: {
        ...typography('Body', 75, 'SemiBold'),
        color: theme.onlineIndicator,
    },
    tagsRow: {
        marginTop: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    ownerTag: {
        backgroundColor: changeOpacity(theme.buttonBg, 0.14),
    },
    ownerTagText: {
        color: theme.buttonBg,
    },
    managerTag: {
        backgroundColor: changeOpacity(theme.buttonBg, 0.14),
    },
    managerTagText: {
        color: theme.buttonBg,
    },
    buttonSection: {
        paddingHorizontal: 16,
        paddingTop: 8,
    },
    sendButton: {
        marginBottom: 12,
    },
    deleteButton: {
        marginTop: 0,
    },
}));

const ContactsEmployeeProfile = ({
    componentId,
    closeButtonId,
    employee,
    departmentName,
    departmentParentPath,
    departmentId,
    companyId: companyIdProp,
    companyName,
    currentUserId,
    fromManage = false,
    description,
    remark,
    relationType,
    relationSource,
}: Props) => {
    const theme = useTheme();
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const styles = getStyleSheet(theme);
    const [sending, setSending] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [relationDescription, setRelationDescription] = useState(() => description ?? '');
    const [relationRemark, setRelationRemark] = useState(() => remark?.trim() ?? '');
    const [isCompanyOwner, setIsCompanyOwner] = useState(false);

    // 管理模式下的可编辑字段
    const [editNickname, setEditNickname] = useState(() => employee.nickname ?? '');
    const [editEmail, setEditEmail] = useState(() => employee.email ?? '');
    const [editPhone, setEditPhone] = useState(() => employee.phone ?? '');
    const [editPosition, setEditPosition] = useState(() => employee.position ?? '');
    const [saving, setSaving] = useState(false);

    // 业务角色状态
    const [businessRoles, setBusinessRoles] = useState<TeamBusinessRole[]>([]);
    const [roleDefs, setRoleDefs] = useState<BusinessRoleDef[]>([]);
    const [showRoleModal, setShowRoleModal] = useState(false);
    const [selectedRoleKeys, setSelectedRoleKeys] = useState<Set<string>>(new Set());
    const [savingRoles, setSavingRoles] = useState(false);

    const handleSaveProfile = usePreventDoubleTap(useCallback(async () => {
        if (!serverUrl || saving) {
            return;
        }
        setSaving(true);
        try {
            const client = NetworkManager.getClient(serverUrl);
            await client.patchUser({
                id: employee.id,
                nickname: editNickname,
                email: editEmail,
                phone: editPhone,
                position: editPosition,
            });
            dismissModal({componentId});
        } catch (e) {
            Alert.alert(
                intl.formatMessage({id: 'mobile.edit_profile.error', defaultMessage: 'Failed to save profile'}),
            );
        } finally {
            setSaving(false);
        }
    }, [serverUrl, saving, employee.id, editNickname, editEmail, editPhone, editPosition, intl, componentId]));

    /** 企业所有者 ID（用于标签计算） */
    const [companyOwnerId, setCompanyOwnerId] = useState<string | undefined>();

    /** 当前查看的员工所在企业的管理员 ID 集合 */
    const [companyManagerIds, setCompanyManagerIds] = useState<Set<string> | undefined>();
    const remarkEditInput = useCustomInputModal();
    const relationDescriptionEditInput = useCustomInputModal();

    useEffect(() => {
        setRelationDescription(description ?? '');
    }, [description]);

    useEffect(() => {
        setRelationRemark(remark?.trim() ?? '');
    }, [remark]);

    useEffect(() => {
        let cancelled = false;

        const loadCompanyOwner = async () => {
            if (!companyIdProp || !serverUrl) {
                if (!cancelled) {
                    setIsCompanyOwner(false);
                    setCompanyOwnerId(undefined);
                    setCompanyManagerIds(undefined);
                }
                return;
            }

            const [teamResult, memberResult] = await Promise.all([
                fetchTeamById(serverUrl, companyIdProp),
                getTeamMembersByIds(serverUrl, companyIdProp, [employee.id], true),
            ]);
            const ownerId = teamResult.team?.creator_id;
            const memberRoles = memberResult.members?.[0]?.roles ?? '';
            const isManager = memberRoles.split(' ').includes('team_admin');
            if (!cancelled) {
                setIsCompanyOwner(Boolean(ownerId && ownerId === employee.id));
                setCompanyOwnerId(ownerId);
                setCompanyManagerIds(isManager ? new Set([employee.id]) : undefined);
            }
        };

        loadCompanyOwner();

        return () => {
            cancelled = true;
        };
    }, [companyIdProp, employee.id, serverUrl]);

    // 加载业务角色
    useEffect(() => {
        if (!companyIdProp || !serverUrl || !fromManage) {
            return;
        }

        let cancelled = false;

        const loadRoles = async () => {
            try {
                const client = NetworkManager.getClient(serverUrl);
                const [roles, defs] = await Promise.all([
                    client.fetchBusinessRoles(companyIdProp),
                    client.fetchBusinessRoleDefs(companyIdProp),
                ]);
                if (!cancelled) {
                    setBusinessRoles(roles.filter((r) => r.user_id === employee.id));
                    setRoleDefs(defs);
                    setSelectedRoleKeys(new Set(roles.filter((r) => r.user_id === employee.id).map((r) => r.role_key)));
                }
            } catch (e) {
                // 静默失败，不阻塞主流程
            }
        };

        loadRoles();

        return () => {
            cancelled = true;
        };
    }, [companyIdProp, employee.id, serverUrl, fromManage]);

    // 保存业务角色
    const handleSaveRoles = usePreventDoubleTap(useCallback(async () => {
        if (!companyIdProp || !serverUrl) {
            return;
        }

        setSavingRoles(true);
        try {
            const client = NetworkManager.getClient(serverUrl);
            const currentKeys = new Set(businessRoles.filter((r) => r.user_id === employee.id).map((r) => r.role_key));

            // 找出需要添加的角色
            const toAdd = Array.from(selectedRoleKeys).filter((key) => !currentKeys.has(key));
            // 找出需要移除的角色
            const toRemove = Array.from(currentKeys).filter((key) => !selectedRoleKeys.has(key));

            // 批量操作
            await Promise.all([
                ...toAdd.map((roleKey) => client.grantBusinessRole(companyIdProp, employee.id, roleKey)),
                ...toRemove.map((roleKey) => client.revokeBusinessRole(companyIdProp, employee.id, roleKey)),
            ]);

            // 刷新角色列表
            const updatedRoles = await client.fetchBusinessRoles(companyIdProp);
            setBusinessRoles(updatedRoles.filter((r) => r.user_id === employee.id));
            setShowRoleModal(false);
            showSnackBar({
                barType: SNACK_BAR_TYPE.INFO_COPIED,
                type: MESSAGE_TYPE.SUCCESS,
                message: intl.formatMessage({id: 'contacts.role_saved', defaultMessage: '角色保存成功'}),
            });
        } catch (e) {
            Alert.alert(
                intl.formatMessage({id: 'contacts.role_save_failed', defaultMessage: '角色保存失败'}),
            );
        } finally {
            setSavingRoles(false);
        }
    }, [companyIdProp, employee.id, serverUrl, businessRoles, selectedRoleKeys, intl]));

    const handleClose = useCallback(() => {
        dismissModal({componentId});
    }, [componentId]);

    useNavButtonPressed(closeButtonId ?? CLOSE_BUTTON_ID, componentId, handleClose, [handleClose]);
    useAndroidHardwareBackHandler(componentId, handleClose);

    const isErpRelation = relationSource === 'erp';
    const canEditRelationFields = Boolean(relationType && currentUserId && !isErpRelation);

    const updateRelationFields = useCallback(async (nextRemark: string, nextDescription: string) => {
        if (!relationType || !currentUserId) {
            return false;
        }
        const result = await updateEmployeeContact(serverUrl, currentUserId, employee.id, relationType as MMEmployeeContactType, {
            remark: nextRemark.trim() || undefined,
            description: nextDescription.trim() || undefined,
        });
        if (result.error) {
            Alert.alert(
                intl.formatMessage({id: 'supplier_customer.error_title', defaultMessage: 'Error'}),
                intl.formatMessage({id: 'supplier_customer.error_update_relation', defaultMessage: 'Could not update. If the relationship was removed, add the contact again.'}),
            );
            return false;
        }
        setRelationRemark(nextRemark.trim());
        setRelationDescription(nextDescription.trim());
        DeviceEventEmitter.emit(Events.SUPPLIER_CUSTOMER_CONTACTS_CHANGED, {contactType: relationType});
        return true;
    }, [currentUserId, employee.id, intl, relationType, serverUrl]);

    const handleEditRemark = usePreventDoubleTap(useCallback(async () => {
        if (!canEditRelationFields) {
            return;
        }
        const nextValue = await remarkEditInput.showModal({
            title: intl.formatMessage({id: 'supplier_customer.field_remark', defaultMessage: 'Remark name'}),
            placeholder: intl.formatMessage({id: 'supplier_customer.add_remark_placeholder', defaultMessage: 'e.g. ACME purchasing contact'}),
            defaultValue: relationRemark,
        });
        if (nextValue === null || nextValue.trim() === relationRemark.trim()) {
            return;
        }
        await updateRelationFields(nextValue, relationDescription);
    }, [canEditRelationFields, intl, relationDescription, relationRemark, remarkEditInput, updateRelationFields]));

    const handleEditRelationDescription = usePreventDoubleTap(useCallback(async () => {
        if (!canEditRelationFields) {
            return;
        }
        const nextValue = await relationDescriptionEditInput.showModal({
            title: intl.formatMessage({id: 'supplier_customer.relation', defaultMessage: 'Relation description'}),
            placeholder: intl.formatMessage({id: 'supplier_customer.field_description_edit_placeholder', defaultMessage: 'How do you work together? Add context—for example projects, roles, or reminders—for yourself and your enterprise. (optional)'}),
            defaultValue: relationDescription,
        });
        if (nextValue === null || nextValue.trim() === relationDescription.trim()) {
            return;
        }
        await updateRelationFields(relationRemark, nextValue);
    }, [canEditRelationFields, intl, relationDescription, relationDescriptionEditInput, relationRemark, updateRelationFields]));

    const resolveMattermostUserId = useCallback(async (): Promise<string | null> => {
        if (!serverUrl) {
            return null;
        }
        const client = NetworkManager.getClient(serverUrl);
        try {
            if (employee.email) {
                const user = await client.getUserByEmail(employee.email);
                return user?.id ?? null;
            }
            return employee.id;
        } catch {
            return employee.id;
        }
    }, [serverUrl, employee.id, employee.email]);

    const isSelf = Boolean(currentUserId && employee.id && currentUserId === employee.id);
    const profileTagKeys = buildEnterpriseUserTagKeys({
        userId: employee.id,
        ownerId: companyOwnerId,
        currentUserId,
        managerIds: companyManagerIds,
    });

    const handleSendMessage = usePreventDoubleTap(useCallback(async () => {
        if (!serverUrl || sending || isSelf) {
            return;
        }
        setSending(true);
        const userId = await resolveMattermostUserId();
        if (!userId) {
            setSending(false);
            Alert.alert(
                '',
                intl.formatMessage({
                    id: 'mobile.open_gm.error',
                    defaultMessage: "We couldn't open a discussion group with those users. Please check your connection and try again.",
                }),
            );
            return;
        }
        const result = await makeGroupChannel(serverUrl, [userId], true);
        setSending(false);
        if (result.error) {
            Alert.alert(
                '',
                intl.formatMessage({
                    id: 'mobile.open_gm.error',
                    defaultMessage: "We couldn't open a discussion group with those users. Please check your connection and try again.",
                }),
            );
            return;
        }
        handleClose();
    }, [serverUrl, sending, isSelf, resolveMattermostUserId, employee, intl, handleClose]));

    const canSendMessage = !isSelf && Boolean(employee.email || employee.id);

    const canChangeDepartment = fromManage && Boolean(companyIdProp);

    const handleChangeDepartment = usePreventDoubleTap(useCallback(() => {
        if (!canChangeDepartment || !companyIdProp) {
            return;
        }
        const sourceName = departmentName ??
            intl.formatMessage({id: 'contacts.root_default_department', defaultMessage: 'Root (default department)'});
        showModalWithBackButton(
            Screens.CONTACTS_BATCH_MOVE_MEMBERS,
            intl.formatMessage({id: 'contacts.move_members', defaultMessage: 'Move members'}),
            'close-contacts-batch-move-single',
            {
                companyId: companyIdProp,
                sourceDepartmentId: departmentId ?? null,
                sourceDepartmentName: sourceName,
                singleEmployeeId: employee.id,
                singleEmployeeName: getContactListDisplayName(employee),
                onSuccess: handleClose,
            },
            {useBackIcon: true, topBar: {visible: false}},
        );
    }, [canChangeDepartment, companyIdProp, departmentId, departmentName, employee.id, intl, handleClose]));

    const isSupplierCustomer = Boolean(relationType);

    const departmentClipboardValue = useMemo(() => {
        if (!departmentName?.trim() && !departmentParentPath?.trim()) {
            return '';
        }
        if (departmentParentPath?.includes('/')) {
            const pathDisplay = formatPathForDisplay(
                departmentParentPath.split('/').filter(Boolean),
                DEPARTMENT_PATH_DISPLAY_MAX_LENGTH,
                '/',
                intl.formatMessage({id: 'contacts.enterprise', defaultMessage: 'Enterprise Contacts'}),
            );
            const namePart = departmentName?.trim() ?? '';
            if (namePart && pathDisplay) {
                return `${namePart} — ${pathDisplay}`;
            }
            return namePart || pathDisplay;
        }
        return departmentName?.trim() ?? '';
    }, [departmentName, departmentParentPath, intl]);

    const canDeleteEnterpriseMember = fromManage && Boolean(companyIdProp) && !isSelf && !isCompanyOwner;
    const canDelete = (canDeleteEnterpriseMember || isSupplierCustomer) && !isErpRelation;

    const handleDeleteRelation = usePreventDoubleTap(useCallback(async () => {
        if (!isSupplierCustomer || deleting) {
            return;
        }
        const relationLabel = relationType === 'supplier'
            ? intl.formatMessage({id: 'supplier_customer.type_supplier', defaultMessage: 'Supplier'})
            : relationType === 'customer'
                ? intl.formatMessage({id: 'supplier_customer.type_customer', defaultMessage: 'Customer'})
                : intl.formatMessage({id: 'contacts.external', defaultMessage: 'External Contact'});
        const confirmName = relationRemark.trim() || getContactListDisplayName(employee);
        const ok = await new Promise<boolean>((resolve) => {
            Alert.alert(
                intl.formatMessage({id: 'supplier_customer.delete_relation', defaultMessage: 'Remove {relation}'}, {relation: relationLabel}),
                intl.formatMessage(
                    {id: 'supplier_customer.delete_relation_confirm', defaultMessage: 'Remove {relation} relationship with {name}? This action cannot be undone.'},
                    {name: confirmName, relation: relationLabel},
                ),
                [
                    {text: intl.formatMessage({id: 'common.cancel', defaultMessage: 'Cancel'}), style: 'cancel', onPress: () => resolve(false)},
                    {text: intl.formatMessage({id: 'common.confirm', defaultMessage: 'Confirm'}), onPress: () => resolve(true)},
                ],
            );
        });
        if (!ok) {
            return;
        }
        setDeleting(true);
        if (!serverUrl || !currentUserId || !relationType) {
            setDeleting(false);
            return;
        }
        const result = await removeEmployeeContact(serverUrl, currentUserId, employee.id, relationType as MMEmployeeContactType);
        setDeleting(false);
        if (result.error) {
            Alert.alert(
                '',
                intl.formatMessage({id: 'supplier_customer.delete_failed', defaultMessage: 'Failed to remove. Please try again.'}),
            );
            return;
        }
        handleClose();
    }, [isSupplierCustomer, relationType, deleting, employee.id, relationRemark, handleClose, intl, serverUrl, currentUserId]));

    const handleDeleteMember = usePreventDoubleTap(useCallback(async () => {
        if (isSupplierCustomer) {
            await handleDeleteRelation();
            return;
        }
        if (!canDeleteEnterpriseMember || deleting) {
            return;
        }
        const ok = await new Promise<boolean>((resolve) => {
            Alert.alert(
                intl.formatMessage({id: 'contacts.delete_member', defaultMessage: 'Remove from enterprise'}),
                intl.formatMessage(
                    {id: 'contacts.delete_member_confirm', defaultMessage: 'Remove {name} from this enterprise and all associated departments? This action cannot be undone.'},
                    {name: getContactListDisplayName(employee)},
                ),
                [
                    {text: intl.formatMessage({id: 'common.cancel', defaultMessage: 'Cancel'}), style: 'cancel', onPress: () => resolve(false)},
                    {text: intl.formatMessage({id: 'common.confirm', defaultMessage: 'Confirm'}), onPress: () => resolve(true)},
                ],
            );
        });
        if (!ok) {
            return;
        }
        if (!serverUrl || !companyIdProp) {
            return;
        }
        setDeleting(true);
        try {
            /** 先获取该成员所在部门，从各部门中移除后再从团队移除 */
            const client = NetworkManager.getClient(serverUrl);
            const departments = await client.getUserDepartments(employee.id, companyIdProp);
            if (departments && departments.length > 0) {
                for (const dept of departments) {
                    await client.removeDepartmentMember(companyIdProp, dept.id, employee.id);
                }
            }
            const result = await removeUserFromTeam(serverUrl, companyIdProp, employee.id);
            if (result.error) {
                Alert.alert(
                    '',
                    intl.formatMessage({id: 'contacts.delete_member_failed', defaultMessage: 'Failed to remove member. Please try again.'}),
                );
                return;
            }
            handleClose();
            DeviceEventEmitter.emit(Events.CONTACTS_LIST_REFRESH);
        } catch (error) {
            Alert.alert(
                '',
                intl.formatMessage({id: 'contacts.delete_member_failed', defaultMessage: 'Failed to remove member. Please try again.'}),
            );
        } finally {
            setDeleting(false);
        }
    }, [canDeleteEnterpriseMember, deleting, employee.id, employee, companyIdProp, handleClose, intl, serverUrl, isSupplierCustomer, handleDeleteRelation]));

    const handleCopyBasicInfo = usePreventDoubleTap(
        useCallback(() => {
            const lines: Array<{label: string; value: string}> = [];
            const nicknameLbl = intl.formatMessage({
                id: 'supplier_customer.directory_name_subtitle',
                defaultMessage: 'Nickname',
            });
            lines.push({label: nicknameLbl, value: getContactListDisplayName(employee)});
            if (relationRemark.trim()) {
                lines.push({
                    label: intl.formatMessage({id: 'supplier_customer.field_remark', defaultMessage: 'Remark name'}),
                    value: relationRemark.trim(),
                });
            }
            if (employee.email?.trim()) {
                lines.push({
                    label: intl.formatMessage({id: 'contacts.email', defaultMessage: 'Email'}),
                    value: employee.email.trim(),
                });
            }
            if (employee.phone?.trim()) {
                lines.push({
                    label: intl.formatMessage({id: 'contacts.phone', defaultMessage: 'Phone'}),
                    value: employee.phone.trim(),
                });
            }
            if (employee.position?.trim()) {
                lines.push({
                    label: intl.formatMessage({id: 'contacts.position', defaultMessage: 'Position'}),
                    value: employee.position.trim(),
                });
            }
            if (departmentClipboardValue.trim()) {
                lines.push({
                    label: intl.formatMessage({id: 'contacts.department', defaultMessage: 'Department'}),
                    value: departmentClipboardValue.trim(),
                });
            }
            if (isSupplierCustomer && relationType) {
                const typeLabel =
                    relationType === 'supplier'
                        ? intl.formatMessage({id: 'supplier_customer.type_supplier', defaultMessage: 'Supplier'})
                        : relationType === 'customer'
                            ? intl.formatMessage({id: 'supplier_customer.type_customer', defaultMessage: 'Customer'})
                            : intl.formatMessage({id: 'contacts.external', defaultMessage: 'External Contact'});
                lines.push({
                    label: intl.formatMessage({id: 'supplier_customer.type', defaultMessage: 'Type'}),
                    value: typeLabel,
                });
            }
            if (isSupplierCustomer && relationDescription.trim()) {
                lines.push({
                    label: intl.formatMessage({id: 'supplier_customer.relation', defaultMessage: 'Relation description'}),
                    value: relationDescription.trim(),
                });
            }
            if (employee.id) {
                lines.push({
                    label: intl.formatMessage({id: 'contacts.clipboard_member_id', defaultMessage: 'Member ID'}),
                    value: employee.id,
                });
            }
            const text = buildClipboardTextFromLines(lines);
            if (!text) {
                return;
            }
            Clipboard.setString(text);
            showSnackBar({
                barType: SNACK_BAR_TYPE.INFO_COPIED,
                type: MESSAGE_TYPE.SUCCESS,
            });
        }, [
            departmentClipboardValue,
            employee.email,
            employee.id,
            employee,
            employee.phone,
            employee.position,
            intl,
            isSupplierCustomer,
            relationDescription,
            relationRemark,
            relationType,
        ]),
    );

    return (
        <SafeAreaView
            edges={SAFE_AREA_EDGES}
            style={[styles.flex, {backgroundColor: theme.centerChannelBg}]}
            testID='contacts.employee_profile.screen'
        >
            <ScrollView
                style={styles.flex}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.avatarSection}>
                    <View style={styles.avatar}>
                        <ContactAvatar
                            employee={employee}
                            size={56}
                        />
                    </View>
                </View>

                <View style={styles.detailGrid}>
                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>
                            {intl.formatMessage({id: 'supplier_customer.account', defaultMessage: 'Account'})}
                        </Text>
                        <Text style={[styles.detailValue, fromManage && styles.detailValueDisabled]} numberOfLines={1}>
                            {employee.username || '-'}
                        </Text>
                    </View>
                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>
                            {intl.formatMessage({id: 'supplier_customer.nickname', defaultMessage: 'Nickname'})}
                        </Text>
                        {fromManage ? (
                            <TextInput
                                style={styles.detailInput}
                                value={editNickname}
                                onChangeText={setEditNickname}
                                placeholder='-'
                                testID='employee_profile.edit.nickname'
                            />
                        ) : (
                            <Text style={styles.detailValue} numberOfLines={1} selectable={true}>
                                {employee.nickname || '-'}
                            </Text>
                        )}
                    </View>
                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>
                            {intl.formatMessage({id: 'contacts.email', defaultMessage: 'Email'})}
                        </Text>
                        {fromManage ? (
                            <TextInput
                                style={styles.detailInput}
                                value={editEmail}
                                onChangeText={setEditEmail}
                                placeholder='-'
                                keyboardType='email-address'
                                autoCapitalize='none'
                                testID='employee_profile.edit.email'
                            />
                        ) : (
                            <Text style={styles.detailValue} numberOfLines={1} selectable={true}>
                                {employee.email || '-'}
                            </Text>
                        )}
                    </View>
                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>
                            {intl.formatMessage({id: 'contacts.phone', defaultMessage: 'Phone'})}
                        </Text>
                        {fromManage ? (
                            <TextInput
                                style={styles.detailInput}
                                value={editPhone}
                                onChangeText={setEditPhone}
                                placeholder='-'
                                keyboardType='phone-pad'
                                testID='employee_profile.edit.phone'
                            />
                        ) : (
                            <Text style={styles.detailValue} numberOfLines={1} selectable={true}>
                                {employee.phone || '-'}
                            </Text>
                        )}
                    </View>
                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>
                            {intl.formatMessage({id: 'channel_info.position', defaultMessage: 'Position'})}
                        </Text>
                        {fromManage ? (
                            <TextInput
                                style={styles.detailInput}
                                value={editPosition}
                                onChangeText={setEditPosition}
                                placeholder='-'
                                testID='employee_profile.edit.position'
                            />
                        ) : (
                            <Text style={styles.detailValue} numberOfLines={1} selectable={true}>
                                {employee.position || '-'}
                            </Text>
                        )}
                    </View>
                    {!isSupplierCustomer && (
                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>
                            {intl.formatMessage({id: 'contacts.department', defaultMessage: 'Department'})}
                        </Text>
                        <Text style={styles.detailValue} numberOfLines={2} selectable={true}>
                            {(departmentName && departmentName !== 'FORCE_TEAM_DEFAULT_DEPARTMENT') ? departmentName : (companyName || '-')}
                        </Text>
                    </View>
                    )}
                    {fromManage && (
                        <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>
                                {intl.formatMessage({id: 'contacts.business_roles', defaultMessage: '业务角色'})}
                            </Text>
                            <TouchableOpacity
                                style={{flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}
                                onPress={() => setShowRoleModal(true)}
                            >
                                <Text style={styles.detailValue} numberOfLines={2}>
                                    {businessRoles.length > 0
                                        ? businessRoles.map((r) => r.role_name).join(', ')
                                        : intl.formatMessage({id: 'contacts.no_roles', defaultMessage: '未分配角色'})}
                                </Text>
                                <CompassIcon
                                    name='chevron-right'
                                    size={20}
                                    color={changeOpacity(theme.centerChannelColor, 0.32)}
                                />
                            </TouchableOpacity>
                        </View>
                    )}
                </View>

                {fromManage ? (
                    <View style={styles.buttonSection}>
                        <Button
                            theme={theme}
                            onPress={handleSaveProfile}
                            type='solid'
                            size='lg'
                            disabled={saving}
                            buttonContainerStyle={styles.sendButton}
                            testID='contacts.employee_profile.save'
                            text={intl.formatMessage({id: 'mobile.edit_profile.save', defaultMessage: 'Save'})}
                        />
                        {canDelete && (
                            <Button
                                theme={theme}
                                onPress={handleDeleteMember}
                                size='lg'
                                isDestructive={true}
                                disabled={deleting}
                                buttonContainerStyle={styles.deleteButton}
                                testID='contacts.employee_profile.delete'
                                text={intl.formatMessage({id: 'contacts.delete_member', defaultMessage: 'Delete Member'})}
                            />
                        )}
                    </View>
                ) : (
                    <View style={styles.buttonSection}>
                        {canSendMessage && (
                            <Button
                                theme={theme}
                                onPress={handleSendMessage}
                                type='solid'
                                size='lg'
                                disabled={sending}
                                buttonContainerStyle={styles.sendButton}
                                testID='contacts.employee_profile.send_message'
                                text={intl.formatMessage({id: 'contacts.send_message', defaultMessage: 'Send Message'})}
                            />
                        )}
                    </View>
                )}
            </ScrollView>
            <CustomInputModal
                visible={remarkEditInput.visible}
                title={remarkEditInput.options.title}
                placeholder={remarkEditInput.options.placeholder}
                defaultValue={remarkEditInput.options.defaultValue}
                confirmContent={remarkEditInput.options.confirmContent}
                showCancelButton={remarkEditInput.options.showCancelButton}
                cancelContent={remarkEditInput.options.cancelContent}
                onConfirm={remarkEditInput.handleConfirm}
                onCancel={remarkEditInput.handleCancel}
            />
            <CustomInputModal
                visible={relationDescriptionEditInput.visible}
                title={relationDescriptionEditInput.options.title}
                placeholder={relationDescriptionEditInput.options.placeholder}
                defaultValue={relationDescriptionEditInput.options.defaultValue}
                confirmContent={relationDescriptionEditInput.options.confirmContent}
                showCancelButton={relationDescriptionEditInput.options.showCancelButton}
                cancelContent={relationDescriptionEditInput.options.cancelContent}
                onConfirm={relationDescriptionEditInput.handleConfirm}
                onCancel={relationDescriptionEditInput.handleCancel}
            />
            <Modal
                visible={showRoleModal}
                transparent={true}
                animationType='slide'
                onRequestClose={() => setShowRoleModal(false)}
            >
                <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end'}}>
                    <View style={{backgroundColor: theme.centerChannelBg, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '80%'}}>
                        <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: changeOpacity(theme.centerChannelColor, 0.1)}}>
                            <TouchableOpacity onPress={() => setShowRoleModal(false)}>
                                <Text style={{color: theme.linkColor, ...typography('Body', 100)}}>
                                    {intl.formatMessage({id: 'mobile.components.select_theme_view.cancel', defaultMessage: 'Cancel'})}
                                </Text>
                            </TouchableOpacity>
                            <Text style={{...typography('Heading', 400, 'SemiBold'), color: theme.centerChannelColor}}>
                                {intl.formatMessage({id: 'contacts.set_roles', defaultMessage: '设置角色'})}
                            </Text>
                            <TouchableOpacity onPress={handleSaveRoles} disabled={savingRoles}>
                                <Text style={{color: savingRoles ? changeOpacity(theme.linkColor, 0.5) : theme.linkColor, ...typography('Body', 100, 'SemiBold')}}>
                                    {savingRoles ? intl.formatMessage({id: 'mobile.post.saving', defaultMessage: 'Saving...'}) : intl.formatMessage({id: 'mobile.edit_profile.save', defaultMessage: 'Save'})}
                                </Text>
                            </TouchableOpacity>
                        </View>
                        <ScrollView style={{padding: 16}}>
                            {roleDefs.map((def) => {
                                const isSelected = selectedRoleKeys.has(def.role_key);
                                return (
                                    <TouchableOpacity
                                        key={def.id}
                                        style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: changeOpacity(theme.centerChannelColor, 0.06)}}
                                        onPress={() => {
                                            setSelectedRoleKeys((prev) => {
                                                const next = new Set(prev);
                                                if (isSelected) {
                                                    next.delete(def.role_key);
                                                } else {
                                                    next.add(def.role_key);
                                                }
                                                return next;
                                            });
                                        }}
                                    >
                                        <Text style={{...typography('Body', 200), color: theme.centerChannelColor, flex: 1}}>
                                            {def.role_name}
                                        </Text>
                                        <View style={{width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: isSelected ? theme.buttonBg : changeOpacity(theme.centerChannelColor, 0.32), backgroundColor: isSelected ? theme.buttonBg : 'transparent', alignItems: 'center', justifyContent: 'center'}}>
                                            {isSelected && (
                                                <CompassIcon name='check' size={16} color={theme.buttonColor}/>
                                            )}
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                            {roleDefs.length === 0 && (
                                <Text style={{...typography('Body', 200), color: changeOpacity(theme.centerChannelColor, 0.56), textAlign: 'center', paddingVertical: 24}}>
                                    {intl.formatMessage({id: 'contacts.no_roles', defaultMessage: '未分配角色'})}
                                </Text>
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
};

export default ContactsEmployeeProfile;
