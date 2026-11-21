// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

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
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {StackNavigationProp} from '@react-navigation/stack';

type DetailField = {
    key: string;
    label: string;
    format?: (value: any, data: any) => string;
};

type SubListConfig = {
    title: string;
    fetchFn: (serverUrl: string, parentName: string) => Promise<any[]>;
    fields: DetailField[];
};

type ErpDetailScreenProps = {
    navigation: StackNavigationProp<any>;
    route: {params: {name: string}};
    fetchDetailFn: (serverUrl: string, name: string) => Promise<any>;
    fields: DetailField[];
    subLists?: SubListConfig[];
    canEdit?: boolean;
    editScreen?: string;
    canDelete?: boolean;
    deleteFn?: (serverUrl: string, name: string) => Promise<any>;
    deleteSuccessMessage?: string;
    onDeleted?: (navigation: any) => void;
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
    scrollContent: {
        padding: 16,
    },
    section: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.03),
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.06),
    },
    sectionTitle: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.centerChannelColor,
        marginBottom: 12,
    },
    fieldRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 6,
    },
    fieldLabel: {
        ...typography('Body', 100, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        flex: 1,
    },
    fieldValue: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.centerChannelColor,
        flex: 2,
        textAlign: 'right',
    },
    subListItem: {
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.06),
    },
    subListTitle: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.centerChannelColor,
        marginBottom: 4,
    },
    subListRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 2,
    },
    subListLabel: {
        ...typography('Body', 75, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.48),
    },
    subListValue: {
        ...typography('Body', 75, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 4,
        alignSelf: 'flex-start',
        marginBottom: 12,
    },
    statusText: {
        ...typography('Body', 75, 'SemiBold'),
    },
    progressBar: {
        height: 6,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
        borderRadius: 3,
        marginTop: 8,
        marginBottom: 4,
        overflow: 'hidden',
    },
    progressFill: {
        height: 6,
        borderRadius: 3,
        backgroundColor: theme.buttonBg,
    },
    progressText: {
        ...typography('Body', 50, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.48),
        textAlign: 'right',
    },
    actions: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 8,
    },
    actionButton: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 8,
        alignItems: 'center',
    },
    editButton: {
        backgroundColor: theme.buttonBg,
    },
    deleteButton: {
        backgroundColor: changeOpacity(theme.errorTextColor, 0.12),
    },
    editButtonText: {
        color: theme.buttonColor,
        ...typography('Body', 100, 'SemiBold'),
    },
    deleteButtonText: {
        color: theme.errorTextColor,
        ...typography('Body', 100, 'SemiBold'),
    },
    emptySubList: {
        paddingVertical: 16,
        alignItems: 'center',
    },
    emptySubListText: {
        color: changeOpacity(theme.centerChannelColor, 0.32),
        ...typography('Body', 100, 'Regular'),
    },
}));

const STATUS_COLORS: Record<string, string> = {
    Completed: '#22c55e',
    Closed: '#22c55e',
    Paid: '#22c55e',
    Delivered: '#22c55e',
    'In Process': '#3b82f6',
    Open: '#3b82f6',
    Working: '#3b82f6',
    Draft: '#9ca3af',
    'Not Started': '#9ca3af',
    Cancelled: '#9ca3af',
    Overdue: '#ef4444',
    Stopped: '#f59e0b',
};

const ErpDetailScreen = ({
    navigation,
    route,
    fetchDetailFn,
    fields,
    subLists,
    canEdit,
    editScreen,
    canDelete,
    deleteFn,
    onDeleted,
}: ErpDetailScreenProps) => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const styles = getStyles(theme);
    const name = route.params.name;

    const [data, setData] = useState<any>(null);
    const [subData, setSubData] = useState<Record<string, any[]>>({});
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    useLayoutEffect(() => {
        navigation.setOptions({title});
    }, [navigation, title]);

    const loadData = useCallback(async () => {
        try {
            const detail = await fetchDetailFn(serverUrl, name);
            setData(detail);

            if (subLists) {
                const subs: Record<string, any[]> = {};
                for (const sub of subLists) {
                    try {
                        subs[sub.title] = await sub.fetchFn(serverUrl, name);
                    } catch {
                        subs[sub.title] = [];
                    }
                }
                setSubData(subs);
            }
        } catch (e: any) {
            Alert.alert('Error', e?.message || String(e));
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [serverUrl, name, fetchDetailFn, subLists]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleDelete = useCallback(() => {
        if (!deleteFn) {return;}
        Alert.alert(
            intl.formatMessage({id: 'erp.delete_confirm_title', defaultMessage: 'Delete'}),
            intl.formatMessage({id: 'erp.delete_confirm', defaultMessage: 'Are you sure you want to delete this item?'}),
            [
                {text: intl.formatMessage({id: 'cancel', defaultMessage: 'Cancel'}), style: 'cancel'},
                {
                    text: intl.formatMessage({id: 'delete', defaultMessage: 'Delete'}),
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await deleteFn(serverUrl, name);
                            onDeleted?.(navigation);
                            navigation.goBack();
                        } catch (e: any) {
                            Alert.alert('Error', e?.message || String(e));
                        }
                    },
                },
            ],
        );
    }, [serverUrl, name, deleteFn, navigation, onDeleted, intl]);

    if (loading) {
        return (
            <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
                <View style={styles.loading}>
                    <ActivityIndicator size='large' color={theme.buttonBg}/>
                </View>
            </SafeAreaView>
        );
    }

    if (!data) {
        return (
            <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
                <View style={styles.loading}>
                    <Text style={styles.emptySubListText}>No data</Text>
                </View>
            </SafeAreaView>
        );
    }

    const status = data.status;
    const statusColor = STATUS_COLORS[status] || theme.buttonBg;
    const hasProgress = data.qty != null && data.produced_qty != null;
    const progressPct = hasProgress ? Math.min(100, Math.round((data.produced_qty / data.qty) * 100)) : null;
    const hasPercentComplete = data.percent_complete != null;

    return (
        <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
            <ScrollView
                style={styles.container}
                contentContainerStyle={styles.scrollContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }}/>}
                showsVerticalScrollIndicator={false}
            >
                {status && (
                    <View style={[styles.statusBadge, {backgroundColor: changeOpacity(statusColor, 0.12)}]}>
                        <Text style={[styles.statusText, {color: statusColor}]}>{status}</Text>
                    </View>
                )}

                {hasProgress && (
                    <View style={{marginBottom: 12}}>
                        <View style={styles.progressBar}>
                            <View style={[styles.progressFill, {width: `${progressPct}%`, backgroundColor: statusColor}]}/>
                        </View>
                        <Text style={styles.progressText}>{data.produced_qty} / {data.qty} ({progressPct}%)</Text>
                    </View>
                )}

                {hasPercentComplete && (
                    <View style={{marginBottom: 12}}>
                        <View style={styles.progressBar}>
                            <View style={[styles.progressFill, {width: `${data.percent_complete}%`}]}/>
                        </View>
                        <Text style={styles.progressText}>{data.percent_complete}%</Text>
                    </View>
                )}

                <View style={styles.section}>
                    {fields.map((field) => {
                        const val = field.format ? field.format(data[field.key], data) : data[field.key];
                        if (val === undefined || val === null || val === '') {return null;}
                        return (
                            <View key={field.key} style={styles.fieldRow}>
                                <Text style={styles.fieldLabel}>{field.label}</Text>
                                <Text style={styles.fieldValue}>{String(val)}</Text>
                            </View>
                        );
                    })}
                </View>

                {subLists?.map((sub) => {
                    const items = subData[sub.title] || [];
                    return (
                        <View key={sub.title} style={styles.section}>
                            <Text style={styles.sectionTitle}>{sub.title}</Text>
                            {items.length === 0 ? (
                                <View style={styles.emptySubList}>
                                    <Text style={styles.emptySubListText}>
                                        {intl.formatMessage({id: 'erp.no_records', defaultMessage: 'No records'})}
                                    </Text>
                                </View>
                            ) : (
                                items.map((item, idx) => (
                                    <View key={item.name || idx} style={[styles.subListItem, idx === items.length - 1 && {borderBottomWidth: 0}]}>
                                        <Text style={styles.subListTitle}>
                                            {sub.fields[0]?.format ? sub.fields[0].format(item[sub.fields[0].key], item) : item[sub.fields[0].key]}
                                        </Text>
                                        {sub.fields.slice(1).map((f) => (
                                            <View key={f.key} style={styles.subListRow}>
                                                <Text style={styles.subListLabel}>{f.label}</Text>
                                                <Text style={styles.subListValue}>
                                                    {f.format ? f.format(item[f.key], item) : String(item[f.key] || '-')}
                                                </Text>
                                            </View>
                                        ))}
                                    </View>
                                ))
                            )}
                        </View>
                    );
                })}

                {(canEdit || canDelete) && (
                    <View style={styles.actions}>
                        {canEdit && editScreen && (
                            <TouchableOpacity
                                style={[styles.actionButton, styles.editButton]}
                                onPress={() => navigation.navigate(editScreen, {mode: 'edit', name, data})}
                            >
                                <Text style={styles.editButtonText}>
                                    {intl.formatMessage({id: 'erp.edit', defaultMessage: 'Edit'})}
                                </Text>
                            </TouchableOpacity>
                        )}
                        {canDelete && (
                            <TouchableOpacity
                                style={[styles.actionButton, styles.deleteButton]}
                                onPress={handleDelete}
                            >
                                <Text style={styles.deleteButtonText}>
                                    {intl.formatMessage({id: 'erp.delete', defaultMessage: 'Delete'})}
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
};

export default ErpDetailScreen;
