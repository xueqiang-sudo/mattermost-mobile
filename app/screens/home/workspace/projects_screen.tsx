// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {ActivityIndicator, FlatList, Text, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import DatabaseManager from '@database/manager';
import {getCurrentTeamId} from '@queries/servers/system';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import {fetchProjects, type DashboardProject} from '../apps/api';

const getStyles = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 8,
    },
    headerTitle: {
        color: theme.centerChannelColor,
        ...typography('Heading', 600, 'SemiBold'),
        marginLeft: 12,
    },
    tabs: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        gap: 8,
        marginBottom: 8,
    },
    tab: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.06),
    },
    tabActive: {
        backgroundColor: theme.buttonBg,
    },
    tabText: {
        ...typography('Body', 100, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.72),
    },
    tabTextActive: {
        color: theme.buttonColor,
    },
    card: {
        marginHorizontal: 16,
        marginBottom: 12,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderRadius: 12,
        padding: 16,
        borderWidth: 0.5,
        borderColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    cardTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    projectName: {
        color: theme.centerChannelColor,
        ...typography('Body', 200, 'SemiBold'),
        flex: 1,
    },
    statusTag: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
    },
    statusText: {
        ...typography('Body', 50, 'SemiBold'),
        color: '#fff',
    },
    cardRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 4,
    },
    cardLabel: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
        ...typography('Body', 75, 'Regular'),
    },
    cardValue: {
        color: theme.centerChannelColor,
        ...typography('Body', 75, 'Regular'),
    },
    progressRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 8,
    },
    progressBar: {
        flex: 1,
        height: 6,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
        borderRadius: 3,
        marginRight: 8,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: 3,
    },
    progressText: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
        ...typography('Body', 50, 'SemiBold'),
        minWidth: 40,
        textAlign: 'right',
    },
    empty: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 60,
    },
    emptyText: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
        ...typography('Body', 200, 'Regular'),
        marginTop: 12,
    },
    loading: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
}));

type TabKey = 'all' | 'open' | 'completed' | 'cancelled';

const STATUS_COLORS: Record<string, string> = {
    Open: '#3B82F6',
    Working: '#E8A735',
    Completed: '#22C55E',
    Cancelled: '#999',
    Overdue: '#EF4444',
};

const ProjectsScreen = () => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const styles = getStyles(theme);

    const [projects, setProjects] = useState<DashboardProject[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<TabKey>('all');

    const loadProjects = useCallback(async () => {
        setLoading(true);
        try {
            const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
            const teamId = await getCurrentTeamId(database);
            const data = await fetchProjects(serverUrl, teamId);
            setProjects(data);
        } catch (e) {
            setProjects([]);
        } finally {
            setLoading(false);
        }
    }, [serverUrl]);

    useEffect(() => {
        loadProjects();
    }, [loadProjects]);

    const filteredProjects = projects.filter((p) => {
        if (activeTab === 'all') {return true;}
        if (activeTab === 'open') {return p.status === 'Open' || p.status === 'Working';}
        if (activeTab === 'completed') {return p.status === 'Completed';}
        if (activeTab === 'cancelled') {return p.status === 'Cancelled';}
        return true;
    });

    const tabs: {key: TabKey; labelId: string; defaultLabel: string}[] = [
        {key: 'all', labelId: 'workspace.projects.tab_all', defaultLabel: '全部'},
        {key: 'open', labelId: 'workspace.projects.tab_open', defaultLabel: '进行中'},
        {key: 'completed', labelId: 'workspace.projects.tab_completed', defaultLabel: '已完成'},
        {key: 'cancelled', labelId: 'workspace.projects.tab_cancelled', defaultLabel: '已取消'},
    ];

    const formatDate = (d: string) => {
        if (!d) {return '—';}
        return d.substring(0, 10);
    };

    const formatMoney = (v: number) => {
        if (!v) {return '¥0.00';}
        if (Math.abs(v) >= 10000) {return `¥${(Math.abs(v) / 10000).toFixed(1)}万`;}
        return `¥${Number(v).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    };

    const renderItem = ({item}: {item: DashboardProject}) => {
        const statusColor = STATUS_COLORS[item.status] || '#999';
        const percent = Math.min(Math.round(item.percent_complete || 0), 100);

        return (
            <View style={styles.card}>
                <View style={styles.cardTop}>
                    <Text style={styles.projectName} numberOfLines={1}>{item.project_name || item.name}</Text>
                    <View style={[styles.statusTag, {backgroundColor: statusColor}]}>
                        <Text style={styles.statusText}>{item.status || '—'}</Text>
                    </View>
                </View>
                {item.customer ? (
                    <View style={styles.cardRow}>
                        <Text style={styles.cardLabel}>{item.customer}</Text>
                        <Text style={styles.cardValue}>{item.sales_order || ''}</Text>
                    </View>
                ) : null}
                <View style={styles.cardRow}>
                    <Text style={styles.cardLabel}>{formatDate(item.expected_start_date)} ~ {formatDate(item.expected_end_date)}</Text>
                    <Text style={styles.cardValue}>{formatMoney(item.total_sales_amount)}</Text>
                </View>
                <View style={styles.progressRow}>
                    <View style={styles.progressBar}>
                        <View style={[styles.progressFill, {width: `${percent}%`, backgroundColor: statusColor}]}/>
                    </View>
                    <Text style={styles.progressText}>{percent}%</Text>
                </View>
                {item.task_total > 0 ? (
                    <View style={styles.cardRow}>
                        <Text style={styles.cardLabel}>
                            {intl.formatMessage(
                                {id: 'workspace.projects.task_progress', defaultMessage: '{done}/{total} tasks'},
                                {done: item.task_completed, total: item.task_total},
                            )}
                        </Text>
                        {item.per_gross_margin ? (
                            <Text style={styles.cardValue}>{intl.formatMessage({id: 'workspace.projects.margin', defaultMessage: 'Margin'}, {value: `${item.per_gross_margin}%`})}: {item.per_gross_margin}%</Text>
                        ) : null}
                    </View>
                ) : null}
            </View>
        );
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.container} edges={[]}>
                <View style={styles.loading}>
                    <ActivityIndicator size='large' color={theme.buttonBg}/>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={[]} testID='projects.screen'>
            <View style={styles.tabs}>
                {tabs.map((tab) => (
                    <TouchableOpacity
                        key={tab.key}
                        style={[styles.tab, activeTab === tab.key && styles.tabActive]}
                        onPress={() => setActiveTab(tab.key)}
                    >
                        <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                            {intl.formatMessage({id: tab.labelId, defaultMessage: tab.defaultLabel})}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>
            {filteredProjects.length === 0 ? (
                <View style={styles.empty}>
                    <CompassIcon name='folder-outline' size={48} color={changeOpacity(theme.centerChannelColor, 0.32)}/>
                    <Text style={styles.emptyText}>
                        {intl.formatMessage({id: 'workspace.projects.empty', defaultMessage: 'No projects'})}
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={filteredProjects}
                    renderItem={renderItem}
                    keyExtractor={(item) => item.name}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{paddingBottom: 20}}
                />
            )}
        </SafeAreaView>
    );
};

export default ProjectsScreen;
