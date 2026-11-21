// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Q} from '@nozbe/watermelondb';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {Alert, DeviceEventEmitter, ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {addChannelToDefaultCategory} from '@actions/local/category';
import {switchToChannelById} from '@actions/remote/channel';
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
import {bottomSheetSnapPoint} from '@utils/helpers';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import {fetchApprovals, fetchHotProducts, type HotProduct} from '../apps/api';
import {getOrCreateSmartNotebookChannel} from '../apps/smart_notebook/smart_notebook_api';

import type {StackNavigationProp} from '@react-navigation/stack';

type WorkspaceCard = {
    key: string;
    icon: string;
    labelId: string;
    defaultLabel: string;
    screen?: string;
    wide?: boolean;
    subtitle?: string;
};

const CARDS: WorkspaceCard[] = [
    {key: 'ai_assistant', icon: 'robot-happy', labelId: 'workspace.card.ai_assistant', defaultLabel: 'AI Assistant'},
    {key: 'approvals', icon: 'check-circle-outline', labelId: 'workspace.card.approvals', defaultLabel: 'Approvals', screen: Screens.APPS_APPROVALS},
    {key: 'hot_products', icon: 'fire', labelId: 'erp.module.hot_products', defaultLabel: 'Hot Products', screen: Screens.APPS_HOT_PRODUCTS},
    {key: 'customers', icon: 'account-multiple-outline', labelId: 'erp.module.customers', defaultLabel: 'Customers', screen: Screens.ERP_CUSTOMERS},
    {key: 'suppliers', icon: 'truck-delivery-outline', labelId: 'erp.module.suppliers', defaultLabel: 'Suppliers', screen: Screens.ERP_SUPPLIERS},
    {key: 'sales_orders', icon: 'cart-outline', labelId: 'erp.module.sales_orders', defaultLabel: 'Sales Orders', screen: Screens.ERP_SALES_ORDERS},
    {key: 'purchase_orders', icon: 'clipboard-text-outline', labelId: 'erp.module.purchase_orders', defaultLabel: 'Purchase Orders', screen: Screens.ERP_PURCHASE_ORDERS},
    {key: 'work_orders', icon: 'cog-outline', labelId: 'erp.module.work_orders', defaultLabel: 'Manufacturing', screen: Screens.ERP_WORK_ORDERS},
    {key: 'projects', icon: 'folder-outline', labelId: 'erp.module.projects', defaultLabel: 'Projects', screen: Screens.ERP_PROJECTS},
    {key: 'stock', icon: 'package-variant-closed', labelId: 'erp.module.stock', defaultLabel: 'Stock', screen: Screens.ERP_STOCK},
    {key: 'warehouse_inout', icon: 'warehouse', labelId: 'erp.module.stock_out', defaultLabel: 'Stock Out', screen: Screens.APPS_WAREHOUSE_INOUT},
    {key: 'finance', icon: 'currency-usd', labelId: 'erp.module.finance', defaultLabel: 'Finance', screen: Screens.APPS_FINANCE},
    {key: 'sales', icon: 'chart-line', labelId: 'erp.module.sales', defaultLabel: 'Sales', screen: Screens.APPS_SALES},
    {key: 'inventory', icon: 'products', labelId: 'erp.module.inventory', defaultLabel: 'Inventory', screen: Screens.APPS_INVENTORY},
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
        gap: 10,
    },
    card: {
        width: '48%',
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderRadius: 10,
        paddingVertical: 14,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.08),
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
        marginRight: 10,
    },
    cardLabel: {
        color: theme.centerChannelColor,
        ...typography('Body', 100, 'SemiBold'),
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
    navigation: StackNavigationProp<any>;
};

const WorkspaceScreen = ({navigation}: Props) => {
    const theme = useTheme();
    const intl = useIntl();
    const styles = getStyles(theme);
    const serverUrl = useServerUrl();

    // ---- State ----
    const [isErpTeam, setIsErpTeam] = useState(false);
    const [approvalCount, setApprovalCount] = useState(0);

    // ---- Check if ERP team ----
    useEffect(() => {
        const checkErpTeam = async () => {
            try {
                const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
                const teamId = await getCurrentTeamId(database);
                if (!teamId) {return;}

                // Use dashboard access API (same as contacts module)
                try {
                    const client = NetworkManager.getClient(serverUrl);
                    const access = await client.doFetch(`/plugins/com.mattermost.frappe-sync/api/dashboard/access?team_id=${teamId}`, {
                        method: 'get',
                    });
                    setIsErpTeam(access?.is_erp_synced_team === true);
                } catch {
                    // Fallback: check erp_address field
                    const team = await database.get('Team').find(teamId);
                    setIsErpTeam(Boolean((team as any)?.erp_address));
                }
            } catch { /* ignore */ }
        };
        checkErpTeam();
    }, [serverUrl]);

    // ---- Fetch news ----
    useEffect(() => {
        const loadNews = async () => {
            try {
                const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
                const publicChannels = await database.get('Channel').query(Q.where('type', 'O')).fetch();
                if (publicChannels.length === 0) {return;}
                const ids = publicChannels.map((ch: any) => ch.id);
                const infos = await database.get('ChannelInfo').query(
                    Q.where('id', Q.oneOf(ids)),
                    Q.where('header', Q.notEq('')),
                ).fetch();
                if (infos.length > 0) {
                    const ch = publicChannels.find((c: any) => c.id === infos[0].id) as any;
                    setNewsChannel(ch?.displayName || '');
                    setNewsText(infos[0].header || '');
                }
            } catch { /* ignore */ }
        };
        loadNews();
    }, [serverUrl]);

    // ---- Fetch hot products ----
    useEffect(() => {
        const loadHot = async () => {
            try {
                const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
                const teamId = await getCurrentTeamId(database);
                const data = await fetchHotProducts(serverUrl, teamId);
                setHotProducts(data.products.slice(0, 5));
            } catch { /* ignore */ }
        };
        loadHot();
    }, [serverUrl]);

    // ---- Fetch pending approval count ----
    useEffect(() => {
        const loadApprovals = async () => {
            try {
                const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
                const teamId = await getCurrentTeamId(database);
                const data = await fetchApprovals(serverUrl, teamId);
                setApprovalCount(data.length);
            } catch { /* ignore */ }
        };
        loadApprovals();
    }, [serverUrl]);

    // ---- Fetch unread messages ----
    useEffect(() => {
        const loadMessages = async () => {
            try {
                const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);

                // Get unread channels with their lastViewedAt
                const myChannels = await database.get('MyChannel').query(
                    Q.where('is_unread', true),
                ).fetch();
                if (myChannels.length === 0) {
                    setRecentMessages([]);
                    return;
                }

                // Build a map of channelId -> lastViewedAt
                const lastViewedMap = new Map<string, number>();
                const channelIds: string[] = [];
                for (const mc of myChannels) {
                    const mcAny = mc as any;
                    lastViewedMap.set(mcAny.id, mcAny.lastViewedAt || 0);
                    channelIds.push(mcAny.id);
                }

                // Get latest posts from unread channels (system posts excluded)
                const posts = await database.get('Post').query(
                    Q.where('channel_id', Q.oneOf(channelIds)),
                    Q.where('type', ''),
                    Q.where('delete_at', 0),
                    Q.sortBy('create_at', Q.desc),
                    Q.take(30),
                ).fetch();

                // Filter: only posts newer than lastViewedAt for their channel
                const unreadPosts = posts.filter((p: any) => {
                    const lastViewed = lastViewedMap.get(p.channelId) || 0;
                    return p.createAt > lastViewed;
                }).slice(0, 8);

                if (unreadPosts.length === 0) {
                    setRecentMessages([]);
                    return;
                }

                // Get channel names
                const uniqueChannelIds = [...new Set(unreadPosts.map((p: any) => p.channelId))];
                const channels = await database.get('Channel').query(
                    Q.where('id', Q.oneOf(uniqueChannelIds)),
                ).fetch();
                const channelMap = new Map(channels.map((ch: any) => [ch.id, ch.displayName || ch.name]));

                // Get sender names
                const userIds = [...new Set(unreadPosts.map((p: any) => p.userId))];
                const users = await database.get('User').query(
                    Q.where('id', Q.oneOf(userIds)),
                ).fetch();
                const userMap = new Map(users.map((u: any) => [u.id, u.nickname || u.username || u.firstName || '']));

                const messages: RecentMessage[] = unreadPosts.map((p: any) => ({
                    postId: p.id,
                    channelId: p.channelId,
                    channelName: channelMap.get(p.channelId) || '',
                    senderName: userMap.get(p.userId) || '',
                    message: p.message || '',
                    createAt: p.createAt,
                }));

                setRecentMessages(messages);
            } catch { /* ignore */ }
        };
        loadMessages();
    }, [serverUrl]);

    // ---- Auto-scroll hot products ----
    useEffect(() => {
        if (hotProducts.length <= 3) {return;}
        scrollTimer.current = setInterval(() => {
            setScrollIndex((prev) => (prev + 1) % hotProducts.length);
        }, 3000);
        return () => {
            if (scrollTimer.current) {clearInterval(scrollTimer.current);}
        };
    }, [hotProducts.length]);

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

        if (card.key === 'notebook') {
            handleSmartNotebook();
        } else if (card.key === 'ai_assistant') {
            handleAIAssistant();
        } else if (card.screen) {
            navigation.navigate(card.screen);
        }
    }, [navigation, handleSmartNotebook, handleAIAssistant, isErpTeam, intl]);


    // ---- Render: Normal card ----
    const renderCard = (card: WorkspaceCard) => {
        const label = intl.formatMessage({id: card.labelId, defaultMessage: card.defaultLabel});
        const showBadge = card.key === 'approvals' && approvalCount > 0;
        return (
            <TouchableOpacity
                key={card.key}
                style={[styles.card, !isErpTeam && styles.cardDisabled]}
                onPress={() => handleCardPress(card)}
                activeOpacity={0.7}
                testID={`workspace.card.${card.key}`}
            >
                <CompassIcon name={card.icon} size={22} color={theme.buttonBg} style={styles.cardIcon}/>
                <View style={{flex: 1}}>
                    <Text style={styles.cardLabel} numberOfLines={1}>
                        {label}
                        {showBadge ? ` (${approvalCount})` : ''}
                    </Text>
                    {card.subtitle ? <Text style={styles.cardSubtitle}>{card.subtitle}</Text> : null}
                </View>
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
