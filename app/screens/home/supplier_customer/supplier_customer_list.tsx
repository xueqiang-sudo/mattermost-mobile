// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useIsFocused, useNavigation} from '@react-navigation/native';
import React, {memo, useCallback, useEffect, useMemo, useState} from 'react';
import {Freeze} from 'react-freeze';
import {useIntl} from 'react-intl';
import {
    Alert,
    DeviceEventEmitter,
    FlatList,
    type GestureResponderEvent,
    RefreshControl,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import Animated, {useAnimatedStyle, withTiming} from 'react-native-reanimated';
import {type Edge, SafeAreaView} from 'react-native-safe-area-context';

import {
    type EmployeeContactDetailRow,
    fetchEmployeeContactsWithDetails,
    removeEmployeeContact,
} from '@actions/remote/employee_contact_new';
import {MMEmployeeContactTypes, type MMEmployeeContactType} from '@client/rest/team_department';
import {useServerUrl} from '@context/server';
import {getContactListDisplayName, getSupplierCustomerDisplayName} from '@utils/contact_section';
import ContactAvatar from '@components/contact_avatar';
import CompassIcon from '@components/compass_icon';
import Loading from '@components/loading';
import {Events, Screens} from '@constants';
import {useTheme} from '@context/theme';
import {usePreventDoubleTap} from '@hooks/utils';
import {showModalWithBackButton} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {StackNavigationProp} from '@react-navigation/stack';
import type {MyHomepageStackParamList} from '@screens/home/my_homepage/stack_param_list';
import type UserModel from '@typings/database/models/servers/user';

type Props = {
    kind: MMEmployeeContactType;
    currentUser?: UserModel;
};

type ListNav = StackNavigationProp<MyHomepageStackParamList>;

/** Stack 内页面：不用手动 topInset 条带，由 SafeAreaView 统一四边，避免双倍顶部留白 */
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
        ...typography('Heading', 600, 'SemiBold'),
        color: theme.sidebarText,
        textAlign: 'center',
        flex: 1,
        marginRight: 32,
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
}));

type RowProps = {
    item: EmployeeContactDetailRow;
    isLast: boolean;
    theme: Theme;
    styles: ReturnType<typeof getStyleSheet>;
    onEditId: (contactId: string) => void;
    onDeleteId: (contactId: string) => void;
    onViewProfile: (contact: EmployeeContactDetailRow) => void;
    relationDescriptionLabel: string;
};

function formatContactSubtitle(detail: EmployeeContactDetailRow, relationLabel: string): string {
    if (!detail.description?.trim()) {
        return '';
    }
    return `${relationLabel}: ${detail.description.trim()}`;
}

function getContactDisplayName(detail: EmployeeContactDetailRow): string {
    return getSupplierCustomerDisplayName(detail.remark, detail.contact);
}

const SupplierCustomerListRow = memo(({
    item,
    isLast,
    theme,
    styles,
    onEditId,
    onDeleteId,
    onViewProfile,
    relationDescriptionLabel,
}: RowProps) => {
    const contactId = item.contact.id;
    const displayName = getContactDisplayName(item);
    const sub = formatContactSubtitle(item, relationDescriptionLabel);
    return (
        <>
            <TouchableOpacity
                style={styles.listItem}
                onPress={() => onViewProfile(item)}
                activeOpacity={0.7}
                testID={`supplier_customer.list.row.${contactId}`}
            >
                <View style={styles.listItemAvatarWrap}>
                    <ContactAvatar
                        employee={item.contact}
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
                            onEditId(contactId);
                        }}
                        hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                        testID={`supplier_customer.list.row.${contactId}.edit`}
                    >
                        <CompassIcon
                            name='pencil-outline'
                            size={20}
                            color={theme.linkColor}
                        />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.actionButton}
                        onPress={(e: GestureResponderEvent) => {
                            e.stopPropagation();
                            onDeleteId(contactId);
                        }}
                        hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                        testID={`supplier_customer.list.row.${contactId}.delete`}
                    >
                        <CompassIcon
                            name='trash-can-outline'
                            size={20}
                            color={theme.errorTextColor}
                        />
                    </TouchableOpacity>
                </View>
            </TouchableOpacity>
            {isLast ? null : <View style={styles.divider}/>}
        </>
    );
});
SupplierCustomerListRow.displayName = 'SupplierCustomerListRow';

const SupplierCustomerListScreen = ({kind, currentUser}: Props) => {
    const theme = useTheme();
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const isFocused = useIsFocused();
    const navigation = useNavigation<ListNav>();
    const styles = getStyleSheet(theme);

    const [items, setItems] = useState<EmployeeContactDetailRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const isSupplierKind = kind === MMEmployeeContactTypes.Supplier;
    const ownerId = currentUser?.id;

    const titleMessage = useMemo(
        () =>
            (isSupplierKind? intl.formatMessage({id: 'supplier_customer.list_title_supplier', defaultMessage: 'My Suppliers'}): intl.formatMessage({id: 'supplier_customer.list_title_customer', defaultMessage: 'My Customers'})),
        [intl, isSupplierKind],
    );

    const emptyMessage = useMemo(
        () =>
            (isSupplierKind? intl.formatMessage({id: 'supplier_customer.empty_suppliers', defaultMessage: 'No suppliers yet'}): intl.formatMessage({id: 'supplier_customer.empty_customers', defaultMessage: 'No customers yet'})),
        [intl, isSupplierKind],
    );
    const relationDescriptionLabel = intl.formatMessage({
        id: 'supplier_customer.relation',
        defaultMessage: 'Relation description',
    });

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
            const result = await fetchEmployeeContactsWithDetails(serverUrl, ownerId, kind);
            if (!result.error && result.data) {
                setItems(result.data);
            }
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
            const result = await fetchEmployeeContactsWithDetails(serverUrl, ownerId, kind);
            if (!result.error && result.data) {
                setItems(result.data);
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
            (payload?: {contactType?: MMEmployeeContactType}) => {
                if (payload?.contactType !== undefined && payload.contactType !== kind) {
                    return;
                }
                if (!ownerId) {
                    return;
                }
                loadData({silent: true});
            },
        );
        return () => sub.remove();
    }, [kind, loadData, ownerId]);

    const openForm = useCallback(
        (opts: {
            existingContactId?: string;
            initialContactName?: string;
            initialDescription?: string;
            initialRemark?: string;
            initialContactEmail?: string;
            initialContactPhone?: string;
            initialContactPosition?: string;
        }) => {
            if (!ownerId) {
                return;
            }
            navigation.navigate(Screens.SUPPLIER_CUSTOMER_FORM, {
                kind,
                ownerId,
                existingContactId: opts.existingContactId,
                initialContactName: opts.initialContactName,
                initialDescription: opts.initialDescription,
                initialRemark: opts.initialRemark,
                initialContactEmail: opts.initialContactEmail,
                initialContactPhone: opts.initialContactPhone,
                initialContactPosition: opts.initialContactPosition,
            });
        },
        [kind, navigation, ownerId],
    );

    const handleAdd = usePreventDoubleTap(
        useCallback(() => {
            openForm({});
        }, [openForm]),
    );

    const handleEditId = useCallback(
        (contactId: string) => {
            const row = items.find((i) => i.contact.id === contactId);
            openForm({
                existingContactId: contactId,
                initialContactName: row ? getContactListDisplayName(row.contact) : undefined,
                initialDescription: row?.description,
                initialRemark: row?.remark,
                initialContactEmail: row?.contact.email,
                initialContactPhone: row?.contact.phone,
                initialContactPosition: row?.contact.position,
            });
        },
        [items, openForm],
    );

    const handleDeleteId = usePreventDoubleTap(
        useCallback(
            (contactId: string) => {
                const row = items.find((i) => i.contact.id === contactId);
                const name = row ? getContactDisplayName(row) : contactId;
                const typeLabel = isSupplierKind? intl.formatMessage({id: 'supplier_customer.type_supplier', defaultMessage: 'Supplier'}): intl.formatMessage({id: 'supplier_customer.type_customer', defaultMessage: 'Customer'});
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
                    intl.formatMessage(
                        {id: 'supplier_customer.delete_confirm', defaultMessage: 'Delete {type}'},
                        {type: typeLabel},
                    ),
                    intl.formatMessage(
                        {id: 'supplier_customer.delete_confirm_msg', defaultMessage: 'Are you sure you want to delete {name}?'},
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
            [intl, isSupplierKind, items, kind, ownerId, serverUrl],
        ),
    );

    const handleViewProfile = usePreventDoubleTap(
        useCallback(
            (contact: EmployeeContactDetailRow) => {
                const title = intl.formatMessage({id: 'contacts.personal_info', defaultMessage: 'Personal Information'});
                showModalWithBackButton(
                    Screens.CONTACTS_EMPLOYEE_PROFILE,
                    title,
                    `close-supplier-customer-${contact.contact.id}`,
                    {
                        employee: contact.contact,
                        description: contact.description,
                        remark: contact.remark,
                        relationType: contact.contact_type,
                        currentUserId: currentUser?.id,
                        closeButtonId: `close-supplier-customer-${contact.contact.id}`,
                    },
                    {useBackIcon: true},
                );
            },
            [intl, currentUser?.id],
        ),
    );

    const animated = useAnimatedStyle(() => ({
        opacity: withTiming(1, {duration: 150}),
        transform: [{translateX: withTiming(0, {duration: 150})}],
    }), []);

    const renderItem = useCallback(
        ({item, index}: {item: EmployeeContactDetailRow; index: number}) => (
            <SupplierCustomerListRow
                item={item}
                isLast={index === items.length - 1}
                theme={theme}
                styles={styles}
                onEditId={handleEditId}
                onDeleteId={handleDeleteId}
                onViewProfile={handleViewProfile}
                relationDescriptionLabel={relationDescriptionLabel}
            />
        ),
        [handleDeleteId, handleEditId, handleViewProfile, items.length, relationDescriptionLabel, styles, theme],
    );

    const keyExtractor = useCallback((item: EmployeeContactDetailRow) => item.contact.id, []);

    const listHeader = (
        <View style={styles.header}>
            <TouchableOpacity
                style={styles.headerBack}
                onPress={() => navigation.goBack()}
                hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                testID='supplier_customer.list.back'
            >
                <CompassIcon
                    name='arrow-left'
                    size={24}
                    color={theme.sidebarText}
                />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{titleMessage}</Text>
            <TouchableOpacity
                style={styles.headerAdd}
                onPress={handleAdd}
                hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                testID='supplier_customer.list.add'
            >
                <CompassIcon
                    name='plus'
                    size={24}
                    color={theme.sidebarText}
                />
            </TouchableOpacity>
        </View>
    );

    return (
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
                                testID='supplier_customer.list.flatlist'
                            />
                        )}
                </Animated.View>
            </SafeAreaView>
        </Freeze>
    );
};

export default SupplierCustomerListScreen;
