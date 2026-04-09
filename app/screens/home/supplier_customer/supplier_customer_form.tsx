// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    Alert,
    DeviceEventEmitter,
    Platform,
    ScrollView,
    StatusBar,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import Animated, {useAnimatedStyle, withTiming} from 'react-native-reanimated';
import {type Edge, SafeAreaView} from 'react-native-safe-area-context';

import {
    addEmployeeContact,
    searchEmployeeContacts,
    updateEmployeeContact,
    type ContactEmployeeSearchRow,
} from '@actions/remote/employee_contact';
import {EmployeeContactTypes, type EmployeeContactType} from '@client/rest/employee_contact';
import ContactAvatar from '@components/contact_avatar';
import CompassIcon from '@components/compass_icon';
import Loading from '@components/loading';
import ProfilePicture from '@components/profile_picture';
import {Events} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {usePreventDoubleTap} from '@hooks/utils';
import NetworkManager from '@managers/network_manager';
import {dismissModal} from '@screens/navigation';
import {showQrScannerModal} from '@screens/qr_scanner/show_modal';
import {logError} from '@utils/log';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {ContactEmployee} from '@client/rest/contact';
import type {AvailableScreens} from '@typings/screens/navigation';

/** Stack/Modal 内：统一由 SafeAreaView 处理四边，避免 topInset 条带与导航层叠加 */
const edges: Edge[] = ['top', 'bottom', 'left', 'right'];

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    flex: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 8,
        paddingVertical: 4,
        backgroundColor: theme.sidebarBg,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    headerBack: {
        padding: 8,
        marginRight: 4,
    },
    headerTitle: {
        ...typography('Heading', 600, 'SemiBold'),
        color: theme.sidebarHeaderTextColor,
        textAlign: 'center',
        flex: 1,
        marginHorizontal: 8,
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    headerAction: {
        padding: 4,
        minWidth: 36,
        alignItems: 'flex-end',
    },
    bodyScroll: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    scrollInner: {
        flexGrow: 1,
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 24,
    },
    section: {
        backgroundColor: theme.centerChannelBg,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.1),
        padding: 16,
        marginBottom: 16,
    },
    sectionTitle: {
        ...typography('Body', 100, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.72),
        marginBottom: 12,
    },
    label: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.centerChannelColor,
        marginBottom: 8,
    },
    input: {
        ...typography('Body', 200),
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.06),
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
        color: theme.centerChannelColor,
        minHeight: 48,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    searchRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    searchInputWrap: {
        flex: 1,
        marginRight: 8,
    },
    searchButton: {
        minWidth: 88,
        height: 48,
        borderRadius: 10,
        backgroundColor: theme.buttonBg,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 14,
    },
    searchButtonDisabled: {
        backgroundColor: changeOpacity(theme.buttonBg, 0.4),
    },
    searchButtonText: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.buttonColor,
    },
    selectedContactCard: {
        marginTop: 10,
        marginBottom: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: changeOpacity(theme.linkColor, 0.35),
        backgroundColor: changeOpacity(theme.linkColor, 0.08),
        paddingHorizontal: 12,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
    },
    selectedContactMeta: {
        flex: 1,
        minWidth: 0,
        marginLeft: 10,
    },
    selectedContactHint: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.64),
    },
    searchResultContainer: {
        marginTop: 2,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.1),
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.02),
    },
    textArea: {
        minHeight: 100,
        textAlignVertical: 'top',
    },
    hintText: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.64),
        marginBottom: 14,
        lineHeight: 20,
    },
    searchResultRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 11,
        paddingHorizontal: 12,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
        backgroundColor: theme.centerChannelBg,
    },
    searchResultRowDisabled: {
        opacity: 0.55,
    },
    searchResultRowLast: {
        borderBottomWidth: 0,
    },
    resultAvatarWrap: {
        marginRight: 10,
    },
    resultActionText: {
        ...typography('Body', 75, 'SemiBold'),
        color: theme.linkColor,
    },
    resultAddedText: {
        ...typography('Body', 75, 'SemiBold'),
        color: changeOpacity(theme.errorTextColor, 0.85),
    },
    searchResultName: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    searchResultMeta: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.64),
        marginTop: 4,
    },
    readonlyValue: {
        ...typography('Body', 200),
        color: theme.centerChannelColor,
        paddingVertical: 10,
    },
    contactRow: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.1),
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 12,
    },
    contactIconWrap: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
        marginRight: 10,
    },
    contactMeta: {
        flex: 1,
        minWidth: 0,
    },
    contactName: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    contactHint: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.64),
        marginTop: 2,
    },
    contactReadonlyCard: {
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.1),
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.03),
        borderRadius: 12,
        padding: 16,
    },
    contactHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
    },
    contactAvatarWrap: {
        marginRight: 14,
    },
    contactNameBlock: {
        flex: 1,
        minWidth: 0,
    },
    contactNameMain: {
        ...typography('Heading', 200, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    readonlyDetailRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingVertical: 10,
        borderTopWidth: 1,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.06),
    },
    readonlyDetailLabel: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        width: 88,
    },
    readonlyDetailValue: {
        ...typography('Body', 200),
        color: theme.centerChannelColor,
        flex: 1,
    },
    relationSectionSubtitle: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.64),
        marginBottom: 12,
        lineHeight: 20,
    },
    fieldDivider: {
        height: 1,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
        marginVertical: 4,
    },
    fieldGroupHint: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.6),
        marginBottom: 8,
        lineHeight: 18,
    },
    loadingBox: {
        paddingVertical: 20,
        alignItems: 'center',
    },
    saveButtonSection: {
        marginTop: 8,
        marginBottom: 8,
    },
    saveButton: {
        backgroundColor: theme.buttonBg,
        borderRadius: 12,
        paddingVertical: 15,
        alignItems: 'center',
    },
    saveButtonDisabled: {
        backgroundColor: changeOpacity(theme.buttonBg, 0.4),
    },
    saveButtonText: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.buttonColor,
    },
}));

export type SupplierCustomerFormProps = {
    kind: EmployeeContactType;
    ownerId: string;
    existingContactId?: string;
    initialContactName?: string;
    initialDescription?: string;
    initialRemark?: string;
    initialContactEmail?: string;
    initialContactPhone?: string;
    initialContactPosition?: string;
    mattermostUserIdForAvatar?: string;
    onBack?: () => void;
    componentId?: AvailableScreens;

    /** 编辑关系说明保存成功后回写上层（如个人信息弹窗），避免仍显示旧的 description */
    onRelationDescriptionSaved?: (nextDescription: string) => void;

    /** 编辑备注名保存成功后回写上层 */
    onRemarkSaved?: (nextRemark: string) => void;
};

const SupplierCustomerFormScreen = ({
    kind,
    ownerId,
    existingContactId,
    initialContactName,
    initialDescription,
    initialRemark,
    initialContactEmail,
    initialContactPhone,
    initialContactPosition,
    mattermostUserIdForAvatar,
    onBack,
    componentId,
    onRelationDescriptionSaved,
    onRemarkSaved,
}: SupplierCustomerFormProps) => {
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const intl = useIntl();
    const styles = getStyleSheet(theme);

    const [searchKeyword, setSearchKeyword] = useState('');
    const [searchResults, setSearchResults] = useState<ContactEmployeeSearchRow[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [selectedEmployee, setSelectedEmployee] = useState<ContactEmployee | null>(null);
    const [description, setDescription] = useState(initialDescription ?? '');
    const [remark, setRemark] = useState(initialRemark ?? '');
    const [saving, setSaving] = useState(false);
    const [avatarMattermostUserId, setAvatarMattermostUserId] = useState<string | null>(null);

    const handleClose = useCallback(() => {
        if (onBack) {
            onBack();
            return;
        }
        if (componentId) {
            dismissModal({componentId});
        }
    }, [componentId, onBack]);

    const isEdit = Boolean(existingContactId);
    const isSupplierKind = kind === EmployeeContactTypes.Supplier;

    useEffect(() => {
        setDescription(initialDescription ?? '');
    }, [initialDescription, existingContactId]);

    useEffect(() => {
        setRemark(initialRemark ?? '');
    }, [initialRemark, existingContactId]);

    useEffect(() => {
        if (!isEdit) {
            return;
        }
        if (mattermostUserIdForAvatar) {
            setAvatarMattermostUserId(mattermostUserIdForAvatar);
            return;
        }
        setAvatarMattermostUserId(null);
        const email = initialContactEmail?.trim();
        if (!email || !serverUrl) {
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const client = NetworkManager.getClient(serverUrl);
                const user = await client.getUserByEmail(email);
                if (!cancelled && user?.id) {
                    setAvatarMattermostUserId(user.id);
                }
            } catch (e) {
                logError('[SupplierCustomerFormScreen.resolveAvatarUser]', e);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [existingContactId, initialContactEmail, isEdit, mattermostUserIdForAvatar, serverUrl]);

    const displayContactEmployee = useMemo(
        (): ContactEmployee => ({
            id: existingContactId ?? 'contact',
            name: initialContactName ?? '',
            email: initialContactEmail,
            phone: initialContactPhone,
            position: initialContactPosition,
        }),
        [existingContactId, initialContactEmail, initialContactName, initialContactPhone, initialContactPosition],
    );
    const typeLabel = isSupplierKind ? intl.formatMessage({id: 'supplier_customer.type_supplier', defaultMessage: 'Supplier'}) : intl.formatMessage({id: 'supplier_customer.type_customer', defaultMessage: 'Customer'});
    const addScreenTitle = intl.formatMessage({id: 'supplier_customer.form_add_title', defaultMessage: 'Add'});
    const headerTitle = isEdit
        ? (isSupplierKind
            ? intl.formatMessage({id: 'supplier_customer.form_edit_supplier_title', defaultMessage: 'Edit supplier'})
            : intl.formatMessage({id: 'supplier_customer.form_edit_customer_title', defaultMessage: 'Edit customer'}))
        : `${addScreenTitle} ${typeLabel}`;

    const runSearch = useCallback(
        async (kw: string) => {
            if (!kw.trim()) {
                setSearchResults([]);
                setHasSearched(false);
                return;
            }
            setSearchLoading(true);
            setHasSearched(true);
            try {
                const contactType = isSupplierKind ? EmployeeContactTypes.Supplier : EmployeeContactTypes.Customer;
                const result = await searchEmployeeContacts(contactType, ownerId, kw.trim());
                if (result.error || !result.data) {
                    setSearchResults([]);
                    return;
                }
                const rows = result.data;
                setSearchResults(rows);
                setSelectedEmployee((current) => {
                    if (!current) {
                        return null;
                    }
                    const hit = rows.find((r) => r.employee.id === current.id);
                    if (hit?.alreadyAdded) {
                        return null;
                    }
                    return current;
                });
            } finally {
                setSearchLoading(false);
            }
        },
        [isSupplierKind, ownerId],
    );

    const handleSearch = usePreventDoubleTap(useCallback(() => {
        if (!isEdit) {
            runSearch(searchKeyword);
        }
    }, [isEdit, runSearch, searchKeyword]));
    const handleScan = usePreventDoubleTap(useCallback(() => {
        if (!isEdit) {
            showQrScannerModal(intl, {
                extra: {
                    forcedEmployeeContactType: isSupplierKind
                        ? EmployeeContactTypes.Supplier
                        : EmployeeContactTypes.Customer,
                },
            });
        }
    }, [intl, isEdit, isSupplierKind]));

    const animated = useAnimatedStyle(() => ({
        opacity: withTiming(1, {duration: 150}),
        transform: [{translateX: withTiming(0, {duration: 150})}],
    }), []);

    const isSelectedAlreadyAdded = useMemo(() => {
        if (!selectedEmployee) {
            return false;
        }
        return searchResults.some(
            (r) => r.employee.id === selectedEmployee.id && r.alreadyAdded,
        );
    }, [searchResults, selectedEmployee]);

    const canSaveAdd = Boolean(selectedEmployee) && !isSelectedAlreadyAdded && !saving;
    const canSaveEdit = isEdit && !saving;
    const canSave = isEdit ? canSaveEdit : canSaveAdd;

    const showErrorAlert = useCallback(
        (message?: string) => {
            Alert.alert(
                intl.formatMessage({id: 'supplier_customer.error_title', defaultMessage: 'Error'}),
                message ??
                    intl.formatMessage({id: 'supplier_customer.error_save', defaultMessage: 'Could not save. Please try again.'}),
            );
        },
        [intl],
    );

    const handleSave = usePreventDoubleTap(
        useCallback(async () => {
            if (isEdit) {
                if (!existingContactId || !canSaveEdit) {
                    return;
                }
                if (!ownerId) {
                    showErrorAlert(
                        intl.formatMessage({
                            id: 'supplier_customer.error_missing_owner',
                            defaultMessage: 'Could not determine your account. Close this screen and try again.',
                        }),
                    );
                    return;
                }
                setSaving(true);
                try {
                    const trimmedDesc = description.trim();
                    const trimmedRemark = remark.trim();
                    const result = await updateEmployeeContact(ownerId, existingContactId, kind, {
                        description: trimmedDesc || undefined,
                        remark: trimmedRemark || undefined,
                    });
                    if (result.error) {
                        showErrorAlert(
                            intl.formatMessage({
                                id: 'supplier_customer.error_update_relation',
                                defaultMessage: 'Could not update. If the relationship was removed, add the contact again.',
                            }),
                        );
                    } else {
                        DeviceEventEmitter.emit(Events.SUPPLIER_CUSTOMER_CONTACTS_CHANGED, {contactType: kind});
                        onRelationDescriptionSaved?.(trimmedDesc);
                        onRemarkSaved?.(trimmedRemark);
                        handleClose();
                    }
                } catch {
                    showErrorAlert();
                } finally {
                    setSaving(false);
                }
                return;
            }

            if (!selectedEmployee || !canSaveAdd) {
                return;
            }
            setSaving(true);
            try {
                const result = await addEmployeeContact(ownerId, {
                    contact_id: selectedEmployee.id,
                    contact_type: kind,
                    description: description.trim() || undefined,
                    remark: remark.trim() || undefined,
                });
                if (result.error) {
                    showErrorAlert();
                } else {
                    DeviceEventEmitter.emit(Events.SUPPLIER_CUSTOMER_CONTACTS_CHANGED, {contactType: kind});
                    handleClose();
                }
            } catch {
                showErrorAlert();
            } finally {
                setSaving(false);
            }
        }, [
            canSaveAdd,
            canSaveEdit,
            description,
            remark,
            existingContactId,
            intl,
            isEdit,
            kind,
            handleClose,
            onRelationDescriptionSaved,
            onRemarkSaved,
            ownerId,
            selectedEmployee,
            showErrorAlert,
        ]),
    );

    const searchSectionTitle = intl.formatMessage({
        id: 'supplier_customer.section_search',
        defaultMessage: 'Select contact',
    });
    const sectionTitle = intl.formatMessage({
        id: 'supplier_customer.relation_info',
        defaultMessage: 'Relation Info',
    });
    const remarkLabel = intl.formatMessage({id: 'supplier_customer.field_remark', defaultMessage: 'Remark name'});
    const relationDescriptionLabel = intl.formatMessage({
        id: 'supplier_customer.relation',
        defaultMessage: 'Relation description',
    });
    const addDescriptionPlaceholder = intl.formatMessage({
        id: 'supplier_customer.add_description_placeholder',
        defaultMessage: 'Example: Main purchasing contact for ACME project. Follows up every Tuesday.',
    });
    const filteredSearchResults = useMemo(() => {
        if (!selectedEmployee) {
            return searchResults;
        }
        return searchResults.filter((row) => row.employee.id !== selectedEmployee.id);
    }, [searchResults, selectedEmployee]);

    const addBody = (
        <>
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>{searchSectionTitle}</Text>
                <Text style={styles.hintText}>
                    {intl.formatMessage({
                        id: 'supplier_customer.search_directory_hint',
                        defaultMessage: 'Search contacts by full nickname, email, or phone number.',
                    })}
                </Text>
                <View style={styles.searchRow}>
                    <View style={styles.searchInputWrap}>
                        <TextInput
                            style={styles.input}
                            value={searchKeyword}
                            onChangeText={setSearchKeyword}
                            placeholder={intl.formatMessage({
                                id: 'supplier_customer.search_employee_placeholder',
                                defaultMessage: 'Enter keyword to search…',
                            })}
                            placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.48)}
                            autoCorrect={false}
                            returnKeyType='search'
                            onSubmitEditing={handleSearch}
                        />
                    </View>
                    <TouchableOpacity
                        style={[styles.searchButton, !searchKeyword.trim() && styles.searchButtonDisabled]}
                        onPress={handleSearch}
                        disabled={!searchKeyword.trim()}
                        activeOpacity={0.8}
                        testID='supplier_customer.form.search'
                    >
                        <Text style={styles.searchButtonText}>
                            {intl.formatMessage({id: 'search_bar.search', defaultMessage: 'Search'})}
                        </Text>
                    </TouchableOpacity>
                </View>
                {selectedEmployee ? (
                    <View style={styles.selectedContactCard}>
                        <ContactAvatar
                            employee={selectedEmployee}
                            size={40}
                        />
                        <View style={styles.selectedContactMeta}>
                            <Text
                                style={styles.searchResultName}
                                numberOfLines={1}
                            >
                                {selectedEmployee.name}
                            </Text>
                            <Text style={styles.selectedContactHint}>
                                {intl.formatMessage({id: 'supplier_customer.selected_badge', defaultMessage: 'Selected'})}
                            </Text>
                        </View>
                        <CompassIcon
                            name='check-circle'
                            size={20}
                            color={theme.linkColor}
                        />
                    </View>
                ) : null}
                {searchLoading ? (
                    <View style={styles.loadingBox}>
                        <Loading
                            color={theme.centerChannelColor}
                            size='small'
                        />
                    </View>
                ) : (
                    <View>
                        {filteredSearchResults.length > 0 && (
                            <View style={styles.searchResultContainer}>
                                {filteredSearchResults.map((row, index) => {
                                    const {employee, alreadyAdded} = row;
                                    const isLast = index === filteredSearchResults.length - 1;
                                    const meta = [employee.email, employee.phone, employee.position].filter(Boolean).join(' · ');
                                    return (
                                        <TouchableOpacity
                                            key={employee.id}
                                            style={[
                                                styles.searchResultRow,
                                                isLast && styles.searchResultRowLast,
                                                alreadyAdded && styles.searchResultRowDisabled,
                                            ]}
                                            onPress={() => {
                                                if (!alreadyAdded) {
                                                    setSelectedEmployee(employee);
                                                }
                                            }}
                                            disabled={alreadyAdded}
                                            activeOpacity={alreadyAdded ? 1 : 0.7}
                                        >
                                            <View style={styles.resultAvatarWrap}>
                                                <ContactAvatar
                                                    employee={employee}
                                                    size={36}
                                                />
                                            </View>
                                            <View style={styles.flex}>
                                                <Text style={styles.searchResultName}>{employee.name}</Text>
                                                {meta ? <Text style={styles.searchResultMeta}>{meta}</Text> : null}
                                            </View>
                                            {alreadyAdded ? (
                                                <Text style={styles.resultAddedText}>
                                                    {intl.formatMessage({
                                                        id: 'supplier_customer.already_added_badge',
                                                        defaultMessage: 'Added',
                                                    })}
                                                </Text>
                                            ) : (
                                                <Text style={styles.resultActionText}>
                                                    {intl.formatMessage({id: 'supplier_customer.select_action', defaultMessage: 'Select'})}
                                                </Text>
                                            )}
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        )}
                        {hasSearched && filteredSearchResults.length === 0 && !searchLoading ? (
                            <Text style={[styles.hintText, {marginBottom: 0, marginTop: 4}]}>
                                {intl.formatMessage({
                                    id: 'supplier_customer.no_search_results',
                                    defaultMessage: 'No matching contacts. Refine your search.',
                                })}
                            </Text>
                        ) : null}
                    </View>
                )}
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>{sectionTitle}</Text>
                <Text style={styles.label}>
                    {remarkLabel}
                </Text>
                <Text style={styles.fieldGroupHint}>
                    {intl.formatMessage({
                        id: 'supplier_customer.add_remark_hint',
                        defaultMessage: 'Optional. When set, your list shows this remark instead of their nickname.',
                    })}
                </Text>
                <TextInput
                    style={styles.input}
                    value={remark}
                    onChangeText={setRemark}
                    placeholder={intl.formatMessage({
                        id: 'supplier_customer.add_remark_placeholder',
                        defaultMessage: 'e.g. ACME purchasing contact',
                    })}
                    placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.48)}
                    autoCorrect={false}
                />
                <View style={styles.fieldDivider} />
                <Text style={styles.label}>{relationDescriptionLabel}</Text>
                <Text style={styles.fieldGroupHint}>
                    {intl.formatMessage({
                        id: 'supplier_customer.relation_edit_hint',
                        defaultMessage: 'Update the note that describes how you work with this contact.',
                    })}
                </Text>
                <TextInput
                    style={[styles.input, styles.textArea]}
                    value={description}
                    onChangeText={setDescription}
                    placeholder={addDescriptionPlaceholder}
                    placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.48)}
                    multiline={true}
                    numberOfLines={4}
                />
            </View>
        </>
    );

    const editNotesSectionTitle = sectionTitle;
    const relationDescriptionHint = intl.formatMessage({
        id: 'supplier_customer.relation_edit_hint',
        defaultMessage: 'Update the note that describes how you work with this contact.',
    });
    const editDescriptionPlaceholder = intl.formatMessage({
        id: 'supplier_customer.field_description_edit_placeholder',
        defaultMessage: 'How do you work together? Add context—for example projects, roles, or reminders—for yourself and your enterprise. (optional)',
    });

    const editBody = (
        <>
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                    {intl.formatMessage({id: 'supplier_customer.linked_employee', defaultMessage: 'Contact'})}
                </Text>
                <Text style={[styles.hintText, {marginBottom: 12}]}>
                    {intl.formatMessage({
                        id: 'supplier_customer.contact_readonly_hint',
                        defaultMessage: 'Directory details below are read-only. Use the next section to change your list label and notes.',
                    })}
                </Text>
                <View style={styles.contactReadonlyCard}>
                    <View style={styles.contactHeaderRow}>
                        <View style={styles.contactAvatarWrap}>
                            {avatarMattermostUserId ? (
                                <ProfilePicture
                                    author={{id: avatarMattermostUserId} as UserProfile}
                                    showStatus={false}
                                    size={56}
                                />
                            ) : (
                                <ContactAvatar
                                    employee={displayContactEmployee}
                                    size={56}
                                />
                            )}
                        </View>
                        <View style={styles.contactNameBlock}>
                            <Text
                                style={styles.contactNameMain}
                                numberOfLines={2}
                            >
                                {(initialRemark?.trim() || initialContactName) ?? existingContactId}
                            </Text>
                            {initialRemark?.trim() ? (
                                <Text
                                    style={styles.contactHint}
                                    numberOfLines={2}
                                >
                                    {intl.formatMessage({
                                        id: 'supplier_customer.directory_name_subtitle',
                                        defaultMessage: 'Nickname',
                                    })}
                                    {': '}
                                    {initialContactName ?? ''}
                                </Text>
                            ) : null}
                        </View>
                    </View>
                    {initialContactEmail ? (
                        <View style={styles.readonlyDetailRow}>
                            <Text style={styles.readonlyDetailLabel}>
                                {intl.formatMessage({id: 'contacts.email', defaultMessage: 'Email'})}
                            </Text>
                            <Text
                                style={styles.readonlyDetailValue}
                                selectable={true}
                            >
                                {initialContactEmail}
                            </Text>
                        </View>
                    ) : null}
                    {initialContactPhone ? (
                        <View style={styles.readonlyDetailRow}>
                            <Text style={styles.readonlyDetailLabel}>
                                {intl.formatMessage({id: 'contacts.phone', defaultMessage: 'Phone'})}
                            </Text>
                            <Text
                                style={styles.readonlyDetailValue}
                                selectable={true}
                            >
                                {initialContactPhone}
                            </Text>
                        </View>
                    ) : null}
                    {initialContactPosition ? (
                        <View style={styles.readonlyDetailRow}>
                            <Text style={styles.readonlyDetailLabel}>
                                {intl.formatMessage({id: 'channel_info.position', defaultMessage: 'Position'})}
                            </Text>
                            <Text
                                style={styles.readonlyDetailValue}
                                selectable={true}
                            >
                                {initialContactPosition}
                            </Text>
                        </View>
                    ) : null}
                </View>
            </View>
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>{editNotesSectionTitle}</Text>
                <Text style={styles.label}>{remarkLabel}</Text>
                <Text style={styles.fieldGroupHint}>
                    {intl.formatMessage({
                        id: 'supplier_customer.add_remark_hint',
                        defaultMessage: 'Optional. When set, your list shows this remark instead of their nickname.',
                    })}
                </Text>
                <TextInput
                    style={styles.input}
                    value={remark}
                    onChangeText={setRemark}
                    placeholder={intl.formatMessage({
                        id: 'supplier_customer.add_remark_placeholder',
                        defaultMessage: 'e.g. ACME purchasing contact',
                    })}
                    placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.48)}
                    autoCorrect={false}
                    testID='supplier_customer.form.edit.remark'
                />
                <View style={styles.fieldDivider} />
                <Text style={styles.label}>{relationDescriptionLabel}</Text>
                <Text style={styles.fieldGroupHint}>{relationDescriptionHint}</Text>
                <TextInput
                    style={[styles.input, styles.textArea]}
                    value={description}
                    onChangeText={setDescription}
                    placeholder={editDescriptionPlaceholder}
                    placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.48)}
                    multiline={true}
                    numberOfLines={4}
                    testID='supplier_customer.form.edit.internal_note'
                />
            </View>
        </>
    );

    return (
        <>
            <StatusBar
                backgroundColor={theme.sidebarBg}
                barStyle='light-content'
            />
            <SafeAreaView
                edges={edges}
                style={[styles.flex, {backgroundColor: theme.sidebarBg}]}
            >
                <Animated.View style={[styles.flex, animated]}>
                    <View style={styles.header}>
                        <TouchableOpacity
                            style={styles.headerBack}
                            onPress={handleClose}
                            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                            testID='supplier_customer.form.back'
                        >
                            <CompassIcon
                                name={Platform.select({ios: 'arrow-back-ios', default: 'arrow-left'})}
                                size={22}
                                color={theme.sidebarHeaderTextColor}
                            />
                        </TouchableOpacity>
                        <Text
                            style={styles.headerTitle}
                            numberOfLines={1}
                        >
                            {headerTitle}
                        </Text>
                        <View style={styles.headerActions}>
                            {!isEdit && (
                                <TouchableOpacity
                                    style={styles.headerAction}
                                    onPress={handleScan}
                                    hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                                    testID='supplier_customer.form.scan'
                                >
                                    <CompassIcon
                                        name='camera-outline'
                                        size={22}
                                        color={theme.sidebarHeaderTextColor}
                                    />
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity
                                style={[styles.headerAction, !canSave && {opacity: 0.4}]}
                                onPress={handleSave}
                                disabled={!canSave}
                                hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                                testID='supplier_customer.form.save'
                            >
                                {saving ? (
                                    <Loading
                                        color={theme.sidebarHeaderTextColor}
                                        size='small'
                                    />
                                ) : (
                                    <CompassIcon
                                        name='check'
                                        size={22}
                                        color={theme.sidebarHeaderTextColor}
                                    />
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>

                    <ScrollView
                        style={styles.bodyScroll}
                        contentContainerStyle={[
                            styles.scrollInner,
                            {paddingBottom: 24},
                        ]}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps='handled'
                    >
                        {isEdit ? editBody : addBody}

                        <View style={styles.saveButtonSection}>
                            <TouchableOpacity
                                style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
                                onPress={handleSave}
                                disabled={!canSave}
                                testID='supplier_customer.form.save_button'
                            >
                                <Text style={styles.saveButtonText}>
                                    {intl.formatMessage({
                                        id: isEdit ? 'supplier_customer.save' : 'supplier_customer.form_add_title',
                                        defaultMessage: isEdit ? 'Save' : 'Add',
                                    })}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </ScrollView>
                </Animated.View>
            </SafeAreaView>
        </>
    );
};

export default SupplierCustomerFormScreen;
