// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useDatabase} from '@nozbe/watermelondb/react';
import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {Alert, Modal, ScrollView, Text, TouchableOpacity, View} from 'react-native';

import {
    addEmployeeContact,
    fetchAllEmployeeContacts,
} from '@actions/remote/employee_contact';
import {fetchUserById} from '@actions/remote/user';
import {EmployeeContactTypes, type EmployeeContactType} from '@client/rest/employee_contact';
import CompassIcon from '@components/compass_icon';
import FormattedText from '@components/formatted_text';
import Loading from '@components/loading';
import ProfilePicture from '@components/profile_picture';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import {usePreventDoubleTap} from '@hooks/utils';
import SecurityManager from '@managers/security_manager';
import {getCurrentUserId} from '@queries/servers/system';
import {dismissModal} from '@screens/navigation';
import {makeStyleSheetFromTheme, changeOpacity} from '@utils/theme';
import {typography} from '@utils/typography';
import {user2FullPhone, username2Nickname} from '@utils/user';

import type {AvailableScreens} from '@typings/screens/navigation';

type AddUserToFriendsProps = {
    componentId: AvailableScreens;
    closeButtonId: string;
    uid?: string;

    /** 从供应商/客户表单扫码进入时限定联系人类型，主按钮一键添加并关闭 modal */
    forcedEmployeeContactType?: EmployeeContactType;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    scroll: {
        flex: 1,
    },
    centerContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingHorizontal: 20,
        paddingTop: 24,
    },
    card: {
        width: '100%',
        borderRadius: 16,
        backgroundColor: theme.centerChannelBg,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.12),
        padding: 16,
    },
    userRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    userTextContainer: {
        flex: 1,
        marginLeft: 12,
        minWidth: 0,
    },
    userName: {
        color: theme.centerChannelColor,
        ...typography('Heading', 300, 'SemiBold'),
    },
    userAccount: {
        marginTop: 2,
        color: changeOpacity(theme.centerChannelColor, 0.72),
        ...typography('Body', 75, 'Regular'),
    },
    relationSection: {
        marginTop: 16,
    },
    relationTitle: {
        color: changeOpacity(theme.centerChannelColor, 0.72),
        ...typography('Body', 75, 'SemiBold'),
        marginBottom: 8,
    },
    relationTagsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    relationTag: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
    },
    relationTagText: {
        ...typography('Body', 100, 'SemiBold'),
        marginLeft: 6,
    },
    noRelationText: {
        ...typography('Body', 100, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.64),
    },
    addButton: {
        marginTop: 20,
        width: '100%',
        borderRadius: 12,
        backgroundColor: theme.buttonBg,
        paddingVertical: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    addButtonDisabled: {
        backgroundColor: changeOpacity(theme.buttonBg, 0.4),
    },
    addButtonText: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.buttonColor,
    },
    loadingState: {
        marginTop: 60,
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 12,
        color: changeOpacity(theme.centerChannelColor, 0.72),
        ...typography('Body', 100, 'Regular'),
    },
    emptyStateIcon: {
        marginBottom: 12,
    },
    emptyStateTitle: {
        color: theme.centerChannelColor,
        textAlign: 'center',
        ...typography('Heading', 400, 'SemiBold'),
    },
    emptyStateSubtext: {
        marginTop: 8,
        color: changeOpacity(theme.centerChannelColor, 0.72),
        textAlign: 'center',
        ...typography('Body', 100, 'Regular'),
    },
    modalBackdrop: {
        flex: 1,
        backgroundColor: changeOpacity('#000000', 0.35),
        justifyContent: 'flex-end',
    },
    sheetContainer: {
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 24,
        backgroundColor: theme.centerChannelBg,
    },
    sheetHandle: {
        alignSelf: 'center',
        width: 36,
        height: 4,
        borderRadius: 2,
        marginBottom: 14,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.2),
    },
    sheetTitle: {
        ...typography('Heading', 200, 'SemiBold'),
        color: theme.centerChannelColor,
        textAlign: 'center',
        marginBottom: 14,
    },
    sheetOption: {
        borderRadius: 12,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.12),
        paddingHorizontal: 14,
        paddingVertical: 12,
        marginBottom: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    sheetOptionText: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    sheetOptionHint: {
        ...typography('Body', 75, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.64),
        marginTop: 2,
    },
    sheetOptionDisabled: {
        opacity: 0.5,
    },
    addedText: {
        ...typography('Body', 75, 'SemiBold'),
        color: theme.onlineIndicator,
    },
    sheetCancel: {
        marginTop: 2,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
    },
    sheetCancelText: {
        ...typography('Body', 100, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.72),
    },
    selfHint: {
        marginTop: 12,
        ...typography('Body', 100, 'Regular'),
        color: changeOpacity(theme.errorTextColor, 0.92),
        textAlign: 'center',
    },
    detailSection: {
        marginTop: 16,
        width: '100%',
    },
    detailSectionTitle: {
        ...typography('Body', 100, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.72),
        marginBottom: 10,
    },
    detailCard: {
        borderRadius: 12,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.08),
        overflow: 'hidden',
        backgroundColor: theme.centerChannelBg,
    },
    detailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.06),
    },
    detailRowLast: {
        borderBottomWidth: 0,
    },
    detailLabel: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        width: 88,
    },
    detailValue: {
        ...typography('Body', 200),
        color: theme.centerChannelColor,
        flex: 1,
    },
}));

type RelationState = {
    isSupplier: boolean;
    isCustomer: boolean;
};

const AddUserToFriends = ({componentId, closeButtonId, uid, forcedEmployeeContactType}: AddUserToFriendsProps) => {
    const theme = useTheme();
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const database = useDatabase();
    const styles = getStyleSheet(theme);
    const [currentUserId, setCurrentUserId] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [sheetVisible, setSheetVisible] = useState(false);
    const [targetUProfile, setTargetUProfile] = useState<UserProfile | undefined>();
    const [relationState, setRelationState] = useState<RelationState>({
        isSupplier: false,
        isCustomer: false,
    });

    const onClosePressed = useCallback(() => {
        dismissModal({componentId});
    }, [componentId]);

    useNavButtonPressed(closeButtonId, componentId, onClosePressed, []);
    useAndroidHardwareBackHandler(componentId, onClosePressed);

    useEffect(() => {
        let mounted = true;
        const loadData = async () => {
            if (!uid || !serverUrl) {
                if (mounted) {
                    setLoading(false);
                }
                return;
            }
            setLoading(true);
            const currUid = await getCurrentUserId(database);
            const [targetUProfile, relationRes] = await Promise.all([
                fetchUserById(serverUrl, uid),
                currUid ? fetchAllEmployeeContacts(currUid) : Promise.resolve({}),
            ]);
            if (!mounted) {
                return;
            }
            const suppliers = relationRes.data?.suppliers ?? [];
            const customers = relationRes.data?.customers ?? [];
            setCurrentUserId(currUid);
            setTargetUProfile(targetUProfile);
            setRelationState({
                isSupplier: suppliers.some((contact) => contact.id === uid),
                isCustomer: customers.some((contact) => contact.id === uid),
            });
            setLoading(false);
        };
        loadData();
        return () => {
            mounted = false;
        };
    }, [database, intl.locale, serverUrl, uid]);

    const refreshRelations = useCallback(async () => {
        if (!currentUserId || !uid) {
            return;
        }
        const relationRes = await fetchAllEmployeeContacts(currentUserId);
        const suppliers = relationRes.data?.suppliers ?? [];
        const customers = relationRes.data?.customers ?? [];
        setRelationState({
            isSupplier: suppliers.some((contact) => contact.id === uid),
            isCustomer: customers.some((contact) => contact.id === uid),
        });
    }, [currentUserId, uid]);

    const addRelation = usePreventDoubleTap(useCallback(async (kind: typeof EmployeeContactTypes.Supplier | typeof EmployeeContactTypes.Customer) => {
        if (!currentUserId || !uid || saving || uid === currentUserId) {
            return;
        }
        setSaving(true);
        const result = await addEmployeeContact(currentUserId, {
            contact_id: uid,
            contact_type: kind,
        });
        setSaving(false);
        if (result.error) {
            Alert.alert(
                intl.formatMessage({id: 'add_user_to_friends.error_title', defaultMessage: 'Error'}),
                intl.formatMessage({id: 'add_user_to_friends.error_add_failed', defaultMessage: 'Failed to add. Please try again.'}),
            );
            return;
        }
        await refreshRelations();
        setSheetVisible(false);
        if (forcedEmployeeContactType) {
            dismissModal({componentId});
        }
    }, [componentId, currentUserId, forcedEmployeeContactType, intl, refreshRelations, saving, uid]));

    const hasAnyRelation = relationState.isSupplier || relationState.isCustomer;
    const allRelationsAdded = relationState.isSupplier && relationState.isCustomer;
    const isSelf = Boolean(uid && currentUserId && uid === currentUserId);
    const isForcedMode =
        forcedEmployeeContactType === EmployeeContactTypes.Supplier ||
        forcedEmployeeContactType === EmployeeContactTypes.Customer;
    let forcedTypeAlreadyAdded = false;
    if (forcedEmployeeContactType === EmployeeContactTypes.Supplier) {
        forcedTypeAlreadyAdded = relationState.isSupplier;
    } else if (forcedEmployeeContactType === EmployeeContactTypes.Customer) {
        forcedTypeAlreadyAdded = relationState.isCustomer;
    }
    const mainButtonDisabled = isForcedMode? saving || isSelf || forcedTypeAlreadyAdded: saving || allRelationsAdded || isSelf;

    let addContactButtonId = 'add_user_to_friends.add_contact';
    let addContactButtonDefault = 'Add contact';
    if (isForcedMode) {
        if (forcedEmployeeContactType === EmployeeContactTypes.Supplier) {
            addContactButtonId = 'add_user_to_friends.add_as_supplier_button';
            addContactButtonDefault = 'Add as supplier';
        } else {
            addContactButtonId = 'add_user_to_friends.add_as_customer_button';
            addContactButtonDefault = 'Add as customer';
        }
    }

    const userDisplayName = username2Nickname(targetUProfile, {locale: intl.locale, includeFullName: false}) ?? uid ?? '-';
    const userAccount = targetUProfile?.username ? `@${targetUProfile.username}` : '';

    const renderRelationTag = (
        iconName: string,
        label: string,
        color: string,
    ) => (
        <View
            style={[
                styles.relationTag,
                {backgroundColor: changeOpacity(color, 0.1)},
            ]}
        >
            <CompassIcon
                name={iconName}
                size={16}
                color={color}
            />
            <Text style={[styles.relationTagText, {color}]}>
                {label}
            </Text>
        </View>
    );

    return (
        <View
            style={styles.container}
            nativeID={SecurityManager.getShieldScreenId(componentId)}
            testID='add_user_to_friends.screen'
        >
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.centerContainer}
                keyboardShouldPersistTaps='handled'
                showsVerticalScrollIndicator={false}
            >
                {loading ? (
                    <View style={styles.loadingState}>
                        <Loading
                            color={theme.centerChannelColor}
                            size='large'
                        />
                        <FormattedText
                            style={styles.loadingText}
                            id='add_user_to_friends.loading'
                            defaultMessage='Loading user information...'
                        />
                    </View>
                ) : !uid ? (
                    <>
                        <View style={styles.emptyStateIcon}>
                            <CompassIcon
                                name='qrcode-scan'
                                size={64}
                                color={changeOpacity(theme.centerChannelColor, 0.4)}
                            />
                        </View>
                        <FormattedText
                            style={styles.emptyStateTitle}
                            id='add_user_to_friends.invalid_qr'
                            defaultMessage='Invalid QR code'
                        />
                    </>
                ) : (
                    <>
                        <View style={styles.card}>
                            <View style={styles.userRow}>
                                {targetUProfile ? (
                                    <ProfilePicture
                                        author={targetUProfile}
                                        size={52}
                                        showStatus={false}
                                    />
                                ) : (
                                    <CompassIcon
                                        name='account-outline'
                                        size={52}
                                        color={changeOpacity(theme.centerChannelColor, 0.4)}
                                    />
                                )}
                                <View style={styles.userTextContainer}>
                                    <Text
                                        style={styles.userName}
                                        numberOfLines={2}
                                    >
                                        {userDisplayName}
                                    </Text>
                                    {userAccount ? (
                                        <Text
                                            style={styles.userAccount}
                                            numberOfLines={1}
                                        >
                                            {userAccount}
                                        </Text>
                                    ) : null}
                                </View>
                            </View>

                            <View style={styles.relationSection}>
                                <FormattedText
                                    style={styles.relationTitle}
                                    id='add_user_to_friends.current_relation'
                                    defaultMessage='Current relation'
                                />
                                <View style={styles.relationTagsRow}>
                                    {relationState.isSupplier &&
                                        renderRelationTag(
                                            'car-outline',
                                            intl.formatMessage({id: 'supplier_customer.type_supplier', defaultMessage: 'Supplier'}),
                                            theme.linkColor,
                                        )}
                                    {relationState.isCustomer &&
                                        renderRelationTag(
                                            'account-multiple-outline',
                                            intl.formatMessage({id: 'supplier_customer.type_customer', defaultMessage: 'Customer'}),
                                            theme.onlineIndicator,
                                        )}
                                    {!hasAnyRelation ? (
                                        <FormattedText
                                            style={styles.noRelationText}
                                            id='add_user_to_friends.no_relation'
                                            defaultMessage='Not added yet'
                                        />
                                    ) : null}
                                </View>
                            </View>
                        </View>

                        {isSelf ? (
                            <FormattedText
                                style={styles.selfHint}
                                id='add_user_to_friends.cannot_add_self'
                                defaultMessage='You cannot add yourself as a contact.'
                            />
                        ) : null}

                        {(targetUProfile?.email || targetUProfile?.phone || targetUProfile?.position) ? (
                            <View style={styles.detailSection}>
                                <Text style={styles.detailSectionTitle}>
                                    {intl.formatMessage({id: 'contacts.contact_info', defaultMessage: 'Contact Info'})}
                                </Text>
                                <View style={styles.detailCard}>
                                    {targetUProfile.email ? (
                                        <View
                                            style={[
                                                styles.detailRow,
                                                !(targetUProfile.phone || targetUProfile.position) && styles.detailRowLast,
                                            ]}
                                        >
                                            <Text style={styles.detailLabel}>
                                                {intl.formatMessage({id: 'contacts.email', defaultMessage: 'Email'})}
                                            </Text>
                                            <Text
                                                style={styles.detailValue}
                                                numberOfLines={2}
                                            >
                                                {targetUProfile.email}
                                            </Text>
                                        </View>
                                    ) : null}
                                    {targetUProfile.phone ? (
                                        <View
                                            style={[
                                                styles.detailRow,
                                                !targetUProfile.position && styles.detailRowLast,
                                            ]}
                                        >
                                            <Text style={styles.detailLabel}>
                                                {intl.formatMessage({id: 'contacts.phone', defaultMessage: 'Phone'})}
                                            </Text>
                                            <Text
                                                style={styles.detailValue}
                                                numberOfLines={1}
                                            >
                                                {user2FullPhone(targetUProfile)}
                                            </Text>
                                        </View>
                                    ) : null}
                                    {targetUProfile.position ? (
                                        <View style={[styles.detailRow, styles.detailRowLast]}>
                                            <Text style={styles.detailLabel}>
                                                {intl.formatMessage({id: 'contacts.position', defaultMessage: 'Position'})}
                                            </Text>
                                            <Text
                                                style={styles.detailValue}
                                                numberOfLines={2}
                                            >
                                                {targetUProfile.position}
                                            </Text>
                                        </View>
                                    ) : null}
                                </View>
                            </View>
                        ) : null}

                        <TouchableOpacity
                            style={[styles.addButton, mainButtonDisabled && styles.addButtonDisabled]}
                            disabled={mainButtonDisabled}
                            onPress={() => {
                                if (isForcedMode && forcedEmployeeContactType) {
                                    addRelation(forcedEmployeeContactType);
                                } else {
                                    setSheetVisible(true);
                                }
                            }}
                            testID='add_user_to_friends.add_contact'
                        >
                            {saving ? (
                                <Loading
                                    color={theme.buttonColor}
                                    size='small'
                                />
                            ) : (
                                <FormattedText
                                    style={styles.addButtonText}
                                    id={addContactButtonId}
                                    defaultMessage={addContactButtonDefault}
                                />
                            )}
                        </TouchableOpacity>
                    </>
                )}
            </ScrollView>

            {isForcedMode ? null : (
                <Modal
                    transparent={true}
                    visible={sheetVisible}
                    animationType='fade'
                    onRequestClose={() => setSheetVisible(false)}
                >
                    <TouchableOpacity
                        style={styles.modalBackdrop}
                        activeOpacity={1}
                        onPress={() => setSheetVisible(false)}
                    >
                        <TouchableOpacity
                            style={styles.sheetContainer}
                            activeOpacity={1}
                            onPress={(e) => e.stopPropagation()}
                        >
                            <View style={styles.sheetHandle}/>
                            <FormattedText
                                style={styles.sheetTitle}
                                id='add_user_to_friends.add_to'
                                defaultMessage='Add to'
                            />

                            <TouchableOpacity
                                style={[styles.sheetOption, relationState.isSupplier && styles.sheetOptionDisabled]}
                                disabled={relationState.isSupplier || saving}
                                onPress={() => addRelation(EmployeeContactTypes.Supplier)}
                                testID='add_user_to_friends.add_supplier'
                            >
                                <View>
                                    <FormattedText
                                        style={styles.sheetOptionText}
                                        id='add_user_to_friends.add_to_supplier'
                                        defaultMessage='Add as supplier'
                                    />
                                    {relationState.isSupplier ? (
                                        <FormattedText
                                            style={styles.sheetOptionHint}
                                            id='add_user_to_friends.already_added_hint'
                                            defaultMessage='Already added'
                                        />
                                    ) : null}
                                </View>
                                {relationState.isSupplier ? (
                                    <FormattedText
                                        style={styles.addedText}
                                        id='add_user_to_friends.already_added'
                                        defaultMessage='Added'
                                    />
                                ) : null}
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.sheetOption, relationState.isCustomer && styles.sheetOptionDisabled]}
                                disabled={relationState.isCustomer || saving}
                                onPress={() => addRelation(EmployeeContactTypes.Customer)}
                                testID='add_user_to_friends.add_customer'
                            >
                                <View>
                                    <FormattedText
                                        style={styles.sheetOptionText}
                                        id='add_user_to_friends.add_to_customer'
                                        defaultMessage='Add as customer'
                                    />
                                    {relationState.isCustomer ? (
                                        <FormattedText
                                            style={styles.sheetOptionHint}
                                            id='add_user_to_friends.already_added_hint'
                                            defaultMessage='Already added'
                                        />
                                    ) : null}
                                </View>
                                {relationState.isCustomer ? (
                                    <FormattedText
                                        style={styles.addedText}
                                        id='add_user_to_friends.already_added'
                                        defaultMessage='Added'
                                    />
                                ) : null}
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.sheetCancel}
                                onPress={() => setSheetVisible(false)}
                                testID='add_user_to_friends.sheet_cancel'
                            >
                                <FormattedText
                                    style={styles.sheetCancelText}
                                    id='common.cancel'
                                    defaultMessage='Cancel'
                                />
                            </TouchableOpacity>
                        </TouchableOpacity>
                    </TouchableOpacity>
                </Modal>
            )}
        </View>
    );
};

export default AddUserToFriends;
