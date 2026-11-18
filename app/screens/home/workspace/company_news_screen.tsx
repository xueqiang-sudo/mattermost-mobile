// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {ActivityIndicator, FlatList, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Q} from '@nozbe/watermelondb';

import CompassIcon from '@components/compass_icon';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import DatabaseManager from '@database/manager';
import ChannelInfoModel from '@typings/database/models/servers/channel_info';
import ChannelModel from '@typings/database/models/servers/channel';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

type Announcement = {
    channelId: string;
    channelName: string;
    header: string;
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
        paddingTop: 12,
        paddingBottom: 8,
    },
    headerTitle: {
        color: theme.centerChannelColor,
        ...typography('Heading', 600, 'SemiBold'),
        marginLeft: 12,
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
    channelName: {
        color: theme.buttonBg,
        ...typography('Body', 100, 'SemiBold'),
        marginBottom: 8,
        flexDirection: 'row',
        alignItems: 'center',
    },
    channelIcon: {
        marginRight: 4,
    },
    headerText: {
        color: theme.centerChannelColor,
        ...typography('Body', 200, 'Regular'),
        lineHeight: 22,
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

const CompanyNewsScreen = () => {
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

            // Query channels that have a non-empty header (announcement)
            // Only include open channels and private channels the user is a member of
            const channelInfos = await database.get<ChannelInfoModel>('ChannelInfo').query(
                Q.where('header', Q.notEq('')),
            ).fetch();

            if (channelInfos.length === 0) {
                setAnnouncements([]);
                setLoading(false);
                return;
            }

            // Get channel details for each
            const channelIds = channelInfos.map((ci) => ci.id);
            const channels = await database.get<ChannelModel>('Channel').query(
                Q.where('id', Q.oneOf(channelIds)),
            ).fetch();

            const channelMap = new Map(channels.map((ch) => [ch.id, ch]));

            const items: Announcement[] = [];
            for (const ci of channelInfos) {
                const channel = channelMap.get(ci.id);
                if (channel) {
                    items.push({
                        channelId: ci.id,
                        channelName: channel.displayName || channel.name || '',
                        header: ci.header || '',
                    });
                }
            }

            setAnnouncements(items);
        } catch (e) {
            setAnnouncements([]);
        } finally {
            setLoading(false);
        }
    }, [serverUrl]);

    useEffect(() => {
        loadAnnouncements();
    }, [loadAnnouncements]);

    const renderItem = ({item}: {item: Announcement}) => (
        <View style={styles.card}>
            <View style={styles.channelName}>
                <CompassIcon
                    name='bullhorn-outline'
                    size={16}
                    color={theme.buttonBg}
                    style={styles.channelIcon}
                />
                <Text style={styles.channelName}>{item.channelName}</Text>
            </View>
            <Text style={styles.headerText} numberOfLines={6}>
                {item.header}
            </Text>
        </View>
    );

    if (loading) {
        return (
            <SafeAreaView style={styles.container} edges={['top']}>
                <View style={styles.loading}>
                    <ActivityIndicator size='large' color={theme.buttonBg}/>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['top']} testID='company_news.screen'>
            <View style={styles.header}>
                <CompassIcon name='bullhorn-outline' size={24} color={theme.centerChannelColor}/>
                <Text style={styles.headerTitle}>
                    {intl.formatMessage({id: 'workspace.news.title', defaultMessage: '公司动态'})}
                </Text>
            </View>
            {announcements.length === 0 ? (
                <View style={styles.empty}>
                    <CompassIcon name='bullhorn-outline' size={48} color={changeOpacity(theme.centerChannelColor, 0.32)}/>
                    <Text style={styles.emptyText}>
                        {intl.formatMessage({id: 'workspace.news.empty', defaultMessage: '暂无公司动态'})}
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={announcements}
                    renderItem={renderItem}
                    keyExtractor={(item) => item.channelId}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{paddingBottom: 20}}
                />
            )}
        </SafeAreaView>
    );
};

export default CompanyNewsScreen;
