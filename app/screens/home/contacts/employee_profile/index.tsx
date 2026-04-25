// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import Clipboard from '@react-native-clipboard/clipboard';
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useIntl} from 'react-intl';
import {Alert, DeviceEventEmitter, ScrollView, Text, TouchableOpacity, View} from 'react-native';
import {type Edge, SafeAreaView} from 'react-native-safe-area-context';

import {makeDirectChannel} from '@actions/remote/channel';
import {removeEmployeeContact, updateEmployeeContact} from '@actions/remote/employee_contact_new';
import {fetchTeamById, removeUserFromTeam} from '@actions/remote/team';
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
import {DEPARTMENT_PATH_DISPLAY_MAX_LENGTH, formatPathForDisplay} from '@utils/department_path';
import {showSnackBar} from '@utils/snack_bar';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {MMEmployeeContactType} from '@client/rest/team_department';
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

    /** 从管理界面进入时为 true，显示「设置部门」入口 */
    fromManage?: boolean;

    /** 供应商/客户关系描述 */
    description?: string;

    /** 供应商/客户备注名；列表与详情优先于对方昵称展示 */
    remark?: string;

    /** 供应商/客户关系类型 */
    relationType?: string;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    flex: {flex: 1},
    scrollContent: {
        paddingHorizontal: 0,
        paddingBottom: 32,
    },
    avatarSection: {
        alignItems: 'center',
        paddingVertical: 32,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
        marginBottom: 16,
    },
    avatar: {
        marginBottom: 16,
    },
    name: {
        ...typography('Heading', 400),
        color: theme.centerChannelColor,
        textAlign: 'center',
    },
    nameDirectoryHint: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.64),
        textAlign: 'center',
        marginTop: 4,
    },
    section: {
        paddingHorizontal: 16,
        marginBottom: 20,
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
        marginTop: 8,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        alignSelf: 'center',
        backgroundColor: changeOpacity(theme.onlineIndicator, 0.12),
    },
    selfTagText: {
        ...typography('Body', 75, 'SemiBold'),
        color: theme.onlineIndicator,
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
    currentUserId,
    fromManage = false,
    description,
    remark,
    relationType,
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
            if (!fromManage || !companyIdProp || !serverUrl) {
                if (!cancelled) {
                    setIsCompanyOwner(false);
                }
                return;
            }

            const result = await fetchTeamById(serverUrl, companyIdProp);
            const ownerId = result.team?.creator_id;
            if (!cancelled) {
                setIsCompanyOwner(Boolean(ownerId && ownerId === employee.id));
            }
        };

        loadCompanyOwner();

        return () => {
            cancelled = true;
        };
    }, [companyIdProp, employee.id, fromManage, serverUrl]);

    const handleClose = useCallback(() => {
        dismissModal({componentId});
    }, [componentId]);

    useNavButtonPressed(closeButtonId ?? CLOSE_BUTTON_ID, componentId, handleClose, [handleClose]);
    useAndroidHardwareBackHandler(componentId, handleClose);

    const canEditRelationFields = Boolean(relationType && currentUserId);

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
                    id: 'mobile.direct_message.error',
                    defaultMessage: "We couldn't open a DM with {displayName}.",
                }, {displayName: getContactListDisplayName(employee)}),
            );
            return;
        }
        const displayName = getContactListDisplayName(employee);
        const result = await makeDirectChannel(serverUrl, userId, displayName, true);
        setSending(false);
        if (result.error) {
            Alert.alert(
                '',
                intl.formatMessage({
                    id: 'mobile.direct_message.error',
                    defaultMessage: "We couldn't open a DM with {displayName}.",
                }, {displayName}),
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
    const canDelete = canDeleteEnterpriseMember || isSupplierCustomer;

    const handleDeleteRelation = usePreventDoubleTap(useCallback(async () => {
        if (!isSupplierCustomer || deleting) {
            return;
        }
        const relationLabel = relationType === 'supplier'? intl.formatMessage({id: 'supplier_customer.type_supplier', defaultMessage: 'Supplier'}): intl.formatMessage({id: 'supplier_customer.type_customer', defaultMessage: 'Customer'});
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
        const result = await removeUserFromTeam(serverUrl, companyIdProp, employee.id);
        setDeleting(false);
        if (result.error) {
            Alert.alert(
                '',
                intl.formatMessage({id: 'contacts.delete_member_failed', defaultMessage: 'Failed to remove member. Please try again.'}),
            );
            return;
        }
        handleClose();
    }, [canDeleteEnterpriseMember, deleting, employee.id, companyIdProp, handleClose, intl, serverUrl]));

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
                        : intl.formatMessage({id: 'supplier_customer.type_customer', defaultMessage: 'Customer'});
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
                            size={80}
                        />
                    </View>
                    <Text
                        style={styles.name}
                        numberOfLines={2}
                    >
                        {relationRemark.trim() || getContactListDisplayName(employee)}
                    </Text>
                    {relationRemark.trim() ? (
                        <Text
                            style={styles.nameDirectoryHint}
                            numberOfLines={1}
                        >
                            {intl.formatMessage({
                                id: 'supplier_customer.directory_name_subtitle',
                                defaultMessage: 'Nickname',
                            })}
                            {': '}
                            {getContactListDisplayName(employee)}
                        </Text>
                    ) : null}
                    {isSelf ? (
                        <View style={styles.selfTag}>
                            <Text style={styles.selfTagText}>
                                {intl.formatMessage({id: 'contacts.self_tag', defaultMessage: 'Self'})}
                            </Text>
                        </View>
                    ) : null}
                </View>

                {isSupplierCustomer && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>
                            {intl.formatMessage({id: 'supplier_customer.relation_info', defaultMessage: 'Relation Info'})}
                        </Text>
                        <View style={styles.card}>
                            <View style={styles.cardRow}>
                                <Text style={styles.cardLabel}>
                                    {intl.formatMessage({id: 'supplier_customer.field_remark', defaultMessage: 'Remark name'})}
                                </Text>
                                <View style={styles.cardValueWrap}>
                                    <Text
                                        style={styles.cardValue}
                                        numberOfLines={2}
                                    >
                                        {relationRemark.trim() || '-'}
                                    </Text>
                                    <TouchableOpacity
                                        style={styles.changeDepartmentInline}
                                        onPress={handleEditRemark}
                                        activeOpacity={0.7}
                                        disabled={!canEditRelationFields}
                                        testID='supplier_customer.edit_remark'
                                    >
                                        <CompassIcon
                                            name='pencil-outline'
                                            size={16}
                                            color={theme.linkColor}
                                        />
                                    </TouchableOpacity>
                                </View>
                            </View>
                            <View style={styles.cardRow}>
                                <Text style={styles.cardLabel}>
                                    {intl.formatMessage({id: 'supplier_customer.relation', defaultMessage: 'Relation description'})}
                                </Text>
                                <View style={styles.cardValueWrap}>
                                    <Text
                                        style={styles.cardValue}
                                        numberOfLines={2}
                                    >
                                        {relationDescription || '-'}
                                    </Text>
                                    <TouchableOpacity
                                        style={styles.changeDepartmentInline}
                                        onPress={handleEditRelationDescription}
                                        activeOpacity={0.7}
                                        disabled={!canEditRelationFields}
                                        testID='supplier_customer.edit_relation'
                                    >
                                        <CompassIcon
                                            name='pencil-outline'
                                            size={16}
                                            color={theme.linkColor}
                                        />
                                    </TouchableOpacity>
                                </View>
                            </View>
                            {relationType && (
                                <View style={[styles.cardRow, styles.cardRowLast]}>
                                    <Text style={styles.cardLabel}>
                                        {intl.formatMessage({id: 'supplier_customer.type', defaultMessage: 'Type'})}
                                    </Text>
                                    <View
                                        style={[
                                            styles.relationBadge,
                                            {
                                                backgroundColor: relationType === 'supplier'? changeOpacity(theme.linkColor, 0.08): changeOpacity(theme.onlineIndicator, 0.08),
                                            },
                                        ]}
                                    >
                                        <CompassIcon
                                            name={relationType === 'supplier' ? 'car-outline' : 'account-multiple-outline'}
                                            size={18}
                                            color={relationType === 'supplier' ? theme.linkColor : theme.onlineIndicator}
                                        />
                                        <Text
                                            style={[
                                                styles.relationBadgeText,
                                                {
                                                    color: relationType === 'supplier'? theme.linkColor: theme.onlineIndicator,
                                                },
                                            ]}
                                        >
                                            {relationType === 'supplier'? intl.formatMessage({id: 'supplier_customer.type_supplier', defaultMessage: 'Supplier'}): intl.formatMessage({id: 'supplier_customer.type_customer', defaultMessage: 'Customer'})
                                            }
                                        </Text>
                                    </View>
                                </View>
                            )}
                        </View>
                    </View>
                )}

                <View style={styles.section}>
                    <View style={styles.sectionTitleRow}>
                        <Text style={styles.sectionTitleInRow}>
                            {intl.formatMessage({id: 'contacts.contact_info', defaultMessage: 'Contact Info'})}
                        </Text>
                        <TouchableOpacity
                            style={styles.copyInfoButton}
                            onPress={handleCopyBasicInfo}
                            activeOpacity={0.7}
                            testID='contacts.employee_profile.copy_basic_info'
                        >
                            <CompassIcon
                                name='content-copy'
                                size={18}
                                color={theme.linkColor}
                            />
                            <Text style={styles.copyInfoButtonText}>
                                {intl.formatMessage({id: 'contacts.copy_basic_info', defaultMessage: 'Copy'})}
                            </Text>
                        </TouchableOpacity>
                    </View>
                    <View style={styles.card}>
                        {employee.email ? (
                            <View style={styles.cardRow}>
                                <Text style={styles.cardLabel}>
                                    {intl.formatMessage({id: 'contacts.email', defaultMessage: 'Email'})}
                                </Text>
                                <Text
                                    style={styles.cardValue}
                                    numberOfLines={1}
                                >
                                    {employee.email}
                                </Text>
                            </View>
                        ) : null}
                        {employee.phone ? (
                            <View style={styles.cardRow}>
                                <Text style={styles.cardLabel}>
                                    {intl.formatMessage({id: 'contacts.phone', defaultMessage: 'Phone'})}
                                </Text>
                                <Text
                                    style={styles.cardValue}
                                    numberOfLines={1}
                                >
                                    {employee.phone}
                                </Text>
                            </View>
                        ) : null}
                        {employee.position ? (
                            <View style={styles.cardRow}>
                                <Text style={styles.cardLabel}>
                                    {intl.formatMessage({id: 'contacts.position', defaultMessage: 'Position'})}
                                </Text>
                                <Text
                                    style={styles.cardValue}
                                    numberOfLines={1}
                                >
                                    {employee.position}
                                </Text>
                            </View>
                        ) : null}
                        {(departmentName || departmentParentPath) ? (
                            <View style={[styles.cardRow, styles.cardRowLast]}>
                                <Text style={styles.cardLabel}>
                                    {intl.formatMessage({id: 'contacts.department', defaultMessage: 'Department'})}
                                </Text>
                                <View style={styles.departmentValueWithAction}>
                                    <View style={styles.departmentValueWrap}>
                                        {departmentParentPath && departmentParentPath.includes('/') ? (
                                            <View style={styles.cardValueColumn}>
                                                {departmentName ? (
                                                    <Text
                                                        style={[styles.cardValue, {flex: undefined}]}
                                                        numberOfLines={1}
                                                    >
                                                        {departmentName}
                                                    </Text>
                                                ) : null}
                                                <Text
                                                    style={styles.cardValueSecondary}
                                                    numberOfLines={2}
                                                >
                                                    {formatPathForDisplay(
                                                        departmentParentPath.split('/').filter(Boolean),
                                                        DEPARTMENT_PATH_DISPLAY_MAX_LENGTH,
                                                        '/',
                                                        intl.formatMessage({id: 'contacts.enterprise', defaultMessage: 'Enterprise Contacts'}),
                                                    )}
                                                </Text>
                                            </View>
                                        ) : (
                                            <View style={styles.cardValueSingleLineWrap}>
                                                <Text
                                                    style={styles.cardValue}
                                                    numberOfLines={1}
                                                >
                                                    {departmentName}
                                                </Text>
                                            </View>
                                        )}
                                    </View>
                                    {canChangeDepartment ? (
                                        <TouchableOpacity
                                            style={styles.changeDepartmentInline}
                                            onPress={handleChangeDepartment}
                                            activeOpacity={0.7}
                                            testID='contacts.employee_profile.change_department'
                                        >
                                            <Text style={styles.changeDepartmentText}>
                                                {intl.formatMessage({id: 'contacts.change_department', defaultMessage: 'Change department'})}
                                            </Text>
                                            <CompassIcon
                                                name='chevron-right'
                                                size={18}
                                                color={theme.linkColor}
                                            />
                                        </TouchableOpacity>
                                    ) : null}
                                </View>
                            </View>
                        ) : null}
                    </View>
                </View>

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
                    {isSupplierCustomer && (
                        <Button
                            theme={theme}
                            onPress={handleDeleteRelation}
                            size='lg'
                            isDestructive={true}
                            disabled={deleting}
                            buttonContainerStyle={styles.deleteButton}
                            testID='contacts.employee_profile.delete_relation'
                            text={intl.formatMessage({id: 'supplier_customer.delete_relation', defaultMessage: 'Remove {relation}'}, {relation: relationType === 'supplier' ? intl.formatMessage({id: 'supplier_customer.type_supplier', defaultMessage: 'Supplier'}) : intl.formatMessage({id: 'supplier_customer.type_customer', defaultMessage: 'Customer'})})}
                        />
                    )}
                    {!isSupplierCustomer && canDelete && (
                        <Button
                            theme={theme}
                            onPress={handleDeleteMember}
                            size='lg'
                            isDestructive={true}
                            disabled={deleting}
                            buttonContainerStyle={styles.deleteButton}
                            testID='contacts.employee_profile.delete'
                            text={intl.formatMessage({id: 'contacts.delete_member', defaultMessage: 'Delete'})}
                        />
                    )}
                </View>
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
        </SafeAreaView>
    );
};

export default ContactsEmployeeProfile;
