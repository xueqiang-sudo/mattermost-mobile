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
    fetchEmployeeContacts,
    removeEmployeeContact,
} from '@actions/remote/employee_contact_new';
import {MMEmployeeContactTypes, type MMEmployeeContactSimple} from '@client/rest/team_department';
import CompassIcon from '@components/compass_icon';
import ContactAvatar from '@components/contact_avatar';
import Loading from '@components/loading';
import {Events, Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {usePreventDoubleTap} from '@hooks/utils';
import {getContactListDisplayName, getSupplierCustomerDisplayName} from '@utils/contact_section';
import {getLastPictureUpdate} from '@utils/user';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {StackNavigationProp} from '@react-navigation/stack';
import type {ContactsStackParamList} from './contacts_stack_param_list';
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
    item: MMEmployeeContactSimple;
    isLast: boolean;
    theme: Theme;
    styles: ReturnType<typeof getStyleSheet>;
    onDeleteId: (contactId: string) => void;
    onViewProfile: (contact: MMEmployeeContactSimple) => void;
};

function getContactDisplayName(detail: MMEmployeeContactSimple): string {
    return getSupplierCustomerDisplayName(detail.remark, detail.contact);
}

const ExternalContactRow = memo(({
    item,
    isLast,
    theme,
    styles,
    onDeleteId,
    onViewProfile,
}: RowProps) => {
    if (!item.contact) {
        return null;
    }
    const contactId = item.contact.id;
    const displayName = getContactDisplayName(item);
    const sub = item.description?.trim() || '';
    return (
        <>
            <TouchableOpacity
                style={styles.listItem}
                onPress={() => onViewProfile(item)}
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
                    {item.source === 'erp' ? null : (
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
};

const ExternalContactsScreen = ({currentUser}: Props) => {
    const theme = useTheme();
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const isFocused = useIsFocused();
    const navigation = useNavigation<StackNavigationProp<ContactsStackParamList>>();
    const styles = getStyleSheet(theme);

    const [items, setItems] = useState<MMEmployeeContactSimple[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const ownerId = currentUser?.id;
    const kind = MMEmployeeContactTypes.External;

    const titleMessage = intl.formatMessage({id: 'contacts.external', defaultMessage: 'External Contacts'});
    const emptyMessage = intl.formatMessage({id: 'contacts.external.empty', defaultMessage: 'No external contacts yet'});

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

    const handleViewProfile = usePreventDoubleTap(
        useCallback(
            (_contact: MMEmployeeContactSimple) => {
                // TODO: Navigate to contact detail view when implemented
            },
            [],
        ),
    );

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
                onDeleteId={handleDeleteId}
                onViewProfile={handleViewProfile}
            />
        ),
        [handleDeleteId, handleViewProfile, items.length, styles, theme],
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
            <View style={styles.headerAdd}/>
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
                            testID='external_contacts.flatlist'
                        />
                    )}
                </Animated.View>
            </SafeAreaView>
        </Freeze>
    );
};

export default ExternalContactsScreen;
