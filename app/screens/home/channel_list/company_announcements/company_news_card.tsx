// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {Text, TouchableOpacity, View} from 'react-native';

import CompassIcon from '@components/compass_icon';
import {Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import DatabaseManager from '@database/manager';
import {getCurrentTeamId} from '@queries/servers/system';
import {showModal} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import {getDashboardAccess} from '../../apps/api';
import {fetchAnnouncements} from './announcement_api';
import type {Announcement} from './types';

type Props = {
    componentId?: string;
};

const getStyles = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        marginHorizontal: 16,
        marginTop: 8,
        marginBottom: 12,
        backgroundColor: changeOpacity(theme.buttonBg, 0.08),
        borderRadius: 12,
        padding: 14,
        borderWidth: 1,
        borderColor: changeOpacity(theme.buttonBg, 0.16),
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    icon: {
        marginRight: 6,
    },
    title: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.buttonBg,
        flex: 1,
    },
    badge: {
        backgroundColor: theme.buttonBg,
        borderRadius: 10,
        paddingHorizontal: 8,
        paddingVertical: 2,
    },
    badgeText: {
        ...typography('Body', 50, 'SemiBold'),
        color: theme.buttonColor,
    },
    latestItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    pinIcon: {
        marginRight: 4,
        marginTop: 2,
    },
    latestTitle: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.centerChannelColor,
        flex: 1,
    },
    latestMeta: {
        ...typography('Body', 50, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginTop: 4,
    },
}));

function formatTime(ts: number): string {
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

const CompanyNewsCard = ({componentId}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const styles = getStyles(theme);

    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [canWrite, setCanWrite] = useState(false);

    const loadData = useCallback(async () => {
        try {
            const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
            const teamId = await getCurrentTeamId(database);
            if (!teamId) {return;}

            // Load announcements
            const data = await fetchAnnouncements(serverUrl, teamId);
            setAnnouncements(data);

            // Check write permission
            const access = await getDashboardAccess(serverUrl, teamId);
            setCanWrite(access?.announcement_write === true);
        } catch {
            // ignore
        }
    }, [serverUrl]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handlePress = useCallback(() => {
        showModal(Screens.ANNOUNCEMENT_LIST, intl.formatMessage({id: 'announcement.title', defaultMessage: '公司动态'}), {canWrite});
    }, [intl, canWrite]);

    if (announcements.length === 0) {
        return null;
    }

    // Get pinned announcement or the latest one
    const pinnedItem = announcements.find((a) => a.is_pinned);
    const latestItem = pinnedItem || announcements[0];
    const unreadCount = announcements.length;

    return (
        <TouchableOpacity style={styles.container} onPress={handlePress} activeOpacity={0.7}>
            <View style={styles.header}>
                <CompassIcon
                    name='bullhorn-outline'
                    size={18}
                    color={theme.buttonBg}
                    style={styles.icon}
                />
                <Text style={styles.title}>
                    {intl.formatMessage({id: 'announcement.title', defaultMessage: '公司动态'})}
                </Text>
                {unreadCount > 0 && (
                    <View style={styles.badge}>
                        <Text style={styles.badgeText}>
                            {intl.formatMessage({id: 'announcement.new_count', defaultMessage: '{count}条新公告'}, {count: unreadCount})}
                        </Text>
                    </View>
                )}
            </View>
            <View style={styles.latestItem}>
                {latestItem.is_pinned && (
                    <CompassIcon
                        name='pin-outline'
                        size={14}
                        color={theme.errorTextColor}
                        style={styles.pinIcon}
                    />
                )}
                <Text style={styles.latestTitle} numberOfLines={1}>
                    {latestItem.title}
                </Text>
            </View>
            <Text style={styles.latestMeta}>
                {latestItem.author_name} · {formatTime(latestItem.created_at)}
            </Text>
        </TouchableOpacity>
    );
};

export default CompanyNewsCard;
