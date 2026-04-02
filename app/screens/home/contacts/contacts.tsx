// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useIsFocused, useNavigation} from '@react-navigation/native';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Freeze} from 'react-freeze';
import {useIntl} from 'react-intl';
import {Platform, ScrollView, StatusBar, Text, TouchableOpacity, View} from 'react-native';
import Animated, {useAnimatedStyle, withTiming} from 'react-native-reanimated';
import {type Edge, SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';

import {
    ensureTeamCompany,
    fetchCanManageEnterprise,
    fetchCompany,
    fetchDepartmentsByCompany,
    fetchEmployeeCountOfCompany,
    fetchEmployeesOfDefaultDepartment,
    fetchTeamCreatorId,
    syncTeamMembersToCompany,
} from '@actions/remote/contact';
import {DEFAULT_DEPARTMENT_NAME, type ContactDepartment, type ContactEmployee} from '@client/rest/contact';
import CompassIcon from '@components/compass_icon';
import ContactAvatar from '@components/contact_avatar';
import Loading from '@components/loading';
import {Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {useOnComponentWillAppear} from '@hooks/use_on_component_will_appear';
import {usePreventDoubleTap} from '@hooks/utils';
import {getTeamById} from '@queries/servers/team';
import {showModal, showModalWithBackButton} from '@screens/navigation';
import {logDebug, logInfo} from '@utils/log';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {Database} from '@nozbe/watermelondb';
import type UserModel from '@typings/database/models/servers/user';

const edges: Edge[] = ['left', 'right'];

type Props = {
    currentUser?: UserModel;
    currentTeamId?: string;
    database?: Database;

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

const ContactsScreen = ({currentUser, currentTeamId, database, rnnHomeComponentId}: Props) => {
    const theme = useTheme();
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();
    const topInset = insets.top || (Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 0);
    const isFocused = useIsFocused();
    const isFocusedRef = useRef(isFocused);
    isFocusedRef.current = isFocused;
    const mounted = useRef(false);

    const [topLevelDepartments, setTopLevelDepartments] = useState<ContactDepartment[]>([]);
    const [defaultDepartmentEmployees, setDefaultDepartmentEmployees] = useState<ContactEmployee[]>([]);
    const [companyEmployeeCount, setCompanyEmployeeCount] = useState<number>(0);
    const [companyName, setCompanyName] = useState<string | undefined>();
    const [loading, setLoading] = useState(true);
    const [serviceError, setServiceError] = useState(false);

    /** 仅企业管理者可管理通讯录、可自动创建 */
    const [isEnterpriseManager, setIsEnterpriseManager] = useState(false);

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
        navigation.navigate(Screens.CONTACTS_SEARCH as never, {
            companyId: currentTeamId,
            companyName,
            currentUserId: currentUser?.id,
        } as never);
    }, [companyName, currentTeamId, currentUser?.id, navigation]));

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

            const getRes = await fetchCompany(currentTeamId);
            if (getRes.error && mounted.current && database) {
                // 通讯录不存在：仅企业管理者（团队创建者或管理员）可自动创建
                const team = await getTeamById(database, currentTeamId);
                const teamName = team?.displayName?.trim();
                const currentUserId = currentUser?.id;
                if (teamName && serverUrl && currentUserId) {
                    const canManage = await fetchCanManageEnterprise(serverUrl, currentTeamId, currentUserId, null);
                    if (!canManage && mounted.current) {
                        setIsEnterpriseManager(false);
                        setLoading(false);
                        return;
                    }
                    const ownerId = await fetchTeamCreatorId(serverUrl, currentTeamId);
                    if (!ownerId || ownerId.trim() === '' || !mounted.current) {
                        setLoading(false);
                        return;
                    }
                    const ensureRes = await ensureTeamCompany(currentTeamId, teamName, ownerId);
                    if (ensureRes.error && mounted.current) {
                        setServiceError(true);
                        setLoading(false);
                        return;
                    }
                    if (mounted.current) {
                        setCompanyName(teamName);
                        setIsEnterpriseManager(true);
                    }

                    // 新建企业时，将团队成员同步到通讯录默认部门
                    if (ensureRes.isNewCreate && serverUrl) {
                        logInfo('new create company need sync team members, currentTeamId:', currentTeamId);
                        await syncTeamMembersToCompany(serverUrl, currentTeamId, currentTeamId);
                    }
                } else {
                    setLoading(false);
                    return;
                }
            } else if (getRes.data?.name && mounted.current) {
                setCompanyName(getRes.data.name);
                const currentUserId = currentUser?.id;
                if (currentUserId && serverUrl) {
                    const canManage = await fetchCanManageEnterprise(serverUrl, currentTeamId!, currentUserId, getRes.data);
                    setIsEnterpriseManager(canManage);
                } else {
                    setIsEnterpriseManager(false);
                }
            } else if (mounted.current) {
                setIsEnterpriseManager(false);
            }

            const deptRes = await fetchDepartmentsByCompany(currentTeamId, {parentDepartmentId: -1});
            if (!mounted.current) {
                return;
            }
            if (deptRes.error) {
                setServiceError(true);
                setLoading(false);
                return;
            }
            setTopLevelDepartments((deptRes.data || []).filter((d) => d.name !== DEFAULT_DEPARTMENT_NAME));

            const [defaultEmpRes, countRes] = await Promise.all([
                fetchEmployeesOfDefaultDepartment(currentTeamId),
                fetchEmployeeCountOfCompany(currentTeamId),
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
    }, [currentTeamId, currentUser?.id, database, isFocused, serverUrl, homeReappearTick]);

    const handleDepartmentPress = usePreventDoubleTap(useCallback((department: ContactDepartment) => {
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

    const handleEmployeePress = usePreventDoubleTap(useCallback((employee: ContactEmployee, deptName?: string) => {
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
                currentUserId: currentUser?.id,
                closeButtonId: `close-employee-${employee.id}`,
            },
            {useBackIcon: true},
        );
    }, [companyName, currentTeamId, currentUser?.id, intl]));

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
                        {(companyName?.trim()) || intl.formatMessage({id: 'contacts.title', defaultMessage: 'Contacts'})}
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
                                color={theme.sidebarText}
                            />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            <View style={styles.enterpriseSection}>
                <View style={styles.enterpriseHeader}>
                    <Text style={styles.enterpriseTitle}>
                        {intl.formatMessage({id: 'contacts.enterprise', defaultMessage: 'Enterprise Contacts'})}
                    </Text>
                </View>
                {renderEnterpriseContent()}
            </View>
        </ScrollView>
    );

    return (
        <Freeze freeze={!isFocused}>
            <>
                <View style={[{height: topInset, backgroundColor: theme.sidebarBg}]}/>
                <SafeAreaView
                    edges={edges}
                    style={styles.flex}
                    testID='contacts.screen'
                >
                    <Animated.View style={[styles.flex, animated]}>
                        {content}
                    </Animated.View>
                </SafeAreaView>
            </>
        </Freeze>
    );
};

export default ContactsScreen;
