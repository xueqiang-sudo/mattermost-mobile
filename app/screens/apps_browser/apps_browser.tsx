// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    FlatList,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import Loading from '@components/loading';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {popTopScreen} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {AvailableScreens} from '@typings/screens/navigation';

type Props = {
    componentId: AvailableScreens;
    channelId: string;
    teamId: string;
};

type AppInfo = {
    app_id: string;
    display_name: string;
    description: string;
    icon_url?: string;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    flex: {flex: 1},
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    headerButton: {padding: 8},
    headerTitle: {
        ...typography('Heading', 400, 'SemiBold'),
        color: theme.centerChannelColor,
        flex: 1,
        textAlign: 'center',
        marginRight: 40,
    },
    listContent: {padding: 16},
    card: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderRadius: 8,
        padding: 12,
        marginBottom: 12,
        flexDirection: 'row',
        alignItems: 'center',
    },
    iconContainer: {
        width: 48,
        height: 48,
        borderRadius: 8,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    cardContent: {
        flex: 1,
    },
    cardTitle: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.centerChannelColor,
        marginBottom: 4,
    },
    cardDescription: {
        ...typography('Body', 100),
        color: changeOpacity(theme.centerChannelColor, 0.56),
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 48,
    },
    emptyText: {
        ...typography('Body', 100),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginTop: 12,
    },
    loadingContainer: {
        paddingVertical: 24,
        alignItems: 'center',
    },
}));

const AppsBrowserScreen = ({componentId, channelId, teamId}: Props) => {
    const theme = useTheme();
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const styles = getStyleSheet(theme);

    const [apps, setApps] = useState<AppInfo[]>([]);
    const [loading, setLoading] = useState(true);

    const handleBack = useCallback(() => {
        popTopScreen(componentId);
    }, [componentId]);

    const loadApps = useCallback(async () => {
        setLoading(true);
        try {
            const {default: NetworkManager} = await import('@managers/network_manager');
            const client = NetworkManager.getClient(serverUrl);
            // Fetch available apps/integrations for this channel
            const data = await client.doFetch(`/apps/bindings?channel_id=${channelId}&team_id=${teamId}`, {method: 'get'});
            setApps(data || []);
        } catch {
            setApps([]);
        } finally {
            setLoading(false);
        }
    }, [channelId, serverUrl, teamId]);

    useEffect(() => {
        loadApps();
    }, [loadApps]);

    const handleAppPress = useCallback((app: AppInfo) => {
        // TODO: Open app modal or trigger app action
        console.log('App pressed:', app.app_id);
    }, []);

    const renderApp = ({item}: {item: AppInfo}) => (
        <TouchableOpacity
            style={styles.card}
            onPress={() => handleAppPress(item)}
            activeOpacity={0.7}
        >
            <View style={styles.iconContainer}>
                <CompassIcon name='application' size={24} color={theme.centerChannelColor}/>
            </View>
            <View style={styles.cardContent}>
                <Text style={styles.cardTitle}>{item.display_name}</Text>
                {item.description && (
                    <Text style={styles.cardDescription} numberOfLines={2}>{item.description}</Text>
                )}
            </View>
        </TouchableOpacity>
    );

    if (loading) {
        return (
            <SafeAreaView style={styles.flex}>
                <View style={styles.header}>
                    <TouchableOpacity style={styles.headerButton} onPress={handleBack}>
                        <CompassIcon name='arrow-left' size={24} color={theme.centerChannelColor}/>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>
                        {intl.formatMessage({id: 'apps_browser.title', defaultMessage: 'Apps'})}
                    </Text>
                    <View style={{width: 40}}/>
                </View>
                <View style={styles.loadingContainer}>
                    <Loading color={theme.centerChannelColor} size='small'/>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.flex} testID='apps_browser.screen'>
            <View style={styles.header}>
                <TouchableOpacity style={styles.headerButton} onPress={handleBack}>
                    <CompassIcon name='arrow-left' size={24} color={theme.centerChannelColor}/>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>
                    {intl.formatMessage({id: 'apps_browser.title', defaultMessage: 'Apps'})}
                </Text>
                <View style={{width: 40}}/>
            </View>

            {apps.length === 0 ? (
                <View style={styles.emptyState}>
                    <CompassIcon name='application-outline' size={48} color={changeOpacity(theme.centerChannelColor, 0.32)}/>
                    <Text style={styles.emptyText}>
                        {intl.formatMessage({id: 'apps_browser.empty', defaultMessage: 'No apps available for this channel'})}
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={apps}
                    keyExtractor={(item) => item.app_id}
                    renderItem={renderApp}
                    contentContainerStyle={styles.listContent}
                />
            )}
        </SafeAreaView>
    );
};

export default AppsBrowserScreen;
