// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useIsFocused, useNavigation} from '@react-navigation/native';
import React, {useCallback, useEffect, useState} from 'react';
import {Freeze} from 'react-freeze';
import {useIntl} from 'react-intl';
import {
    Alert,
    DeviceEventEmitter,
    FlatList,
    type GestureResponderEvent,
    Keyboard,
    Modal,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import Animated, {useAnimatedStyle, withTiming} from 'react-native-reanimated';
import {type Edge, SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';

import {makeGroupChannel} from '@actions/remote/channel';
import {
    addEmployeeContact,
    fetchEmployeeContacts,
    removeEmployeeContact,
    searchExactGlobalEmployeeContacts,
    type EmployeeContactSearchRow,
} from '@actions/remote/employee_contact_new';
import {updateEmployeeContact} from '@actions/remote/employee_contact_new';
import {getDashboardAccess} from '@screens/home/apps/api';
import {MMEmployeeContactTypes, type MMEmployeeContactSimple} from '@client/rest/team_department';
import CompassIcon from '@components/compass_icon';
import ContactAvatar from '@components/contact_avatar';
import Loading from '@components/loading';
import {Events} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {usePreventDoubleTap} from '@hooks/utils';
import {getSupplierCustomerDisplayName} from '@utils/contact_section';
import {getLastPictureUpdate} from '@utils/user';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {StackNavigationProp} from '@react-navigation/stack';
import type {ContactsStackParamList} from './contacts_stack_param_list';
import type TeamModel from '@typings/database/models/servers/team';
import type UserModel from '@typings/database/models/servers/user';

const edges: Edge[] = ['top', 'bottom', 'left', 'right'];

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    flex: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 4,
        backgroundColor: theme.sidebarBg,
    },
    headerBack: {
        padding: 4,
    },
    headerTitle: {
        ...typography('Heading', 300, 'SemiBold'),
        color: theme.sidebarText,
        textAlign: 'center',
        flex: 1,
    },
    headerAdd: {
        padding: 4,
    },
    listContent: {
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 32,
    },
    listCard: {
        backgroundColor: theme.centerChannelBg,
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    listItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
    },
    listItemAvatarWrap: {
        marginRight: 12,
    },
    listItemContent: {
        flex: 1,
        minWidth: 0,
        justifyContent: 'center',
    },
    listItemName: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    listItemSub: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.64),
        marginTop: 2,
    },
    listItemActions: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    actionButton: {
        padding: 4,
        marginLeft: 4,
    },
    divider: {
        height: 1,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
        marginLeft: 68,
    },
    emptyMessage: {
        ...typography('Body', 100),
        color: changeOpacity(theme.centerChannelColor, 0.64),
        paddingVertical: 32,
        paddingHorizontal: 20,
        textAlign: 'center',
    },
    loadingContainer: {
        paddingVertical: 24,
        alignItems: 'center',
    },

    // ---- Modal shared styles ----
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContainer: {
        backgroundColor: theme.centerChannelBg,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        maxHeight: '90%',
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 8,
    },
    modalTitle: {
        ...typography('Heading', 300, 'SemiBold'),
        color: theme.centerChannelColor,
        flex: 1,
    },
    modalClose: {
        padding: 4,
    },
    modalBody: {
        paddingHorizontal: 16,
        paddingBottom: 8,
    },
    modalFooter: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.1),
        gap: 8,
    },
    modalBtn: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
        backgroundColor: theme.buttonBg,
    },
    modalBtnSecondary: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.2),
    },
    modalBtnDisabled: {
        opacity: 0.5,
    },
    modalBtnText: {
        color: theme.buttonColor,
        ...typography('Body', 100, 'SemiBold'),
    },
    modalBtnTextSecondary: {
        color: theme.centerChannelColor,
        ...typography('Body', 100),
    },

    // ---- Detail modal ----
    detailAvatarSection: {
        alignItems: 'center',
        paddingVertical: 16,
    },
    detailName: {
        ...typography('Heading', 300, 'SemiBold'),
        color: theme.centerChannelColor,
        marginTop: 8,
    },
    detailGrid: {
        paddingVertical: 8,
    },
    detailRow: {
        flexDirection: 'row',
        paddingVertical: 6,
    },
    detailLabel: {
        width: 80,
        color: changeOpacity(theme.centerChannelColor, 0.56),
        ...typography('Body', 100),
    },
    detailValue: {
        flex: 1,
        color: theme.centerChannelColor,
        ...typography('Body', 100),
    },
    detailSection: {
        paddingVertical: 8,
    },
    detailSectionTitle: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
        ...typography('Body', 75, 'SemiBold'),
        marginBottom: 4,
    },
    detailSectionBody: {
        color: theme.centerChannelColor,
        ...typography('Body', 100),
    },

    // ---- Add/Edit form ----
    formField: {
        marginBottom: 12,
    },
    formLabel: {
        color: changeOpacity(theme.centerChannelColor, 0.64),
        ...typography('Body', 75),
        marginBottom: 4,
    },
    formInput: {
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        borderRadius: 8,
        color: theme.centerChannelColor,
        paddingHorizontal: 12,
        paddingVertical: 8,
        ...typography('Body', 100),
    },
    formInputReadonly: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
    },
    formTextArea: {
        minHeight: 60,
        textAlignVertical: 'top',
    },
    phoneRow: {
        flexDirection: 'row',
        gap: 8,
    },
    phoneInput: {
        flex: 1,
    },
    searchBtn: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
        backgroundColor: theme.buttonBg,
        justifyContent: 'center',
    },
    searchBtnText: {
        color: theme.buttonColor,
        ...typography('Body', 100, 'SemiBold'),
    },
    searchStatus: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginTop: 4,
    },
    searchError: {
        ...typography('Body', 75),
        color: theme.errorTextColor,
        marginTop: 4,
    },
    formError: {
        ...typography('Body', 75),
        color: theme.errorTextColor,
        marginTop: 4,
    },
}));

function getContactDisplayName(detail: MMEmployeeContactSimple): string {
    return getSupplierCustomerDisplayName(detail.remark, detail.contact);
}

function getGenderLabel(g?: string): string {
    if (!g) return '-';
    switch (g.toLowerCase()) {
    case 'male': return 'Male';
    case 'female': return 'Female';
    case 'other': return 'Other';
    default: return g;
    }
}

type RowProps = {
    item: MMEmployeeContactSimple;
    isLast: boolean;
    theme: Theme;
    styles: ReturnType<typeof getStyleSheet>;
    contactEdit: boolean;
    onDeleteId: (contactId: string) => void;
    onViewDetails: (contact: MMEmployeeContactSimple) => void;
    onEdit: (contact: MMEmployeeContactSimple) => void;
};

const ExternalContactRow = React.memo(({
    item,
    isLast,
    theme,
    styles,
    contactEdit,
    onDeleteId,
    onViewDetails,
    onEdit,
}: RowProps) => {
    if (!item.contact) {
        return null;
    }
    const contactId = item.contact.id;
    const displayName = getContactDisplayName(item);
    const sub = item.description?.trim() || '';
    const isErp = item.source === 'erp';
    const showEditDelete = contactEdit && !isErp;

    return (
        <>
            <TouchableOpacity
                style={styles.listItem}
                onPress={() => onViewDetails(item)}
                activeOpacity={0.7}
                testID={`external_contacts.row.${contactId}`}
            >
                <View style={styles.listItemAvatarWrap}>
                    <ContactAvatar
                        employee={getLastPictureUpdate(item.contact) > 0 ? item.contact : undefined}
                        size={40}
                    />
                </View>
                <View style={styles.listItemContent}>
                    <Text
                        style={styles.listItemName}
                        numberOfLines={1}
                    >
                        {displayName}
                    </Text>
                    {sub ? (
                        <Text
                            style={styles.listItemSub}
                            numberOfLines={2}
                        >
                            {sub}
                        </Text>
                    ) : null}
                </View>
                <View style={styles.listItemActions}>
                    <TouchableOpacity
                        style={styles.actionButton}
                        onPress={(e: GestureResponderEvent) => {
                            e.stopPropagation();
                            onViewDetails(item);
                        }}
                        hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                        testID={`external_contacts.row.${contactId}.details`}
                    >
                        <CompassIcon
                            name='information-outline'
                            size={20}
                            color={changeOpacity(theme.centerChannelColor, 0.56)}
                        />
                    </TouchableOpacity>
                    {showEditDelete && (
                        <TouchableOpacity
                            style={styles.actionButton}
                            onPress={(e: GestureResponderEvent) => {
                                e.stopPropagation();
                                onEdit(item);
                            }}
                            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                            testID={`external_contacts.row.${contactId}.edit`}
                        >
                            <CompassIcon
                                name='pencil-outline'
                                size={20}
                                color={changeOpacity(theme.centerChannelColor, 0.56)}
                            />
                        </TouchableOpacity>
                    )}
                    {showEditDelete && (
                        <TouchableOpacity
                            style={styles.actionButton}
                            onPress={(e: GestureResponderEvent) => {
                                e.stopPropagation();
                                onDeleteId(contactId);
                            }}
                            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                            testID={`external_contacts.row.${contactId}.delete`}
                        >
                            <CompassIcon
                                name='trash-can-outline'
                                size={20}
                                color={theme.errorTextColor}
                            />
                        </TouchableOpacity>
                    )}
                </View>
            </TouchableOpacity>
            {isLast ? null : <View style={styles.divider}/>}
        </>
    );
});
ExternalContactRow.displayName = 'ExternalContactRow';

type Props = {
    currentUser?: UserModel;
    currentTeam?: TeamModel;
};

const ExternalContactsScreen = ({currentUser, currentTeam}: Props) => {
    const theme = useTheme();
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const isFocused = useIsFocused();
    const navigation = useNavigation<StackNavigationProp<ContactsStackParamList>>();
    const insets = useSafeAreaInsets();
    const styles = getStyleSheet(theme);

    const [items, setItems] = useState<MMEmployeeContactSimple[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [contactEdit, setContactEdit] = useState(false);

    const ownerId = currentUser?.id;
    const kind = MMEmployeeContactTypes.External;

    const titleMessage = intl.formatMessage({id: 'contacts.external', defaultMessage: 'External Contacts'});
    const emptyMessage = intl.formatMessage({id: 'contacts.external.empty', defaultMessage: 'No external contacts yet'});

    // ---- Detail modal ----
    const [detailsTarget, setDetailsTarget] = useState<MMEmployeeContactSimple | null>(null);

    // ---- Edit modal ----
    const [editTarget, setEditTarget] = useState<MMEmployeeContactSimple | null>(null);
    const [editRemark, setEditRemark] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editSaving, setEditSaving] = useState(false);

    // ---- Add modal ----
    const [showAddModal, setShowAddModal] = useState(false);
    const [addPhone, setAddPhone] = useState('');
    const [addSearching, setAddSearching] = useState(false);
    const [addSearchResult, setAddSearchResult] = useState<EmployeeContactSearchRow | null>(null);
    const [addSearchError, setAddSearchError] = useState('');
    const [addRemark, setAddRemark] = useState('');
    const [addDescription, setAddDescription] = useState('');
    const [addSaving, setAddSaving] = useState(false);
    const [addError, setAddError] = useState('');

    // ---- Fetch permission ----
    const teamId = currentTeam?.id;
    useEffect(() => {
        if (!serverUrl || !teamId) return;
        getDashboardAccess(serverUrl, teamId).then((access) => {
            setContactEdit(access.contact_edit === true);
        }).catch(() => {
            setContactEdit(false);
        });
    }, [serverUrl, teamId]);

    const loadData = useCallback(async (opts?: {silent?: boolean}) => {
        if (!ownerId || !serverUrl) {
            setItems([]);
            setLoading(false);
            return;
        }
        const silent = Boolean(opts?.silent);
        if (!silent) {
            setLoading(true);
        }
        try {
            const result = await fetchEmployeeContacts(serverUrl, ownerId, kind, {granularity: 2});
            if (!result.error && result.data) {
                setItems((result.data as MMEmployeeContactSimple[]).filter((item) => item && item.contact));
            } else {
                setItems([]);
            }
        } catch {
            setItems([]);
        } finally {
            if (!silent) {
                setLoading(false);
            }
        }
    }, [kind, ownerId, serverUrl]);

    const onRefresh = useCallback(async () => {
        if (!ownerId || !serverUrl) {
            return;
        }
        setRefreshing(true);
        try {
            const result = await fetchEmployeeContacts(serverUrl, ownerId, kind, {granularity: 2});
            if (!result.error && result.data) {
                setItems((result.data as MMEmployeeContactSimple[]).filter((item) => item && item.contact));
            }
        } finally {
            setRefreshing(false);
        }
    }, [kind, ownerId, serverUrl]);

    useEffect(() => {
        if (isFocused) {
            loadData();
        }
    }, [isFocused, loadData]);

    useEffect(() => {
        const sub = DeviceEventEmitter.addListener(
            Events.SUPPLIER_CUSTOMER_CONTACTS_CHANGED,
            () => {
                if (!ownerId) {
                    return;
                }
                loadData({silent: true});
            },
        );
        return () => sub.remove();
    }, [loadData, ownerId]);

    // ---- Delete ----
    const handleDeleteId = usePreventDoubleTap(
        useCallback(
            (contactId: string) => {
                const row = items.find((i) => i.contact.id === contactId);
                const name = row ? getContactDisplayName(row) : contactId;
                const onConfirmDelete = async () => {
                    if (!ownerId) {
                        return;
                    }
                    const result = await removeEmployeeContact(serverUrl, ownerId, contactId, kind);
                    if (!result.error) {
                        setItems(items.filter((entry) => entry.contact.id !== contactId));
                    }
                };
                Alert.alert(
                    intl.formatMessage({id: 'contacts.external.delete_title', defaultMessage: 'Delete External Contact'}),
                    intl.formatMessage(
                        {id: 'contacts.external.delete_confirm', defaultMessage: 'Are you sure you want to delete {name}?'},
                        {name},
                    ),
                    [
                        {text: intl.formatMessage({id: 'common.cancel', defaultMessage: 'Cancel'}), style: 'cancel'},
                        {
                            text: intl.formatMessage({id: 'common.delete', defaultMessage: 'Delete'}),
                            style: 'destructive',
                            onPress: onConfirmDelete,
                        },
                    ],
                );
            },
            [intl, items, kind, ownerId, serverUrl],
        ),
    );

    // ---- View details ----
    const handleViewDetails = usePreventDoubleTap(
        useCallback(
            (contact: MMEmployeeContactSimple) => {
                setDetailsTarget(contact);
            },
            [],
        ),
    );

    // ---- Edit ----
    const handleEdit = usePreventDoubleTap(
        useCallback(
            (contact: MMEmployeeContactSimple) => {
                setEditTarget(contact);
                setEditRemark(contact.remark || '');
                setEditDescription(contact.description || '');
            },
            [],
        ),
    );

    const handleEditSave = usePreventDoubleTap(useCallback(async () => {
        if (!ownerId || !editTarget) return;
        setEditSaving(true);
        const result = await updateEmployeeContact(
            serverUrl, ownerId, editTarget.contact_id, kind,
            {remark: editRemark.trim(), description: editDescription.trim()},
        );
        setEditSaving(false);
        if (!result.error) {
            setEditTarget(null);
            loadData({silent: true});
        } else {
            Alert.alert(
                intl.formatMessage({id: 'contacts.external.edit_error', defaultMessage: 'Error'}),
                intl.formatMessage({id: 'contacts.external.edit_failed', defaultMessage: 'Failed to update contact'}),
            );
        }
    }, [ownerId, editTarget, editRemark, editDescription, serverUrl, kind, loadData, intl]));

    // ---- Send message ----
    const handleSendMessage = usePreventDoubleTap(useCallback(async (contactId: string) => {
        setDetailsTarget(null);
        setEditTarget(null);
        await makeGroupChannel(serverUrl, [contactId]);
        navigation.goBack();
    }, [serverUrl, navigation]));

    // ---- Add: phone search ----
    const handleAddSearch = usePreventDoubleTap(useCallback(async () => {
        const phone = addPhone.trim();
        if (!phone || !ownerId) return;
        setAddSearching(true);
        setAddSearchError('');
        setAddSearchResult(null);
        try {
            const result = await searchExactGlobalEmployeeContacts(serverUrl, kind, ownerId, phone);
            if (result.error) {
                setAddSearchError(intl.formatMessage({id: 'contacts.external.add.not_found', defaultMessage: 'User not found'}));
            } else if (result.data && result.data.length > 0) {
                setAddSearchResult(result.data[0]);
            } else {
                setAddSearchError(intl.formatMessage({id: 'contacts.external.add.not_found', defaultMessage: 'User not found'}));
            }
        } catch {
            setAddSearchError(intl.formatMessage({id: 'contacts.external.add.not_found', defaultMessage: 'User not found'}));
        } finally {
            setAddSearching(false);
        }
    }, [addPhone, ownerId, serverUrl, kind, intl]));

    // ---- Add: save ----
    const handleAddSave = usePreventDoubleTap(useCallback(async () => {
        if (!ownerId || !addSearchResult || addSearchResult.alreadyAdded) return;
        setAddSaving(true);
        setAddError('');
        const result = await addEmployeeContact(serverUrl, ownerId, {
            contact_id: addSearchResult.employee.id,
            contact_type: kind,
            remark: addRemark.trim(),
            description: addDescription.trim(),
        });
        setAddSaving(false);
        if (result.error) {
            setAddError(intl.formatMessage({id: 'contacts.external.add_failed', defaultMessage: 'Failed to add contact'}));
        } else {
            setShowAddModal(false);
            resetAddForm();
            loadData({silent: true});
        }
    }, [ownerId, addSearchResult, addRemark, addDescription, serverUrl, kind, intl, loadData]));

    const resetAddForm = useCallback(() => {
        setAddPhone('');
        setAddSearchResult(null);
        setAddSearchError('');
        setAddRemark('');
        setAddDescription('');
        setAddError('');
    }, []);

    const handleAddClose = useCallback(() => {
        setShowAddModal(false);
        resetAddForm();
    }, [resetAddForm]);

    const animated = useAnimatedStyle(() => ({
        opacity: withTiming(1, {duration: 150}),
        transform: [{translateX: withTiming(0, {duration: 150})}],
    }), []);

    const renderItem = useCallback(
        ({item, index}: {item: MMEmployeeContactSimple; index: number}) => (
            <ExternalContactRow
                item={item}
                isLast={index === items.length - 1}
                theme={theme}
                styles={styles}
                contactEdit={contactEdit}
                onDeleteId={handleDeleteId}
                onViewDetails={handleViewDetails}
                onEdit={handleEdit}
            />
        ),
        [handleDeleteId, handleViewDetails, handleEdit, items.length, styles, theme, contactEdit],
    );

    const keyExtractor = useCallback((item: MMEmployeeContactSimple) => item.contact.id, []);

    const listHeader = (
        <View style={styles.header}>
            <TouchableOpacity
                style={styles.headerBack}
                onPress={() => navigation.goBack()}
                hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                testID='external_contacts.back'
            >
                <CompassIcon
                    name='arrow-left'
                    size={24}
                    color={theme.sidebarText}
                />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{titleMessage}</Text>
            {contactEdit ? (
                <TouchableOpacity
                    style={styles.headerAdd}
                    onPress={() => setShowAddModal(true)}
                    hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                    testID='external_contacts.add'
                >
                    <CompassIcon
                        name='plus'
                        size={24}
                        color={theme.sidebarText}
                    />
                </TouchableOpacity>
            ) : (
                <View style={styles.headerAdd}/>
            )}
        </View>
    );

    // ---- Detail modal render ----
    const renderDetailModal = () => {
        if (!detailsTarget) return null;
        const c = detailsTarget.contact;
        const name = getContactDisplayName(detailsTarget);
        const phone = c?.username || c?.phone || '-';
        const email = c?.email || '-';
        const position = c?.position || '-';
        const gender = getGenderLabel(c?.gender);

        return (
            <Modal
                visible={true}
                transparent={true}
                animationType='slide'
                onRequestClose={() => setDetailsTarget(null)}
            >
                <View style={styles.modalOverlay}>
                    <SafeAreaView edges={['bottom']} style={styles.modalContainer}>
                        <View style={[styles.modalHeader, {paddingTop: insets.top + 16}]}>
                            <Text style={styles.modalTitle}>
                                {intl.formatMessage({id: 'contacts.external.details', defaultMessage: 'Contact Details'})}
                            </Text>
                            <TouchableOpacity
                                style={styles.modalClose}
                                onPress={() => setDetailsTarget(null)}
                            >
                                <CompassIcon name='close' size={24} color={theme.centerChannelColor}/>
                            </TouchableOpacity>
                        </View>
                        <ScrollView style={styles.modalBody}>
                            <View style={styles.detailAvatarSection}>
                                <ContactAvatar
                                    employee={c && getLastPictureUpdate(c) > 0 ? c : undefined}
                                    size={64}
                                />
                                <Text style={styles.detailName}>{name}</Text>
                            </View>
                            <View style={styles.detailGrid}>
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>
                                        {intl.formatMessage({id: 'contacts.external.company', defaultMessage: 'Company'})}
                                    </Text>
                                    <Text style={styles.detailValue}>{detailsTarget.company || '-'}</Text>
                                </View>
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>
                                        {intl.formatMessage({id: 'address_book.phone', defaultMessage: 'Phone'})}
                                    </Text>
                                    <Text style={styles.detailValue}>{phone}</Text>
                                </View>
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>
                                        {intl.formatMessage({id: 'address_book.email', defaultMessage: 'Email'})}
                                    </Text>
                                    <Text style={styles.detailValue}>{email}</Text>
                                </View>
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>
                                        {intl.formatMessage({id: 'contacts.external.position', defaultMessage: 'Position'})}
                                    </Text>
                                    <Text style={styles.detailValue}>{position}</Text>
                                </View>
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>
                                        {intl.formatMessage({id: 'contacts.external.gender', defaultMessage: 'Gender'})}
                                    </Text>
                                    <Text style={styles.detailValue}>{gender}</Text>
                                </View>
                            </View>
                            <View style={styles.detailSection}>
                                <Text style={styles.detailSectionTitle}>
                                    {intl.formatMessage({id: 'contacts.external.remark', defaultMessage: 'Remark'})}
                                </Text>
                                <Text style={styles.detailSectionBody}>
                                    {detailsTarget.remark || intl.formatMessage({id: 'contacts.external.no_remark', defaultMessage: 'No remark'})}
                                </Text>
                            </View>
                            <View style={styles.detailSection}>
                                <Text style={styles.detailSectionTitle}>
                                    {intl.formatMessage({id: 'contacts.external.description', defaultMessage: 'Description'})}
                                </Text>
                                <Text style={styles.detailSectionBody}>
                                    {detailsTarget.description || intl.formatMessage({id: 'contacts.external.no_description', defaultMessage: 'No description'})}
                                </Text>
                            </View>
                        </ScrollView>
                        <View style={styles.modalFooter}>
                            <TouchableOpacity
                                style={[styles.modalBtn, styles.modalBtnSecondary]}
                                onPress={() => handleSendMessage(detailsTarget.contact_id)}
                            >
                                <Text style={styles.modalBtnTextSecondary}>
                                    {intl.formatMessage({id: 'contacts.external.send_message', defaultMessage: 'Send Message'})}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.modalBtn}
                                onPress={() => setDetailsTarget(null)}
                            >
                                <Text style={styles.modalBtnText}>
                                    {intl.formatMessage({id: 'contacts.external.close', defaultMessage: 'Close'})}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </SafeAreaView>
                </View>
            </Modal>
        );
    };

    // ---- Edit modal render ----
    const renderEditModal = () => {
        if (!editTarget) return null;
        const c = editTarget.contact;
        const name = getContactDisplayName(editTarget);
        const phone = c?.username || c?.phone || '-';
        const email = c?.email || '-';
        const position = c?.position || '-';
        const gender = getGenderLabel(c?.gender);

        return (
            <Modal
                visible={true}
                transparent={true}
                animationType='slide'
                onRequestClose={() => !editSaving && setEditTarget(null)}
            >
                <View style={styles.modalOverlay}>
                    <SafeAreaView edges={['bottom']} style={styles.modalContainer}>
                        <View style={[styles.modalHeader, {paddingTop: insets.top + 16}]}>
                            <Text style={styles.modalTitle}>
                                {intl.formatMessage({id: 'contacts.external.edit', defaultMessage: 'Edit Contact'})}
                            </Text>
                            <TouchableOpacity
                                style={styles.modalClose}
                                onPress={() => !editSaving && setEditTarget(null)}
                                disabled={editSaving}
                            >
                                <CompassIcon name='close' size={24} color={theme.centerChannelColor}/>
                            </TouchableOpacity>
                        </View>
                        <ScrollView style={styles.modalBody}>
                            <View style={styles.detailGrid}>
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>
                                        {intl.formatMessage({id: 'address_book.contact_name', defaultMessage: 'Name'})}
                                    </Text>
                                    <Text style={styles.detailValue}>{name}</Text>
                                </View>
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>
                                        {intl.formatMessage({id: 'address_book.phone', defaultMessage: 'Phone'})}
                                    </Text>
                                    <Text style={styles.detailValue}>{phone}</Text>
                                </View>
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>
                                        {intl.formatMessage({id: 'address_book.email', defaultMessage: 'Email'})}
                                    </Text>
                                    <Text style={styles.detailValue}>{email}</Text>
                                </View>
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>
                                        {intl.formatMessage({id: 'contacts.external.position', defaultMessage: 'Position'})}
                                    </Text>
                                    <Text style={styles.detailValue}>{position}</Text>
                                </View>
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>
                                        {intl.formatMessage({id: 'contacts.external.gender', defaultMessage: 'Gender'})}
                                    </Text>
                                    <Text style={styles.detailValue}>{gender}</Text>
                                </View>
                            </View>
                            <View style={styles.formField}>
                                <Text style={styles.formLabel}>
                                    {intl.formatMessage({id: 'contacts.external.add.remark', defaultMessage: 'Remark'})}
                                </Text>
                                <TextInput
                                    style={styles.formInput}
                                    value={editRemark}
                                    onChangeText={setEditRemark}
                                    placeholder={intl.formatMessage({id: 'contacts.external.add.remark_placeholder', defaultMessage: 'Display name'})}
                                    placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.32)}
                                    editable={!editSaving}
                                />
                            </View>
                            <View style={styles.formField}>
                                <Text style={styles.formLabel}>
                                    {intl.formatMessage({id: 'contacts.external.add.description', defaultMessage: 'Description'})}
                                </Text>
                                <TextInput
                                    style={[styles.formInput, styles.formTextArea]}
                                    value={editDescription}
                                    onChangeText={setEditDescription}
                                    placeholder={intl.formatMessage({id: 'contacts.external.add.description_placeholder', defaultMessage: 'Optional notes'})}
                                    placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.32)}
                                    multiline={true}
                                    numberOfLines={3}
                                    editable={!editSaving}
                                />
                            </View>
                        </ScrollView>
                        <View style={styles.modalFooter}>
                            <TouchableOpacity
                                style={[styles.modalBtn, styles.modalBtnSecondary, editSaving && styles.modalBtnDisabled]}
                                onPress={() => handleSendMessage(editTarget.contact_id)}
                                disabled={editSaving}
                            >
                                <Text style={styles.modalBtnTextSecondary}>
                                    {intl.formatMessage({id: 'contacts.external.send_message', defaultMessage: 'Send Message'})}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalBtn, styles.modalBtnSecondary, editSaving && styles.modalBtnDisabled]}
                                onPress={() => setEditTarget(null)}
                                disabled={editSaving}
                            >
                                <Text style={styles.modalBtnTextSecondary}>
                                    {intl.formatMessage({id: 'common.cancel', defaultMessage: 'Cancel'})}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalBtn, editSaving && styles.modalBtnDisabled]}
                                onPress={handleEditSave}
                                disabled={editSaving}
                            >
                                <Text style={styles.modalBtnText}>
                                    {editSaving
                                        ? intl.formatMessage({id: 'contacts.external.add.saving', defaultMessage: 'Saving...'})
                                        : intl.formatMessage({id: 'contacts.external.add.save', defaultMessage: 'Save'})
                                    }
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </SafeAreaView>
                </View>
            </Modal>
        );
    };

    // ---- Add modal render ----
    const renderAddModal = () => {
        return (
            <Modal
                visible={showAddModal}
                transparent={true}
                animationType='slide'
                onRequestClose={handleAddClose}
            >
                <View style={styles.modalOverlay}>
                    <SafeAreaView edges={['bottom']} style={styles.modalContainer}>
                        <View style={[styles.modalHeader, {paddingTop: insets.top + 16}]}>
                            <Text style={styles.modalTitle}>
                                {intl.formatMessage({id: 'contacts.external.add', defaultMessage: 'Add External Contact'})}
                            </Text>
                            <TouchableOpacity
                                style={styles.modalClose}
                                onPress={handleAddClose}
                                disabled={addSaving}
                            >
                                <CompassIcon name='close' size={24} color={theme.centerChannelColor}/>
                            </TouchableOpacity>
                        </View>
                        <ScrollView style={styles.modalBody} keyboardShouldPersistTaps='handled'>
                            {/* Phone search */}
                            <View style={styles.formField}>
                                <Text style={styles.formLabel}>
                                    {intl.formatMessage({id: 'contacts.external.add.phone', defaultMessage: 'Phone Number'})}
                                </Text>
                                <View style={styles.phoneRow}>
                                    <TextInput
                                        style={[styles.formInput, styles.phoneInput]}
                                        value={addPhone}
                                        onChangeText={(text) => {
                                            setAddPhone(text);
                                            if (addSearchResult || addSearchError) {
                                                setAddSearchResult(null);
                                                setAddSearchError('');
                                            }
                                        }}
                                        placeholder={intl.formatMessage({id: 'contacts.external.add.phone_placeholder', defaultMessage: 'Enter phone number to search'})}
                                        placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.32)}
                                        keyboardType='phone-pad'
                                        returnKeyType='search'
                                        onSubmitEditing={handleAddSearch}
                                        editable={!addSaving}
                                        autoFocus={true}
                                    />
                                    <TouchableOpacity
                                        style={[styles.searchBtn, addSearching && styles.modalBtnDisabled]}
                                        onPress={handleAddSearch}
                                        disabled={addSaving || addSearching || !addPhone.trim()}
                                    >
                                        <Text style={styles.searchBtnText}>
                                            {addSearching
                                                ? intl.formatMessage({id: 'contacts.external.add.searching', defaultMessage: 'Searching...'})
                                                : intl.formatMessage({id: 'contacts.external.add.search', defaultMessage: 'Search'})
                                            }
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                                {addSearchError ? (
                                    <Text style={styles.searchError}>{addSearchError}</Text>
                                ) : null}
                            </View>

                            {/* Search result */}
                            {addSearchResult && addSearchResult.alreadyAdded && (
                                <Text style={styles.searchError}>
                                    {intl.formatMessage({id: 'contacts.external.add.duplicate', defaultMessage: 'Contact already exists'})}
                                </Text>
                            )}

                            {addSearchResult && !addSearchResult.alreadyAdded && (
                                <>
                                    {/* User info (read-only) */}
                                    <View style={styles.detailGrid}>
                                        <View style={styles.detailRow}>
                                            <Text style={styles.detailLabel}>
                                                {intl.formatMessage({id: 'address_book.contact_name', defaultMessage: 'Name'})}
                                            </Text>
                                            <Text style={styles.detailValue}>
                                                {addSearchResult.employee.nickname || addSearchResult.employee.first_name || addSearchResult.employee.username}
                                            </Text>
                                        </View>
                                        <View style={styles.detailRow}>
                                            <Text style={styles.detailLabel}>
                                                {intl.formatMessage({id: 'address_book.email', defaultMessage: 'Email'})}
                                            </Text>
                                            <Text style={styles.detailValue}>
                                                {addSearchResult.employee.email || '-'}
                                            </Text>
                                        </View>
                                    </View>

                                    {/* Editable fields */}
                                    <View style={styles.formField}>
                                        <Text style={styles.formLabel}>
                                            {intl.formatMessage({id: 'contacts.external.add.remark', defaultMessage: 'Remark'})}
                                        </Text>
                                        <TextInput
                                            style={styles.formInput}
                                            value={addRemark}
                                            onChangeText={setAddRemark}
                                            placeholder={intl.formatMessage({id: 'contacts.external.add.remark_placeholder', defaultMessage: 'Display name'})}
                                            placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.32)}
                                            editable={!addSaving}
                                        />
                                    </View>
                                    <View style={styles.formField}>
                                        <Text style={styles.formLabel}>
                                            {intl.formatMessage({id: 'contacts.external.add.description', defaultMessage: 'Description'})}
                                        </Text>
                                        <TextInput
                                            style={[styles.formInput, styles.formTextArea]}
                                            value={addDescription}
                                            onChangeText={setAddDescription}
                                            placeholder={intl.formatMessage({id: 'contacts.external.add.description_placeholder', defaultMessage: 'Optional notes'})}
                                            placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.32)}
                                            multiline={true}
                                            numberOfLines={3}
                                            editable={!addSaving}
                                        />
                                    </View>
                                </>
                            )}

                            {addError ? <Text style={styles.formError}>{addError}</Text> : null}
                        </ScrollView>
                        <View style={styles.modalFooter}>
                            <TouchableOpacity
                                style={[styles.modalBtn, styles.modalBtnSecondary]}
                                onPress={handleAddClose}
                                disabled={addSaving}
                            >
                                <Text style={styles.modalBtnTextSecondary}>
                                    {intl.formatMessage({id: 'common.cancel', defaultMessage: 'Cancel'})}
                                </Text>
                            </TouchableOpacity>
                            {addSearchResult && !addSearchResult.alreadyAdded && (
                                <TouchableOpacity
                                    style={[styles.modalBtn, addSaving && styles.modalBtnDisabled]}
                                    onPress={handleAddSave}
                                    disabled={addSaving}
                                >
                                    <Text style={styles.modalBtnText}>
                                        {addSaving
                                            ? intl.formatMessage({id: 'contacts.external.add.saving', defaultMessage: 'Saving...'})
                                            : intl.formatMessage({id: 'contacts.external.add.save', defaultMessage: 'Save'})
                                        }
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </SafeAreaView>
                </View>
            </Modal>
        );
    };

    return (
        <>
            <Freeze freeze={!isFocused}>
                <SafeAreaView
                    edges={edges}
                    style={[styles.flex, {backgroundColor: theme.sidebarBg}]}
                >
                    <Animated.View style={[styles.flex, animated]}>
                        {listHeader}
                        {loading && items.length === 0 ? (
                            <View style={styles.loadingContainer}>
                                <Loading
                                    color={theme.centerChannelColor}
                                    size='small'
                                />
                            </View>
                        ) : (
                            <FlatList
                                style={[styles.flex, {backgroundColor: theme.centerChannelBg}]}
                                contentContainerStyle={[
                                    styles.listContent,
                                    {paddingBottom: 24},
                                    items.length === 0 ? {flexGrow: 1} : undefined,
                                ]}
                                data={items}
                                keyExtractor={keyExtractor}
                                renderItem={renderItem}
                                refreshControl={
                                    <RefreshControl
                                        refreshing={refreshing}
                                        onRefresh={onRefresh}
                                        tintColor={theme.centerChannelColor}
                                    />
                                }
                                ListEmptyComponent={
                                    loading ? null : (
                                        <Text style={styles.emptyMessage}>{emptyMessage}</Text>
                                    )
                                }
                                testID='external_contacts.flatlist'
                            />
                        )}
                    </Animated.View>
                </SafeAreaView>
            </Freeze>

            {renderDetailModal()}
            {renderEditModal()}
            {renderAddModal()}
        </>
    );
};

export default ExternalContactsScreen;
