// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useDatabase, withDatabase, withObservables} from '@nozbe/watermelondb/react';
import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {Alert, RefreshControl, ScrollView, Text, TouchableOpacity, View} from 'react-native';
import {type Edge, SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';

import {
    createEnterpriseForEmployee,
    fetchManageEnterpriseList,
    joinEnterprise,
    type FetchManageEnterpriseListResult,
    type ManageEnterpriseEntry,
} from '@actions/remote/contact';
import {ContactCompanyTypes} from '@client/rest/contact';
import CompassIcon from '@components/compass_icon';
import {CustomInputModal, useCustomInputModal} from '@components/custom_input_modal';
import Loading from '@components/loading';
import {Screens} from '@constants';
import {useTheme} from '@context/theme';
import {usePreventDoubleTap} from '@hooks/utils';
import {observeCurrentTeamId} from '@queries/servers/system';
import {observeCurrentUser} from '@queries/servers/user';
import {goToScreen} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {WithDatabaseArgs} from '@typings/database/database';
import type UserModel from '@typings/database/models/servers/user';

type Props = {
    currentUser?: UserModel;
    currentTeamId?: string;
};

const edges: Edge[] = ['left', 'right'];

/**
 * 是否在企业列表中显示来源标签（Mattermost / 通讯录 / 两者皆有）。
 * 默认 false 不显示，方便正式环境保持界面简洁。
 * 设为 true 便于测试时快速区分企业来源。
 */
const SHOW_ENTERPRISE_SOURCE_LABEL = false;

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
    entry: ManageEnterpriseEntry,
    formatMessage: (descriptor: {id: string; defaultMessage: string}) => string,
): string {
    if (entry.isMattermostTeam && entry.hasContactCompanyRecord) {
        return formatMessage({id: 'enterprise.manage.source.mm_and_contact', defaultMessage: 'Mattermost team · Contact directory'});
    }
    if (entry.isMattermostTeam) {
        return formatMessage({id: 'enterprise.manage.source.mm_only', defaultMessage: 'Mattermost team only'});
    }
    return formatMessage({id: 'enterprise.manage.source.contact_only', defaultMessage: 'Contact directory'});
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
        marginRight: 8,
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
    const styles = getStyleSheet(theme);

    const [entries, setEntries] = useState<ManageEnterpriseEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<unknown>();

    const createInputModal = useCustomInputModal();
    const joinInputModal = useCustomInputModal();

    const employeeId = currentUser?.id;

    const loadCompanies = useCallback(async (opts?: {isRefresh?: boolean}) => {
        if (!employeeId) {
            return;
        }
        if (opts?.isRefresh) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }
        setError(undefined);
        const res: FetchManageEnterpriseListResult = await fetchManageEnterpriseList(database, employeeId);
        if (res.error && !res.data?.length) {
            setError(res.error);
            setEntries([]);
        } else {
            setError(undefined);
            setEntries(res.data ?? []);
        }
        if (opts?.isRefresh) {
            setRefreshing(false);
        } else {
            setLoading(false);
        }
    }, [database, employeeId]);

    useEffect(() => {
        loadCompanies();
    }, [loadCompanies]);

    const handleCreateEnterprise = usePreventDoubleTap(useCallback(async () => {
        if (!employeeId) {
            Alert.alert(
                intl.formatMessage({id: 'enterprise.manage.loading_user', defaultMessage: 'Loading user'}),
                intl.formatMessage({id: 'enterprise.manage.please_wait', defaultMessage: 'Please wait a moment and try again.'}),
            );
            return;
        }
        const title = intl.formatMessage({id: 'enterprise.manage.create', defaultMessage: 'Create enterprise'});
        const placeholder = intl.formatMessage({id: 'enterprise.manage.create.name_placeholder', defaultMessage: 'Enterprise name'});

        const inputValue = await createInputModal.showModal({
            title,
            placeholder,
            confirmContent: intl.formatMessage({id: 'mobile.post.confirm', defaultMessage: 'Confirm'}),
            cancelContent: intl.formatMessage({id: 'mobile.post.cancel', defaultMessage: 'Cancel'}),
        });
        if (!inputValue?.trim()) {
            return;
        }
        const res = await createEnterpriseForEmployee(employeeId, {
            name: inputValue.trim(),
            type: ContactCompanyTypes.Team,
        });
        if (res.error) {
            Alert.alert(
                intl.formatMessage({id: 'enterprise.manage.create_failed', defaultMessage: 'Failed to create enterprise'}),
            );
            return;
        }
        await loadCompanies();
    }, [employeeId, intl, loadCompanies, createInputModal]));

    const handleJoinEnterprise = usePreventDoubleTap(useCallback(async () => {
        if (!employeeId) {
            Alert.alert(
                intl.formatMessage({id: 'enterprise.manage.loading_user', defaultMessage: 'Loading user'}),
                intl.formatMessage({id: 'enterprise.manage.please_wait', defaultMessage: 'Please wait a moment and try again.'}),
            );
            return;
        }
        const title = intl.formatMessage({id: 'enterprise.manage.join', defaultMessage: 'Join another enterprise'});
        const placeholder = intl.formatMessage({id: 'enterprise.manage.join.placeholder', defaultMessage: 'Enterprise ID'});

        const companyId = await joinInputModal.showModal({
            title,
            placeholder,
            confirmContent: intl.formatMessage({id: 'mobile.post.confirm', defaultMessage: 'Confirm'}),
            cancelContent: intl.formatMessage({id: 'mobile.post.cancel', defaultMessage: 'Cancel'}),
        });
        if (!companyId?.trim()) {
            return;
        }
        const res = await joinEnterprise(employeeId, companyId.trim());
        if (res.error) {
            Alert.alert(
                intl.formatMessage({id: 'enterprise.manage.join_failed', defaultMessage: 'Failed to join enterprise. Please check the ID and try again.'}),
            );
            return;
        }
        await loadCompanies();
    }, [employeeId, intl, loadCompanies, joinInputModal]));

    const handleCompanyPress = usePreventDoubleTap(useCallback((entry: ManageEnterpriseEntry) => {
        const title = intl.formatMessage({id: 'enterprise.detail.title', defaultMessage: 'Enterprise information'});
        goToScreen(Screens.MANAGE_ENTERPRISE_DETAIL, title, {
            companyId: entry.id,
            companyName: entry.name,
            isMattermostTeam: entry.isMattermostTeam,
            hasContactCompanyRecord: entry.hasContactCompanyRecord,
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
                        <Text
                            style={styles.companyName}
                            numberOfLines={1}
                        >
                            {entry.name}
                        </Text>
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
                        defaultMessage: 'Includes your Mattermost teams (mapped to contact companies) and enterprises in the contact directory. Create or join additional enterprises below.',
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
            <CustomInputModal
                key={createInputModal.visible ? 'create-open' : 'create-closed'}
                visible={createInputModal.visible}
                title={createInputModal.options.title}
                placeholder={createInputModal.options.placeholder}
                defaultValue={createInputModal.options.defaultValue}
                confirmContent={createInputModal.options.confirmContent}
                showCancelButton={createInputModal.options.showCancelButton}
                cancelContent={createInputModal.options.cancelContent}
                theme={theme}
                onConfirm={createInputModal.handleConfirm}
                onCancel={createInputModal.handleCancel}
            />
            <CustomInputModal
                key={joinInputModal.visible ? 'join-open' : 'join-closed'}
                visible={joinInputModal.visible}
                title={joinInputModal.options.title}
                placeholder={joinInputModal.options.placeholder}
                defaultValue={joinInputModal.options.defaultValue}
                confirmContent={joinInputModal.options.confirmContent}
                showCancelButton={joinInputModal.options.showCancelButton}
                cancelContent={joinInputModal.options.cancelContent}
                theme={theme}
                onConfirm={joinInputModal.handleConfirm}
                onCancel={joinInputModal.handleCancel}
            />
        </SafeAreaView>
    );
};

const enhanced = withObservables([], ({database}: WithDatabaseArgs) => ({
    currentUser: observeCurrentUser(database),
    currentTeamId: observeCurrentTeamId(database),
}));

export default withDatabase(enhanced(ManageEnterpriseScreen));

