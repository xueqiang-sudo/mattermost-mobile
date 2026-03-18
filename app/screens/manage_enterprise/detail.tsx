// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useState} from 'react';
import {Alert, ScrollView, Text, TouchableOpacity, View} from 'react-native';
import {useIntl} from 'react-intl';
import {type Edge, SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';

import {
    dissolveEnterprise,
    ensureTeamCompany,
    fetchCompany,
    fetchEmployeeCountOfCompany,
    quitEnterprise,
    type FetchCompanyResult,
    type FetchEmployeeCountOfCompanyResult,
} from '@actions/remote/contact';
import {type ContactCompany, ContactCompanyTypes} from '@client/rest/contact';
import CompassIcon from '@components/compass_icon';
import Loading from '@components/loading';
import {useTheme} from '@context/theme';
import {usePreventDoubleTap} from '@hooks/utils';
import {dismissModal} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';
import type UserModel from '@typings/database/models/servers/user';

type Props = {
    companyId: string;
    companyName?: string;
    /** Mattermost 团队尚未在通讯录建企时，进入详情先 ensureTeamCompany */
    tryEnsureTeamCompany?: boolean;
    currentUser?: UserModel;
    componentId: string;
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
        paddingTop: 16,
        paddingBottom: 12,
    },
    name: {
        ...typography('Heading', 500, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    metaRow: {
        marginTop: 8,
    },
    metaText: {
        ...typography('Body', 100),
        color: changeOpacity(theme.centerChannelColor, 0.64),
    },
    sectionTitle: {
        marginTop: 24,
        marginBottom: 8,
        ...typography('Body', 75, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.64),
    },
    card: {
        borderRadius: 12,
        backgroundColor: theme.centerChannelBg,
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    value: {
        ...typography('Body', 200),
        color: theme.centerChannelColor,
    },
    dangerButton: {
        marginTop: 32,
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: changeOpacity(theme.errorTextColor, 0.08),
        flexDirection: 'row',
        columnGap: 6,
    },
    dangerButtonText: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.errorTextColor,
    },
    loadingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        columnGap: 8,
    },
    errorText: {
        ...typography('Body', 100),
        color: changeOpacity(theme.centerChannelColor, 0.64),
    },
}));

const ManageEnterpriseDetailScreen = ({companyId, companyName, tryEnsureTeamCompany, currentUser, componentId}: Props) => {
    const theme = useTheme();
    const intl = useIntl();
    const insets = useSafeAreaInsets();
    const styles = getStyleSheet(theme);

    const [company, setCompany] = useState<ContactCompany | undefined>();
    const [memberCount, setMemberCount] = useState<number | undefined>();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<unknown>();

    const employeeId = currentUser?.id;

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            setError(undefined);

            const loadPair = async () =>
                Promise.all([
                    fetchCompany(companyId),
                    fetchEmployeeCountOfCompany(companyId),
                ]) as Promise<[FetchCompanyResult, FetchEmployeeCountOfCompanyResult]>;

            let [companyRes, countRes] = await loadPair();

            if ((companyRes.error || !companyRes.data) && tryEnsureTeamCompany && companyName?.trim()) {
                const ensured = await ensureTeamCompany(companyId, companyName.trim());
                if (ensured.data) {
                    [companyRes, countRes] = await loadPair();
                }
            }

            if (companyRes.error || !companyRes.data) {
                setError(companyRes.error ?? new Error('Company not found'));
            } else {
                setCompany(companyRes.data);
            }

            if (!countRes.error && typeof countRes.data === 'number') {
                setMemberCount(countRes.data);
            }
            setLoading(false);
        };

        load();
    }, [companyId, companyName, tryEnsureTeamCompany]);

    const handleBackToList = useCallback(() => {
        dismissModal({componentId});
    }, [componentId]);

    const handleQuitOrDissolve = usePreventDoubleTap(useCallback(() => {
        const isOwnerType = company?.type === ContactCompanyTypes.Team;
        const isDissolve = isOwnerType;

        const title = isDissolve ?
            intl.formatMessage({id: 'enterprise.detail.dissolve', defaultMessage: 'Dissolve enterprise'}) :
            intl.formatMessage({id: 'enterprise.detail.quit', defaultMessage: 'Leave enterprise'});

        const message = isDissolve ?
            intl.formatMessage({id: 'enterprise.detail.dissolve_confirm', defaultMessage: 'This will permanently delete this enterprise and all of its data in the contact system. This action cannot be undone. Continue?'}) :
            intl.formatMessage({id: 'enterprise.detail.quit_confirm', defaultMessage: 'You will no longer receive notifications or updates from this enterprise. Continue to leave?'});

        Alert.alert(
            title,
            message,
            [
                {
                    text: intl.formatMessage({id: 'mobile.post.cancel', defaultMessage: 'Cancel'}),
                    style: 'cancel',
                },
                {
                    text: intl.formatMessage({id: 'mobile.post.confirm', defaultMessage: 'Confirm'}),
                    style: 'destructive',
                    onPress: async () => {
                        if (isDissolve) {
                            const res = await dissolveEnterprise(companyId);
                            if (res.error) {
                                Alert.alert(
                                    intl.formatMessage({id: 'enterprise.detail.dissolve_failed', defaultMessage: 'Failed to dissolve enterprise.'}),
                                );
                                return;
                            }
                            handleBackToList();
                            return;
                        }

                        if (!employeeId) {
                            return;
                        }
                        const res = await quitEnterprise(employeeId, companyId);
                        if (res.error) {
                            Alert.alert(
                                intl.formatMessage({id: 'enterprise.detail.quit_failed', defaultMessage: 'Failed to leave enterprise.'}),
                            );
                            return;
                        }
                        handleBackToList();
                    },
                },
            ],
        );
    }, [company?.type, companyId, employeeId, handleBackToList, intl]));

    const renderBody = () => {
        if (loading && !company) {
            return (
                <View style={styles.card}>
                    <View style={styles.loadingRow}>
                        <Loading
                            color={theme.centerChannelColor}
                            size='small'
                        />
                        <Text style={styles.errorText}>
                            {intl.formatMessage({id: 'enterprise.detail.loading', defaultMessage: 'Loading enterprise information...'})}
                        </Text>
                    </View>
                </View>
            );
        }

        if (error || !company) {
            return (
                <View style={styles.card}>
                    <Text style={styles.errorText}>
                        {intl.formatMessage({id: 'enterprise.detail.load_failed', defaultMessage: 'Unable to load enterprise information.'})}
                    </Text>
                </View>
            );
        }

        return (
            <>
                <View style={styles.header}>
                    <Text
                        style={styles.name}
                        numberOfLines={1}
                    >
                        {company.name || companyName}
                    </Text>
                    <View style={styles.metaRow}>
                        <Text style={styles.metaText}>
                            {intl.formatMessage(
                                {id: 'enterprise.detail.id', defaultMessage: 'Enterprise ID: {id}'},
                                {id: company.id},
                            )}
                        </Text>
                        {typeof memberCount === 'number' && (
                            <Text style={styles.metaText}>
                                {intl.formatMessage(
                                    {id: 'enterprise.detail.member_count', defaultMessage: '{count} members'},
                                    {count: memberCount},
                                )}
                            </Text>
                        )}
                    </View>
                </View>

                <Text style={styles.sectionTitle}>
                    {intl.formatMessage({id: 'enterprise.detail.basic_info', defaultMessage: 'Basic information'})}
                </Text>
                <View style={styles.card}>
                    <Text style={styles.value}>
                        {intl.formatMessage(
                            {id: 'enterprise.detail.type', defaultMessage: 'Type: {type}'},
                            {
                                type: company.type === ContactCompanyTypes.Team ?
                                    intl.formatMessage({id: 'enterprise.manage.type.team', defaultMessage: 'My enterprise'}) :
                                    company.type,
                            },
                        )}
                    </Text>
                    {company.description ? (
                        <Text style={[styles.value, {marginTop: 8}]}>
                            {company.description}
                        </Text>
                    ) : null}
                </View>

                <TouchableOpacity
                    style={styles.dangerButton}
                    onPress={handleQuitOrDissolve}
                    activeOpacity={0.7}
                    testID={company.type === ContactCompanyTypes.Team ? 'enterprise.detail.dissolve.button' : 'enterprise.detail.quit.button'}
                >
                    <CompassIcon
                        name={company.type === ContactCompanyTypes.Team ? 'close-circle-outline' : 'logout-variant'}
                        size={20}
                        color={theme.errorTextColor}
                    />
                    <Text style={styles.dangerButtonText}>
                        {company.type === ContactCompanyTypes.Team ?
                            intl.formatMessage({id: 'enterprise.detail.dissolve', defaultMessage: 'Dissolve enterprise'}) :
                            intl.formatMessage({id: 'enterprise.detail.quit', defaultMessage: 'Leave enterprise'})}
                    </Text>
                </TouchableOpacity>
            </>
        );
    };

    return (
        <SafeAreaView
            edges={edges}
            style={styles.flex}
            testID='enterprise.detail.screen'
        >
            <ScrollView
                style={styles.flex}
                contentContainerStyle={[styles.scrollContent, {paddingBottom: insets.bottom + 24}]}
                showsVerticalScrollIndicator={false}
            >
                {renderBody()}
            </ScrollView>
        </SafeAreaView>
    );
};

export default ManageEnterpriseDetailScreen;

