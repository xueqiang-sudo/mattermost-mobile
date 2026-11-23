// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useNavigation} from '@react-navigation/native';
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useIntl} from 'react-intl';
import {Alert, DeviceEventEmitter, Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';

import {addChannelToDefaultCategory} from '@actions/local/category';
import {switchToChannelById} from '@actions/remote/channel';
import {getErpPermissions, type ErpPermissionsResponse} from '@actions/remote/erp_permissions';
import CompassIcon from '@components/compass_icon';
import SlideUpPanelItem, {ITEM_HEIGHT} from '@components/slide_up_panel_item';
import {openDirectChannelWithBot} from '@screens/channel/ai_actions/ai_api';
import {Navigation, Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import DatabaseManager from '@database/manager';
import NetworkManager from '@managers/network_manager';
import {getChannelById} from '@queries/servers/channel';
import {getCurrentTeamId} from '@queries/servers/system';
import {bottomSheet} from '@screens/navigation';
import {debugLog} from '@store/debug_log';
import {bottomSheetSnapPoint} from '@utils/helpers';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import {fetchApprovals} from '../apps/api';
import {getOrCreateSmartNotebookChannel} from '../apps/smart_notebook/smart_notebook_api';

import type {StackNavigationProp} from '@react-navigation/stack';
import type TeamModel from '@typings/database/models/servers/team';

type WorkspaceCard = {
    key: string;
    icon: string;
    labelId: string;
    defaultLabel: string;
    screen?: string;
    wide?: boolean;
    subtitle?: string;
    doctype?: string;
    analyticsDoctypes?: string[];
};

// Role-based access control for analytics apps
const APP_ROLE_ACCESS: Record<string, string[]> = {
    // 热销榜：所有 ERP 用户可访问（无角色限制）
    hot_products: [],

    // 审批清单：所有 ERP 用户可访问（无角色限制）
    approvals: [],

    // 流水账：总经理、系统管理员、财务经理（会计经理）
    finance: [
        'General Manager',      // 总经理
        'System Manager',       // 系统管理员
        'Accounts Manager',     // 财务经理/会计经理
    ],

    // 销售统计：总经理、系统管理员、副总经理、销售经理、财务经理
    sales: [
        'General Manager',          // 总经理
        'System Manager',           // 系统管理员
        'Deputy General Manager',   // 副总经理
        'Sales Manager',            // 销售经理
        'Accounts Manager',         // 财务经理/会计经理
    ],

    // 库存分析：总经理、系统管理员、副总经理、财务经理、销售经理、中台经理（内勤经理）
    inventory: [
        'General Manager',          // 总经理
        'System Manager',           // 系统管理员
        'Deputy General Manager',   // 副总经理
        'Accounts Manager',         // 财务经理/会计经理
        'Sales Manager',            // 销售经理
        'Internal Manager',         // 中台经理/内勤经理
    ],
};

const CARDS: WorkspaceCard[] = [
    {key: 'ai_assistant', icon: 'robot-happy', labelId: 'workspace.card.ai_assistant', defaultLabel: 'AI Assistant'},
    {key: 'approvals', icon: 'check-circle-outline', labelId: 'workspace.card.approvals', defaultLabel: 'Approvals', screen: Screens.APPS_APPROVALS},
    {key: 'hot_products', icon: 'fire', labelId: 'erp.module.hot_products', defaultLabel: 'Hot Products', screen: Screens.APPS_HOT_PRODUCTS, analyticsDoctypes: ['Sales Order', 'Sales Invoice']},
    {key: 'work_orders', icon: 'cog-outline', labelId: 'erp.module.work_orders', defaultLabel: 'Manufacturing', screen: Screens.ERP_WORK_ORDERS, doctype: 'Work Order'},
    {key: 'customers', icon: 'account-multiple-outline', labelId: 'erp.module.customers', defaultLabel: 'Customers', screen: Screens.ERP_CUSTOMERS, doctype: 'Customer'},
    {key: 'suppliers', icon: 'car-outline', labelId: 'erp.module.suppliers', defaultLabel: 'Suppliers', screen: Screens.ERP_SUPPLIERS, doctype: 'Supplier'},
    {key: 'sales_orders', icon: 'file-text-outline', labelId: 'erp.module.sales_orders', defaultLabel: 'Sales Orders', screen: Screens.ERP_SALES_ORDERS, doctype: 'Sales Order'},
    {key: 'purchase_orders', icon: 'credit-card-outline', labelId: 'erp.module.purchase_orders', defaultLabel: 'Purchase Orders', screen: Screens.ERP_PURCHASE_ORDERS, doctype: 'Purchase Order'},
    {key: 'projects', icon: 'folder-outline', labelId: 'erp.module.projects', defaultLabel: 'Projects', screen: Screens.ERP_PROJECTS, doctype: 'Project'},
    {key: 'stock', icon: 'products', labelId: 'erp.module.stock', defaultLabel: 'Stock', screen: Screens.ERP_STOCK, doctype: 'Item'},
    {key: 'warehouse_inout', icon: 'export-variant', labelId: 'erp.module.stock_out', defaultLabel: 'Stock Out', screen: Screens.APPS_WAREHOUSE_INOUT, doctype: 'Stock Entry'},
    {key: 'quality_inspection', icon: 'shield-outline', labelId: 'erp.module.quality_inspection', defaultLabel: '质检', screen: Screens.ERP_QUALITY_INSPECTION, doctype: 'Quality Inspection'},
    {key: 'subcontracting', icon: 'hand-right-outline', labelId: 'erp.module.subcontracting', defaultLabel: '委外', screen: Screens.ERP_SUBCONTRACTING, doctype: 'Subcontracting Order'},
    {key: 'finance', icon: 'currency-usd', labelId: 'erp.module.finance', defaultLabel: 'Finance', screen: Screens.APPS_FINANCE, analyticsDoctypes: ['GL Entry', 'Journal Entry']},
    {key: 'sales', icon: 'chart-line', labelId: 'erp.module.sales', defaultLabel: 'Sales', screen: Screens.APPS_SALES, analyticsDoctypes: ['Sales Order', 'Sales Invoice']},
    {key: 'inventory', icon: 'view-grid-plus-outline', labelId: 'erp.module.inventory', defaultLabel: 'Inventory', screen: Screens.APPS_INVENTORY, analyticsDoctypes: ['Item', 'Bin']},
];

type RecentMessage = {
    postId: string;
    channelId: string;
    channelName: string;
    senderName: string;
    message: string;
    createAt: number;
};

const getStyles = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    scrollContent: {
        padding: 16,
        flexGrow: 1,
    },
    scrollArea: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
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
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'flex-start',
    },
    card: {
        paddingVertical: 16,
        paddingHorizontal: 8,
        marginHorizontal: 6,
        marginVertical: 6,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
    },
    cardDisabled: {
        opacity: 0.5,
    },
    cardWide: {
        width: '100%',
        flexDirection: 'row',
        gap: 12,
        paddingHorizontal: 20,
    },
    cardIcon: {
        marginBottom: 8,
    },
    cardLabel: {
        color: theme.centerChannelColor,
        ...typography('Body', 200, 'SemiBold'),
        textAlign: 'center',
    },
    cardSubtitle: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
        ...typography('Body', 75, 'Regular'),
        marginTop: 2,
    },

    // ---- Wide preview cards ----
    wideCard: {
        width: '100%',
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderRadius: 12,
        padding: 16,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    wideCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
    },
    wideCardTitle: {
        color: theme.centerChannelColor,
        ...typography('Body', 200, 'SemiBold'),
        marginLeft: 8,
    },
    wideCardMore: {
        color: theme.buttonBg,
        ...typography('Body', 75, 'SemiBold'),
        marginLeft: 'auto',
    },
    newsChannel: {
        color: theme.buttonBg,
        ...typography('Body', 75, 'SemiBold'),
        marginBottom: 6,
    },
    newsText: {
        color: changeOpacity(theme.centerChannelColor, 0.72),
        ...typography('Body', 100, 'Regular'),
        lineHeight: 20,
    },
    newsEmpty: {
        color: changeOpacity(theme.centerChannelColor, 0.4),
        ...typography('Body', 100, 'Regular'),
        fontStyle: 'italic',
    },

    // ---- Hot product row ----
    hotRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.06),
    },
    hotRowLast: {
        borderBottomWidth: 0,
    },
    hotRank: {
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
    },
    hotRankText: {
        ...typography('Body', 50, 'SemiBold'),
        color: '#fff',
    },
    hotName: {
        flex: 1,
        color: theme.centerChannelColor,
        ...typography('Body', 100, 'Regular'),
    },
    hotQty: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
        ...typography('Body', 75, 'Regular'),
        marginRight: 8,
    },
    hotAmount: {
        color: theme.buttonBg,
        ...typography('Body', 100, 'SemiBold'),
        minWidth: 60,
        textAlign: 'right',
    },
    hotEmpty: {
        color: changeOpacity(theme.centerChannelColor, 0.4),
        ...typography('Body', 100, 'Regular'),
        fontStyle: 'italic',
    },

    // ---- Message row ----
    msgRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingVertical: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.06),
    },
    msgRowLast: {
        borderBottomWidth: 0,
    },
    msgAvatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: changeOpacity(theme.buttonBg, 0.15),
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
    },
    msgAvatarText: {
        color: theme.buttonBg,
        ...typography('Body', 100, 'SemiBold'),
    },
    msgContent: {
        flex: 1,
    },
    msgTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 2,
    },
    msgChannel: {
        color: theme.buttonBg,
        ...typography('Body', 75, 'SemiBold'),
        flex: 1,
    },
    msgTime: {
        color: changeOpacity(theme.centerChannelColor, 0.4),
        ...typography('Body', 50, 'Regular'),
        marginLeft: 8,
    },
    msgSender: {
        color: theme.centerChannelColor,
        ...typography('Body', 75, 'SemiBold'),
        marginBottom: 2,
    },
    msgText: {
        color: changeOpacity(theme.centerChannelColor, 0.72),
        ...typography('Body', 75, 'Regular'),
        lineHeight: 18,
    },
    msgEmpty: {
        color: changeOpacity(theme.centerChannelColor, 0.4),
        ...typography('Body', 100, 'Regular'),
        fontStyle: 'italic',
    },
    msgScroll: {
        maxHeight: 220,
    },
}));

const RANK_COLORS = ['#E8A735', '#9CA3AF', '#CD7F32'];

function formatMoney(value: number, intl: ReturnType<typeof useIntl>): string {
    const abs = Math.abs(value || 0);
    if (abs >= 10000) {
        return intl.formatMessage({id: 'workspace.money.wan', defaultMessage: '¥{value}w'}, {value: (abs / 10000).toFixed(1)});
    }
    return `¥${abs.toLocaleString(undefined, {maximumFractionDigits: 0})}`;
}

function formatTimeAgo(ts: number, intl: ReturnType<typeof useIntl>): string {
    const now = Date.now();
    const diff = now - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) {return intl.formatMessage({id: 'workspace.time.just_now', defaultMessage: 'Just now'});}
    if (mins < 60) {return intl.formatMessage({id: 'workspace.time.mins_ago', defaultMessage: '{mins}m ago'}, {mins});}
    const hours = Math.floor(mins / 60);
    if (hours < 24) {return intl.formatMessage({id: 'workspace.time.hours_ago', defaultMessage: '{hours}h ago'}, {hours});}
    const days = Math.floor(hours / 24);
    if (days < 7) {return intl.formatMessage({id: 'workspace.time.days_ago', defaultMessage: '{days}d ago'}, {days});}
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()}`;
}

type Props = {
    currentTeam?: TeamModel;
};

const WorkspaceScreen = ({currentTeam}: Props) => {
    const navigation = useNavigation<StackNavigationProp<any>>();
    const theme = useTheme();
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const insets = useSafeAreaInsets();

    // Calculate optimal card dimensions based on screen size
    const {screenWidth} = Dimensions.get('window');
    const numColumns = 4;

    // Available space calculation
    const horizontalPadding = 16 * 2; // left + right padding
    const cardMargin = 6; // each card has marginHorizontal: 6, so 12 total per card

    const availableWidth = screenWidth - horizontalPadding;
    // 每个卡片宽度 = 可用宽度 / 列数 - 左右 margin
    const cardWidth = availableWidth / numColumns - cardMargin * 2;

    const dynamicStyles = {
        card: {
            width: cardWidth,
            // 确保宽度不会被 flex 压缩
            flexShrink: 0,
            flexGrow: 0,
        },
    };

    const styles = getStyles(theme);

    // ---- State ----
    const [isErpTeam, setIsErpTeam] = useState(false);
    const [approvalCount, setApprovalCount] = useState(0);
    const [erpPermissions, setErpPermissions] = useState<ErpPermissionsResponse | null>(null);

    // React to team changes
    const currentTeamId = useMemo(() => currentTeam?.id, [currentTeam]);

    // ---- Check if ERP team ----
    useEffect(() => {
        const checkErpTeam = async () => {
            try {
                const teamId = currentTeamId;
                debugLog('[WorkspaceScreen] checkErpTeam: teamId=', teamId, ' teamName=', currentTeam?.display_name);
                if (!teamId) {
                    setIsErpTeam(false);
                    return;
                }

                // Use dashboard access API (same as contacts module)
                try {
                    const client = NetworkManager.getClient(serverUrl);
                    const access = await client.doFetch(`/plugins/com.mattermost.frappe-sync/api/dashboard/access?team_id=${teamId}`, {
                        method: 'get',
                    });
                    const isErp = access?.is_erp_synced_team === true;
                    debugLog('[WorkspaceScreen] dashboard/access response: is_erp_synced_team=', isErp);
                    setIsErpTeam(isErp);
                } catch {
                    // Fallback: check erp_address field
                    const fallback = Boolean((currentTeam as any)?.erp_address);
                    debugLog('[WorkspaceScreen] dashboard/access failed, fallback erp_address=', fallback);
                    setIsErpTeam(fallback);
                }
            } catch (e) {
                debugLog('[WorkspaceScreen] checkErpTeam error:', e);
            }
        };
        checkErpTeam();
    }, [serverUrl, currentTeamId, currentTeam]);

    // ---- Fetch pending approval count ----
    useEffect(() => {
        const loadApprovals = async () => {
            try {
                const teamId = currentTeamId;
                if (!teamId) {return;}
                const data = await fetchApprovals(serverUrl, teamId);
                setApprovalCount(data.length);
            } catch { /* ignore */ }
        };
        loadApprovals();
    }, [serverUrl, currentTeamId]);

    // ---- Load ERP permissions ----
    useEffect(() => {
        const loadPermissions = async () => {
            debugLog('[WorkspaceScreen] loadPermissions: isErpTeam=', isErpTeam, ' currentTeamId=', currentTeamId);
            if (!isErpTeam) {
                debugLog('[WorkspaceScreen] Not ERP team, skip permissions load');
                setErpPermissions(null);
                return;
            }

            try {
                debugLog('[WorkspaceScreen] Calling GET /plugins/com.mattermost.frappe-sync/api/erp/permissions');
                const permissions = await getErpPermissions(serverUrl);
                debugLog('[WorkspaceScreen] ERP permissions response:', JSON.stringify({
                    has_erp_account: permissions?.has_erp_account,
                    roles: permissions?.roles,
                    allowed_doctypes_count: permissions?.allowed_doctypes?.length ?? 0,
                    allowed_doctypes: permissions?.allowed_doctypes,
                    data_scope: permissions?.data_scope,
                }));
                setErpPermissions(permissions);
            } catch (error) {
                debugLog('[WorkspaceScreen] Failed to load ERP permissions:', error);
                setErpPermissions(null);
            }
        };
        loadPermissions();
    }, [serverUrl, isErpTeam, currentTeamId]);

    // ---- Handlers ----
    const handleSmartNotebook = useCallback(async () => {
        try {
            const displayName = intl.formatMessage({
                id: 'apps.smart_notebook.display_name',
                defaultMessage: 'Smart Notebook',
            });
            const welcomeMessage = intl.formatMessage({
                id: 'apps.smart_notebook.welcome',
                defaultMessage: 'Welcome to Smart Notebook! Record your ideas and notes here.',
            });
            const channel = await getOrCreateSmartNotebookChannel(serverUrl, displayName, welcomeMessage);
            if (channel?.id) {
                try {
                    const {operator, database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
                    const currentTeamId = await getCurrentTeamId(database);
                    if (currentTeamId) {
                        const channelForCurrentTeam = {...channel, team_id: currentTeamId};
                        const channelModels = await operator.handleChannel({
                            channels: [channelForCurrentTeam as any],
                            prepareRecordsOnly: true,
                        }) || [];

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
                        } catch { /* fallback to current team */ }

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
                            await operator.batchRecords([...channelModels, ...ctModels], 'smartNotebookEntryUpsert');
                        }

                        const localChannel = await getChannelById(database, channel.id);
                        if (localChannel) {
                            await addChannelToDefaultCategory(serverUrl, localChannel, false);
                        }
                    }
                } catch { /* silently handle */ }

                // Switch to Messages tab then navigate to the smart notebook channel
                DeviceEventEmitter.emit(Navigation.NAVIGATE_TO_TAB, {screen: Screens.HOME_TAB_CHAT});
                setTimeout(() => {
                    switchToChannelById(serverUrl, channel.id);
                }, 300);
            }
        } catch { /* silently handle */ }
    }, [serverUrl, intl]);

    const handleAIAssistant = useCallback(async () => {
        try {
            const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
            const client = NetworkManager.getClient(serverUrl);
            const teamId = await getCurrentTeamId(database);
            if (!teamId) {
                return;
            }

            // Query bot users in the current team via server API
            const users = await client.getProfilesInTeam(teamId, 0, 200);
            const bots = (users || []).filter((u: any) => u.is_bot && !u.delete_at);

            if (bots.length === 0) {
                Alert.alert(
                    intl.formatMessage({id: 'ai_assistant.no_bots', defaultMessage: 'No AI assistants'}),
                    intl.formatMessage({id: 'ai_assistant.no_bots_detail', defaultMessage: 'No AI assistants configured for this team. Please contact your administrator.'}),
                );
                return;
            }

            const openBotChat = async (botUserId: string) => {
                const result = await openDirectChannelWithBot(serverUrl, botUserId, teamId);
                if (result.data) {
                    DeviceEventEmitter.emit(Navigation.NAVIGATE_TO_TAB, {screen: Screens.HOME_TAB_CHAT});
                    setTimeout(() => {
                        switchToChannelById(serverUrl, result.data!.id);
                    }, 300);
                } else {
                    Alert.alert(
                        intl.formatMessage({id: 'ai_assistant.error', defaultMessage: 'Error'}),
                        intl.formatMessage({id: 'ai_assistant.create_channel_failed', defaultMessage: 'Failed to create bot channel. Please try again.'}),
                    );
                }
            };

            if (bots.length === 1) {
                await openBotChat(bots[0].id);
                return;
            }

            // Multiple bots: show bottom sheet for selection
            const CLOSE_BUTTON_ID = 'close-bot-selection';
            const snapPoint = bottomSheetSnapPoint(bots.length, ITEM_HEIGHT);

            const renderContent = () => (
                <View>
                    {bots.map((bot: any) => (
                        <SlideUpPanelItem
                            key={bot.id}
                            leftIcon='robot-happy'
                            onPress={async () => {
                                await openBotChat(bot.id);
                            }}
                            text={bot.nickname || bot.username}
                            testID={`bot_selection.${bot.id}`}
                        />
                    ))}
                </View>
            );

            bottomSheet({
                closeButtonId: CLOSE_BUTTON_ID,
                title: intl.formatMessage({id: 'ai_assistant.select_bot', defaultMessage: 'Select AI Assistant'}),
                snapPoints: [1, snapPoint],
                renderContent,
                theme,
            });
        } catch (error) {
            Alert.alert(
                intl.formatMessage({id: 'ai_assistant.error', defaultMessage: 'Failed to load AI assistants'}),
                intl.formatMessage({id: 'ai_assistant.error_detail', defaultMessage: 'Please try again later.'}),
            );
        }
    }, [serverUrl, intl, theme]);

    // ---- Helper: Check if button is enabled ----
    // 对齐 webapp sidebar_apps_section.tsx 的权限逻辑：
    // - 分析类应用（在 APP_ROLE_ACCESS 中）只检查角色，不检查 doctype
    // - CRUD 模块（有 doctype 但不在 APP_ROLE_ACCESS 中）检查 allowed_doctypes
    //   但如果 API 没返回 allowed_doctypes 则放行（服务端兜底）
    const isButtonEnabled = useCallback((card: WorkspaceCard): boolean => {
        // If not ERP team, all buttons disabled
        if (!isErpTeam) {
            return false;
        }

        // AI Assistant and Approvals are always available for ERP users
        if (card.key === 'ai_assistant' || card.key === 'approvals') {
            return true;
        }

        // If no permissions loaded yet, assume enabled (will check on click)
        if (!erpPermissions) {
            return true;
        }

        // If user has no ERP account, disable all ERP features
        if (!erpPermissions.has_erp_account) {
            return false;
        }

        // Analytics apps: role-only check (matches webapp)
        const allowedRoles = APP_ROLE_ACCESS[card.key];
        if (allowedRoles !== undefined) {
            // Empty array = no role restriction, all ERP users can access
            if (allowedRoles.length === 0) {
                return true;
            }

            // Check if user has any of the allowed roles (case-insensitive)
            const userRoles = erpPermissions.roles || [];
            return userRoles.some(userRole =>
                allowedRoles.some(allowedRole =>
                    userRole.toLowerCase() === allowedRole.toLowerCase()
                )
            );
        }

        // CRUD modules: check doctype permission
        // If API didn't return allowed_doctypes, allow (server enforces)
        if (card.doctype) {
            const allowedDoctypes = erpPermissions.allowed_doctypes;
            if (!allowedDoctypes || allowedDoctypes.length === 0) {
                return true;
            }
            return allowedDoctypes.includes(card.doctype);
        }

        return true;
    }, [isErpTeam, erpPermissions]);

    const handleCardPress = useCallback((card: WorkspaceCard) => {
        // Check if ERP team - all workspace cards require ERP
        if (!isErpTeam) {
            Alert.alert(
                intl.formatMessage({id: 'workspace.erp_only_title', defaultMessage: '功能不可用'}),
                intl.formatMessage({id: 'workspace.erp_only_message', defaultMessage: '此功能仅对 ERP 企业开放。如需使用，请联系管理员开通 ERP 权限。'}),
                [{text: intl.formatMessage({id: 'ok', defaultMessage: '我知道了'})}],
            );
            return;
        }

        // Check if button is enabled (permission check)
        if (!isButtonEnabled(card)) {
            Alert.alert(
                intl.formatMessage({id: 'workspace.no_permission_title', defaultMessage: '无权限'}),
                intl.formatMessage({id: 'workspace.no_permission_message', defaultMessage: '您在 ERP 中没有此功能的权限，请联系管理员。'}),
                [{text: intl.formatMessage({id: 'ok', defaultMessage: '我知道了'})}],
            );
            return;
        }

        if (card.key === 'notebook') {
            handleSmartNotebook();
        } else if (card.key === 'ai_assistant') {
            handleAIAssistant();
        } else if (card.screen) {
            navigation.navigate(card.screen);
        }
    }, [navigation, handleSmartNotebook, handleAIAssistant, isErpTeam, isButtonEnabled, intl]);

    // ---- Render: Normal card ----
    const renderCard = (card: WorkspaceCard) => {
        const label = intl.formatMessage({id: card.labelId, defaultMessage: card.defaultLabel});
        const showBadge = card.key === 'approvals' && approvalCount > 0;
        const enabled = isButtonEnabled(card);

        return (
            <TouchableOpacity
                key={card.key}
                style={[styles.card, dynamicStyles.card, (!isErpTeam || !enabled) && styles.cardDisabled]}
                onPress={() => handleCardPress(card)}
                activeOpacity={0.7}
                testID={`workspace.card.${card.key}`}
            >
                <CompassIcon name={card.icon} size={40} color={theme.buttonBg} style={styles.cardIcon}/>
                <Text style={styles.cardLabel} numberOfLines={2}>
                    {label}
                    {showBadge ? ` (${approvalCount})` : ''}
                </Text>
                {card.subtitle ? <Text style={styles.cardSubtitle}>{card.subtitle}</Text> : null}
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']} testID='workspace.screen'>
            <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <View style={styles.grid}>
                    {CARDS.map(renderCard)}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

export default WorkspaceScreen;
