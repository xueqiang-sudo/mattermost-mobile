// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';
import {useIntl} from 'react-intl';
import {Alert, ScrollView, Text, TouchableOpacity, View} from 'react-native';
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

import {deleteAnnouncement} from './announcement_api';
import type {Announcement} from './types';

type Props = {
    componentId: string;
    announcement: Announcement;
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
    headerActions: {
        flexDirection: 'row',
        gap: 16,
    },
    actionBtn: {
        padding: 4,
    },
    content: {
        flex: 1,
        padding: 16,
    },
    badges: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        gap: 8,
    },
    pinBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: changeOpacity(theme.errorTextColor, 0.12),
        borderRadius: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    pinBadgeText: {
        ...typography('Body', 75, 'SemiBold'),
        color: theme.errorTextColor,
        marginLeft: 4,
    },
    priorityBadge: {
        borderRadius: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    priorityBadgeText: {
        ...typography('Body', 75, 'SemiBold'),
        color: '#fff',
    },
    title: {
        ...typography('Heading', 300, 'SemiBold'),
        color: theme.centerChannelColor,
        marginBottom: 12,
    },
    meta: {
        ...typography('Body', 75, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginBottom: 20,
    },
    divider: {
        height: 1,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
        marginBottom: 20,
    },
    body: {
        ...typography('Body', 200, 'Regular'),
        color: theme.centerChannelColor,
        lineHeight: 24,
    },
}));

const PRIORITY_COLORS: Record<string, string> = {
    normal: '#6B7280',
    important: '#F59E0B',
    urgent: '#EF4444',
};

function formatDateTime(ts: number): string {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const AnnouncementDetailScreen = ({componentId, announcement, canWrite}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const styles = getStyles(theme);

    const handleEdit = useCallback(() => {
        showModal(Screens.ANNOUNCEMENT_FORM, intl.formatMessage({id: 'announcement.edit', defaultMessage: '编辑公告'}), {mode: 'edit', announcement, componentId});
    }, [intl, announcement, componentId]);

    const handleDelete = useCallback(() => {
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
                            await deleteAnnouncement(serverUrl, teamId, announcement.id);
                            dismissModal({componentId});
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
    }, [serverUrl, intl, announcement.id, componentId]);

    const priorityColor = PRIORITY_COLORS[announcement.priority] || PRIORITY_COLORS.normal;
    const priorityLabel = intl.formatMessage({
        id: `announcement.priority.${announcement.priority}`,
        defaultMessage: announcement.priority === 'normal' ? '普通' : announcement.priority === 'important' ? '重要' : '紧急',
    });

    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={() => dismissModal({componentId})}>
                    <CompassIcon name='arrow-left' size={24} color={theme.sidebarText}/>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>
                    {intl.formatMessage({id: 'announcement.detail', defaultMessage: '公告详情'})}
                </Text>
                {canWrite && (
                    <View style={styles.headerActions}>
                        <TouchableOpacity style={styles.actionBtn} onPress={handleEdit}>
                            <CompassIcon name='pencil-outline' size={22} color={theme.sidebarText}/>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.actionBtn} onPress={handleDelete}>
                            <CompassIcon name='trash-can-outline' size={22} color={theme.sidebarText}/>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                <View style={styles.badges}>
                    {announcement.is_pinned && (
                        <View style={styles.pinBadge}>
                            <CompassIcon name='pin-outline' size={14} color={theme.errorTextColor}/>
                            <Text style={styles.pinBadgeText}>
                                {intl.formatMessage({id: 'announcement.pinned', defaultMessage: '置顶'})}
                            </Text>
                        </View>
                    )}
                    {announcement.priority !== 'normal' && (
                        <View style={[styles.priorityBadge, {backgroundColor: priorityColor}]}>
                            <Text style={styles.priorityBadgeText}>{priorityLabel}</Text>
                        </View>
                    )}
                </View>
                <Text style={styles.title}>{announcement.title}</Text>
                <Text style={styles.meta}>
                    {announcement.author_name} · {formatDateTime(announcement.created_at)}
                </Text>
                <View style={styles.divider}/>
                <Text style={styles.body}>{announcement.content}</Text>
            </ScrollView>
        </SafeAreaView>
    );
};

export default AnnouncementDetailScreen;
