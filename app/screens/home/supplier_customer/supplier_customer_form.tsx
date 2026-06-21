// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    Alert,
    DeviceEventEmitter,
    FlatList,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import Animated, {useAnimatedStyle, withTiming} from 'react-native-reanimated';
import {type Edge, SafeAreaView} from 'react-native-safe-area-context';

import {makeDirectChannel} from '@actions/remote/channel';
import {
    addEmployeeContact,
    searchExactGlobalEmployeeContacts,
    updateEmployeeContact,
    type EmployeeContactSearchRow,
} from '@actions/remote/employee_contact_new';
import {MMEmployeeContactTypes, type MMEmployeeContactType} from '@client/rest/team_department';
import CompassIcon from '@components/compass_icon';
import ContactAvatar from '@components/contact_avatar';
import Loading from '@components/loading';
import ProfilePicture from '@components/profile_picture';
import {Events} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {usePreventDoubleTap} from '@hooks/utils';
import NetworkManager from '@managers/network_manager';
import {dismissModal} from '@screens/navigation';
import {showQrScannerModal} from '@screens/qr_scanner/show_modal';
import {getContactListDisplayName} from '@utils/contact_section';
import {logError} from '@utils/log';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {UserProfile} from '@typings/api/user';
import type {AvailableScreens} from '@typings/screens/navigation';

const edges: Edge[] = ['top', 'bottom', 'left', 'right'];

enum AddStage {
    SEARCH = 'search',
    FILL_INFO = 'fill',
}

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
        paddingTop: 8,
        paddingBottom: 12,
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
    textArea: {
        minHeight: 72,
        textAlignVertical: 'top',
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
        marginTop: 4,
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

    // --- Search stage styles ---
    searchSection: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        minHeight: 40,
    },
    searchIcon: {
        color: changeOpacity(theme.centerChannelColor, 0.5),
        marginRight: 8,
    },
    searchInput: {
        flex: 1,
        color: theme.centerChannelColor,
        fontSize: 16,
        padding: 0,
    },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxChecked: {
        backgroundColor: theme.buttonBg,
        borderColor: theme.buttonBg,
    },
    checkboxUnchecked: {
        borderColor: changeOpacity(theme.centerChannelColor, 0.3),
    },
    checkIcon: {
        color: '#fff',
        fontSize: 14,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
    },
    sectionHeaderText: {
        flex: 1,
        color: changeOpacity(theme.centerChannelColor, 0.7),
        ...typography('Body', 100, 'SemiBold'),
    },
    sectionCount: {
        color: changeOpacity(theme.centerChannelColor, 0.5),
        ...typography('Body', 100),
    },
    chevron: {
        color: changeOpacity(theme.centerChannelColor, 0.5),
        marginRight: 4,
    },
    memberRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        gap: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.05),
    },
    memberRowDisabled: {
        opacity: 0.5,
    },
    memberName: {
        flex: 1,
        color: theme.centerChannelColor,
        ...typography('Body', 200),
    },
    memberMeta: {
        color: changeOpacity(theme.centerChannelColor, 0.5),
        fontSize: 12,
    },
    memberAlreadyAdded: {
        color: changeOpacity(theme.centerChannelColor, 0.5),
        fontSize: 12,
        marginLeft: 4,
    },
    bottomBar: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    doneButton: {
        backgroundColor: theme.buttonBg,
        borderRadius: 8,
        paddingHorizontal: 24,
        paddingVertical: 10,
    },
    doneButtonDisabled: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.2),
    },
    doneButtonText: {
        color: theme.buttonColor,
        ...typography('Body', 200, 'SemiBold'),
    },
    dropdownOverlay: {
        backgroundColor: theme.centerChannelBg,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.1),
        maxHeight: 300,
    },
    dropdownList: {
        paddingHorizontal: 16,
    },
    selectedMemberRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        gap: 12,
    },
    selectedMemberName: {
        flex: 1,
        color: theme.centerChannelColor,
        ...typography('Body', 200),
    },
    collapseButtonContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    noResults: {
        alignItems: 'center',
        paddingVertical: 32,
    },
    noResultsText: {
        color: changeOpacity(theme.centerChannelColor, 0.5),
        ...typography('Body', 200),
    },

    // --- Fill info stage styles ---
    fillInfoCard: {
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.1),
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
    },
    fillInfoCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    fillInfoCardName: {
        flex: 1,
        marginLeft: 12,
        ...typography('Body', 200, 'SemiBold'),
        color: theme.centerChannelColor,
    },

    // --- Edit mode styles ---
    editHeaderSection: {
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
    },
    editAvatarName: {
        ...typography('Heading', 400, 'SemiBold'),
        color: theme.centerChannelColor,
        marginTop: 12,
        textAlign: 'center',
    },
    detailGrid: {
        paddingHorizontal: 16,
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
    detailValueEmpty: {
        color: changeOpacity(theme.centerChannelColor, 0.32),
    },
    editFieldSection: {
        paddingHorizontal: 16,
        paddingTop: 8,
    },
    editFieldLabel: {
        ...typography('Body', 100, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.72),
        marginBottom: 8,
        marginTop: 10,
    },
    readonlyText: {
        ...typography('Body', 200),
        color: theme.centerChannelColor,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
        minHeight: 48,
        lineHeight: 22,
    },
    readonlyTextEmpty: {
        color: changeOpacity(theme.centerChannelColor, 0.32),
    },
    sendButtonContainer: {
        alignItems: 'center',
        paddingTop: 24,
        paddingHorizontal: 16,
        paddingBottom: 16,
    },
    sendButton: {
        backgroundColor: theme.buttonBg,
        borderRadius: 10,
        paddingHorizontal: 32,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
    },
    sendButtonDisabled: {
        backgroundColor: changeOpacity(theme.buttonBg, 0.4),
    },
    sendButtonText: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.buttonColor,
        marginLeft: 6,
    },
}));

export type SupplierCustomerFormProps = {
    kind: MMEmployeeContactType;
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
    onRelationDescriptionSaved?: (nextDescription: string) => void;
    onRemarkSaved?: (nextRemark: string) => void;
    readOnly?: boolean;
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
    readOnly,
}: SupplierCustomerFormProps) => {
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const intl = useIntl();
    const styles = getStyleSheet(theme);

    const isEdit = Boolean(existingContactId);
    const isSupplierKind = kind === MMEmployeeContactTypes.Supplier;

    const handleClose = useCallback(() => {
        if (onBack) {
            onBack();
            return;
        }
        if (componentId) {
            dismissModal({componentId});
        }
    }, [componentId, onBack]);

    // =====================
    // ADD MODE STATE
    // =====================
    const [addStage, setAddStage] = useState(AddStage.SEARCH);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<EmployeeContactSearchRow[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [selectedUsers, setSelectedUsers] = useState<Map<string, UserProfile>>(new Map());
    const [showDropdown, setShowDropdown] = useState(false);
    const [userRemarks, setUserRemarks] = useState<Map<string, string>>(new Map());
    const [userDescriptions, setUserDescriptions] = useState<Map<string, string>>(new Map());
    const [saving, setSaving] = useState(false);
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['searchResults']));

    // =====================
    // EDIT MODE STATE (preserved)
    // =====================
    const [description, setDescription] = useState(initialDescription ?? '');
    const [remark, setRemark] = useState(initialRemark ?? '');
    const [avatarMattermostUserId, setAvatarMattermostUserId] = useState<string | null>(null);

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
        const email = typeof initialContactEmail === 'string' ? initialContactEmail.trim() : '';
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
        (): UserProfile => ({
            id: mattermostUserIdForAvatar ?? existingContactId ?? 'contact-placeholder',
            username: existingContactId ?? 'contact',
            email: initialContactEmail ?? '',
            nickname: initialContactName ?? '',
            first_name: '',
            last_name: '',
            position: initialContactPosition ?? '',
            roles: '',
            locale: '',
            phone: initialContactPhone,
            create_at: 0,
            update_at: 0,
            delete_at: 0,
            auth_service: '',
            notify_props: {} as UserNotifyProps,
        }),
        [existingContactId, initialContactEmail, initialContactName, initialContactPhone, initialContactPosition, mattermostUserIdForAvatar],
    );

    // =====================
    // ADD MODE: Search logic
    // =====================
    const runSearch = useCallback(async (kw: string) => {
        if (!kw.trim()) {
            setSearchResults([]);
            setHasSearched(false);
            return;
        }
        if (!serverUrl || !ownerId) {
            setSearchResults([]);
            return;
        }
        setSearchLoading(true);
        setHasSearched(true);
        try {
            const contactType = isSupplierKind ? MMEmployeeContactTypes.Supplier : MMEmployeeContactTypes.Customer;
            const result = await searchExactGlobalEmployeeContacts(serverUrl, contactType, ownerId, kw.trim());
            if (result.error || !result.data) {
                setSearchResults([]);
                return;
            }
            setSearchResults(result.data);
        } finally {
            setSearchLoading(false);
        }
    }, [isSupplierKind, ownerId, serverUrl]);

    // Debounced search on text change
    useEffect(() => {
        if (isEdit || addStage !== AddStage.SEARCH) {
            return;
        }
        const timer = setTimeout(() => {
            runSearch(searchTerm);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchTerm, addStage, isEdit, runSearch]);

    const toggleSelect = useCallback((row: EmployeeContactSearchRow) => {
        const {employee, alreadyAdded} = row;
        if (alreadyAdded || employee.id === ownerId) {
            return;
        }
        setSelectedUsers((prev) => {
            const next = new Map(prev);
            if (next.has(employee.id)) {
                next.delete(employee.id);
                setUserRemarks((prevR) => {
                    const nextR = new Map(prevR);
                    nextR.delete(employee.id);
                    return nextR;
                });
                setUserDescriptions((prevD) => {
                    const nextD = new Map(prevD);
                    nextD.delete(employee.id);
                    return nextD;
                });
            } else {
                next.set(employee.id, employee);
                // Auto-fill remark with nickname
                setUserRemarks((prevR) => {
                    const nextR = new Map(prevR);
                    nextR.set(employee.id, employee.nickname || '');
                    return nextR;
                });
            }
            return next;
        });
        setSearchTerm('');
    }, [ownerId]);

    const selectedUsersArray = useMemo(() => Array.from(selectedUsers.values()), [selectedUsers]);

    const handleProceedToFillInfo = useCallback(() => {
        if (selectedUsers.size === 0) {
            return;
        }
        setAddStage(AddStage.FILL_INFO);
    }, [selectedUsers.size]);

    const handleBackToSearch = useCallback(() => {
        setAddStage(AddStage.SEARCH);
    }, []);

    const handleBatchSave = usePreventDoubleTap(useCallback(async () => {
        if (selectedUsers.size === 0 || saving || !serverUrl || !ownerId) {
            return;
        }
        setSaving(true);
        let allSuccess = true;
        for (const [userId] of selectedUsers) {
            try {
                const result = await addEmployeeContact(serverUrl, ownerId, {
                    contact_id: userId,
                    contact_type: kind,
                    description: userDescriptions.get(userId)?.trim() || undefined,
                    remark: userRemarks.get(userId)?.trim() || undefined,
                });
                if (result.error) {
                    allSuccess = false;
                }
            } catch {
                allSuccess = false;
            }
        }
        setSaving(false);
        if (allSuccess) {
            DeviceEventEmitter.emit(Events.SUPPLIER_CUSTOMER_CONTACTS_CHANGED, {contactType: kind});
            handleClose();
        } else {
            Alert.alert(
                intl.formatMessage({id: 'supplier_customer.error_title', defaultMessage: 'Error'}),
                intl.formatMessage({id: 'supplier_customer.error_save', defaultMessage: 'Could not save. Please try again.'}),
            );
        }
    }, [selectedUsers, saving, serverUrl, ownerId, kind, userRemarks, userDescriptions, handleClose, intl]));

    // =====================
    // EDIT MODE: Save logic (preserved)
    // =====================
    const showErrorAlert = useCallback(
        (message?: string) => {
            Alert.alert(
                intl.formatMessage({id: 'supplier_customer.error_title', defaultMessage: 'Error'}),
                message ?? intl.formatMessage({id: 'supplier_customer.error_save', defaultMessage: 'Could not save. Please try again.'}),
            );
        },
        [intl],
    );

    const canSaveEdit = isEdit && !saving;

    const handleEditSave = usePreventDoubleTap(useCallback(async () => {
        if (!isEdit || !existingContactId || !canSaveEdit) {
            return;
        }
        if (!ownerId || !serverUrl) {
            showErrorAlert();
            return;
        }
        setSaving(true);
        try {
            const trimmedDesc = description.trim();
            const trimmedRemark = remark.trim();
            const result = await updateEmployeeContact(serverUrl, ownerId, existingContactId, kind, {
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
    }, [canSaveEdit, description, remark, existingContactId, intl, isEdit, kind, handleClose, onRelationDescriptionSaved, onRemarkSaved, ownerId, serverUrl, showErrorAlert]));

    const handleScan = usePreventDoubleTap(useCallback(() => {
        if (!isEdit) {
            showQrScannerModal(intl, {
                extra: {
                    forcedEmployeeContactType: isSupplierKind ? MMEmployeeContactTypes.Supplier : MMEmployeeContactTypes.Customer,
                },
            });
        }
    }, [intl, isEdit, isSupplierKind]));

    const animated = useAnimatedStyle(() => ({
        opacity: withTiming(1, {duration: 150}),
        transform: [{translateX: withTiming(0, {duration: 150})}],
    }), []);

    // =====================
    // RENDER HELPERS
    // =====================
    const typeLabel = isSupplierKind
        ? intl.formatMessage({id: 'supplier_customer.type_supplier', defaultMessage: 'Supplier'})
        : intl.formatMessage({id: 'supplier_customer.type_customer', defaultMessage: 'Customer'});
    const addScreenTitle = intl.formatMessage({id: 'supplier_customer.form_add_title', defaultMessage: 'Add'});
    const headerTitle = readOnly
        ? intl.formatMessage({id: 'supplier_customer.detail_info', defaultMessage: 'Detail Info'})
        : (isEdit
            ? (isSupplierKind
                ? intl.formatMessage({id: 'supplier_customer.form_edit_supplier_title', defaultMessage: 'Edit supplier'})
                : intl.formatMessage({id: 'supplier_customer.form_edit_customer_title', defaultMessage: 'Edit customer'}))
            : (addStage === AddStage.SEARCH
                ? `${addScreenTitle} ${typeLabel}`
                : intl.formatMessage({id: 'supplier_customer.fill_info', defaultMessage: 'Fill Info'})));

    const renderCheckbox = (row: EmployeeContactSearchRow) => {
        const isSelected = selectedUsers.has(row.employee.id);
        const isDisabled = row.alreadyAdded || row.employee.id === ownerId;

        if (isDisabled) {
            return (
                <View style={[styles.checkbox, {backgroundColor: changeOpacity(theme.centerChannelColor, 0.3), borderColor: changeOpacity(theme.centerChannelColor, 0.3)}]}>
                    {row.alreadyAdded && <CompassIcon name='check' size={14} style={styles.checkIcon}/>}
                </View>
            );
        }
        if (isSelected) {
            return (
                <View style={[styles.checkbox, styles.checkboxChecked]}>
                    <CompassIcon name='check' size={14} style={styles.checkIcon}/>
                </View>
            );
        }
        return <View style={[styles.checkbox, styles.checkboxUnchecked]}/>;
    };

    const renderSearchResultRow = (row: EmployeeContactSearchRow) => {
        const isSelf = row.employee.id === ownerId;
        const isDisabled = row.alreadyAdded || isSelf;
        const name = getContactListDisplayName(row.employee);
        const meta = [row.employee.email, row.employee.phone, row.employee.position].filter(Boolean).join(' · ');

        return (
            <TouchableOpacity
                key={row.employee.id}
                style={[styles.memberRow, isDisabled && styles.memberRowDisabled]}
                onPress={() => toggleSelect(row)}
                disabled={isDisabled}
            >
                {renderCheckbox(row)}
                <ContactAvatar employee={row.employee} size={40}/>
                <View style={{flex: 1}}>
                    <Text style={styles.memberName}>{name}</Text>
                    {meta ? <Text style={styles.memberMeta}>{meta}</Text> : null}
                </View>
                {row.alreadyAdded && (
                    <Text style={styles.memberAlreadyAdded}>
                        {intl.formatMessage({id: 'supplier_customer.already_added_badge', defaultMessage: 'Added'})}
                    </Text>
                )}
            </TouchableOpacity>
        );
    };

    const toggleSection = useCallback((key: string) => {
        setExpandedSections((prev) => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    }, []);

    // =====================
    // ADD MODE: Search stage render
    // =====================
    const renderSearchStage = () => {
        const isExpanded = expandedSections.has('searchResults');

        return (
            <View style={{flex: 1, backgroundColor: theme.centerChannelBg}}>
                <>
                {/* Search bar */}
                <View style={styles.searchSection}>
                    <View style={styles.searchBar}>
                        {selectedUsersArray.length === 0 && (
                            <CompassIcon name='magnify' size={20} style={styles.searchIcon}/>
                        )}
                        {selectedUsersArray.length > 0 && (
                            <TouchableOpacity
                                style={{flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginRight: 8}}
                                onPress={() => setShowDropdown(true)}
                            >
                                {selectedUsersArray.map((user) => (
                                    <ContactAvatar key={user.id} employee={user} size={28}/>
                                ))}
                            </TouchableOpacity>
                        )}
                        <TextInput
                            style={styles.searchInput}
                            value={searchTerm}
                            onChangeText={setSearchTerm}
                            placeholder={intl.formatMessage({
                                id: 'supplier_customer.search_employee_placeholder',
                                defaultMessage: 'Search by name, phone, or email...',
                            })}
                            placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.5)}
                            autoCapitalize='none'
                            returnKeyType='search'
                        />
                    </View>
                    {showDropdown && (
                        <View style={styles.dropdownOverlay}>
                            <View style={styles.dropdownList}>
                                {selectedUsersArray.map((user) => {
                                    const name = getContactListDisplayName(user);
                                    return (
                                        <TouchableOpacity
                                            key={user.id}
                                            style={styles.selectedMemberRow}
                                            onPress={() => toggleSelect({employee: user, alreadyAdded: false})}
                                        >
                                            <View style={[styles.checkbox, styles.checkboxChecked]}>
                                                <CompassIcon name='check' size={14} style={styles.checkIcon}/>
                                            </View>
                                            <ContactAvatar employee={user} size={32}/>
                                            <Text style={styles.selectedMemberName}>{name}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                            <TouchableOpacity
                                style={styles.collapseButtonContainer}
                                onPress={() => setShowDropdown(false)}
                            >
                                <CompassIcon name='chevron-up' size={24} style={{color: theme.buttonBg}}/>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>

                {/* Search results */}
                {searchLoading ? (
                    <View style={styles.loadingBox}>
                        <Loading color={theme.centerChannelColor} size='small'/>
                    </View>
                ) : searchResults.length > 0 ? (
                    <View>
                        <TouchableOpacity
                            style={styles.sectionHeader}
                            onPress={() => toggleSection('searchResults')}
                        >
                            <CompassIcon
                                name={isExpanded ? 'chevron-down' : 'chevron-right'}
                                size={20}
                                style={styles.chevron}
                            />
                            <Text style={styles.sectionHeaderText}>
                                {intl.formatMessage({id: 'channel_add_members.search_results', defaultMessage: 'Search Results'})}
                            </Text>
                            <Text style={styles.sectionCount}>({searchResults.length})</Text>
                        </TouchableOpacity>
                        {isExpanded && searchResults.map(renderSearchResultRow)}
                    </View>
                ) : hasSearched ? (
                    <View style={styles.noResults}>
                        <Text style={styles.noResultsText}>
                            {intl.formatMessage({id: 'supplier_customer.no_search_results', defaultMessage: 'No matching contacts found.'})}
                        </Text>
                    </View>
                ) : null}

                {/* Bottom bar */}
                <View style={styles.bottomBar}>
                    <TouchableOpacity
                        style={[styles.doneButton, selectedUsers.size === 0 && styles.doneButtonDisabled]}
                        onPress={handleProceedToFillInfo}
                        disabled={selectedUsers.size === 0}
                    >
                        <Text style={styles.doneButtonText}>
                            {selectedUsers.size > 0
                                ? intl.formatMessage({id: 'create_direct_message.done_with_count', defaultMessage: 'Done ({count})'}, {count: selectedUsers.size})
                                : intl.formatMessage({id: 'mobile.add_members.done', defaultMessage: 'Done'})}
                        </Text>
                    </TouchableOpacity>
                </View>
                </>
            </View>
        );
    };

    // =====================
    // ADD MODE: Fill info stage render
    // =====================
    const renderFillInfoStage = () => {
        return (
            <ScrollView
                style={styles.bodyScroll}
                contentContainerStyle={styles.scrollInner}
                keyboardShouldPersistTaps='handled'
            >
                {selectedUsersArray.map((user) => {
                    const name = getContactListDisplayName(user);
                    return (
                        <View key={user.id} style={styles.fillInfoCard}>
                            <View style={styles.fillInfoCardHeader}>
                                <ContactAvatar employee={user} size={40}/>
                                <Text style={styles.fillInfoCardName}>{name}</Text>
                            </View>
                            <Text style={styles.label}>
                                {intl.formatMessage({id: 'supplier_customer.field_remark', defaultMessage: 'Remark name'})}
                            </Text>
                            <TextInput
                                style={styles.input}
                                value={userRemarks.get(user.id) || ''}
                                onChangeText={(text) => {
                                    setUserRemarks((prev) => {
                                        const next = new Map(prev);
                                        next.set(user.id, text);
                                        return next;
                                    });
                                }}
                                placeholder={intl.formatMessage({id: 'supplier_customer.add_remark_placeholder', defaultMessage: 'e.g. ACME purchasing contact'})}
                                placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.48)}
                                autoCorrect={false}
                            />
                            <View style={styles.fieldDivider}/>
                            <Text style={styles.label}>
                                {intl.formatMessage({id: 'supplier_customer.description', defaultMessage: 'Description'})}
                            </Text>
                            <TextInput
                                style={[styles.input, styles.textArea]}
                                value={userDescriptions.get(user.id) || ''}
                                onChangeText={(text) => {
                                    setUserDescriptions((prev) => {
                                        const next = new Map(prev);
                                        next.set(user.id, text);
                                        return next;
                                    });
                                }}
                                placeholder=''
                                placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.48)}
                                multiline={true}
                                numberOfLines={3}
                            />
                        </View>
                    );
                })}

                <View style={styles.saveButtonSection}>
                    <TouchableOpacity
                        style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                        onPress={handleBatchSave}
                        disabled={saving}
                    >
                        {saving ? (
                            <Loading color={theme.buttonColor} size='small'/>
                        ) : (
                            <Text style={styles.saveButtonText}>
                                {intl.formatMessage({id: 'supplier_customer.save', defaultMessage: 'Save'})}
                            </Text>
                        )}
                    </TouchableOpacity>
                </View>
            </ScrollView>
        );
    };

    // =====================
    // EDIT MODE: Body
    // =====================
    const initialRemarkTrimmed = typeof initialRemark === 'string' ? initialRemark.trim() : '';
    const editDisplayName = (initialRemarkTrimmed || initialContactName) ?? existingContactId ?? '';

    // Determine the account identifier (username)
    const accountValue = existingContactId ?? '';
    const isAccountPhone = /^\+?[\d\s\-()]{6,}$/.test(accountValue);
    const isAccountEmail = accountValue.includes('@');

    // If account is phone → show email; if account is email → show phone; otherwise show both
    const showEmailField = !isAccountEmail;
    const showPhoneField = !isAccountPhone;

    const renderDetailRow = (label: string, value?: string) => (
        <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{label}</Text>
            <Text style={[styles.detailValue, !value && styles.detailValueEmpty]} selectable={true}>
                {value || '-'}
            </Text>
        </View>
    );

    const editDescriptionPlaceholder = '';

    const editBody = (
        <>
            {/* Header: Avatar + Name (centered) */}
            <View style={styles.editHeaderSection}>
                {avatarMattermostUserId ? (
                    <ProfilePicture
                        author={{id: avatarMattermostUserId} as UserProfile}
                        showStatus={false}
                        size={56}
                    />
                ) : (
                    <ContactAvatar employee={displayContactEmployee} size={56}/>
                )}
                <Text style={styles.editAvatarName} numberOfLines={2}>
                    {editDisplayName}
                </Text>
            </View>

            {/* Detail info grid */}
            <View style={styles.detailGrid}>
                {renderDetailRow(
                    intl.formatMessage({id: 'supplier_customer.account', defaultMessage: 'Account'}),
                    accountValue || undefined,
                )}
                {showEmailField && renderDetailRow(
                    intl.formatMessage({id: 'contacts.email', defaultMessage: 'Email'}),
                    initialContactEmail,
                )}
                {showPhoneField && renderDetailRow(
                    intl.formatMessage({id: 'contacts.phone', defaultMessage: 'Phone'}),
                    initialContactPhone,
                )}
                {renderDetailRow(
                    intl.formatMessage({id: 'supplier_customer.nickname', defaultMessage: 'Nickname'}),
                    initialContactName,
                )}
                {renderDetailRow(
                    intl.formatMessage({id: 'channel_info.position', defaultMessage: 'Position'}),
                    initialContactPosition,
                )}
            </View>

            {/* Editable: Remark + Description */}
            <View style={styles.editFieldSection}>
                <Text style={styles.editFieldLabel}>
                    {intl.formatMessage({id: 'supplier_customer.field_remark', defaultMessage: 'Remark name'})}
                </Text>
                <TextInput
                    style={styles.input}
                    value={remark}
                    onChangeText={setRemark}
                    placeholder={intl.formatMessage({id: 'supplier_customer.add_remark_placeholder', defaultMessage: 'e.g. ACME purchasing contact'})}
                    placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.48)}
                    autoCorrect={false}
                />

                <Text style={styles.editFieldLabel}>
                    {intl.formatMessage({id: 'supplier_customer.description', defaultMessage: 'Description'})}
                </Text>
                <TextInput
                    style={[styles.input, styles.textArea]}
                    value={description}
                    onChangeText={setDescription}
                    placeholder={editDescriptionPlaceholder}
                    placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.48)}
                    multiline={true}
                    numberOfLines={4}
                />
            </View>

            {/* Save button */}
            <View style={styles.saveButtonSection}>
                <TouchableOpacity
                    style={[styles.saveButton, !canSaveEdit && styles.saveButtonDisabled]}
                    onPress={handleEditSave}
                    disabled={!canSaveEdit}
                >
                    {saving ? (
                        <Loading color={theme.buttonColor} size='small'/>
                    ) : (
                        <Text style={styles.saveButtonText}>
                            {intl.formatMessage({id: 'supplier_customer.save', defaultMessage: 'Save'})}
                        </Text>
                    )}
                </TouchableOpacity>
            </View>
        </>
    );

    // =====================
    // READ-ONLY MODE: Send message
    // =====================
    const [sendingMessage, setSendingMessage] = useState(false);
    const readOnlyEmail = initialContactEmail ?? '';
    const readOnlyPhone = initialContactPhone ?? '';
    const readOnlyPosition = initialContactPosition ?? '';
    const readOnlyRemark = typeof initialRemark === 'string' ? initialRemark.trim() : '';
    const readOnlyDescription = typeof initialDescription === 'string' ? initialDescription.trim() : '';
    const readOnlyDisplayName = (readOnlyRemark || initialContactName) ?? existingContactId ?? '';
    const readOnlyAccountValue = existingContactId ?? '';
    const readOnlyIsAccountPhone = /^\+?[\d\s\-()]{6,}$/.test(readOnlyAccountValue);
    const readOnlyIsAccountEmail = readOnlyAccountValue.includes('@');

    const handleSendMessage = usePreventDoubleTap(useCallback(async () => {
        if (!serverUrl || sendingMessage) {
            return;
        }
        setSendingMessage(true);
        try {
            let userId = existingContactId;
            if (!userId && readOnlyEmail) {
                const client = NetworkManager.getClient(serverUrl);
                const user = await client.getUserByEmail(readOnlyEmail);
                userId = user?.id;
            }
            if (!userId) {
                setSendingMessage(false);
                return;
            }
            const result = await makeDirectChannel(serverUrl, userId, readOnlyDisplayName, true);
            if (!result.error) {
                handleClose();
            }
        } catch {
            // ignore
        } finally {
            setSendingMessage(false);
        }
    }, [serverUrl, sendingMessage, existingContactId, readOnlyEmail, readOnlyDisplayName, handleClose]));

    const readonlyDetailRow = (label: string, value?: string) => (
        <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{label}</Text>
            <Text style={[styles.detailValue, !value && styles.detailValueEmpty]} selectable={true}>
                {value || '-'}
            </Text>
        </View>
    );

    const readOnlyBody = (
        <>
            {/* Header: Avatar + Name */}
            <View style={styles.editHeaderSection}>
                {avatarMattermostUserId ? (
                    <ProfilePicture
                        author={{id: avatarMattermostUserId} as UserProfile}
                        showStatus={false}
                        size={56}
                    />
                ) : (
                    <ContactAvatar employee={displayContactEmployee} size={56}/>
                )}
                <Text style={styles.editAvatarName} numberOfLines={2}>
                    {readOnlyDisplayName}
                </Text>
            </View>

            {/* Detail info grid */}
            <View style={styles.detailGrid}>
                {readonlyDetailRow(
                    intl.formatMessage({id: 'supplier_customer.account', defaultMessage: 'Account'}),
                    readOnlyAccountValue || undefined,
                )}
                {!readOnlyIsAccountEmail && readonlyDetailRow(
                    intl.formatMessage({id: 'contacts.email', defaultMessage: 'Email'}),
                    readOnlyEmail,
                )}
                {!readOnlyIsAccountPhone && readonlyDetailRow(
                    intl.formatMessage({id: 'contacts.phone', defaultMessage: 'Phone'}),
                    readOnlyPhone,
                )}
                {readonlyDetailRow(
                    intl.formatMessage({id: 'supplier_customer.nickname', defaultMessage: 'Nickname'}),
                    initialContactName,
                )}
                {readonlyDetailRow(
                    intl.formatMessage({id: 'channel_info.position', defaultMessage: 'Position'}),
                    readOnlyPosition,
                )}
            </View>

            {/* Read-only Remark + Description */}
            <View style={styles.editFieldSection}>
                <Text style={styles.editFieldLabel}>
                    {intl.formatMessage({id: 'supplier_customer.field_remark', defaultMessage: 'Remark name'})}
                </Text>
                <Text style={[styles.readonlyText, !readOnlyRemark && styles.readonlyTextEmpty]}>
                    {readOnlyRemark || '-'}
                </Text>

                <Text style={styles.editFieldLabel}>
                    {intl.formatMessage({id: 'supplier_customer.description', defaultMessage: 'Description'})}
                </Text>
                <Text style={[styles.readonlyText, !readOnlyDescription && styles.readonlyTextEmpty]}>
                    {readOnlyDescription || '-'}
                </Text>
            </View>

            {/* Send Message button */}
            <View style={styles.sendButtonContainer}>
                <TouchableOpacity
                    style={[styles.sendButton, sendingMessage && styles.sendButtonDisabled]}
                    onPress={handleSendMessage}
                    disabled={sendingMessage}
                >
                    {sendingMessage ? (
                        <Loading color={theme.buttonColor} size='small'/>
                    ) : (
                        <>
                            <CompassIcon name='send' size={18} color={theme.buttonColor}/>
                            <Text style={styles.sendButtonText}>
                                {intl.formatMessage({id: 'supplier_customer.send_message', defaultMessage: 'Send Message'})}
                            </Text>
                        </>
                    )}
                </TouchableOpacity>
            </View>
        </>
    );

    // =====================
    // MAIN RENDER
    // =====================
    const renderBody = () => {
        if (readOnly) {
            return (
                <ScrollView
                    style={styles.bodyScroll}
                    contentContainerStyle={styles.scrollInner}
                >
                    {readOnlyBody}
                </ScrollView>
            );
        }
        if (isEdit) {
            return (
                <ScrollView
                    style={styles.bodyScroll}
                    contentContainerStyle={styles.scrollInner}
                    keyboardShouldPersistTaps='handled'
                >
                    {editBody}
                </ScrollView>
            );
        }
        if (addStage === AddStage.SEARCH) {
            return renderSearchStage();
        }
        return renderFillInfoStage();
    };

    return (
        <>
            <StatusBar backgroundColor={theme.sidebarBg} barStyle='light-content'/>
            <SafeAreaView edges={edges} style={[styles.flex, {backgroundColor: theme.sidebarBg}]}>
                <Animated.View style={[styles.flex, animated]}>
                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity
                            style={styles.headerBack}
                            onPress={readOnly || isEdit || addStage === AddStage.SEARCH ? handleClose : handleBackToSearch}
                            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                        >
                            <CompassIcon
                                name={Platform.select({ios: 'arrow-back-ios', default: 'arrow-left'})}
                                size={22}
                                color={theme.sidebarHeaderTextColor}
                            />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle} numberOfLines={1}>
                            {headerTitle}
                        </Text>
                        <View style={styles.headerActions}>
                            {!readOnly && !isEdit && addStage === AddStage.SEARCH && (
                                <TouchableOpacity
                                    style={styles.headerAction}
                                    onPress={handleScan}
                                    hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                                >
                                    <CompassIcon name='camera-outline' size={22} color={theme.sidebarHeaderTextColor}/>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>

                    {renderBody()}
                </Animated.View>
            </SafeAreaView>
        </>
    );
};

export default SupplierCustomerFormScreen;
