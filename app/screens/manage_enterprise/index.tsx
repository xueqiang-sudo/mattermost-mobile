// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useDatabase} from '@nozbe/watermelondb/react';
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
import Loading from '@components/loading';
import {Screens} from '@constants';
import {useTheme} from '@context/theme';
import {usePreventDoubleTap} from '@hooks/utils';
import {goToScreen} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type UserModel from '@typings/database/models/servers/user';

type Props = {
    currentUser?: UserModel;
};

const edges: Edge[] = ['left', 'right'];

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
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.5),
    },
    companyMeta: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.56),
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

const ManageEnterpriseScreen = ({currentUser}: Props) => {
    const database = useDatabase();
    const theme = useTheme();
    const intl = useIntl();
    const insets = useSafeAreaInsets();
    const styles = getStyleSheet(theme);

    const [entries, setEntries] = useState<ManageEnterpriseEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<unknown>();

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

    const handleCreateEnterprise = usePreventDoubleTap(useCallback(() => {
        if (!employeeId) {
            return;
        }
        const title = intl.formatMessage({id: 'enterprise.manage.create', defaultMessage: 'Create enterprise'});
        const placeholder = intl.formatMessage({id: 'enterprise.manage.create.name_placeholder', defaultMessage: 'Enterprise name'});

        let inputValue = '';
        Alert.prompt(
            title,
            '',
            [
                {
                    text: intl.formatMessage({id: 'mobile.post.cancel', defaultMessage: 'Cancel'}),
                    style: 'cancel',
                },
                {
                    text: intl.formatMessage({id: 'mobile.post.confirm', defaultMessage: 'Confirm'}),
                    onPress: async (value) => {
                        inputValue = (value || '').trim();
                        if (!inputValue) {
                            return;
                        }
                        const res = await createEnterpriseForEmployee(employeeId, {
                            name: inputValue,
                            type: ContactCompanyTypes.Team,
                        });
                        if (res.error) {
                            Alert.alert(
                                intl.formatMessage({id: 'enterprise.manage.create_failed', defaultMessage: 'Failed to create enterprise'}),
                            );
                            return;
                        }
                        await loadCompanies();
                    },
                },
            ],
            'plain-text',
            '',
            'default',
            placeholder,
        );
    }, [employeeId, intl, loadCompanies]));

    const handleJoinEnterprise = usePreventDoubleTap(useCallback(() => {
        if (!employeeId) {
            return;
        }
        const title = intl.formatMessage({id: 'enterprise.manage.join', defaultMessage: 'Join another enterprise'});
        const placeholder = intl.formatMessage({id: 'enterprise.manage.join.placeholder', defaultMessage: 'Enterprise ID'});

        Alert.prompt(
            title,
            '',
            [
                {
                    text: intl.formatMessage({id: 'mobile.post.cancel', defaultMessage: 'Cancel'}),
                    style: 'cancel',
                },
                {
                    text: intl.formatMessage({id: 'mobile.post.confirm', defaultMessage: 'Confirm'}),
                    onPress: async (value) => {
                        const companyId = (value || '').trim();
                        if (!companyId) {
                            return;
                        }
                        const res = await joinEnterprise(employeeId, companyId);
                        if (res.error) {
                            Alert.alert(
                                intl.formatMessage({id: 'enterprise.manage.join_failed', defaultMessage: 'Failed to join enterprise. Please check the ID and try again.'}),
                            );
                            return;
                        }
                        await loadCompanies();
                    },
                },
            ],
            'plain-text',
            '',
            'default',
            placeholder,
        );
    }, [employeeId, intl, loadCompanies]));

    const handleCompanyPress = usePreventDoubleTap(useCallback((entry: ManageEnterpriseEntry) => {
        const title = intl.formatMessage({id: 'enterprise.detail.title', defaultMessage: 'Enterprise information'});
        const tryEnsureTeamCompany = entry.isMattermostTeam && !entry.hasContactCompanyRecord;
        goToScreen(Screens.MANAGE_ENTERPRISE_DETAIL, title, {
            companyId: entry.id,
            companyName: entry.name,
            tryEnsureTeamCompany,
        });
    }, [intl]));

    const sourceLabel = useCallback((entry: ManageEnterpriseEntry) => {
        if (entry.isMattermostTeam && entry.hasContactCompanyRecord) {
            return intl.formatMessage({
                id: 'enterprise.manage.source.mm_and_contact',
                defaultMessage: 'Mattermost team · Contact directory',
            });
        }
        if (entry.isMattermostTeam) {
            return intl.formatMessage({
                id: 'enterprise.manage.source.mm_pending',
                defaultMessage: 'Mattermost team (sync to contacts on open)',
            });
        }
        return intl.formatMessage({
            id: 'enterprise.manage.source.contact_only',
            defaultMessage: 'Contact directory',
        });
    }, [intl]);

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
                    <View style={{marginRight: 12}}>
                        <CompassIcon
                            name={entry.isMattermostTeam ? 'account-group-outline' : 'sitemap'}
                            size={22}
                            color={theme.linkColor}
                        />
                    </View>
                    <View style={styles.companyNameBlock}>
                        <Text
                            style={styles.companyName}
                            numberOfLines={1}
                        >
                            {entry.name}
                        </Text>
                        <Text
                            style={styles.companySource}
                            numberOfLines={2}
                        >
                            {sourceLabel(entry)}
                        </Text>
                    </View>
                    <Text style={styles.companyMeta}>
                        {entry.type === ContactCompanyTypes.Team ? intl.formatMessage({id: 'enterprise.manage.type.team', defaultMessage: 'My enterprise'}) : ''}
                    </Text>
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
                <View style={styles.card}>
                    {renderCompanies()}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

export default ManageEnterpriseScreen;

