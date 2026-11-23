// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {ActivityIndicator, Alert, FlatList, Text, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import {Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import DatabaseManager from '@database/manager';
import {getCurrentTeamId} from '@queries/servers/system';
import {dismissModal, showModal} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import {deleteAnnouncement, fetchAnnouncements} from './announcement_api';
import type {Announcement} from './types';

type Props = {
    componentId: string;
    canWrite: boolean;
};

const getStyles = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: theme.sidebarBg,
    },
    backButton: {
        padding: 4,
        marginRight: 8,
    },
    headerTitle: {
        ...typography('Heading', 200, 'SemiBold'),
        color: theme.sidebarText,
        flex: 1,
    },
    publishBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.buttonBg,
        borderRadius: 6,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    publishBtnText: {
        ...typography('Body', 75, 'SemiBold'),
        color: theme.buttonColor,
        marginLeft: 4,
    },
    loading: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    empty: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 60,
    },
    emptyIcon: {
        marginBottom: 12,
    },
    emptyText: {
        ...typography('Body', 200, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.56),
    },
    card: {
        marginHorizontal: 16,
        marginTop: 12,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    cardPinned: {
        backgroundColor: changeOpacity(theme.buttonBg, 0.06),
        borderColor: changeOpacity(theme.buttonBg, 0.2),
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 8,
    },
    pinBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: changeOpacity(theme.errorTextColor, 0.12),
        borderRadius: 4,
        paddingHorizontal: 6,
        paddingVertical: 2,
        marginRight: 8,
    },
    pinBadgeText: {
        ...typography('Body', 50, 'SemiBold'),
        color: theme.errorTextColor,
        marginLeft: 2,
    },
    priorityBadge: {
        borderRadius: 4,
        paddingHorizontal: 6,
        paddingVertical: 2,
        marginRight: 8,
    },
    priorityBadgeText: {
        ...typography('Body', 50, 'SemiBold'),
        color: '#fff',
    },
    cardTitle: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.centerChannelColor,
        flex: 1,
    },
    cardContent: {
        ...typography('Body', 100, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.72),
        lineHeight: 20,
        marginBottom: 12,
    },
    cardMeta: {
        ...typography('Body', 50, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.56),
    },
    cardActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        marginTop: 12,
        gap: 16,
    },
    actionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    actionBtnText: {
        ...typography('Body', 75, 'SemiBold'),
        marginLeft: 4,
    },
}));

const PRIORITY_COLORS: Record<string, string> = {
    normal: '#6B7280',
    important: '#F59E0B',
    urgent: '#EF4444',
};

function formatTime(ts: number): string {
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) {
        return '昨天';
    }
    return `${d.getMonth() + 1}月${d.getDate()}日`;
}

const AnnouncementListScreen = ({componentId, canWrite}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const styles = getStyles(theme);

    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [loading, setLoading] = useState(true);

    const loadAnnouncements = useCallback(async () => {
        setLoading(true);
        try {
            const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
            const teamId = await getCurrentTeamId(database);
            if (!teamId) {return;}
            const data = await fetchAnnouncements(serverUrl, teamId);
            // Sort: pinned first, then by created_at desc
            data.sort((a, b) => {
                if (a.is_pinned && !b.is_pinned) {return -1;}
                if (!a.is_pinned && b.is_pinned) {return 1;}
                return b.created_at - a.created_at;
            });
            setAnnouncements(data);
        } catch {
            // ignore
        } finally {
            setLoading(false);
        }
    }, [serverUrl]);

    useEffect(() => {
        loadAnnouncements();
    }, [loadAnnouncements]);

    const handlePress = useCallback((item: Announcement) => {
        showModal(Screens.ANNOUNCEMENT_DETAIL, intl.formatMessage({id: 'announcement.detail', defaultMessage: '公告详情'}), {announcement: item, canWrite});
    }, [intl, canWrite]);

    const handlePublish = useCallback(() => {
        showModal(Screens.ANNOUNCEMENT_FORM, intl.formatMessage({id: 'announcement.publish', defaultMessage: '发布公告'}), {mode: 'create', componentId});
    }, [intl, componentId]);

    const handleEdit = useCallback((item: Announcement) => {
        showModal(Screens.ANNOUNCEMENT_FORM, intl.formatMessage({id: 'announcement.edit', defaultMessage: '编辑公告'}), {mode: 'edit', announcement: item, componentId});
    }, [intl, componentId]);

    const handleDelete = useCallback((item: Announcement) => {
        Alert.alert(
            intl.formatMessage({id: 'announcement.delete_confirm_title', defaultMessage: '删除公告'}),
            intl.formatMessage({id: 'announcement.delete_confirm_message', defaultMessage: '确定删除此公告吗？'}),
            [
                {text: intl.formatMessage({id: 'cancel', defaultMessage: '取消'}), style: 'cancel'},
                {
                    text: intl.formatMessage({id: 'delete', defaultMessage: '删除'}),
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
                            const teamId = await getCurrentTeamId(database);
                            if (!teamId) {return;}
                            await deleteAnnouncement(serverUrl, teamId, item.id);
                            loadAnnouncements();
                        } catch (e: any) {
                            Alert.alert(
                                intl.formatMessage({id: 'error', defaultMessage: '错误'}),
                                e?.message || String(e),
                            );
                        }
                    },
                },
            ],
        );
    }, [serverUrl, intl, loadAnnouncements]);

    const renderCard = ({item}: {item: Announcement}) => {
        const priorityColor = PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.normal;
        const priorityLabel = intl.formatMessage({
            id: `announcement.priority.${item.priority}`,
            defaultMessage: item.priority === 'normal' ? '普通' : item.priority === 'important' ? '重要' : '紧急',
        });

        return (
            <TouchableOpacity
                style={[styles.card, item.is_pinned && styles.cardPinned]}
                onPress={() => handlePress(item)}
                activeOpacity={0.7}
            >
                <View style={styles.cardHeader}>
                    {item.is_pinned && (
                        <View style={styles.pinBadge}>
                            <CompassIcon name='pin-outline' size={12} color={theme.errorTextColor}/>
                            <Text style={styles.pinBadgeText}>
                                {intl.formatMessage({id: 'announcement.pinned', defaultMessage: '置顶'})}
                            </Text>
                        </View>
                    )}
                    {item.priority !== 'normal' && (
                        <View style={[styles.priorityBadge, {backgroundColor: priorityColor}]}>
                            <Text style={styles.priorityBadgeText}>{priorityLabel}</Text>
                        </View>
                    )}
                    <Text style={styles.cardTitle} numberOfLines={2}>
                        {item.title}
                    </Text>
                </View>
                <Text style={styles.cardContent} numberOfLines={3}>
                    {item.content}
                </Text>
                <Text style={styles.cardMeta}>
                    {item.author_name} · {formatTime(item.created_at)}
                </Text>
                {canWrite && (
                    <View style={styles.cardActions}>
                        <TouchableOpacity style={styles.actionBtn} onPress={() => handleEdit(item)}>
                            <CompassIcon name='pencil-outline' size={16} color={theme.buttonBg}/>
                            <Text style={[styles.actionBtnText, {color: theme.buttonBg}]}>
                                {intl.formatMessage({id: 'announcement.edit', defaultMessage: '编辑'})}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.actionBtn} onPress={() => handleDelete(item)}>
                            <CompassIcon name='trash-can-outline' size={16} color={theme.errorTextColor}/>
                            <Text style={[styles.actionBtnText, {color: theme.errorTextColor}]}>
                                {intl.formatMessage({id: 'announcement.delete', defaultMessage: '删除'})}
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}
            </TouchableOpacity>
        );
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.container} edges={['bottom']}>
                <View style={styles.header}>
                    <TouchableOpacity style={styles.backButton} onPress={() => dismissModal({componentId})}>
                        <CompassIcon name='arrow-left' size={24} color={theme.sidebarText}/>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>
                        {intl.formatMessage({id: 'announcement.title', defaultMessage: '公司动态'})}
                    </Text>
                </View>
                <View style={styles.loading}>
                    <ActivityIndicator size='large' color={theme.centerChannelColor}/>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={() => dismissModal({componentId})}>
                    <CompassIcon name='arrow-left' size={24} color={theme.sidebarText}/>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>
                    {intl.formatMessage({id: 'announcement.title', defaultMessage: '公司动态'})}
                </Text>
                {canWrite && (
                    <TouchableOpacity style={styles.publishBtn} onPress={handlePublish}>
                        <CompassIcon name='plus' size={16} color={theme.buttonColor}/>
                        <Text style={styles.publishBtnText}>
                            {intl.formatMessage({id: 'announcement.publish', defaultMessage: '发布'})}
                        </Text>
                    </TouchableOpacity>
                )}
            </View>
            {announcements.length === 0 ? (
                <View style={styles.empty}>
                    <CompassIcon
                        name='bullhorn-outline'
                        size={48}
                        color={changeOpacity(theme.centerChannelColor, 0.32)}
                        style={styles.emptyIcon}
                    />
                    <Text style={styles.emptyText}>
                        {intl.formatMessage({id: 'announcement.empty', defaultMessage: '暂无公告'})}
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={announcements}
                    renderItem={renderCard}
                    keyExtractor={(item) => item.id}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{paddingBottom: 20}}
                />
            )}
        </SafeAreaView>
    );
};

export default AnnouncementListScreen;
