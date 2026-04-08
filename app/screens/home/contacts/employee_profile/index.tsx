// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {Alert, ScrollView, Text, TouchableOpacity, View} from 'react-native';
import {type Edge, SafeAreaView} from 'react-native-safe-area-context';

import {makeDirectChannel} from '@actions/remote/channel';
import {deleteContactEmployee, fetchCompany} from '@actions/remote/contact';
import Button from '@components/button';
import CompassIcon from '@components/compass_icon';
import ContactAvatar from '@components/contact_avatar';
import {Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import {usePreventDoubleTap} from '@hooks/utils';
import NetworkManager from '@managers/network_manager';
import {dismissModal, showModalWithBackButton} from '@screens/navigation';
import {DEPARTMENT_PATH_DISPLAY_MAX_LENGTH, formatPathForDisplay} from '@utils/department_path';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {ContactEmployee} from '@client/rest/contact';
import type {AvailableScreens} from '@typings/screens/navigation';

const CLOSE_BUTTON_ID = 'close-contacts-employee-profile';

const SAFE_AREA_EDGES: Edge[] = ['top', 'bottom', 'left', 'right'];

/** 与 showModalWithBackButton(SUPPLIER_CUSTOMER_FORM, …) 的 componentId 一致，用于明确关闭编辑层 */
const SUPPLIER_CUSTOMER_FORM_MODAL_ID = 'close-supplier-customer-form' as AvailableScreens;

type Props = {
    componentId: AvailableScreens;
    closeButtonId?: string;
    employee: ContactEmployee;
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
    relationType,
}: Props) => {
    const theme = useTheme();
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const styles = getStyleSheet(theme);
    const [sending, setSending] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [relationDescription, setRelationDescription] = useState(() => description ?? '');
    const [isCompanyOwner, setIsCompanyOwner] = useState(false);

    useEffect(() => {
        setRelationDescription(description ?? '');
    }, [description]);

    useEffect(() => {
        let cancelled = false;

        const loadCompanyOwner = async () => {
            if (!fromManage || !companyIdProp) {
                if (!cancelled) {
                    setIsCompanyOwner(false);
                }
                return;
            }

            const result = await fetchCompany(companyIdProp);
            const ownerId = result.data?.owner_id ?? (result.data as {ownerId?: string} | undefined)?.ownerId;
            if (!cancelled) {
                setIsCompanyOwner(Boolean(ownerId && ownerId === employee.id));
            }
        };

        loadCompanyOwner();

        return () => {
            cancelled = true;
        };
    }, [companyIdProp, employee.id, fromManage]);

    const handleClose = useCallback(() => {
        dismissModal({componentId});
    }, [componentId]);

    useNavButtonPressed(closeButtonId ?? CLOSE_BUTTON_ID, componentId, handleClose, [handleClose]);
    useAndroidHardwareBackHandler(componentId, handleClose);

    const handleEditRelation = usePreventDoubleTap(useCallback(() => {
        if (!relationType || !currentUserId) {
            return;
        }
        let editFormTitle: string;
        if (relationType === 'supplier') {
            editFormTitle = intl.formatMessage({id: 'supplier_customer.form_edit_supplier_title', defaultMessage: 'Edit supplier'});
        } else {
            editFormTitle = intl.formatMessage({id: 'supplier_customer.form_edit_customer_title', defaultMessage: 'Edit customer'});
        }
        showModalWithBackButton(
            Screens.SUPPLIER_CUSTOMER_FORM,
            editFormTitle,
            SUPPLIER_CUSTOMER_FORM_MODAL_ID,
            {
                kind: relationType as 'supplier' | 'customer',
                ownerId: currentUserId ?? '',
                existingContactId: employee.id,
                initialContactName: employee.name,
                initialDescription: relationDescription,
                initialContactEmail: employee.email,
                initialContactPhone: employee.phone,
                initialContactPosition: employee.position,
                onRelationDescriptionSaved: setRelationDescription,
                onBack: () => {
                    dismissModal({componentId: SUPPLIER_CUSTOMER_FORM_MODAL_ID});
                },
            },
            {
                useBackIcon: true,
                topBar: {
                    visible: false,
                    height: 0,
                },
            },
        );
    }, [relationType, relationDescription, currentUserId, employee.email, employee.id, employee.name, employee.phone, employee.position, intl]));

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
                }, {displayName: employee.name}),
            );
            return;
        }
        const result = await makeDirectChannel(serverUrl, userId, employee.name, true);
        setSending(false);
        if (result.error) {
            Alert.alert(
                '',
                intl.formatMessage({
                    id: 'mobile.direct_message.error',
                    defaultMessage: "We couldn't open a DM with {displayName}.",
                }, {displayName: employee.name}),
            );
            return;
        }
        handleClose();
    }, [serverUrl, sending, isSelf, resolveMattermostUserId, employee.name, intl, handleClose]));

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
                singleEmployeeName: employee.name,
                onSuccess: handleClose,
            },
            {useBackIcon: true, topBar: {visible: false}},
        );
    }, [canChangeDepartment, companyIdProp, departmentId, departmentName, employee.id, intl, handleClose]));

    const isSupplierCustomer = Boolean(relationType);

    const canDeleteEnterpriseMember = fromManage && Boolean(companyIdProp) && !isSelf && !isCompanyOwner;
    const canDelete = canDeleteEnterpriseMember || isSupplierCustomer;

    const handleDeleteRelation = usePreventDoubleTap(useCallback(async () => {
        if (!isSupplierCustomer || deleting) {
            return;
        }
        const relationLabel = relationType === 'supplier'? intl.formatMessage({id: 'supplier_customer.type_supplier', defaultMessage: 'Supplier'}): intl.formatMessage({id: 'supplier_customer.type_customer', defaultMessage: 'Customer'});
        const ok = await new Promise<boolean>((resolve) => {
            Alert.alert(
                intl.formatMessage({id: 'supplier_customer.delete_relation', defaultMessage: 'Remove {relation}'}, {relation: relationLabel}),
                intl.formatMessage(
                    {id: 'supplier_customer.delete_relation_confirm', defaultMessage: 'Remove {relation} relationship with {name}? This action cannot be undone.'},
                    {name: employee.name, relation: relationLabel},
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
        const result = await deleteContactEmployee(employee.id);
        setDeleting(false);
        if (result.error) {
            Alert.alert(
                '',
                intl.formatMessage({id: 'supplier_customer.delete_failed', defaultMessage: 'Failed to remove. Please try again.'}),
            );
            return;
        }
        handleClose();
    }, [isSupplierCustomer, relationType, deleting, employee.id, employee.name, handleClose, intl]));

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
                    {name: employee.name},
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
        const result = await deleteContactEmployee(employee.id);
        setDeleting(false);
        if (result.error) {
            Alert.alert(
                '',
                intl.formatMessage({id: 'contacts.delete_member_failed', defaultMessage: 'Failed to remove member. Please try again.'}),
            );
            return;
        }
        handleClose();
    }, [canDeleteEnterpriseMember, deleting, employee.id, employee.name, handleClose, intl]));

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
                        numberOfLines={1}
                    >
                        {employee.name}
                    </Text>
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
                                        onPress={handleEditRelation}
                                        activeOpacity={0.7}
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
                    <Text style={styles.sectionTitle}>
                        {intl.formatMessage({id: 'contacts.contact_info', defaultMessage: 'Contact Info'})}
                    </Text>
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
        </SafeAreaView>
    );
};

export default ContactsEmployeeProfile;
