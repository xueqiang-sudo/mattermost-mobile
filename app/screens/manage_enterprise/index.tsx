// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useDatabase, withDatabase, withObservables} from '@nozbe/watermelondb/react';
import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {Alert, DeviceEventEmitter, RefreshControl, ScrollView, Text, TouchableOpacity, View} from 'react-native';
import {type Edge, SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';

import {getTeamById, queryMyTeams} from '@queries/servers/team';
import AdaptiveTitleText from '@components/adaptive_title_text';
import CompassIcon from '@components/compass_icon';
import Loading from '@components/loading';
import {Events, Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {usePreventDoubleTap} from '@hooks/utils';
import {observeCurrentTeamId} from '@queries/servers/system';
import {observeCurrentUser} from '@queries/servers/user';
import {dismissModal, goToScreen, showModalWithBackButton} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {ManageEnterpriseEntry} from './types';

import type {WithDatabaseArgs} from '@typings/database/database';
import type UserModel from '@typings/database/models/servers/user';

type Props = {
    currentUser?: UserModel;
    currentTeamId?: string;
};

const edges: Edge[] = ['left', 'right'];

/**
 * 是否在企业列表中显示来源标签（当前统一为 Mattermost）。
 * 默认 false 不显示，方便正式环境保持界面简洁。
 * 设为 true 便于测试时观察标记位是否生效。
 */
const SHOW_ENTERPRISE_SOURCE_LABEL = false;
const CLOSE_CREATE_TEAM = 'close-manage-enterprise-create';
const CLOSE_JOIN_TEAM_QR = 'close-manage-enterprise-join';

const AVATAR_COLORS = [
    '#5D7A8C', '#6B8E6B', '#8B7355', '#7B68A0', '#A0525D',
    '#4682B4', '#2E8B57', '#CD853F', '#6A5ACD', '#DC143C',
];

function getEnterpriseAvatarStyle(displayName: string) {
    const hash = (displayName || '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const color = AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
    return {backgroundColor: changeOpacity(color, 0.92)};
}

function getSourceLabel(
    _entry: ManageEnterpriseEntry,
    formatMessage: (descriptor: {id: string; defaultMessage: string}) => string,
): string {
    return formatMessage({id: 'enterprise.manage.source.mm_only', defaultMessage: 'Mattermost enterprise only'});
}

function getEnterpriseInitials(displayName: string): string {
    const trimmed = (displayName || '').trim();
    if (!trimmed) {
        return '?';
    }
    const isCJK = /[\u4e00-\u9fff\u3400-\u4dbf]/.test(trimmed);
    if (isCJK) {
        return trimmed.slice(0, 2);
    }
    const segments = trimmed.split(/\s+/);
    if (segments.length >= 2) {
        return (segments[0][0] + segments[1][0]).toUpperCase().slice(0, 2);
    }
    return trimmed.slice(0, 2).toUpperCase();
}

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    flex: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: 16,
        paddingBottom: 24,
    },
    header: {
        paddingTop: 12,
        paddingBottom: 8,
    },
    headerTitle: {
        ...typography('Heading', 400, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    headerSubtitle: {
        marginTop: 2,
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.64),
    },
    actionsRow: {
        flexDirection: 'row',
        marginTop: 16,
        marginBottom: 8,
        gap: 8,
    },
    primaryAction: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        borderRadius: 8,
        backgroundColor: theme.buttonBg,
    },
    primaryActionText: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.buttonColor,
        marginLeft: 4,
    },
    secondaryAction: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        borderRadius: 8,
        backgroundColor: changeOpacity(theme.buttonBg, 0.08),
    },
    secondaryActionText: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.buttonBg,
        marginLeft: 4,
    },
    sectionTitle: {
        marginTop: 16,
        marginBottom: 8,
        ...typography('Body', 75, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.64),
    },
    card: {
        borderRadius: 12,
        backgroundColor: theme.centerChannelBg,
        overflow: 'hidden',
    },
    companyRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    companyAvatar: {
        width: 40,
        height: 40,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    companyAvatarText: {
        color: '#FFFFFF',
        ...typography('Heading', 300, 'SemiBold'),
    },
    companyNameBlock: {
        flex: 1,
        minWidth: 0,
        marginRight: 8,
        justifyContent: 'center',
    },
    companyName: {
        ...typography('Body', 200),
        color: theme.centerChannelColor,
    },
    companySource: {
        marginTop: 2,
        ...typography('Body', 50),
        color: changeOpacity(theme.centerChannelColor, 0.56),
    },
    companyMeta: {
        marginLeft: 8,
    },
    currentBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
        backgroundColor: changeOpacity(theme.linkColor, 0.15),
    },
    currentBadgeText: {
        ...typography('Body', 50, 'SemiBold'),
        color: theme.linkColor,
    },
    divider: {
        height: 1,
        marginLeft: 16,
        marginRight: 16,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    empty: {
        paddingHorizontal: 16,
        paddingVertical: 16,
    },
    emptyText: {
        ...typography('Body', 100),
        color: changeOpacity(theme.centerChannelColor, 0.64),
    },
    loadingRow: {
        paddingHorizontal: 16,
        paddingVertical: 20,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
}));

const ManageEnterpriseScreen = ({currentUser, currentTeamId}: Props) => {
    const database = useDatabase();
    const theme = useTheme();
    const intl = useIntl();
    const insets = useSafeAreaInsets();
    const serverUrl = useServerUrl();
    const styles = getStyleSheet(theme);

    const [entries, setEntries] = useState<ManageEnterpriseEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<unknown>();

    const employeeId = currentUser?.id;

    const loadCompanies = useCallback(async (opts?: {isRefresh?: boolean}): Promise<ManageEnterpriseEntry[]> => {
        if (!employeeId) {
            return [];
        }
        if (opts?.isRefresh) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }
        setError(undefined);
        let newEntries: ManageEnterpriseEntry[] = [];
        try {
            const myTeams = await queryMyTeams(database).fetch();
            for (const mt of myTeams) {
                const team = await getTeamById(database, mt.id);
                if (team) {
                    newEntries.push({
                        id: team.id,
                        name: team.displayName || team.name,
                    });
                }
            }
            setError(undefined);
            setEntries(newEntries);
        } catch (e) {
            setError(e);
            newEntries = [];
            setEntries([]);
        }
        if (opts?.isRefresh) {
            setRefreshing(false);
        } else {
            setLoading(false);
        }
        return newEntries;
    }, [database, employeeId]);

    useEffect(() => {
        loadCompanies();
    }, [loadCompanies]);

    useEffect(() => {
        const listener = DeviceEventEmitter.addListener(Events.MANAGE_ENTERPRISE_REFRESH, async () => {
            const entries = await loadCompanies({isRefresh: true});
            if (entries.length === 0) {
                dismissModal();
            }
        });
        return () => listener.remove();
    }, [loadCompanies]);

    const handleCreateEnterprise = usePreventDoubleTap(useCallback(async () => {
        if (!employeeId || !serverUrl) {
            Alert.alert(
                intl.formatMessage({id: 'enterprise.manage.loading_user', defaultMessage: 'Loading user'}),
                intl.formatMessage({id: 'enterprise.manage.please_wait', defaultMessage: 'Please wait a moment and try again.'}),
            );
            return;
        }
        showModalWithBackButton(
            Screens.CREATE_TEAM,
            intl.formatMessage({id: 'create_team.title', defaultMessage: 'Create Enterprise'}),
            CLOSE_CREATE_TEAM,
            {
                serverUrl,
                nickname: currentUser?.nickname || '',
                userId: employeeId,
            },
        );
    }, [employeeId, intl, serverUrl, currentUser?.nickname]));

    const handleJoinEnterprise = usePreventDoubleTap(useCallback(async () => {
        if (!employeeId || !serverUrl) {
            Alert.alert(
                intl.formatMessage({id: 'enterprise.manage.loading_user', defaultMessage: 'Loading user'}),
                intl.formatMessage({id: 'enterprise.manage.please_wait', defaultMessage: 'Please wait a moment and try again.'}),
            );
            return;
        }
        showModalWithBackButton(
            Screens.JOIN_TEAM_QR,
            intl.formatMessage({id: 'join_team_qr.title', defaultMessage: 'Join Enterprise'}),
            CLOSE_JOIN_TEAM_QR,
            {
                serverUrl,
                nickname: currentUser?.nickname || '',
                userId: employeeId,
            },
        );
    }, [employeeId, intl, serverUrl, currentUser?.nickname]));

    const handleCompanyPress = usePreventDoubleTap(useCallback((entry: ManageEnterpriseEntry) => {
        const title = intl.formatMessage({id: 'enterprise.detail.title', defaultMessage: 'Enterprise information'});
        goToScreen(Screens.MANAGE_ENTERPRISE_DETAIL, title, {
            companyId: entry.id,
            companyName: entry.name,
            isCurrentTeam: entry.id === currentTeamId,
        });
    }, [intl, currentTeamId]));

    const renderCompanies = () => {
        if (loading && !entries.length) {
            return (
                <View style={styles.loadingRow}>
                    <Loading
                        color={theme.centerChannelColor}
                        size='small'
                    />
                    <Text style={styles.companyMeta}>
                        {intl.formatMessage({id: 'enterprise.manage.loading', defaultMessage: 'Loading enterprises...'})}
                    </Text>
                </View>
            );
        }

        if (error) {
            return (
                <View style={styles.empty}>
                    <Text style={styles.emptyText}>
                        {intl.formatMessage({id: 'enterprise.manage.load_failed', defaultMessage: 'Failed to load enterprises. Please try again later.'})}
                    </Text>
                </View>
            );
        }

        if (!entries.length) {
            return (
                <View style={styles.empty}>
                    <Text style={styles.emptyText}>
                        {intl.formatMessage({id: 'enterprise.manage.empty', defaultMessage: 'You are not in any enterprise list here yet. Use Create or Join above, or pull down to refresh.'})}
                    </Text>
                </View>
            );
        }

        return entries.map((entry, index) => (
            <React.Fragment key={entry.id}>
                <TouchableOpacity
                    style={styles.companyRow}
                    activeOpacity={0.7}
                    onPress={() => handleCompanyPress(entry)}
                    testID={`enterprise.manage.company.${entry.id}`}
                >
                    <View style={[styles.companyAvatar, getEnterpriseAvatarStyle(entry.name)]}>
                        <Text
                            style={styles.companyAvatarText}
                            numberOfLines={1}
                        >
                            {getEnterpriseInitials(entry.name)}
                        </Text>
                    </View>
                    <View style={styles.companyNameBlock}>
                        <AdaptiveTitleText
                            text={entry.name}
                            textStyle={styles.companyName}
                            testID={`enterprise.manage.company_name.${entry.id}`}
                        />
                        {SHOW_ENTERPRISE_SOURCE_LABEL && (
                            <Text
                                style={styles.companySource}
                                numberOfLines={1}
                            >
                                {getSourceLabel(entry, intl.formatMessage)}
                            </Text>
                        )}
                    </View>
                    <View style={styles.companyMeta}>
                        {entry.id === currentTeamId && (
                            <View style={styles.currentBadge}>
                                <Text style={styles.currentBadgeText}>
                                    {intl.formatMessage({id: 'enterprise.manage.current_badge', defaultMessage: 'Current'})}
                                </Text>
                            </View>
                        )}
                    </View>
                    <CompassIcon
                        name='chevron-right'
                        size={20}
                        color={changeOpacity(theme.centerChannelColor, 0.56)}
                    />
                </TouchableOpacity>
                {index < entries.length - 1 && <View style={styles.divider}/>}
            </React.Fragment>
        ));
    };

    return (
        <SafeAreaView
            edges={edges}
            style={styles.flex}
            testID='enterprise.manage.screen'
        >
            <View style={styles.header}>
                <Text style={styles.headerTitle}>
                    {intl.formatMessage({id: 'enterprise.manage.title', defaultMessage: 'Manage enterprises'})}
                </Text>
                <Text style={styles.headerSubtitle}>
                    {intl.formatMessage({
                        id: 'enterprise.manage.subtitle_merged',
                        defaultMessage: 'Includes your Mattermost enterprises. Create or join more above.',
                    })}
                </Text>
            </View>

            <View style={styles.actionsRow}>
                <TouchableOpacity
                    style={styles.primaryAction}
                    onPress={handleCreateEnterprise}
                    activeOpacity={0.7}
                    testID='enterprise.manage.create.button'
                >
                    <CompassIcon
                        name='plus'
                        size={18}
                        color={theme.buttonColor}
                    />
                    <Text style={styles.primaryActionText}>
                        {intl.formatMessage({id: 'enterprise.manage.create', defaultMessage: 'Create enterprise'})}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.secondaryAction}
                    onPress={handleJoinEnterprise}
                    activeOpacity={0.7}
                    testID='enterprise.manage.join.button'
                >
                    <CompassIcon
                        name='account-multiple-plus-outline'
                        size={18}
                        color={theme.buttonBg}
                    />
                    <Text style={styles.secondaryActionText}>
                        {intl.formatMessage({id: 'enterprise.manage.join', defaultMessage: 'Join another enterprise'})}
                    </Text>
                </TouchableOpacity>
            </View>

            <Text style={styles.sectionTitle}>
                {intl.formatMessage({id: 'enterprise.manage.list_title', defaultMessage: 'Your enterprises'})}
            </Text>

            <ScrollView
                style={styles.flex}
                contentContainerStyle={[styles.scrollContent, {paddingBottom: insets.bottom + 16}]}
                showsVerticalScrollIndicator={false}
                refreshControl={(
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={() => loadCompanies({isRefresh: true})}
                        tintColor={theme.centerChannelColor}
                    />
                )}
            >
                <View style={styles.card}>
                    {renderCompanies()}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

const enhanced = withObservables([], ({database}: WithDatabaseArgs) => ({
    currentUser: observeCurrentUser(database),
    currentTeamId: observeCurrentTeamId(database),
}));

export default withDatabase(enhanced(ManageEnterpriseScreen));

