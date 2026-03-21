// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useState} from 'react';
import {useIntl} from 'react-intl';
import {Alert, ScrollView, Text, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {makeDirectChannel} from '@actions/remote/channel';
import {deleteContactEmployee} from '@actions/remote/contact';
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

type Props = {
    componentId: AvailableScreens;
    closeButtonId?: string;
    employee: ContactEmployee;
    departmentName?: string;
    departmentParentPath?: string;
    companyName?: string;
    currentUserId?: string;

    /** 从管理界面进入时用于「设置部门」：每人只能属于一个部门 */
    departmentId?: number;
    companyId?: string;

    /** 从管理界面进入时为 true，显示「设置部门」入口 */
    fromManage?: boolean;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    flex: {flex: 1},
    scrollContent: {
        paddingHorizontal: 16,
        paddingBottom: 32,
    },
    avatarSection: {
        alignItems: 'center',
        paddingVertical: 24,
    },
    avatar: {
        marginBottom: 12,
    },
    name: {
        ...typography('Heading', 400),
        color: theme.centerChannelColor,
    },
    card: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.06),
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
    },
    cardRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
    },

    /** 与根目录部门列表行一致：固定行高 + 内容垂直居中 */
    cardRowDepartmentSingle: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        minHeight: 44,
    },
    cardValueSingleLineWrap: {
        flex: 1,
        justifyContent: 'center',
        alignSelf: 'stretch',
    },
    cardLabel: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.64),
        width: 80,
    },
    cardValue: {
        ...typography('Body', 200),
        color: theme.centerChannelColor,
        flex: 1,
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
    departmentRowValue: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    departmentRowArrow: {
        marginLeft: 8,
    },

    /** 部门行右侧：部门值 + 设置部门入口同一行 */
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
        paddingVertical: 4,
        paddingHorizontal: 4,
    },
    changeDepartmentText: {
        ...typography('Body', 75),
        color: theme.linkColor,
        marginRight: 2,
    },
    sendButton: {
        marginTop: 16,
    },
    deleteButton: {
        marginTop: 16,
    },
}));

const ContactsEmployeeProfile = ({
    componentId,
    closeButtonId,
    employee,
    departmentName,
    departmentParentPath,
    companyName,
    departmentId,
    companyId: companyIdProp,
    currentUserId,
    fromManage = false,
}: Props) => {
    const theme = useTheme();
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const styles = getStyleSheet(theme);
    const [sending, setSending] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const handleClose = useCallback(() => {
        dismissModal({componentId});
    }, [componentId]);

    useNavButtonPressed(closeButtonId ?? CLOSE_BUTTON_ID, componentId, handleClose, [handleClose]);
    useAndroidHardwareBackHandler(componentId, handleClose);

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

    const handleSendMessage = usePreventDoubleTap(useCallback(async () => {
        if (!serverUrl || sending) {
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
    }, [serverUrl, sending, resolveMattermostUserId, employee.name, intl, handleClose]));

    const canSendMessage = Boolean(employee.email || employee.id);

    const isSelf = Boolean(currentUserId && employee.id && currentUserId === employee.id);

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

    const canDelete = Boolean(companyIdProp) && !isSelf;

    const handleDeleteMember = usePreventDoubleTap(useCallback(async () => {
        if (!canDelete || deleting) {
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
    }, [canDelete, deleting, employee.id, employee.name, handleClose, intl]));

    return (
        <SafeAreaView
            edges={['bottom']}
            style={styles.flex}
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
                        <View style={departmentParentPath && departmentParentPath.includes('/') ? styles.cardRow : styles.cardRowDepartmentSingle}>
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
                    {companyName ? (
                        <View style={styles.cardRow}>
                            <Text style={styles.cardLabel}>
                                {intl.formatMessage({id: 'contacts.enterprise_name', defaultMessage: 'Enterprise'})}
                            </Text>
                            <Text
                                style={styles.cardValue}
                                numberOfLines={1}
                            >
                                {companyName}
                            </Text>
                        </View>
                    ) : null}
                </View>

                {canSendMessage && (
                    <Button
                        theme={theme}
                        onPress={handleSendMessage}
                        type='primary'
                        size='lg'
                        disabled={sending}
                        style={styles.sendButton}
                        testID='contacts.employee_profile.send_message'
                        text={intl.formatMessage({id: 'contacts.send_message', defaultMessage: 'Send Message'})}
                    />
                )}
                {canDelete && (
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
            </ScrollView>
        </SafeAreaView>
    );
};

export default ContactsEmployeeProfile;
