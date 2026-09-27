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
import {usePreventDoubleTap} from '@hooks/utils';
import {goToScreen, popTopScreen} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {AvailableScreens} from '@typings/screens/navigation';

type Props = {
    componentId: AvailableScreens;
};

export type RoleInfo = {
    id: string;
    name: string;
    display_name: string;
    description: string;
    permissions: string[];
    scheme_managed: boolean;
    built_in: boolean;
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
    },
    cardTitle: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.centerChannelColor,
        marginBottom: 4,
    },
    cardDescription: {
        ...typography('Body', 100),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginBottom: 4,
    },
    cardMeta: {
        ...typography('Body', 50),
        color: changeOpacity(theme.centerChannelColor, 0.56),
    },
    badge: {
        display: 'inline-block',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        backgroundColor: changeOpacity(theme.linkColor, 0.15),
        marginRight: 4,
    },
    badgeText: {
        ...typography('Body', 50, 'SemiBold'),
        color: theme.linkColor,
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

const RoleListScreen = ({componentId}: Props) => {
    const theme = useTheme();
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const styles = getStyleSheet(theme);

    const [roles, setRoles] = useState<RoleInfo[]>([]);
    const [loading, setLoading] = useState(true);

    const handleBack = useCallback(() => {
        popTopScreen(componentId);
    }, [componentId]);

    const loadRoles = useCallback(async () => {
        setLoading(true);
        try {
            const {default: NetworkManager} = await import('@managers/network_manager');
            const client = NetworkManager.getClient(serverUrl);
            const data = await client.doFetch('/roles', {method: 'get'});
            setRoles(data || []);
        } catch {
            setRoles([]);
        } finally {
            setLoading(false);
        }
    }, [serverUrl]);

    useEffect(() => {
        loadRoles();
    }, [loadRoles]);

    const handleRolePress = usePreventDoubleTap(useCallback((role: RoleInfo) => {
        const title = intl.formatMessage({id: 'role_management.detail_title', defaultMessage: 'Role Detail'});
        goToScreen('RoleDetail', title, {role});
    }, [intl]));

    const renderRole = ({item}: {item: RoleInfo}) => (
        <TouchableOpacity
            style={styles.card}
            onPress={() => handleRolePress(item)}
            activeOpacity={0.7}
        >
            <Text style={styles.cardTitle}>{item.display_name || item.name}</Text>
            {item.description && (
                <Text style={styles.cardDescription} numberOfLines={2}>{item.description}</Text>
            )}
            <View style={{flexDirection: 'row', flexWrap: 'wrap', marginTop: 4}}>
                {item.built_in && (
                    <View style={styles.badge}>
                        <Text style={styles.badgeText}>Built-in</Text>
                    </View>
                )}
                {item.scheme_managed && (
                    <View style={styles.badge}>
                        <Text style={styles.badgeText}>Scheme managed</Text>
                    </View>
                )}
                <Text style={styles.cardMeta}>
                    {item.permissions.length} permissions
                </Text>
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
                        {intl.formatMessage({id: 'role_management.title', defaultMessage: 'Role Management'})}
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
        <SafeAreaView style={styles.flex} testID='role_management.list'>
            <View style={styles.header}>
                <TouchableOpacity style={styles.headerButton} onPress={handleBack}>
                    <CompassIcon name='arrow-left' size={24} color={theme.centerChannelColor}/>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>
                    {intl.formatMessage({id: 'role_management.title', defaultMessage: 'Role Management'})}
                </Text>
                <View style={{width: 40}}/>
            </View>

            {roles.length === 0 ? (
                <View style={styles.emptyState}>
                    <CompassIcon name='shield-account' size={48} color={changeOpacity(theme.centerChannelColor, 0.32)}/>
                    <Text style={styles.emptyText}>
                        {intl.formatMessage({id: 'role_management.empty', defaultMessage: 'No roles available'})}
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={roles}
                    keyExtractor={(item) => item.id}
                    renderItem={renderRole}
                    contentContainerStyle={styles.listContent}
                />
            )}
        </SafeAreaView>
    );
};

export default RoleListScreen;
