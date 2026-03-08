// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useIsFocused, useNavigation} from '@react-navigation/native';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Freeze} from 'react-freeze';
import {useIntl} from 'react-intl';
import {Alert, ScrollView, Text, TouchableOpacity, View} from 'react-native';
import Animated, {useAnimatedStyle, withTiming} from 'react-native-reanimated';
import {type Edge, SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';

import {fetchProfilesInTeam} from '@actions/remote/user';
import CompassIcon from '@components/compass_icon';
import Loading from '@components/loading';
import ProfilePicture from '@components/profile_picture';
import {General, Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {usePreventDoubleTap} from '@hooks/utils';
import {TITLE_HEIGHT} from '@screens/bottom_sheet/content';
import {bottomSheet, showModal} from '@screens/navigation';
import {bottomSheetSnapPoint} from '@utils/helpers';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type UserModel from '@typings/database/models/servers/user';

const edges: Edge[] = ['left', 'right'];
const LIST_ITEM_HEIGHT = 56;

const createMockUser = (id: string, username: string, firstName: string, lastName: string): UserProfile => ({
    id,
    create_at: 0,
    update_at: 0,
    delete_at: 0,
    username,
    auth_service: '',
    email: `${username}@example.com`,
    first_name: firstName,
    last_name: lastName,
    nickname: '',
    position: '',
    roles: 'system_user',
    locale: '',
    notify_props: {
        channel: 'true',
        comments: 'never',
        desktop: 'default',
        desktop_sound: 'true',
        desktop_notification_sound: 'default',
        email: 'true',
        first_name: 'true',
        mention_keys: '',
        highlight_keys: '',
        push: 'default',
        push_status: 'away',
        calls_desktop_sound: 'true',
        calls_notification_sound: 'default',
        calls_mobile_sound: 'true',
        calls_mobile_notification_sound: 'default',
    },
    props: {},
});

const MOCK_CUSTOMERS: UserProfile[] = [
    createMockUser('mock-customer-1', 'customer1', '张', '客户'),
    createMockUser('mock-customer-2', 'customer2', '李', '客户'),
];

const MOCK_SUPPLIERS: UserProfile[] = [
    createMockUser('mock-supplier-1', 'supplier1', '王', '供应商'),
];

type Props = {
    currentUser?: UserModel;
    currentTeamId?: string;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    flex: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
        paddingVertical: 4,
        backgroundColor: theme.sidebarBg,
    },
    headerUser: {
        position: 'absolute',
        left: 0,
        right: 0,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        ...typography('Heading', 600, 'SemiBold'),
        color: theme.sidebarText,
        textAlign: 'center',
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        marginLeft: 'auto',
        zIndex: 1,
        gap: 12,
    },
    headerIconButton: {
        padding: 4,
    },
    section: {
        marginTop: 12,
        marginHorizontal: 16,
    },
    sectionTitle: {
        ...typography('Body', 75, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.64),
        paddingHorizontal: 16,
        paddingTop: 4,
        paddingBottom: 6,
    },
    businessRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 5,
        paddingHorizontal: 16,
        backgroundColor: theme.centerChannelBg,
        borderRadius: 12,
        marginBottom: 2,
    },
    businessRowLast: {
        marginBottom: 0,
    },
    iconBox: {
        width: 40,
        height: 40,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
    },
    iconBoxCustomer: {
        backgroundColor: changeOpacity('#34C759', 0.15),
    },
    iconBoxSupplier: {
        backgroundColor: changeOpacity('#007AFF', 0.12),
    },
    sectionRowText: {
        ...typography('Body', 200),
        color: theme.centerChannelColor,
        flex: 1,
    },
    addButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    addButtonCustomer: {
        backgroundColor: changeOpacity('#34C759', 0.15),
    },
    addButtonSupplier: {
        backgroundColor: changeOpacity('#007AFF', 0.12),
    },
    sectionDivider: {
        height: 1,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
        marginHorizontal: 16,
        marginTop: 8,
        marginBottom: 8,
    },
    enterpriseSection: {
        marginTop: 0,
        marginHorizontal: 16,
        backgroundColor: theme.centerChannelBg,
        borderRadius: 12,
        overflow: 'hidden',
    },
    enterpriseHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 4,
    },
    enterpriseTitle: {
        ...typography('Body', 75, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.64),
    },
    memberCount: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.64),
    },
    listItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.06),
    },
    listItemAvatar: {
        marginRight: 14,
    },
    listItemName: {
        ...typography('Body', 200),
        color: theme.centerChannelColor,
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        paddingBottom: 32,
    },
    bottomSheetItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 20,
        minHeight: LIST_ITEM_HEIGHT,
    },
    bottomSheetList: {
        paddingBottom: 24,
    },
}));

const ContactsScreen = ({
    currentUser,
    currentTeamId,
}: Props) => {
    const theme = useTheme();
    const intl = useIntl();
    const navigation = useNavigation();
    const serverUrl = useServerUrl();
    const insets = useSafeAreaInsets();
    const isFocused = useIsFocused();
    const mounted = useRef(false);

    const [enterpriseMembers, setEnterpriseMembers] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(false);

    const styles = getStyleSheet(theme);

    const openAccount = usePreventDoubleTap(useCallback(() => {
        showModal(
            Screens.ACCOUNT_MODAL,
            intl.formatMessage({id: 'account.modal_title', defaultMessage: 'Account'}),
        );
    }, [intl]));

    const handleSearch = usePreventDoubleTap(useCallback(() => {
        navigation.navigate(Screens.SEARCH as never);
    }, [navigation]));

    const handleManageContacts = usePreventDoubleTap(useCallback(() => {
        Alert.alert(intl.formatMessage({id: 'contacts.manage_contacts', defaultMessage: 'Manage Contacts'}), intl.formatMessage({id: 'contacts.add_feature_coming', defaultMessage: 'Feature coming soon'}));
    }, [intl]));

    const handleAddCustomer = usePreventDoubleTap(useCallback(() => {
        Alert.alert(
            intl.formatMessage({id: 'contacts.add_feature_coming', defaultMessage: 'Feature coming soon'}),
        );
    }, [intl]));

    const handleAddSupplier = usePreventDoubleTap(useCallback(() => {
        Alert.alert(
            intl.formatMessage({id: 'contacts.add_feature_coming', defaultMessage: 'Feature coming soon'}),
        );
    }, [intl]));

    const handleOpenCustomersList = usePreventDoubleTap(useCallback(() => {
        const renderContent = () => (
            <View style={styles.bottomSheetList}>
                {MOCK_CUSTOMERS.map((item) => (
                    <View
                        key={item.id}
                        style={styles.bottomSheetItem}
                    >
                        <View style={styles.listItemAvatar}>
                            <ProfilePicture
                                author={item}
                                size={40}
                                showStatus={false}
                            />
                        </View>
                        <Text
                            style={styles.listItemName}
                            numberOfLines={1}
                        >
                            {item.nickname}
                        </Text>
                    </View>
                ))}
                <Text style={[styles.memberCount, {paddingHorizontal: 20, paddingTop: 12}]}>
                    {intl.formatMessage(
                        {id: 'contacts.member_count', defaultMessage: 'Total {count} members'},
                        {count: MOCK_CUSTOMERS.length},
                    )}
                </Text>
            </View>
        );

        const count = MOCK_CUSTOMERS.length;
        const snapPoints: Array<string | number> = [
            1,
            Math.min(bottomSheetSnapPoint(count, LIST_ITEM_HEIGHT) + TITLE_HEIGHT + 80, 420),
        ];
        if (count > 4) {
            snapPoints.push('70%');
        }

        bottomSheet({
            closeButtonId: 'close-customers-list',
            renderContent,
            snapPoints,
            title: intl.formatMessage({id: 'contacts.my_customers', defaultMessage: 'My Customers'}),
            theme,
            scrollable: true,
        });
    }, [intl, theme, styles.bottomSheetList, styles.memberCount, styles.bottomSheetItem, styles.listItemAvatar, styles.listItemName]));

    const handleOpenSuppliersList = usePreventDoubleTap(useCallback(() => {
        const renderContent = () => (
            <View style={styles.bottomSheetList}>
                {MOCK_SUPPLIERS.map((item) => (
                    <View
                        key={item.id}
                        style={styles.bottomSheetItem}
                    >
                        <View style={styles.listItemAvatar}>
                            <ProfilePicture
                                author={item}
                                size={40}
                                showStatus={false}
                            />
                        </View>
                        <Text
                            style={styles.listItemName}
                            numberOfLines={1}
                        >
                            {item.nickname}
                        </Text>
                    </View>
                ))}
                <Text style={[styles.memberCount, {paddingHorizontal: 20, paddingTop: 12}]}>
                    {intl.formatMessage(
                        {id: 'contacts.member_count', defaultMessage: 'Total {count} members'},
                        {count: MOCK_SUPPLIERS.length},
                    )}
                </Text>
            </View>
        );

        const count = MOCK_SUPPLIERS.length;
        const snapPoints: Array<string | number> = [
            1,
            Math.min(bottomSheetSnapPoint(count, LIST_ITEM_HEIGHT) + TITLE_HEIGHT + 80, 420),
        ];
        if (count > 4) {
            snapPoints.push('70%');
        }

        bottomSheet({
            closeButtonId: 'close-suppliers-list',
            renderContent,
            snapPoints,
            title: intl.formatMessage({id: 'contacts.my_suppliers', defaultMessage: 'My Suppliers'}),
            theme,
            scrollable: true,
        });
    }, [intl, styles.bottomSheetItem, styles.bottomSheetList, styles.listItemAvatar, styles.listItemName, styles.memberCount, theme]));

    useEffect(() => {
        if (!currentTeamId || !serverUrl) {
            setLoading(false);
            return;
        }

        mounted.current = true;
        setLoading(true);

        const fetchMembers = async () => {
            const result = await fetchProfilesInTeam(
                serverUrl,
                currentTeamId,
                0,
                General.PROFILE_CHUNK_SIZE,
                '',
                {active: true},
            );

            if (mounted.current && result.users) {
                setEnterpriseMembers(result.users);
            }
            if (mounted.current) {
                setLoading(false);
            }
        };

        fetchMembers();

        return () => {
            mounted.current = false;
        };
    }, [serverUrl, currentTeamId]);

    const renderContactItem = useCallback((user: UserProfile) => (
        <View
            key={user.id}
            style={styles.listItem}
        >
            <View style={styles.listItemAvatar}>
                <ProfilePicture
                    author={user}
                    size={40}
                    showStatus={false}
                />
            </View>
            <Text
                style={styles.listItemName}
                numberOfLines={1}
            >
                {user.nickname}
            </Text>
        </View>
    ), [styles]);

    const animated = useAnimatedStyle(() => ({
        opacity: withTiming(1, {duration: 150}),
        transform: [{translateX: withTiming(0, {duration: 150})}],
    }), []);

    const content = (
        <ScrollView
            style={styles.flex}
            contentContainerStyle={[styles.scrollContent, {paddingBottom: insets.bottom + 24}]}
            showsVerticalScrollIndicator={false}
        >
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.headerUser}
                    onPress={openAccount}
                    activeOpacity={0.7}
                    testID='contacts.header.account'
                >
                    <Text
                        style={styles.headerTitle}
                        numberOfLines={1}
                    >
                        {currentUser
                            ? ((currentUser.nickname?.trim()) || currentUser.username || intl.formatMessage({id: 'contacts.title', defaultMessage: 'Contacts'}))
                            : intl.formatMessage({id: 'contacts.title', defaultMessage: 'Contacts'})}
                    </Text>
                </TouchableOpacity>
                <View style={styles.headerActions}>
                    <TouchableOpacity
                        style={styles.headerIconButton}
                        onPress={handleSearch}
                        hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                        testID='contacts.header.search'
                    >
                        <CompassIcon
                            name='magnify'
                            size={24}
                            color={theme.sidebarText}
                        />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.headerIconButton}
                        onPress={handleManageContacts}
                        hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                        testID='contacts.header.manage'
                    >
                        <CompassIcon
                            name='format-list-bulleted'
                            size={24}
                            color={theme.sidebarText}
                        />
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                    {intl.formatMessage({id: 'contacts.business_contacts', defaultMessage: 'Business Contacts'})}
                </Text>
                <TouchableOpacity
                    style={styles.businessRow}
                    onPress={handleOpenCustomersList}
                    activeOpacity={0.7}
                    testID='contacts.my_customers.row'
                >
                    <View style={[styles.iconBox, styles.iconBoxCustomer]}>
                        <CompassIcon
                            name='account-multiple-outline'
                            size={22}
                            color='#34C759'
                        />
                    </View>
                    <Text style={styles.sectionRowText}>
                        {intl.formatMessage({id: 'contacts.my_customers', defaultMessage: 'My Customers'})}
                    </Text>
                    <TouchableOpacity
                        style={[styles.addButton, styles.addButtonCustomer]}
                        onPress={handleAddCustomer}
                        hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                        testID='contacts.add_customer'
                    >
                        <CompassIcon
                            name='plus'
                            size={18}
                            color='#34C759'
                        />
                    </TouchableOpacity>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.businessRow, styles.businessRowLast]}
                    onPress={handleOpenSuppliersList}
                    activeOpacity={0.7}
                    testID='contacts.my_suppliers.row'
                >
                    <View style={[styles.iconBox, styles.iconBoxSupplier]}>
                        <CompassIcon
                            name='account-multiple-outline'
                            size={22}
                            color='#007AFF'
                        />
                    </View>
                    <Text style={styles.sectionRowText}>
                        {intl.formatMessage({id: 'contacts.my_suppliers', defaultMessage: 'My Suppliers'})}
                    </Text>
                    <TouchableOpacity
                        style={[styles.addButton, styles.addButtonSupplier]}
                        onPress={handleAddSupplier}
                        hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                        testID='contacts.add_supplier'
                    >
                        <CompassIcon
                            name='plus'
                            size={18}
                            color='#007AFF'
                        />
                    </TouchableOpacity>
                </TouchableOpacity>
            </View>

            <View style={styles.sectionDivider}/>

            <View style={styles.enterpriseSection}>
                <View style={styles.enterpriseHeader}>
                    <Text style={styles.enterpriseTitle}>
                        {intl.formatMessage({id: 'contacts.enterprise', defaultMessage: 'Enterprise Contacts'})}
                    </Text>
                    <Text style={styles.memberCount}>
                        {intl.formatMessage(
                            {id: 'contacts.member_count', defaultMessage: 'Total {count} members'},
                            {count: enterpriseMembers.length},
                        )}
                    </Text>
                </View>
                {loading ? (
                    <View style={[styles.listItem, {justifyContent: 'center', paddingVertical: 24}]}>
                        <Loading
                            color={theme.centerChannelColor}
                            size='small'
                        />
                        <Text style={[styles.memberCount, {marginTop: 8}]}>
                            {intl.formatMessage({id: 'contacts.loading', defaultMessage: 'Loading...'})}
                        </Text>
                    </View>
                ) : (
                    enterpriseMembers.map(renderContactItem)
                )}
            </View>
        </ScrollView>
    );

    return (
        <Freeze freeze={!isFocused}>
            <SafeAreaView
                edges={edges}
                style={styles.flex}
                testID='contacts.screen'
            >
                <View style={[{height: insets.top, backgroundColor: theme.sidebarBg}]}/>
                <Animated.View style={[styles.flex, animated]}>
                    {content}
                </Animated.View>
            </SafeAreaView>
        </Freeze>
    );
};

export default ContactsScreen;
