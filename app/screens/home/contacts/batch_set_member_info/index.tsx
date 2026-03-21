// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useState} from 'react';
import {useIntl} from 'react-intl';
import {Alert, ScrollView, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {updateContactEmployee} from '@actions/remote/contact';
import {type ContactEmployee} from '@client/rest/contact';
import CompassIcon from '@components/compass_icon';
import ContactAvatar from '@components/contact_avatar';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import {usePreventDoubleTap} from '@hooks/utils';
import {dismissModal} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {AvailableScreens} from '@typings/screens/navigation';

const CLOSE_BUTTON_ID = 'close-contacts-batch-set-info';

type Props = {
    componentId: AvailableScreens;
    closeButtonId?: string;
    companyId: string;
    departmentId: number;
    departmentName: string;
    initialEmployees: ContactEmployee[];
    onSuccess?: () => void;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    flex: {flex: 1},
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: theme.sidebarBg,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    headerLeftSpacer: {
        width: 40,
    },
    headerTitle: {
        flex: 1,
        ...typography('Heading', 600, 'SemiBold'),
        color: theme.sidebarText,
        textAlign: 'center',
    },
    headerCloseWrap: {
        width: 40,
        alignItems: 'flex-end',
    },
    scrollContent: {
        padding: 16,
        paddingBottom: 24,
    },
    sectionLabel: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.64),
        marginBottom: 8,
    },
    selectRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.06),
        borderRadius: 8,
        marginBottom: 20,
    },
    selectRowIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: theme.linkColor,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    selectRowText: {
        ...typography('Body', 200),
        color: theme.centerChannelColor,
        flex: 1,
    },
    selectRowCount: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.64),
    },
    inputRow: {
        marginBottom: 16,
    },
    inputLabel: {
        ...typography('Body', 100),
        color: changeOpacity(theme.centerChannelColor, 0.8),
        marginBottom: 6,
    },
    input: {
        ...typography('Body', 200),
        color: theme.centerChannelColor,
        paddingVertical: 10,
        paddingHorizontal: 14,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.06),
        borderRadius: 8,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.12),
    },
    bottomBar: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        paddingBottom: 24,
        backgroundColor: theme.centerChannelBg,
        borderTopWidth: 1,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    confirmButton: {
        paddingVertical: 12,
        borderRadius: 8,
        backgroundColor: theme.linkColor,
        alignItems: 'center',
        justifyContent: 'center',
    },
    confirmButtonDisabled: {
        backgroundColor: changeOpacity(theme.linkColor, 0.4),
    },
    confirmButtonText: {
        ...typography('Body', 200, 'SemiBold'),
        color: '#fff',
    },
    listItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.06),
    },
    checkbox: {
        width: 22,
        height: 22,
        borderRadius: 4,
        borderWidth: 2,
        marginRight: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxSelected: {
        backgroundColor: theme.linkColor,
        borderColor: theme.linkColor,
    },
    checkboxUnselected: {
        borderColor: changeOpacity(theme.centerChannelColor, 0.4),
    },
    listItemAvatar: {marginRight: 12},
    listItemName: {
        ...typography('Body', 200),
        color: theme.centerChannelColor,
        flex: 1,
    },
}));

const ContactsBatchSetMemberInfo = ({
    componentId,
    closeButtonId,
    initialEmployees,
    onSuccess,
}: Props) => {
    const theme = useTheme();
    const intl = useIntl();
    const styles = getStyleSheet(theme);
    const effectiveCloseId = closeButtonId ?? CLOSE_BUTTON_ID;

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [membersExpanded, setMembersExpanded] = useState(false);
    const [position, setPosition] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleClose = useCallback(() => {
        dismissModal({componentId});
    }, [componentId]);

    const toggleMember = useCallback((id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }, []);

    const handleToggleMembersExpanded = useCallback(() => {
        setMembersExpanded((prev) => !prev);
    }, []);

    const hasUpdates = position.trim() !== '' || phone.trim() !== '' || email.trim() !== '';
    const canSubmit = selectedIds.size > 0 && hasUpdates && !submitting;

    const handleConfirm = usePreventDoubleTap(useCallback(async () => {
        if (!canSubmit) {
            if (selectedIds.size === 0) {
                Alert.alert(
                    intl.formatMessage({id: 'contacts.batch_set_member_info', defaultMessage: 'Batch set member info'}),
                    intl.formatMessage({id: 'contacts.select_at_least_one_member', defaultMessage: 'Please select at least one member'}),
                );
            } else if (!hasUpdates) {
                Alert.alert(
                    intl.formatMessage({id: 'contacts.batch_set_member_info', defaultMessage: 'Batch set member info'}),
                    intl.formatMessage({id: 'contacts.fill_at_least_one_field', defaultMessage: 'Please fill in at least one field to set'}),
                );
            }
            return;
        }
        setSubmitting(true);
        const updates: { position?: string; phone?: string; email?: string } = {};
        if (position.trim()) {
            updates.position = position.trim();
        }
        if (phone.trim()) {
            updates.phone = phone.trim();
        }
        if (email.trim()) {
            updates.email = email.trim();
        }

        let failed = 0;
        for (const employeeId of selectedIds) {
            const res = await updateContactEmployee(employeeId, updates);
            if (res.error) {
                failed += 1;
            }
        }
        setSubmitting(false);

        if (failed > 0) {
            Alert.alert(
                intl.formatMessage({id: 'contacts.batch_set_member_info', defaultMessage: 'Batch set member info'}),
                intl.formatMessage(
                    {id: 'contacts.batch_set_partial_failed', defaultMessage: '{failed} of {total} member(s) failed to update.'},
                    {failed, total: selectedIds.size},
                ),
            );
        }
        onSuccess?.();
        handleClose();
    }, [canSubmit, email, hasUpdates, intl, onSuccess, phone, position, selectedIds, handleClose]));

    useNavButtonPressed(effectiveCloseId, componentId, handleClose, [handleClose]);
    useAndroidHardwareBackHandler(componentId, handleClose);

    return (
        <SafeAreaView
            edges={['bottom']}
            style={styles.flex}
            testID='contacts.batch_set_member_info.screen'
        >
            <View style={styles.header}>
                <View style={styles.headerLeftSpacer}/>
                <Text style={styles.headerTitle}>
                    {intl.formatMessage({id: 'contacts.batch_set_member_info', defaultMessage: 'Batch set member info'})}
                </Text>
                <View style={styles.headerCloseWrap}>
                    <TouchableOpacity
                        onPress={handleClose}
                        testID='contacts.batch_set.close'
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
                <Text style={styles.sectionLabel}>
                    {intl.formatMessage({id: 'contacts.select_members', defaultMessage: 'Select members'})}
                </Text>
                <TouchableOpacity
                    style={styles.selectRow}
                    onPress={handleToggleMembersExpanded}
                    activeOpacity={0.7}
                    testID='contacts.batch_set.select_members'
                >
                    <View style={styles.selectRowIcon}>
                        <CompassIcon
                            name='plus'
                            size={20}
                            color='#fff'
                        />
                    </View>
                    <Text style={styles.selectRowText}>
                        {intl.formatMessage({id: 'contacts.select_members', defaultMessage: 'Select members'})}
                    </Text>
                    {selectedIds.size > 0 && (
                        <Text style={styles.selectRowCount}>
                            {intl.formatMessage({id: 'contacts.selected_count', defaultMessage: '{count} selected'}, {count: selectedIds.size})}
                        </Text>
                    )}
                </TouchableOpacity>
                {membersExpanded && initialEmployees.length > 0 && (
                    <View style={{marginBottom: 16}}>
                        {initialEmployees.map((emp) => (
                            <TouchableOpacity
                                key={emp.id}
                                style={styles.listItem}
                                onPress={() => toggleMember(emp.id)}
                                activeOpacity={0.7}
                                testID={`contacts.batch_set.member.${emp.id}`}
                            >
                                <View style={[styles.checkbox, selectedIds.has(emp.id) ? styles.checkboxSelected : styles.checkboxUnselected]}>
                                    {selectedIds.has(emp.id) && <CompassIcon
                                        name='check'
                                        size={14}
                                        color='#fff'
                                                                />}
                                </View>
                                <View style={styles.listItemAvatar}>
                                    <ContactAvatar
                                        employee={emp}
                                        size={36}
                                    />
                                </View>
                                <Text
                                    style={styles.listItemName}
                                    numberOfLines={1}
                                >{emp.name}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}

                <Text style={[styles.sectionLabel, {marginTop: 8}]}>
                    {intl.formatMessage({id: 'contacts.set_for_members', defaultMessage: 'Set for members'})}
                </Text>
                <Text style={styles.sectionLabel}>
                    {intl.formatMessage({id: 'contacts.select_info_to_set', defaultMessage: 'Select information to set'})}
                </Text>
                <View style={styles.inputRow}>
                    <Text style={styles.inputLabel}>
                        {intl.formatMessage({id: 'contacts.position', defaultMessage: 'Position'})}
                    </Text>
                    <TextInput
                        style={styles.input}
                        value={position}
                        onChangeText={setPosition}
                        placeholder={intl.formatMessage({id: 'contacts.position_placeholder', defaultMessage: 'Enter position'})}
                        placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.4)}
                        testID='contacts.batch_set.position'
                    />
                </View>
                <View style={styles.inputRow}>
                    <Text style={styles.inputLabel}>
                        {intl.formatMessage({id: 'contacts.phone', defaultMessage: 'Phone'})}
                    </Text>
                    <TextInput
                        style={styles.input}
                        value={phone}
                        onChangeText={setPhone}
                        placeholder={intl.formatMessage({id: 'contacts.phone_placeholder', defaultMessage: 'Enter phone'})}
                        placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.4)}
                        keyboardType='phone-pad'
                        testID='contacts.batch_set.phone'
                    />
                </View>
                <View style={styles.inputRow}>
                    <Text style={styles.inputLabel}>
                        {intl.formatMessage({id: 'contacts.email', defaultMessage: 'Email'})}
                    </Text>
                    <TextInput
                        style={styles.input}
                        value={email}
                        onChangeText={setEmail}
                        placeholder={intl.formatMessage({id: 'contacts.email_placeholder', defaultMessage: 'Enter email'})}
                        placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.4)}
                        keyboardType='email-address'
                        autoCapitalize='none'
                        testID='contacts.batch_set.email'
                    />
                </View>
            </ScrollView>
            <View style={styles.bottomBar}>
                <TouchableOpacity
                    style={[styles.confirmButton, !canSubmit && styles.confirmButtonDisabled]}
                    onPress={handleConfirm}
                    disabled={!canSubmit}
                    activeOpacity={0.8}
                    testID='contacts.batch_set.confirm'
                >
                    <Text style={styles.confirmButtonText}>
                        {intl.formatMessage({id: 'common.confirm', defaultMessage: 'Confirm'})}
                    </Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
};

export default ContactsBatchSetMemberInfo;
