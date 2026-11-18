// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Q} from '@nozbe/watermelondb';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {DeviceEventEmitter, ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {addChannelToDefaultCategory} from '@actions/local/category';
import {switchToChannelById} from '@actions/remote/channel';
import Badge from '@components/badge';
import CompassIcon from '@components/compass_icon';
import {Navigation, Screens} from '@constants';
import {useServerUrl} from '@context/server';
import DatabaseManager from '@database/manager';
import {NetworkManager} from '@managers/network_manager';
import {getChannelById} from '@queries/servers/channel';
import {getCurrentTeamId} from '@queries/servers/system';
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
    {key: 'erp', icon: 'chart-bar', labelId: 'workspace.card.erp', defaultLabel: 'ERP', screen: Screens.WORKSPACE_ERP_DESK},
    {key: 'mes', icon: 'factory', labelId: 'workspace.card.mes', defaultLabel: '排产', screen: Screens.APPS_MES},
    {key: 'orders', icon: 'clipboard-text-outline', labelId: 'workspace.card.orders', defaultLabel: '我的订单', screen: Screens.WORKSPACE_ORDERS},
    {key: 'projects', icon: 'folder-outline', labelId: 'workspace.card.projects', defaultLabel: '我的项目', screen: Screens.WORKSPACE_PROJECTS},
    {key: 'approvals', icon: 'check-decagram-outline', labelId: 'workspace.card.approvals', defaultLabel: '审批', screen: Screens.APPS_APPROVALS},
    {key: 'todos', icon: 'format-list-checks', labelId: 'workspace.card.todos', defaultLabel: '待办', screen: Screens.WORKSPACE_TODOS},
    {key: 'notebook', icon: 'notebook-outline', labelId: 'workspace.card.notebook', defaultLabel: '智能笔记'},
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
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 8,
    },
    headerTitle: {
        color: theme.centerChannelColor,
        ...typography('Heading', 600, 'SemiBold'),
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    card: {
        width: '48%',
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 100,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.08),
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
    cardBadge: {
        position: 'absolute',
        top: -4,
        right: -10,
    },
    cardLabel: {
        color: theme.centerChannelColor,
        ...typography('Body', 200, 'SemiBold'),
        textAlign: 'center',
    },
    cardSubtitle: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
        ...typography('Body', 75, 'Regular'),
        textAlign: 'center',
        marginTop: 4,
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

function formatMoney(value: number): string {
    const abs = Math.abs(value || 0);
    if (abs >= 10000) {
        return `¥${(abs / 10000).toFixed(1)}万`;
    }
    return `¥${abs.toLocaleString(undefined, {maximumFractionDigits: 0})}`;
}

function formatTimeAgo(ts: number): string {
    const now = Date.now();
    const diff = now - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) {return '刚刚';}
    if (mins < 60) {return `${mins}分钟前`;}
    const hours = Math.floor(mins / 60);
    if (hours < 24) {return `${hours}小时前`;}
    const days = Math.floor(hours / 24);
    if (days < 7) {return `${days}天前`;}
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()}`;
}

type Props = {
    navigation: StackNavigationProp<any>;
    theme: Theme;
};

const WorkspaceScreen = ({navigation, theme}: Props) => {
    const intl = useIntl();
    const styles = getStyles(theme);
    const serverUrl = useServerUrl();

    // ---- State ----
    const [newsText, setNewsText] = useState('');
    const [newsChannel, setNewsChannel] = useState('');
    const [hotProducts, setHotProducts] = useState<HotProduct[]>([]);
    const [recentMessages, setRecentMessages] = useState<RecentMessage[]>([]);
    const [approvalCount, setApprovalCount] = useState(0);

    // Auto-scroll index for hot products
    const [scrollIndex, setScrollIndex] = useState(0);
    const scrollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

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
                defaultMessage: '智能笔记本',
            });
            const welcomeMessage = intl.formatMessage({
                id: 'apps.smart_notebook.welcome',
                defaultMessage: '欢迎使用智能笔记本！在这里记录你的想法和笔记。',
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

    const handleCardPress = useCallback((card: WorkspaceCard) => {
        if (card.key === 'notebook') {
            handleSmartNotebook();
        } else if (card.screen) {
            navigation.navigate(card.screen);
        }
    }, [navigation, handleSmartNotebook]);

    const handleNewsPress = useCallback(() => {
        navigation.navigate(Screens.WORKSPACE_NEWS);
    }, [navigation]);

    const handleHotPress = useCallback(() => {
        navigation.navigate(Screens.APPS_HOT_PRODUCTS);
    }, [navigation]);

    const handleMessagePress = useCallback((channelId: string) => {
        // Switch to Messages tab then navigate to the channel
        DeviceEventEmitter.emit(Navigation.NAVIGATE_TO_TAB, {screen: Screens.HOME_TAB_CHAT});
        setTimeout(() => {
            switchToChannelById(serverUrl, channelId);
        }, 300);
    }, [serverUrl]);

    // ---- Visible hot products ----
    const visibleHot = hotProducts.length <= 3
        ? hotProducts
        : Array.from({length: 3}, (_, i) => hotProducts[(scrollIndex + i) % hotProducts.length]);

    // ---- Render: News card ----
    const renderNewsCard = () => (
        <TouchableOpacity style={styles.wideCard} onPress={handleNewsPress} activeOpacity={0.7} testID='workspace.card.news'>
            <View style={styles.wideCardHeader}>
                <CompassIcon name='bullhorn-outline' size={20} color={theme.buttonBg}/>
                <Text style={styles.wideCardTitle}>
                    {intl.formatMessage({id: 'workspace.card.news', defaultMessage: '公司动态'})}
                </Text>
                <Text style={styles.wideCardMore}>
                    {intl.formatMessage({id: 'workspace.news.view_more', defaultMessage: '全文 ›'})}
                </Text>
            </View>
            {newsText ? (
                <>
                    {newsChannel ? <Text style={styles.newsChannel}>{newsChannel}</Text> : null}
                    <Text style={styles.newsText} numberOfLines={3}>{newsText}</Text>
                </>
            ) : (
                <Text style={styles.newsEmpty}>
                    {intl.formatMessage({id: 'workspace.news.empty_short', defaultMessage: '暂无公告'})}
                </Text>
            )}
        </TouchableOpacity>
    );

    // ---- Render: Hot products card ----
    const renderHotCard = () => (
        <TouchableOpacity style={styles.wideCard} onPress={handleHotPress} activeOpacity={0.7} testID='workspace.card.hot_products'>
            <View style={styles.wideCardHeader}>
                <CompassIcon name='fire' size={20} color={theme.buttonBg}/>
                <Text style={styles.wideCardTitle}>
                    {intl.formatMessage({id: 'workspace.card.hot_products', defaultMessage: '热销品'})}
                </Text>
                <Text style={styles.wideCardMore}>
                    {intl.formatMessage({id: 'workspace.hot.view_more', defaultMessage: '更多 ›'})}
                </Text>
            </View>
            {hotProducts.length === 0 ? (
                <Text style={styles.hotEmpty}>
                    {intl.formatMessage({id: 'workspace.hot.empty', defaultMessage: '暂无热销数据'})}
                </Text>
            ) : (
                visibleHot.map((p, i) => {
                    const globalIndex = hotProducts.indexOf(p);
                    const rankColor = globalIndex < 3 ? RANK_COLORS[globalIndex] : changeOpacity(theme.centerChannelColor, 0.32);
                    return (
                        <View key={p.item_code} style={[styles.hotRow, i === visibleHot.length - 1 && styles.hotRowLast]}>
                            <View style={[styles.hotRank, {backgroundColor: rankColor}]}>
                                <Text style={styles.hotRankText}>{globalIndex + 1}</Text>
                            </View>
                            <Text style={styles.hotName} numberOfLines={1}>{p.item_name}</Text>
                            <Text style={styles.hotQty}>{p.total_qty}{p.uom || ''}</Text>
                            <Text style={styles.hotAmount}>{formatMoney(p.total_amount)}</Text>
                        </View>
                    );
                })
            )}
        </TouchableOpacity>
    );

    // ---- Render: Messages card ----
    const renderMessagesCard = () => (
        <View style={styles.wideCard} testID='workspace.card.messages'>
            <View style={styles.wideCardHeader}>
                <CompassIcon name='message-text-outline' size={20} color={theme.buttonBg}/>
                <Text style={styles.wideCardTitle}>
                    {intl.formatMessage({id: 'workspace.card.messages', defaultMessage: '消息'})}
                </Text>
            </View>
            {recentMessages.length === 0 ? (
                <Text style={styles.msgEmpty}>
                    {intl.formatMessage({id: 'workspace.messages.empty', defaultMessage: '暂无新消息'})}
                </Text>
            ) : (
                <ScrollView style={styles.msgScroll} showsVerticalScrollIndicator={true} nestedScrollEnabled={true}>
                    {recentMessages.map((msg, i) => {
                        const initial = (msg.senderName || msg.channelName || '?').charAt(0).toUpperCase();
                        return (
                            <TouchableOpacity
                                key={msg.postId}
                                style={[styles.msgRow, i === recentMessages.length - 1 && styles.msgRowLast]}
                                onPress={() => handleMessagePress(msg.channelId)}
                                activeOpacity={0.7}
                            >
                                <View style={styles.msgAvatar}>
                                    <Text style={styles.msgAvatarText}>{initial}</Text>
                                </View>
                                <View style={styles.msgContent}>
                                    <View style={styles.msgTop}>
                                        <Text style={styles.msgChannel} numberOfLines={1}>{msg.channelName}</Text>
                                        <Text style={styles.msgTime}>{formatTimeAgo(msg.createAt)}</Text>
                                    </View>
                                    <Text style={styles.msgSender}>{msg.senderName}</Text>
                                    <Text style={styles.msgText} numberOfLines={2}>{msg.message}</Text>
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            )}
        </View>
    );

    // ---- Render: Normal card ----
    const renderCard = (card: WorkspaceCard) => {
        const label = intl.formatMessage({id: card.labelId, defaultMessage: card.defaultLabel});
        const showBadge = card.key === 'approvals' && approvalCount > 0;
        return (
            <TouchableOpacity
                key={card.key}
                style={[styles.card, card.wide && styles.cardWide]}
                onPress={() => handleCardPress(card)}
                activeOpacity={0.7}
                testID={`workspace.card.${card.key}`}
            >
                <View>
                    <CompassIcon name={card.icon} size={32} color={theme.buttonBg} style={styles.cardIcon}/>
                    {showBadge && (
                        <Badge
                            value={approvalCount}
                            visible={true}
                            type={approvalCount > 9 ? 'Normal' : 'Small'}
                            backgroundColor={theme.errorTextColor}
                            borderColor={theme.centerChannelBg}
                            color={theme.buttonColor}
                            style={styles.cardBadge}
                        />
                    )}
                </View>
                <View>
                    <Text style={styles.cardLabel}>{label}</Text>
                    {card.subtitle ? <Text style={styles.cardSubtitle}>{card.subtitle}</Text> : null}
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={styles.container} edges={['top']} testID='workspace.screen'>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>
                    {intl.formatMessage({id: 'workspace.title', defaultMessage: '工作台'})}
                </Text>
            </View>
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <View style={styles.grid}>
                    {renderNewsCard()}
                    {renderHotCard()}
                    {renderMessagesCard()}
                    {CARDS.map(renderCard)}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

export default WorkspaceScreen;
