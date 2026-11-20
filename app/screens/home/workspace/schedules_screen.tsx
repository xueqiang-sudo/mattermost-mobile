// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useState} from 'react';
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
import NetworkManager from '@managers/network_manager';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

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
}));

const SchedulesScreen = () => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const styles = getStyles(theme);

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
                            Alert.alert('Error', e?.message || String(e));
                        }
                    },
                },
            ],
        );
    }, [serverUrl, intl]);

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
        if (!enabled || status === 'paused') {
            return {bg: changeOpacity(theme.centerChannelColor, 0.08), color: changeOpacity(theme.centerChannelColor, 0.56)};
        }
        if (status === 'completed') {
            return {bg: changeOpacity(theme.onlineIndicator, 0.12), color: theme.onlineIndicator};
        }
        return {bg: changeOpacity(theme.buttonBg, 0.12), color: theme.buttonBg};
    };

    const getStatusLabel = (status: string, enabled: boolean) => {
        if (!enabled) {return intl.formatMessage({id: 'schedules.status.disabled', defaultMessage: '已停用'});}
        switch (status) {
        case 'active': return intl.formatMessage({id: 'schedules.status.active', defaultMessage: '进行中'});
        case 'paused': return intl.formatMessage({id: 'schedules.status.paused', defaultMessage: '已暂停'});
        case 'completed': return intl.formatMessage({id: 'schedules.status.completed', defaultMessage: '已完成'});
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
                    </View>
                ) : (
                    schedules.map((schedule) => {
                        const statusStyle = getStatusStyle(schedule.status, schedule.enabled);
                        return (
                            <View key={schedule.id} style={styles.card}>
                                <View style={styles.cardHeader}>
                                    <Text style={styles.cardTitle} numberOfLines={1}>
                                        {schedule.name}
                                    </Text>
                                    <View style={[styles.statusBadge, {backgroundColor: statusStyle.bg}]}>
                                        <Text style={[styles.statusText, {color: statusStyle.color}]}>
                                            {getStatusLabel(schedule.status, schedule.enabled)}
                                        </Text>
                                    </View>
                                </View>
                                <View style={styles.cardBody}>
                                    <Text style={styles.cardMessage} numberOfLines={2}>
                                        {schedule.message}
                                    </Text>
                                </View>
                                <View style={styles.cardFooter}>
                                    <Text style={styles.cardMeta}>
                                        {intl.formatMessage({id: 'schedules.next_run', defaultMessage: '下次'}): {formatTime(schedule.next_run)}
                                    </Text>
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
                        );
                    })
                )}
            </ScrollView>
        </SafeAreaView>
    );
};

export default SchedulesScreen;
