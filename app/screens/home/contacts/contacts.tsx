// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useIsFocused, useNavigation} from '@react-navigation/native';
import {type StackNavigationProp} from '@react-navigation/stack';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Freeze} from 'react-freeze';
import {useIntl} from 'react-intl';
import {DeviceEventEmitter, ScrollView, Text, TouchableOpacity, View} from 'react-native';
import Animated, {useAnimatedStyle, withTiming} from 'react-native-reanimated';
import {type Edge, SafeAreaView} from 'react-native-safe-area-context';

import {fetchTeamById} from '@actions/remote/team';
import {ContactsBarEnterpriseTitle} from '@components/adaptive_title_text';
import CompassIcon from '@components/compass_icon';
import {Events, Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {useOnComponentWillAppear} from '@hooks/use_on_component_will_appear';
import {usePreventDoubleTap} from '@hooks/utils';
import NetworkManager from '@managers/network_manager';
import {logDebug} from '@utils/log';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import {type ContactsStackParamList} from './contacts_stack_param_list';

import type {MMDepartment} from '@client/rest/team_department';
import type TeamModel from '@typings/database/models/servers/team';
import type UserModel from '@typings/database/models/servers/user';

/** 通讯录在 Stack 内：不再用手动 topInset 条带（易与系统/导航层重复叠加成「双倍留白」），只由 SafeAreaView 统一处理四边 */
const edges: Edge[] = ['top', 'bottom', 'left', 'right'];

type Props = {
    currentUser?: UserModel;
    currentTeam?: TeamModel;
    isEnterpriseManager: boolean;

    /** RNN Home componentId；关管理弹窗时 Home 会 willAppear，用于刷新列表 */
    rnnHomeComponentId?: string;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    flex: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 2,
        backgroundColor: theme.sidebarBg,
        flexShrink: 0,
    },
    headerTitle: {
        ...typography('Heading', 300, 'SemiBold'),
        color: theme.sidebarText,
    },
    scrollContent: {
        flexGrow: 1,
        paddingBottom: 32,
    },
    myContactSection: {
        marginTop: 12,
        marginHorizontal: 16,
        backgroundColor: theme.centerChannelBg,
        borderRadius: 12,
        overflow: 'hidden',
    },
    myContactItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
    },
    myContactIcon: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
        borderRadius: 6,
    },
    myContactLabel: {
        flex: 1,
        ...typography('Body', 200),
        color: theme.centerChannelColor,
    },
    myContactChevron: {
        color: changeOpacity(theme.centerChannelColor, 0.32),
    },
    myContactDivider: {
        height: 0.5,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
        marginLeft: 70,
    },
}));

const ContactsScreen = ({currentUser, currentTeam, isEnterpriseManager, rnnHomeComponentId}: Props) => {
    const theme = useTheme();
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const navigation = useNavigation<StackNavigationProp<ContactsStackParamList, keyof ContactsStackParamList>>();
    const isFocused = useIsFocused();
    const isFocusedRef = useRef(isFocused);
    isFocusedRef.current = isFocused;
    const mounted = useRef(false);
    const tagMetaRequestIdRef = useRef(0);

    const currentTeamId = useMemo(() => currentTeam?.id, [currentTeam]);
    const currentUserId = useMemo(() => currentUser?.id, [currentUser]);
    const companyName = useMemo(() => currentTeam?.displayName?.trim(), [currentTeam]);

    const [contactsHeaderWidth, setContactsHeaderWidth] = useState(0);
    const [ownerId, setOwnerId] = useState<string | undefined>();
    const [resolvedCurrentUserId, setResolvedCurrentUserId] = useState<string | undefined>(currentUserId);

    /** RNN 弹窗关闭或 React Navigation Tab 再次聚焦时递增，触发主列表重新拉取 */
    const [homeReappearTick, setHomeReappearTick] = useState(0);

    const styles = getStyleSheet(theme);

    const bumpHomeReappearTick = useCallback(() => {
        logDebug('[ContactsScreen.bumpHomeReappearTick] isFocusedRef.current:', isFocusedRef.current);
        if (!isFocusedRef.current) {
            return;
        }
        setHomeReappearTick((t) => t + 1);
    }, []);
    useOnComponentWillAppear(rnnHomeComponentId, bumpHomeReappearTick);

    useEffect(() => {
        setResolvedCurrentUserId(currentUserId);
    }, [currentUserId]);

    const loadTagMeta = useCallback(async () => {
        if (!serverUrl || !currentTeamId) {
            return;
        }
        const requestId = ++tagMetaRequestIdRef.current;
        const teamResult = await fetchTeamById(serverUrl, currentTeamId);
        if (requestId === tagMetaRequestIdRef.current) {
            setOwnerId(teamResult.team?.creator_id);
        }
        try {
            const me = await NetworkManager.getClient(serverUrl).getMe();
            if (requestId === tagMetaRequestIdRef.current) {
                setResolvedCurrentUserId(me?.id);
            }
        } catch {
            // ignore
        }
    }, [currentTeamId, serverUrl]);

    useEffect(() => {
        loadTagMeta();
    }, [loadTagMeta, homeReappearTick]);

    useEffect(() => {
        const listener = DeviceEventEmitter.addListener(Events.MANAGE_ENTERPRISE_REFRESH, () => {
            loadTagMeta();
        });
        return () => listener.remove();
    }, [loadTagMeta]);

    /** 成员被删除后刷新通讯录主列表 */
    useEffect(() => {
        const listener = DeviceEventEmitter.addListener(Events.CONTACTS_LIST_REFRESH, () => {
            setHomeReappearTick((t) => t + 1);
        });
        return () => listener.remove();
    }, []);

    const handleMySuppliers = usePreventDoubleTap(useCallback(() => {
        navigation.navigate(Screens.MY_SUPPLIERS);
    }, [navigation]));

    const handleMyCustomers = usePreventDoubleTap(useCallback(() => {
        navigation.navigate(Screens.MY_CUSTOMERS);
    }, [navigation]));

    const handleEnterpriseContacts = usePreventDoubleTap(useCallback(() => {
        const breadcrumb = [
            intl.formatMessage({id: 'contacts.enterprise', defaultMessage: 'Enterprise Contacts'}),
        ];
        navigation.navigate(Screens.CONTACTS_DEPARTMENT_DETAIL, {
            departmentId: null,
            departmentName: intl.formatMessage({id: 'contacts.enterprise', defaultMessage: 'Enterprise Contacts'}),
            breadcrumb,
            companyId: currentTeamId ?? '',
            companyName,
            ownerId,
            currentUserId: resolvedCurrentUserId,
        });
    }, [companyName, intl, currentTeamId, navigation, ownerId, resolvedCurrentUserId]));

    const animated = useAnimatedStyle(() => ({
        opacity: withTiming(1, {duration: 150}),
        transform: [{translateX: withTiming(0, {duration: 150})}],
    }), []);

    return (
        <Freeze freeze={!isFocused}>
            <SafeAreaView
                edges={edges}
                style={[styles.flex, {backgroundColor: theme.sidebarBg}]}
                testID='contacts.screen'
            >
                <Animated.View style={[styles.flex, animated]}>
                    <View style={styles.flex}>
                        <View
                            style={[styles.header, {position: 'relative', minHeight: 44}]}
                            onLayout={(e) => setContactsHeaderWidth(e.nativeEvent.layout.width)}
                        >
                            <ContactsBarEnterpriseTitle
                                text={(companyName?.trim()) || intl.formatMessage({id: 'contacts.title', defaultMessage: 'Contacts'})}
                                textStyle={styles.headerTitle}
                                testID='contacts.header.title'
                                barWidth={contactsHeaderWidth}
                            />
                        </View>
                        <ScrollView
                            style={[styles.flex, {backgroundColor: theme.centerChannelBg}]}
                            contentContainerStyle={[styles.scrollContent, {paddingBottom: 24}]}
                            showsVerticalScrollIndicator={false}
                        >
                            <View style={styles.myContactSection}>
                                <TouchableOpacity
                                    style={styles.myContactItem}
                                    onPress={handleEnterpriseContacts}
                                    activeOpacity={0.7}
                                    testID='contacts.enterprise'
                                >
                                    <View style={[styles.myContactIcon, {backgroundColor: changeOpacity(theme.sidebarTextActiveBorder || theme.linkColor, 0.12)}]}>
                                        <CompassIcon
                                            name='account-multiple-outline'
                                            size={24}
                                            color={theme.sidebarTextActiveBorder || theme.linkColor}
                                        />
                                    </View>
                                    <Text style={styles.myContactLabel}>
                                        {intl.formatMessage({id: 'contacts.enterprise', defaultMessage: 'Enterprise Contacts'})}
                                    </Text>
                                    <CompassIcon
                                        name='chevron-right'
                                        size={20}
                                        style={styles.myContactChevron}
                                    />
                                </TouchableOpacity>
                                <View style={styles.myContactDivider}/>
                                <TouchableOpacity
                                    style={styles.myContactItem}
                                    onPress={handleMySuppliers}
                                    activeOpacity={0.7}
                                    testID='contacts.my_suppliers'
                                >
                                    <View style={[styles.myContactIcon, {backgroundColor: changeOpacity(theme.linkColor, 0.12)}]}>
                                        <CompassIcon
                                            name='car-outline'
                                            size={24}
                                            color={theme.linkColor}
                                        />
                                    </View>
                                    <Text style={styles.myContactLabel}>
                                        {intl.formatMessage({id: 'my_homepage.my_suppliers', defaultMessage: 'My Suppliers'})}
                                    </Text>
                                    <CompassIcon
                                        name='chevron-right'
                                        size={20}
                                        style={styles.myContactChevron}
                                    />
                                </TouchableOpacity>
                                <View style={styles.myContactDivider}/>
                                <TouchableOpacity
                                    style={styles.myContactItem}
                                    onPress={handleMyCustomers}
                                    activeOpacity={0.7}
                                    testID='contacts.my_customers'
                                >
                                    <View style={[styles.myContactIcon, {backgroundColor: changeOpacity(theme.onlineIndicator, 0.12)}]}>
                                        <CompassIcon
                                            name='account-outline'
                                            size={24}
                                            color={theme.onlineIndicator}
                                        />
                                    </View>
                                    <Text style={styles.myContactLabel}>
                                        {intl.formatMessage({id: 'my_homepage.my_customers', defaultMessage: 'My Customers'})}
                                    </Text>
                                    <CompassIcon
                                        name='chevron-right'
                                        size={20}
                                        style={styles.myContactChevron}
                                    />
                                </TouchableOpacity>
                            </View>
                        </ScrollView>
                    </View>
                </Animated.View>
            </SafeAreaView>
        </Freeze>
    );
};

export default ContactsScreen;
