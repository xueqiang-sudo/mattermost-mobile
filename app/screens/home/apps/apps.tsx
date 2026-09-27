// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useIsFocused, useNavigation} from '@react-navigation/native';
import {type StackNavigationProp} from '@react-navigation/stack';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Freeze} from 'react-freeze';
import {useIntl} from 'react-intl';
import {Dimensions, ScrollView, Text, TouchableOpacity, View} from 'react-native';
import Animated, {useAnimatedStyle, withTiming} from 'react-native-reanimated';
import {type Edge, SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';

import {fetchTeamById} from '@actions/remote/team';
import CompassIcon from '@components/compass_icon';
import Loading from '@components/loading';
import {Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {useOnComponentWillAppear} from '@hooks/use_on_component_will_appear';
import {goToScreen} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import {type AppsStackParamList} from './apps_stack_param_list';
import {APPS, getDashboardAccess, type AppDef, type DashboardAccess} from './api';

import type TeamModel from '@typings/database/models/servers/team';
import type UserModel from '@typings/database/models/servers/user';

const edges: Edge[] = ['bottom', 'left', 'right'];

type Props = {
    currentUser?: UserModel;
    currentTeam?: TeamModel;
    rnnHomeComponentId?: string;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    flex: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 2,
        backgroundColor: theme.sidebarBg,
        flexShrink: 0,
    },
    headerTitle: {
        ...typography('Heading', 200, 'SemiBold'),
        color: theme.sidebarText,
        textAlign: 'center',
    },
    scrollContent: {
        flexGrow: 1,
        paddingBottom: 32,
    },
    gridContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: 12,
        paddingTop: 16,
    },
    appCard: {
        width: (Dimensions.get('window').width - 48) / 3,
        alignItems: 'center',
        paddingVertical: 16,
        marginBottom: 8,
    },
    appIconContainer: {
        width: 56,
        height: 56,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
    appLabel: {
        ...typography('Body', 75),
        color: theme.centerChannelColor,
        textAlign: 'center',
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
        paddingTop: 64,
    },
    emptyText: {
        ...typography('Body', 200),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        textAlign: 'center',
        marginTop: 16,
    },
}));

const ICON_COLORS: Record<string, string> = {
    fire: '#FF6B35',
    'check-circle-outline': '#4CAF50',
    'credit-card-outline': '#2196F3',
    'chart-line': '#FF9800',
    'archive-outline': '#795548',
    'forum-outline': '#9C27B0',
    'file-excel-outline': '#4CAF50',
    'folder-outline': '#2196F3',
    'book-outline': '#FF5722',
    'notebook-outline': '#607D8B',
};

const AppsScreen = ({currentUser, currentTeam, rnnHomeComponentId}: Props) => {
    const theme = useTheme();
    const intl = useIntl();
    const insets = useSafeAreaInsets();
    const serverUrl = useServerUrl();
    const isFocused = useIsFocused();
    const isFocusedRef = useRef(isFocused);
    isFocusedRef.current = isFocused;

    const [dashboardAccess, setDashboardAccess] = useState<DashboardAccess | null>(null);
    const [loading, setLoading] = useState(true);
    const [homeReappearTick, setHomeReappearTick] = useState(0);

    const currentTeamId = useMemo(() => currentTeam?.id, [currentTeam]);
    const isErpTeam = useMemo(() => Boolean((currentTeam as any)?.erp_address), [currentTeam]);
    const conversationsEnabled = useMemo(() => (currentTeam as any)?.conversations_enabled === true, [currentTeam]);

    const styles = getStyleSheet(theme);

    const bumpHomeReappearTick = useCallback(() => {
        if (!isFocusedRef.current) {
            return;
        }
        setHomeReappearTick((t) => t + 1);
    }, []);
    useOnComponentWillAppear(rnnHomeComponentId, bumpHomeReappearTick);

    const loadDashboardAccess = useCallback(async () => {
        if (!serverUrl || !currentTeamId) {
            return;
        }
        setLoading(true);
        try {
            const access = await getDashboardAccess(serverUrl, currentTeamId);
            setDashboardAccess(access);
        } catch {
            setDashboardAccess(null);
        } finally {
            setLoading(false);
        }
    }, [currentTeamId, serverUrl]);

    useEffect(() => {
        loadDashboardAccess();
    }, [loadDashboardAccess, homeReappearTick]);

    const visibleApps = useMemo(() => {
        if (!dashboardAccess) {
            return [];
        }

        const allowedTabs = new Set(dashboardAccess.tabs || []);

        return APPS.filter((app) => {
            // Non-ERP teams: hide erpOnly apps
            if (app.erpOnly && !isErpTeam) {
                return false;
            }
            // Team-level gate: conversations
            if (app.key === 'conversations' && !conversationsEnabled) {
                return false;
            }
            // Apps with noPermission are always visible
            if (app.noPermission) {
                return true;
            }
            // All other apps require explicit permission
            return allowedTabs.has(app.key);
        });
    }, [dashboardAccess, isErpTeam, conversationsEnabled]);

    const handleAppPress = useCallback((app: AppDef) => {
        const title = intl.formatMessage({id: app.labelId, defaultMessage: app.defaultLabel});
        goToScreen(Screens.APPS_WEBVIEW, title, {
            appKey: app.key,
            title: app.defaultLabel,
        });
    }, [intl]);

    const animated = useAnimatedStyle(() => ({
        opacity: withTiming(1, {duration: 150}),
        transform: [{translateX: withTiming(0, {duration: 150})}],
    }), []);

    if (loading) {
        return (
            <Freeze freeze={!isFocused}>
                <SafeAreaView
                    edges={edges}
                    style={[styles.flex, {backgroundColor: theme.sidebarBg}]}
                    testID='apps.screen'
                >
                    <View style={[styles.header, {position: 'relative', minHeight: 48, justifyContent: 'center', paddingTop: insets.top}]}>
                        <Text style={styles.headerTitle}>
                            {intl.formatMessage({id: 'tab_bar.apps.label', defaultMessage: '应用'})}
                        </Text>
                    </View>
                    <View style={styles.loadingContainer}>
                        <Loading color={theme.centerChannelColor} size='large'/>
                    </View>
                </SafeAreaView>
            </Freeze>
        );
    }

    return (
        <Freeze freeze={!isFocused}>
            <SafeAreaView
                edges={edges}
                style={[styles.flex, {backgroundColor: theme.sidebarBg}]}
                testID='apps.screen'
            >
                <Animated.View style={[styles.flex, animated]}>
                    <View style={styles.flex}>
                        <View
                            style={[styles.header, {position: 'relative', minHeight: 48, justifyContent: 'center', paddingTop: insets.top}]}
                        >
                            <Text
                                style={styles.headerTitle}
                                testID='apps.header.title'
                            >
                                {intl.formatMessage({id: 'tab_bar.apps.label', defaultMessage: '应用'})}
                            </Text>
                        </View>
                        <ScrollView
                            style={[styles.flex, {backgroundColor: theme.centerChannelBg}]}
                            contentContainerStyle={[styles.scrollContent, {paddingBottom: 24}]}
                            showsVerticalScrollIndicator={false}
                        >
                            {visibleApps.length === 0 ? (
                                <View style={styles.emptyContainer}>
                                    <CompassIcon
                                        name='application-outline'
                                        size={64}
                                        color={changeOpacity(theme.centerChannelColor, 0.32)}
                                    />
                                    <Text style={styles.emptyText}>
                                        {intl.formatMessage({id: 'apps.empty', defaultMessage: '暂无可用应用'})}
                                    </Text>
                                </View>
                            ) : (
                                <View style={styles.gridContainer}>
                                    {visibleApps.map((app) => (
                                        <TouchableOpacity
                                            key={app.key}
                                            style={styles.appCard}
                                            onPress={() => handleAppPress(app)}
                                            activeOpacity={0.7}
                                            testID={`apps.${app.key}`}
                                        >
                                            <View
                                                style={[
                                                    styles.appIconContainer,
                                                    {backgroundColor: changeOpacity(ICON_COLORS[app.iconName] || theme.buttonBg, 0.12)},
                                                ]}
                                            >
                                                <CompassIcon
                                                    name={app.iconName}
                                                    size={28}
                                                    color={ICON_COLORS[app.iconName] || theme.buttonBg}
                                                />
                                            </View>
                                            <Text style={styles.appLabel}>
                                                {intl.formatMessage({id: app.labelId, defaultMessage: app.defaultLabel})}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}
                        </ScrollView>
                    </View>
                </Animated.View>
            </SafeAreaView>
        </Freeze>
    );
};

export default AppsScreen;
