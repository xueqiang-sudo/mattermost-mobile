// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useIsFocused, useNavigation} from '@react-navigation/native';
import {type StackNavigationProp} from '@react-navigation/stack';
import React, {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {Freeze} from 'react-freeze';
import {useIntl} from 'react-intl';
import {ScrollView, Text, TouchableOpacity, View} from 'react-native';
import Animated, {useAnimatedStyle, withTiming} from 'react-native-reanimated';
import {type Edge, SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';

import {switchToChannelById} from '@actions/remote/channel';
import {fetchTeamById} from '@actions/remote/team';
import {addChannelToDefaultCategory} from '@actions/local/category';
import DatabaseManager from '@database/manager';
import {getChannelById} from '@queries/servers/channel';
import CompassIcon from '@components/compass_icon';
import Loading from '@components/loading';
import {Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {useOnComponentWillAppear} from '@hooks/use_on_component_will_appear';
import NetworkManager from '@managers/network_manager';
import {resetToDebug} from '@screens/navigation';


import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';
import {isSystemAdmin} from '@utils/user';

import {type AppsStackParamList} from './apps_stack_param_list';
import {APPS, checkErpSuppliers, getDashboardAccess, type AppDef, type DashboardAccess} from './api';
import {getOrCreateSmartNotebookChannel} from './smart_notebook/smart_notebook_api';

import type TeamModel from '@typings/database/models/servers/team';
import type UserModel from '@typings/database/models/servers/user';

const edges: Edge[] = ['bottom', 'left', 'right'];

type Props = {
    currentUser?: UserModel;
    currentTeam?: TeamModel;
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
        ...typography('Heading', 200, 'SemiBold'),
        color: theme.sidebarText,
        textAlign: 'center',
    },
    scrollContent: {
        flexGrow: 1,
        paddingBottom: 32,
    },
    gridContainer: {
        paddingHorizontal: 16,
        paddingTop: 8,
    },
    sectionGrid: {
        gap: 12,
    },
    gridRow: {
        flexDirection: 'row',
        gap: 12,
    },
    appCard: {
        flex: 1,
        paddingVertical: 16,
        paddingHorizontal: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    appIconContainer: {
        width: 56,
        height: 56,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
    },
    appLabel: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.centerChannelColor,
        textAlign: 'center',
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
        paddingTop: 64,
    },
    emptyText: {
        ...typography('Body', 200),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        textAlign: 'center',
        marginTop: 16,
    },
}));

const ICON_COLORS: Record<string, string> = {
    'forum-outline': '#9C27B0',
    'folder-outline': '#2196F3',
    'book-outline': '#FF5722',
    'notebook-outline': '#607D8B',
    'account-multiple-outline': '#E91E63',
    'format-list-bulleted': '#4CAF50',
    'calendar-outline': '#FF9800',
    'share-variant-outline': '#00BCD4',
    'truck-delivery-outline': '#795548',
    monitor: '#3F51B5',
    'bug-outline': '#607D8B',
};

const AppsScreen = ({currentUser, currentTeam, rnnHomeComponentId}: Props) => {
    const theme = useTheme();
    const intl = useIntl();
    const insets = useSafeAreaInsets();
    const serverUrl = useServerUrl();
    const isFocused = useIsFocused();
    const isFocusedRef = useRef(isFocused);
    isFocusedRef.current = isFocused;
    const navigation = useNavigation<StackNavigationProp<AppsStackParamList>>();

    useLayoutEffect(() => {
        navigation.setOptions({title: intl.formatMessage({id: 'tab_bar.apps.label', defaultMessage: 'Apps'})});
    }, [navigation, intl]);

    const [dashboardAccess, setDashboardAccess] = useState<DashboardAccess | null>(null);
    const [loading, setLoading] = useState(true);
    const [homeReappearTick, setHomeReappearTick] = useState(0);
    const [hasErpSuppliers, setHasErpSuppliers] = useState(false);

    const currentTeamId = useMemo(() => currentTeam?.id, [currentTeam]);
    const isErpTeam = useMemo(() => Boolean(dashboardAccess?.erp_address), [dashboardAccess]);
    const conversationsEnabled = useMemo(() => dashboardAccess?.conversations_enabled === true, [dashboardAccess]);
    const teamMes = useMemo(() => dashboardAccess?.team_mes_enabled === true, [dashboardAccess]);
    const isTeamAdmin = useMemo(() => dashboardAccess?.is_admin === true, [dashboardAccess]);
    const isSysAdmin = useMemo(() => isSystemAdmin(currentUser?.roles || ''), [currentUser]);
    const teamSidebarAdmin = useMemo(() => dashboardAccess?.sidebar_admin_enabled === true, [dashboardAccess]);

    const styles = getStyleSheet(theme);

    const numColumns = 4;

    const bumpHomeReappearTick = useCallback(() => {
        if (!isFocusedRef.current) {
            return;
        }
        setHomeReappearTick((t) => t + 1);
    }, []);
    useOnComponentWillAppear(rnnHomeComponentId, bumpHomeReappearTick);

    const loadDashboardAccess = useCallback(async () => {
        if (!serverUrl || !currentTeamId) {
            return;
        }
        setLoading(true);
        try {
            const access = await getDashboardAccess(serverUrl, currentTeamId);
            setDashboardAccess(access);
        } catch {
            setDashboardAccess(null);
        } finally {
            setLoading(false);
        }
    }, [currentTeamId, serverUrl]);

    useEffect(() => {
        loadDashboardAccess();
    }, [loadDashboardAccess, homeReappearTick]);

    // Check if user has ERP suppliers (external contacts in ERP teams)
    useEffect(() => {
        const checkSuppliers = async () => {
            if (!serverUrl) {return;}
            try {
                const hasSuppliers = await checkErpSuppliers(serverUrl);
                setHasErpSuppliers(hasSuppliers);
            } catch {
                setHasErpSuppliers(false);
            }
        };
        checkSuppliers();
    }, [serverUrl]);

    const visibleApps = useMemo(() => {
        if (!dashboardAccess) {
            return [];
        }

        const allowedTabs = new Set(dashboardAccess.tabs || []);

        return APPS.filter((app) => {
            // Hide price_list (user request)
            if (app.key === 'price_list') {
                return false;
            }
            // Non-ERP teams: hide erpOnly apps
            if (app.erpOnly && !isErpTeam) {
                return false;
            }
            // Team-level gate: conversations
            if (app.key === 'conversations' && !conversationsEnabled) {
                return false;
            }
            // MES: require both API-level mes_enabled AND team-level mes_enabled (matches webapp)
            if (app.key === 'mes') {
                return Boolean(dashboardAccess.mes_enabled) && teamMes;
            }
            // Role Management: visible to team admins OR system admins (no sidebar_admin_enabled check)
            if (app.key === 'role_management') {
                return isTeamAdmin || isSysAdmin;
            }
            // My Suppliers: only show if user has ERP external contacts
            if (app.key === 'my_suppliers') {
                return hasErpSuppliers;
            }
            // Apps with noPermission are always visible
            if (app.noPermission) {
                return true;
            }
            // All other apps require explicit permission in tabs list
            return allowedTabs.has(app.key);
        });
    }, [dashboardAccess, isErpTeam, conversationsEnabled, teamMes, isTeamAdmin, isSysAdmin, hasErpSuppliers]);

    // Chunk visible apps into rows of 4
    const appRows = useMemo(() => {
        const rows: AppDef[][] = [];
        for (let i = 0; i < visibleApps.length; i += numColumns) {
            rows.push(visibleApps.slice(i, i + numColumns));
        }
        return rows;
    }, [visibleApps]);

    const handleAppPress = useCallback((app: AppDef) => {
        switch (app.key) {
            case 'todos':
                navigation.navigate(Screens.WORKSPACE_TODOS);
                break;
            case 'schedules':
                navigation.navigate(Screens.WORKSPACE_SCHEDULES);
                break;
            case 'mes':
                navigation.navigate(Screens.APPS_MES);
                break;
            case 'role_management':
                navigation.navigate(Screens.APPS_ROLE_MANAGEMENT);
                break;
            case 'cloud_drive':
                navigation.navigate(Screens.APPS_CLOUD_DRIVE);
                break;
            case 'knowledge_base':
                navigation.navigate(Screens.APPS_KNOWLEDGE_BASE, {
                    kbWrite: Boolean(dashboardAccess?.kb_write),
                });
                break;
            case 'smart_notebook':
                (async () => {
                    try {
                        const displayName = intl.formatMessage({
                            id: 'apps.smart_notebook.display_name',
                            defaultMessage: '智能笔记本',
                        });
                        const welcomeMessage = intl.formatMessage({
                            id: 'apps.smart_notebook.welcome',
                            defaultMessage: '欢迎使用智能笔记本！在这里记录你的想法和笔记。',
                        });
                        const channel = await getOrCreateSmartNotebookChannel(
                            serverUrl,
                            displayName,
                            welcomeMessage,
                        );
                        if (channel?.id) {
                            // 切换到频道前，确保它在当前团队的默认分类（内部群）里可见。
                            // 智能笔记本频道是用户级别跨团队共享的，mobile 端分类显示
                            // 依赖本地 category_channels 表，必须显式 upsert Channel + ChannelTeam。
                            try {
                                const {operator, database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
                                const currentUserId = currentUser?.id;
                                const currentTeamId = currentTeam?.id;

                                if (currentUserId && currentTeamId) {
                                    // 1. Upsert 本地 Channel（team_id 改写为当前 team）
                                    const channelForCurrentTeam = {...channel, team_id: currentTeamId};
                                    const channelModels = await operator.handleChannel({
                                        channels: [channelForCurrentTeam as any],
                                        prepareRecordsOnly: true,
                                    }) || [];

                                    // 2. 调用 ensure_smart_notebook_team 拿到所有绑定的 team_ids
                                    //    （getOrCreateSmartNotebookChannel 只 ensure 当前 team，
                                    //    这里再调一次让后端把用户所有 team 都绑上）
                                    let teamIds: string[] = [currentTeamId];
                                    try {
                                        const client = NetworkManager.getClient(serverUrl);
                                        const ensureResp: any = await client.doFetch('/api/v4/channels/ensure_smart_notebook_team', {
                                            method: 'post',
                                            body: {team_id: currentTeamId},
                                        });
                                        if (Array.isArray(ensureResp?.team_ids) && ensureResp.team_ids.length > 0) {
                                            teamIds = ensureResp.team_ids;
                                        }
                                    } catch {
                                        // 失败时用当前 team 兜底
                                    }

                                    // 3. Upsert ChannelTeam 关联
                                    const ctPayload = teamIds.map((tid: string) => ({
                                        id: `${channel.id}-${tid}`,
                                        channel_id: channel.id,
                                        team_id: tid,
                                    }));
                                    const ctModels = await operator.handleChannelTeam({
                                        channelTeams: ctPayload,
                                        prepareRecordsOnly: true,
                                    }) || [];

                                    if (channelModels.length || ctModels.length) {
                                        await operator.batchRecords(
                                            [...channelModels, ...ctModels],
                                            'smartNotebookEntryUpsert',
                                        );
                                    }
                                }

                                // 4. 加到默认分类
                                const localChannel = await getChannelById(database, channel.id);
                                if (localChannel) {
                                    await addChannelToDefaultCategory(serverUrl, localChannel, false);
                                }
                            } catch (err) {
                                // silently handle error
                            }
                            await switchToChannelById(serverUrl, channel.id);
                        }
                    } catch (err) {
                        // silently handle error
                    }
                })();
                break;
            case 'conversations':
                navigation.navigate(Screens.APPS_CONVERSATIONS);
                break;
            case 'notebook':
                navigation.navigate(Screens.APPS_NOTEBOOK);
                break;
            case 'promotion':
                navigation.navigate(Screens.APPS_PROMOTION);
                break;
            case 'my_suppliers':
                navigation.navigate(Screens.MY_SUPPLIERS);
                break;
            case 'debug':
                resetToDebug();
                break;
            default:
                navigation.navigate(Screens.APPS_WEBVIEW, {
                    appKey: app.key,
                    title: app.defaultLabel,
                });
                break;
        }
    }, [navigation, dashboardAccess]);

    const renderAppCard = (app: AppDef) => (
        <TouchableOpacity
            key={app.key}
            style={styles.appCard}
            onPress={() => handleAppPress(app)}
            activeOpacity={0.7}
            testID={`apps.${app.key}`}
        >
            <View
                style={[
                    styles.appIconContainer,
                    {backgroundColor: changeOpacity(ICON_COLORS[app.iconName] || theme.buttonBg, 0.12)},
                ]}
            >
                <CompassIcon
                    name={app.iconName}
                    size={28}
                    color={ICON_COLORS[app.iconName] || theme.buttonBg}
                />
            </View>
            <Text style={styles.appLabel}>
                {intl.formatMessage({id: app.labelId, defaultMessage: app.defaultLabel})}
            </Text>
        </TouchableOpacity>
    );

    const animated = useAnimatedStyle(() => ({
        opacity: withTiming(1, {duration: 150}),
        transform: [{translateX: withTiming(0, {duration: 150})}],
    }), []);

    if (loading) {
        return (
            <Freeze freeze={!isFocused}>
                <SafeAreaView
                    edges={edges}
                    style={[styles.flex, {backgroundColor: theme.centerChannelBg}]}
                    testID='apps.screen'
                >
                    <View style={styles.loadingContainer}>
                        <Loading color={theme.centerChannelColor} size='large'/>
                    </View>
                </SafeAreaView>
            </Freeze>
        );
    }

    return (
        <Freeze freeze={!isFocused}>
            <SafeAreaView
                edges={edges}
                style={[styles.flex, {backgroundColor: theme.centerChannelBg}]}
                testID='apps.screen'
            >
                <Animated.View style={[styles.flex, animated]}>
                    <View style={styles.flex}>
                        <ScrollView
                            style={[styles.flex, {backgroundColor: theme.centerChannelBg}]}
                            contentContainerStyle={[styles.scrollContent, {paddingBottom: 24}]}
                            showsVerticalScrollIndicator={false}
                        >
                            {visibleApps.length === 0 ? (
                                <View style={styles.emptyContainer}>
                                    <CompassIcon
                                        name='application-outline'
                                        size={64}
                                        color={changeOpacity(theme.centerChannelColor, 0.32)}
                                    />
                                    <Text style={styles.emptyText}>
                                        {intl.formatMessage({id: 'apps.empty', defaultMessage: '暂无可用应用'})}
                                    </Text>
                                </View>
                            ) : (
                                <View style={styles.gridContainer}>
                                    <View style={styles.sectionGrid}>
                                        {appRows.map((row, rowIndex) => (
                                            <View key={rowIndex} style={styles.gridRow}>
                                                {row.map(renderAppCard)}
                                                {Array.from({length: numColumns - row.length}, (_, i) => (
                                                    <View key={`placeholder-${i}`} style={styles.appCard}/>
                                                ))}
                                            </View>
                                        ))}
                                    </View>
                                </View>
                            )}
                        </ScrollView>
                    </View>
                </Animated.View>
            </SafeAreaView>
        </Freeze>
    );
};

export default AppsScreen;
