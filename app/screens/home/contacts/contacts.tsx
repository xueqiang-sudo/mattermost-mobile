// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useIsFocused, useNavigation} from '@react-navigation/native';
import {type StackNavigationProp} from '@react-navigation/stack';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Freeze} from 'react-freeze';
import {useIntl} from 'react-intl';
import {ScrollView, Text, TouchableOpacity, View} from 'react-native';
import Animated, {useAnimatedStyle, withTiming} from 'react-native-reanimated';
import {type Edge, SafeAreaView} from 'react-native-safe-area-context';

import {
    syncTeamMembersToDefaultDepartment,
    fetchDepartmentsByTeam,
    fetchEmployeesOfDefaultDepartment,
} from '@actions/remote/contact_new';
import {fetchTeamMemberCount} from '@actions/remote/team';
import {DEFAULT_TEAM_DEPARTMENT_NAME} from '@client/rest/constants';
import {ContactsBarEnterpriseTitle} from '@components/adaptive_title_text';
import CompassIcon from '@components/compass_icon';
import ContactAvatar from '@components/contact_avatar';
import Loading from '@components/loading';
import {Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {useOnComponentWillAppear} from '@hooks/use_on_component_will_appear';
import {usePreventDoubleTap} from '@hooks/utils';
import {showModal, showModalWithBackButton} from '@screens/navigation';
import {logDebug} from '@utils/log';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import {type ContactsStackParamList} from './contacts_stack_param_list';

import type {MMDepartment} from '@client/rest/team_department';
import type {Database} from '@nozbe/watermelondb';
import type TeamModel from '@typings/database/models/servers/team';
import type UserModel from '@typings/database/models/servers/user';

/** 通讯录在 Stack 内：不再用手动 topInset 条带（易与系统/导航层重复叠加成「双倍留白」），只由 SafeAreaView 统一处理四边 */
const edges: Edge[] = ['top', 'bottom', 'left', 'right'];

type Props = {
    currentUser?: UserModel;
    currentTeam?: TeamModel;
    database?: Database;
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
        ...typography('Heading', 600, 'SemiBold'),
        color: theme.sidebarText,
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        flexShrink: 0,
        gap: 12,
        marginLeft: 'auto',
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
    memberCountFooter: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
    },
    listItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 16,
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
    emptyMessage: {
        ...typography('Body', 100),
        color: changeOpacity(theme.centerChannelColor, 0.64),
        paddingVertical: 24,
        paddingHorizontal: 20,
        textAlign: 'center',
    },
    serviceError: {
        ...typography('Body', 100),
        color: changeOpacity(theme.centerChannelColor, 0.64),
        paddingVertical: 24,
        paddingHorizontal: 20,
        textAlign: 'center',
    },
    departmentRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 16,
    },
    insetDivider: {
        height: 1,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        marginLeft: 56,
        marginRight: 16,
    },
    departmentFolderIcon: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
        backgroundColor: changeOpacity(theme.linkColor, 0.12),
        borderRadius: 6,
    },
    departmentRowName: {
        ...typography('Body', 200),
        color: theme.centerChannelColor,
        flex: 1,
    },
    subSection: {},
}));

const ContactsScreen = ({currentUser, currentTeam, database, isEnterpriseManager, rnnHomeComponentId}: Props) => {
    const theme = useTheme();
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const navigation = useNavigation<StackNavigationProp<ContactsStackParamList, keyof ContactsStackParamList>>();
    const isFocused = useIsFocused();
    const isFocusedRef = useRef(isFocused);
    isFocusedRef.current = isFocused;
    const mounted = useRef(false);

    const currentTeamId = useMemo(() => currentTeam?.id, [currentTeam]);
    const currentUserId = useMemo(() => currentUser?.id, [currentUser]);
    const companyName = useMemo(() => currentTeam?.displayName?.trim(), [currentTeam]);

    const [topLevelDepartments, setTopLevelDepartments] = useState<MMDepartment[]>([]);
    const [defaultDepartmentEmployees, setDefaultDepartmentEmployees] = useState<UserProfile[]>([]);
    const [companyEmployeeCount, setCompanyEmployeeCount] = useState<number>(0);
    const [loading, setLoading] = useState(true);
    const [serviceError, setServiceError] = useState(false);
    const [contactsHeaderWidth, setContactsHeaderWidth] = useState(0);
    const [contactsHeaderActionsWidth, setContactsHeaderActionsWidth] = useState(0);

    const contactsActionsReserve = Math.max(
        contactsHeaderActionsWidth,
        isEnterpriseManager ? 72 : 40,
    );

    /** RNN 弹窗关闭或 React Navigation Tab 再次聚焦时递增，触发主列表重新拉取 */
    const [homeReappearTick, setHomeReappearTick] = useState(0);

    const styles = getStyleSheet(theme);

    const openAccount = usePreventDoubleTap(useCallback(() => {
        showModal(
            Screens.ACCOUNT_MODAL,
            intl.formatMessage({id: 'account.modal_title', defaultMessage: 'Account'}),
        );
    }, [intl]));

    const handleSearch = usePreventDoubleTap(useCallback(() => {
        if (!currentTeamId) {
            return;
        }
        navigation.navigate(Screens.CONTACTS_SEARCH, {
            companyId: currentTeamId,
            companyName,
            currentUserId: currentUserId,
        });
    }, [companyName, currentTeamId, currentUserId, navigation]));

    const handleManageContacts = usePreventDoubleTap(useCallback(() => {
        const closeButtonId = 'close-contacts-manage';
        showModal(
            Screens.CONTACTS_MANAGE,
            '',
            {
                companyId: currentTeamId ?? '',
                companyName,
                closeButtonId,
            },
            {topBar: {visible: false}, componentId: closeButtonId},
        );
    }, [companyName, currentTeamId]));

    const bumpHomeReappearTick = useCallback(() => {
        logDebug('[ContactsScreen.bumpHomeReappearTick] isFocusedRef.current:', isFocusedRef.current);
        if (!isFocusedRef.current) {
            return;
        }
        setHomeReappearTick((t) => t + 1);
    }, []);
    useOnComponentWillAppear(rnnHomeComponentId, bumpHomeReappearTick);

    useEffect(() => {
        const fetchEnterprise = async () => {
            logDebug('[ContactsScreen.fetchEnterprise] isFocused:', isFocused);
            if (!isFocused) {
                logDebug('[ContactsScreen.fetchEnterprise] isFocused is false, return');
                return;
            }

            mounted.current = true;
            setLoading(true);
            setServiceError(false);

            if (!currentTeamId) {
                setLoading(false);
                return;
            }

            const deptRes = await fetchDepartmentsByTeam(serverUrl, currentTeamId, {parentId: -1, perPage: 10000});
            if (!mounted.current) {
                return;
            }
            if (deptRes.error) {
                setServiceError(true);
                setLoading(false);
                return;
            }

            if (isEnterpriseManager && !deptRes.data?.find((d) => d.name === DEFAULT_TEAM_DEPARTMENT_NAME)) {
                // 创建默认部门 && 同步团队成员到默认部门
                await syncTeamMembersToDefaultDepartment(serverUrl, currentTeamId);
            }

            setTopLevelDepartments((deptRes.data || []).filter((d) => d.name !== DEFAULT_TEAM_DEPARTMENT_NAME));

            const [defaultEmpRes, countRes] = await Promise.all([
                fetchEmployeesOfDefaultDepartment(serverUrl, currentTeamId),
                fetchTeamMemberCount(serverUrl, currentTeamId),
            ]);

            if (!mounted.current) {
                return;
            }
            if (defaultEmpRes.error) {
                setServiceError(true);
            } else {
                setDefaultDepartmentEmployees(defaultEmpRes.data ?? []);
            }
            if (!countRes.error && countRes.data !== undefined) {
                setCompanyEmployeeCount(countRes.data);
            }
            setLoading(false);
        };

        fetchEnterprise();

        return () => {
            mounted.current = false;
        };
    }, [currentTeamId, currentUserId, database, isFocused, serverUrl, homeReappearTick, isEnterpriseManager]);

    const handleDepartmentPress = usePreventDoubleTap(useCallback((department: MMDepartment) => {
        const breadcrumb = [
            intl.formatMessage({id: 'contacts.enterprise', defaultMessage: 'Enterprise Contacts'}),
            department.name,
        ];
        navigation.navigate(Screens.CONTACTS_DEPARTMENT_DETAIL, {
            departmentId: department.id,
            departmentName: department.name,
            breadcrumb,
            companyId: currentTeamId ?? '',
            companyName,
        });
    }, [companyName, intl, currentTeamId, navigation]));

    const handleEmployeePress = usePreventDoubleTap(useCallback((employee: UserProfile, deptName?: string) => {
        const title = intl.formatMessage({id: 'contacts.personal_info', defaultMessage: 'Personal Information'});
        showModalWithBackButton(
            Screens.CONTACTS_EMPLOYEE_PROFILE,
            title,
            `close-employee-${employee.id}`,
            {
                employee,
                departmentName: deptName,
                companyName,
                companyId: currentTeamId ?? undefined,
                currentUserId: currentUserId ?? '',
                closeButtonId: `close-employee-${employee.id}`,
            },
            {useBackIcon: true},
        );
    }, [companyName, currentTeamId, currentUserId, intl]));

    const animated = useAnimatedStyle(() => ({
        opacity: withTiming(1, {duration: 150}),
        transform: [{translateX: withTiming(0, {duration: 150})}],
    }), []);

    const renderEnterpriseContent = () => {
        if (serviceError) {
            return (
                <Text style={styles.serviceError}>
                    {intl.formatMessage({id: 'contacts.service_unavailable', defaultMessage: 'Contact service is not available'})}
                </Text>
            );
        }
        if (loading) {
            return (
                <View style={[styles.listItem, {justifyContent: 'center', paddingVertical: 24}]}>
                    <Loading
                        color={theme.centerChannelColor}
                        size='small'
                    />
                    <Text style={[styles.memberCount, {marginTop: 8}]}>
                        {intl.formatMessage({id: 'contacts.loading', defaultMessage: 'Loading...'})}
                    </Text>
                </View>
            );
        }
        if (topLevelDepartments.length === 0 && defaultDepartmentEmployees.length === 0) {
            return (
                <Text style={styles.emptyMessage}>
                    {intl.formatMessage({id: 'contacts.no_enterprise_contacts', defaultMessage: 'No enterprise contacts'})}
                </Text>
            );
        }
        return (
            <View style={styles.subSection}>
                {topLevelDepartments.map((dept, deptIdx) => (
                    <React.Fragment key={dept.id}>
                        <TouchableOpacity
                            style={styles.departmentRow}
                            onPress={() => handleDepartmentPress(dept)}
                            activeOpacity={0.7}
                            testID={`contacts.department.${dept.id}`}
                        >
                            <View style={styles.departmentFolderIcon}>
                                <CompassIcon
                                    name='folder-outline'
                                    size={24}
                                    color={theme.linkColor}
                                />
                            </View>
                            <Text
                                style={styles.departmentRowName}
                                numberOfLines={1}
                            >
                                {dept.name}
                            </Text>
                        </TouchableOpacity>
                        {deptIdx < topLevelDepartments.length - 1 || defaultDepartmentEmployees.length > 0 ? (
                            <View style={styles.insetDivider}/>
                        ) : null}
                    </React.Fragment>
                ))}
                {defaultDepartmentEmployees.map((emp, empIdx) => (
                    <React.Fragment key={emp.id}>
                        <TouchableOpacity
                            style={styles.listItem}
                            onPress={() => handleEmployeePress(emp, intl.formatMessage({id: 'contacts.default_department', defaultMessage: 'Default Department'}))}
                            activeOpacity={0.7}
                            testID={`contacts.employee.${emp.id}`}
                        >
                            <View style={styles.listItemAvatar}>
                                <ContactAvatar
                                    employee={emp}
                                    size={40}
                                />
                            </View>
                            <Text
                                style={styles.listItemName}
                                numberOfLines={1}
                            >
                                {emp.name}
                            </Text>
                        </TouchableOpacity>
                        {empIdx < defaultDepartmentEmployees.length - 1 ? (
                            <View style={styles.insetDivider}/>
                        ) : null}
                    </React.Fragment>
                ))}
                <View style={styles.memberCountFooter}>
                    <Text style={styles.memberCount}>
                        {intl.formatMessage(
                            {id: 'contacts.member_count', defaultMessage: 'Total {count} members'},
                            {count: companyEmployeeCount},
                        )}
                    </Text>
                </View>
            </View>
        );
    };

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
                            <TouchableOpacity
                                activeOpacity={0.7}
                                onPress={openAccount}
                                style={{
                                    position: 'absolute',
                                    left: 16,
                                    right: contactsActionsReserve + 16 + 8,
                                    top: 0,
                                    bottom: 0,
                                    zIndex: 0,
                                }}
                                testID='contacts.header.account'
                            />
                            <ContactsBarEnterpriseTitle
                                text={(companyName?.trim()) || intl.formatMessage({id: 'contacts.title', defaultMessage: 'Contacts'})}
                                textStyle={styles.headerTitle}
                                testID='contacts.header.title'
                                barWidth={contactsHeaderWidth}
                                actionsBlockWidth={contactsActionsReserve}
                            />
                            <View
                                style={[styles.headerActions, {zIndex: 2}]}
                                onLayout={(e) => setContactsHeaderActionsWidth(e.nativeEvent.layout.width)}
                            >
                                <TouchableOpacity
                                    style={styles.headerIconButton}
                                    onPress={handleSearch}
                                    hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                                    testID='contacts.header.search'
                                >
                                    <CompassIcon
                                        name='magnify'
                                        size={24}
                                        color={theme.sidebarHeaderTextColor}
                                    />
                                </TouchableOpacity>
                                {isEnterpriseManager && (
                                    <TouchableOpacity
                                        style={styles.headerIconButton}
                                        onPress={handleManageContacts}
                                        hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                                        testID='contacts.header.manage'
                                    >
                                        <CompassIcon
                                            name='format-list-bulleted'
                                            size={24}
                                            color={theme.sidebarHeaderTextColor}
                                        />
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>
                        <ScrollView
                            style={[styles.flex, {backgroundColor: theme.centerChannelBg}]}
                            contentContainerStyle={[styles.scrollContent, {paddingBottom: 24}]}
                            showsVerticalScrollIndicator={false}
                        >
                            <View style={styles.enterpriseSection}>
                                <View style={styles.enterpriseHeader}>
                                    <Text style={styles.enterpriseTitle}>
                                        {intl.formatMessage({id: 'contacts.enterprise', defaultMessage: 'Enterprise Contacts'})}
                                    </Text>
                                </View>
                                {renderEnterpriseContent()}
                            </View>
                        </ScrollView>
                    </View>
                </Animated.View>
            </SafeAreaView>
        </Freeze>
    );
};

export default ContactsScreen;
