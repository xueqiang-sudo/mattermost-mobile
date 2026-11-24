// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useNavigation} from '@react-navigation/native';
import React, {useCallback, useEffect, useLayoutEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    ActivityIndicator,
    Alert,
    RefreshControl,
    ScrollView,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import DatabaseManager from '@database/manager';
import NetworkManager from '@managers/network_manager';
import {getCurrentTeamId} from '@queries/servers/system';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';
import {openDirectChannelWithBot} from '@screens/channel/ai_actions/ai_api';
import {switchToChannelById} from '@actions/remote/channel';
import {DeviceEventEmitter} from 'react-native';
import {Navigation, Screens} from '@constants';
import SlideUpPanelItem, {ITEM_HEIGHT} from '@components/slide_up_panel_item';
import {bottomSheet} from '@screens/navigation';
import {bottomSheetSnapPoint} from '@utils/helpers';

type Schedule = {
    id: string;
    name: string;
    message: string;
    expression: string;
    next_run: string | null;
    last_run: string | null;
    status: string;
    enabled: boolean;
    created_at: string;
    run_count: number;
};

const getStyles = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    loading: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    loadingText: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
        ...typography('Body', 200, 'Regular'),
        marginTop: 12,
    },
    scrollContent: {
        padding: 16,
    },
    card: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    cardTitle: {
        flex: 1,
        color: theme.centerChannelColor,
        ...typography('Heading', 200, 'SemiBold'),
    },
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
        marginLeft: 8,
    },
    statusText: {
        ...typography('Body', 50, 'SemiBold'),
    },
    cardBody: {
        marginBottom: 8,
    },
    cardMessage: {
        color: changeOpacity(theme.centerChannelColor, 0.72),
        ...typography('Body', 100, 'Regular'),
        lineHeight: 20,
    },
    cardFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 8,
    },
    cardFooterRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    cardMeta: {
        color: changeOpacity(theme.centerChannelColor, 0.48),
        ...typography('Body', 50, 'Regular'),
    },
    deleteButton: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 6,
        backgroundColor: changeOpacity(theme.errorTextColor, 0.12),
    },
    deleteText: {
        color: theme.errorTextColor,
        ...typography('Body', 75, 'SemiBold'),
    },
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 80,
    },
    emptyIcon: {
        marginBottom: 16,
    },
    emptyText: {
        color: changeOpacity(theme.centerChannelColor, 0.48),
        ...typography('Body', 200, 'Regular'),
        textAlign: 'center',
    },
    errorContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
    },
    errorText: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
        ...typography('Body', 200, 'Regular'),
        textAlign: 'center',
        marginBottom: 16,
    },
    retryButton: {
        backgroundColor: theme.buttonBg,
        borderRadius: 8,
        paddingHorizontal: 24,
        paddingVertical: 10,
    },
    retryText: {
        color: theme.buttonColor,
        ...typography('Body', 200, 'SemiBold'),
    },
    headerButton: {
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    hintCard: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: changeOpacity(theme.buttonBg, 0.06),
        borderRadius: 10,
        padding: 12,
        marginBottom: 12,
        gap: 8,
    },
    hintIcon: {
        marginTop: 2,
    },
    hintText: {
        flex: 1,
        color: changeOpacity(theme.centerChannelColor, 0.72),
        ...typography('Body', 75, 'Regular'),
        lineHeight: 18,
    },
    aiButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.buttonBg,
        borderRadius: 8,
        paddingHorizontal: 20,
        paddingVertical: 12,
        gap: 8,
    },
    aiButtonText: {
        color: theme.buttonColor,
        ...typography('Body', 100, 'SemiBold'),
    },
}));

const SchedulesScreen = () => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const navigation = useNavigation();
    const styles = getStyles(theme);

    useLayoutEffect(() => {
        navigation.setOptions({
            title: intl.formatMessage({id: 'workspace.schedules.title', defaultMessage: 'Schedules'}),
            headerRight: () => (
                <TouchableOpacity
                    onPress={handleAIAssistant}
                    style={styles.headerButton}
                >
                    <CompassIcon name='robot-happy' size={24} color={theme.sidebarText}/>
                </TouchableOpacity>
            ),
        });
    }, [navigation, intl, handleAIAssistant, styles.headerButton, theme.sidebarText]);

    const [schedules, setSchedules] = useState<Schedule[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [refreshing, setRefreshing] = useState(false);

    const fetchSchedules = useCallback(async () => {
        try {
            const client = NetworkManager.getClient(serverUrl);
            const data = await client.doFetch(
                '/plugins/com.mattermost.fact-extractor/api/schedules',
                {method: 'get'},
            );
            const list = data?.result || data || [];
            setSchedules(Array.isArray(list) ? list : []);
            setError('');
        } catch (e: any) {
            setError(e?.message || String(e));
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [serverUrl]);

    useEffect(() => {
        fetchSchedules();
    }, [fetchSchedules]);

    const handleRefresh = useCallback(() => {
        setRefreshing(true);
        fetchSchedules();
    }, [fetchSchedules]);

    const handleDelete = useCallback((schedule: Schedule) => {
        Alert.alert(
            intl.formatMessage({id: 'schedules.delete_title', defaultMessage: '删除日程'}),
            intl.formatMessage(
                {id: 'schedules.delete_confirm', defaultMessage: '确定删除「{name}」吗？'},
                {name: schedule.name},
            ),
            [
                {
                    text: intl.formatMessage({id: 'cancel', defaultMessage: '取消'}),
                    style: 'cancel',
                },
                {
                    text: intl.formatMessage({id: 'delete', defaultMessage: '删除'}),
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const client = NetworkManager.getClient(serverUrl);
                            await client.doFetch(
                                `/plugins/com.mattermost.fact-extractor/api/schedules/${schedule.id}`,
                                {method: 'delete'},
                            );
                            setSchedules((prev) => prev.filter((s) => s.id !== schedule.id));
                        } catch (e: any) {
                            Alert.alert(
                                intl.formatMessage({id: 'schedules.error', defaultMessage: 'Error'}),
                                e?.message || String(e),
                            );
                        }
                    },
                },
            ],
        );
    }, [serverUrl, intl]);

    const handleAIAssistant = useCallback(async () => {
        try {
            const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
            const client = NetworkManager.getClient(serverUrl);
            const teamId = await getCurrentTeamId(database);
            if (!teamId) {
                return;
            }

            // Query bot users in the current team
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

    const formatTime = (isoStr: string | null) => {
        if (!isoStr) {return '-';}
        try {
            const d = new Date(isoStr);
            const month = d.getMonth() + 1;
            const day = d.getDate();
            const hours = d.getHours().toString().padStart(2, '0');
            const mins = d.getMinutes().toString().padStart(2, '0');
            return `${month}/${day} ${hours}:${mins}`;
        } catch {
            return isoStr;
        }
    };

    const getStatusStyle = (status: string, enabled: boolean) => {
        if (!enabled || status === 'paused' || status === 'cancelled') {
            return {bg: changeOpacity(theme.centerChannelColor, 0.08), color: changeOpacity(theme.centerChannelColor, 0.56)};
        }
        if (status === 'completed') {
            return {bg: changeOpacity(theme.onlineIndicator, 0.12), color: theme.onlineIndicator};
        }
        if (status === 'failed') {
            return {bg: changeOpacity(theme.errorTextColor, 0.12), color: theme.errorTextColor};
        }
        if (status === 'pending') {
            return {bg: changeOpacity(theme.centerChannelColor, 0.08), color: changeOpacity(theme.centerChannelColor, 0.72)};
        }
        return {bg: changeOpacity(theme.buttonBg, 0.12), color: theme.buttonBg};
    };

    const getStatusLabel = (status: string, enabled: boolean) => {
        if (!enabled) {return intl.formatMessage({id: 'schedules.status.disabled', defaultMessage: '已停用'});}
        switch (status) {
        case 'active': return intl.formatMessage({id: 'schedules.status.active', defaultMessage: '进行中'});
        case 'pending': return intl.formatMessage({id: 'schedules.status.pending', defaultMessage: '等待中'});
        case 'paused': return intl.formatMessage({id: 'schedules.status.paused', defaultMessage: '已暂停'});
        case 'completed': return intl.formatMessage({id: 'schedules.status.completed', defaultMessage: '已完成'});
        case 'failed': return intl.formatMessage({id: 'schedules.status.failed', defaultMessage: '失败'});
        case 'cancelled': return intl.formatMessage({id: 'schedules.status.cancelled', defaultMessage: '已取消'});
        default: return status;
        }
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
                <View style={styles.loading}>
                    <ActivityIndicator size='large' color={theme.buttonBg}/>
                    <Text style={styles.loadingText}>
                        {intl.formatMessage({id: 'schedules.loading', defaultMessage: '加载日程...'})}
                    </Text>
                </View>
            </SafeAreaView>
        );
    }

    if (error) {
        return (
            <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
                <View style={styles.errorContainer}>
                    <CompassIcon name='alert-circle-outline' size={48} color={changeOpacity(theme.centerChannelColor, 0.32)}/>
                    <Text style={styles.errorText}>{error}</Text>
                    <TouchableOpacity style={styles.retryButton} onPress={handleRefresh}>
                        <Text style={styles.retryText}>
                            {intl.formatMessage({id: 'retry', defaultMessage: '重试'})}
                        </Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
            <ScrollView
                style={styles.container}
                contentContainerStyle={schedules.length === 0 ? {flex: 1} : styles.scrollContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh}/>}
                showsVerticalScrollIndicator={false}
            >
                {/* 提示卡片 - 始终显示 */}
                <TouchableOpacity style={styles.hintCard} onPress={handleAIAssistant} activeOpacity={0.7}>
                    <CompassIcon name='lightbulb-on-outline' size={18} color={theme.buttonBg} style={styles.hintIcon}/>
                    <Text style={styles.hintText}>
                        {intl.formatMessage({
                            id: 'schedules.hint',
                            defaultMessage: '给 AI 助手发消息即可创建日程，如「下午2点开会提醒我」「每天9点提醒查看邮件」，AI 会自动创建并在指定时间提醒你。',
                        })}
                    </Text>
                </TouchableOpacity>

                {schedules.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <CompassIcon
                            name='calendar-outline'
                            size={64}
                            color={changeOpacity(theme.centerChannelColor, 0.24)}
                            style={styles.emptyIcon}
                        />
                        <Text style={styles.emptyText}>
                            {intl.formatMessage({id: 'schedules.empty', defaultMessage: '暂无日程安排'})}
                        </Text>
                        <TouchableOpacity
                            style={styles.aiButton}
                            onPress={handleAIAssistant}
                        >
                            <CompassIcon name='robot-happy' size={20} color={theme.buttonColor}/>
                            <Text style={styles.aiButtonText}>
                                {intl.formatMessage({id: 'schedules.chat_with_ai', defaultMessage: '与 AI 助手聊天'})}
                            </Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    schedules.map((schedule) => {
                        const statusStyle = getStatusStyle(schedule.status, schedule.enabled);
                        // 如果 name 是手机号格式或和 message 重复，不显示标题
                        const isPhoneName = /^\d{5,}$/.test(schedule.name.trim());
                        const isDuplicateName = schedule.name.trim() === schedule.message.trim();
                        const showTitle = !isPhoneName && !isDuplicateName && schedule.name.trim().length > 0;
                        return (
                            <View key={schedule.id} style={styles.card}>
                                {showTitle && (
                                    <View style={styles.cardHeader}>
                                        <Text style={styles.cardTitle} numberOfLines={2}>
                                            {schedule.name}
                                        </Text>
                                    </View>
                                )}
                                <View style={styles.cardBody}>
                                    <Text style={styles.cardMessage}>
                                        {schedule.message}
                                    </Text>
                                </View>
                                <View style={styles.cardFooter}>
                                    <Text style={styles.cardMeta}>
                                        {`${intl.formatMessage({id: 'schedules.next_run', defaultMessage: '下次'})}: ${formatTime(schedule.next_run)}`}
                                    </Text>
                                    <View style={styles.cardFooterRight}>
                                        <View style={[styles.statusBadge, {backgroundColor: statusStyle.bg}]}>
                                            <Text style={[styles.statusText, {color: statusStyle.color}]}>
                                                {getStatusLabel(schedule.status, schedule.enabled)}
                                            </Text>
                                        </View>
                                        <TouchableOpacity
                                            style={styles.deleteButton}
                                            onPress={() => handleDelete(schedule)}
                                        >
                                        <Text style={styles.deleteText}>
                                            {intl.formatMessage({id: 'schedules.delete', defaultMessage: '删除'})}
                                        </Text>
                                    </TouchableOpacity>
                                    </View>
                                </View>
                            </View>
                        );
                    })
                )}
            </ScrollView>
        </SafeAreaView>
    );
};

export default SchedulesScreen;
