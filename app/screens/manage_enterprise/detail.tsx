// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {Alert, DeviceEventEmitter, ScrollView, Text, TouchableOpacity, View} from 'react-native';
import {type Edge, SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';

import {
    dissolveEnterprise,
    fetchCanDissolveTeam,
    fetchCompany,
    fetchEmployeeCountOfCompany,
    quitEnterprise,
    type FetchCompanyResult,
    type FetchEmployeeCountOfCompanyResult,
} from '@actions/remote/contact';
import {deleteTeam, fetchTeamMemberCount, removeCurrentUserFromTeam} from '@actions/remote/team';
import {type ContactCompany} from '@client/rest/contact';
import CompassIcon from '@components/compass_icon';
import Loading from '@components/loading';
import {Events} from '@constants';
import {SNACK_BAR_TYPE} from '@constants/snack_bar';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {usePreventDoubleTap} from '@hooks/utils';
import {observeCurrentUser} from '@queries/servers/user';
import {popTopScreen} from '@screens/navigation';
import {showSnackBar} from '@utils/snack_bar';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {WithDatabaseArgs} from '@typings/database/database';
import type UserModel from '@typings/database/models/servers/user';

type Props = {
    companyId: string;
    companyName?: string;

    /** 企业对应 Mattermost 团队（companyId = teamId），用于获取创建者判断解散权限 */
    isMattermostTeam?: boolean;

    /** 通讯录中是否有该企业记录 */
    hasContactCompanyRecord?: boolean;

    /** 是否为当前选中的企业 */
    isCurrentTeam?: boolean;
    currentUser?: UserModel;
    componentId: string;
};

const edges: Edge[] = ['left', 'right'];

const AVATAR_COLORS = [
    '#5D7A8C', '#6B8E6B', '#8B7355', '#7B68A0', '#A0525D',
    '#4682B4', '#2E8B57', '#CD853F', '#6A5ACD', '#DC143C',
];

function getEnterpriseAvatarStyle(displayName: string) {
    const hash = (displayName || '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const color = AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
    return {backgroundColor: changeOpacity(color, 0.92)};
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
        paddingBottom: 24,
    },
    heroSection: {
        paddingTop: 32,
        paddingBottom: 28,
        paddingHorizontal: 24,
        backgroundColor: changeOpacity(theme.sidebarBg, 0.06),
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
        alignItems: 'center',
    },
    avatarWrapper: {
        width: 80,
        height: 80,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    avatarText: {
        color: '#FFFFFF',
        ...typography('Heading', 400, 'SemiBold'),
    },
    nameWrapper: {
        alignItems: 'center',
        marginBottom: 8,
    },
    name: {
        ...typography('Heading', 500, 'SemiBold'),
        color: theme.centerChannelColor,
        textAlign: 'center',
    },
    badgeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginBottom: 12,
    },
    currentBadge: {
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 10,
        backgroundColor: changeOpacity(theme.sidebarTextActiveBorder || theme.linkColor, 0.18),
    },
    currentBadgeText: {
        ...typography('Body', 75, 'SemiBold'),
        color: theme.sidebarTextActiveBorder || theme.linkColor,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
    },
    metaIcon: {
        opacity: 0.72,
    },
    metaText: {
        ...typography('Body', 100),
        color: changeOpacity(theme.centerChannelColor, 0.72),
    },
    bodySection: {
        paddingHorizontal: 20,
        paddingTop: 24,
    },
    descriptionCard: {
        borderRadius: 14,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        padding: 16,
        marginBottom: 24,
    },
    descriptionText: {
        ...typography('Body', 200),
        color: theme.centerChannelColor,
        lineHeight: 22,
    },
    dangerButton: {
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: changeOpacity(theme.errorTextColor, 0.08),
        flexDirection: 'row',
        columnGap: 8,
        borderWidth: 1,
        borderColor: changeOpacity(theme.errorTextColor, 0.2),
    },
    dangerButtonText: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.errorTextColor,
    },
    card: {
        borderRadius: 14,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        paddingHorizontal: 20,
        paddingVertical: 18,
    },
    loadingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        columnGap: 10,
    },
    errorText: {
        ...typography('Body', 100),
        color: changeOpacity(theme.centerChannelColor, 0.64),
    },
}));

const ManageEnterpriseDetailScreen = ({companyId, companyName, isMattermostTeam, hasContactCompanyRecord = true, isCurrentTeam = false, currentUser, componentId}: Props) => {
    const theme = useTheme();
    const intl = useIntl();
    const insets = useSafeAreaInsets();
    const serverUrl = useServerUrl();
    const styles = getStyleSheet(theme);

    const [company, setCompany] = useState<ContactCompany | undefined>();
    const [memberCount, setMemberCount] = useState<number | undefined>();
    const [isCreator, setIsCreator] = useState<boolean | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<unknown>();

    const employeeId = currentUser?.id;

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            setError(undefined);
            setIsCreator(null);

            const loadPair = async () =>
                Promise.all([
                    fetchCompany(companyId),
                    fetchEmployeeCountOfCompany(companyId),
                ]) as Promise<[FetchCompanyResult, FetchEmployeeCountOfCompanyResult]>;

            const [companyRes, countRes] = await loadPair();

            if (companyRes.error || !companyRes.data) {
                if (!hasContactCompanyRecord && companyName) {
                    setCompany({
                        id: companyId,
                        name: companyName,
                        type: 'team' as const,
                    });
                } else {
                    setError(companyRes.error ?? new Error('Company not found'));
                }
            } else {
                setCompany(companyRes.data);
            }

            // 成员数：通讯录有且>0则用通讯录；若通讯录无/报错/为0 且为 MM 团队，则用 Mattermost 成员数
            const contactCount = (!countRes.error && typeof countRes.data === 'number') ? countRes.data : undefined;
            const shouldUseMattermost = isMattermostTeam && serverUrl && (!hasContactCompanyRecord || contactCount === undefined || contactCount === 0);

            if (shouldUseMattermost) {
                const mmCountRes = await fetchTeamMemberCount(serverUrl, companyId);
                if (!mmCountRes.error && typeof mmCountRes.data === 'number') {
                    setMemberCount(mmCountRes.data);
                } else if (contactCount !== undefined) {
                    setMemberCount(contactCount);
                }
            } else if (contactCount !== undefined) {
                setMemberCount(contactCount);
            }
            setLoading(false);
        };

        load();
    }, [companyId, companyName, hasContactCompanyRecord, isMattermostTeam, serverUrl]);

    // 判断是否显示「解散」：需求1/2/3 综合逻辑
    // - 需求2: 通讯录有且 owner_id 有效 → 以 owner_id === employeeId 为准
    // - 需求1: 通讯录无（仅 MM）→ 以 Mattermost 创建者或管理员为准
    // - 需求3: 通讯录有但 owner_id 为空 → 以 Mattermost 创建者或管理员为准
    useEffect(() => {
        const checkCreator = async () => {
            if (!employeeId) {
                setIsCreator(false);
                return;
            }
            const ownerId = company?.owner_id ?? (company as {ownerId?: string})?.ownerId;
            if (ownerId != null && ownerId !== '') {
                setIsCreator(ownerId === employeeId);
                return;
            }
            if (!isMattermostTeam || !serverUrl) {
                setIsCreator(false);
                return;
            }
            const canDissolve = await fetchCanDissolveTeam(serverUrl, companyId, employeeId);
            setIsCreator(canDissolve);
        };
        checkCreator();
    }, [company, companyId, employeeId, isMattermostTeam, serverUrl]);

    const handleSuccessAndBack = useCallback((isDissolve: boolean) => {
        showSnackBar({
            barType: isDissolve ? SNACK_BAR_TYPE.ENTERPRISE_DISSOLVED_SUCCESS : SNACK_BAR_TYPE.ENTERPRISE_QUIT_SUCCESS,
            ignoreNavigationEvents: true,
            duration: 2000,
        });
        DeviceEventEmitter.emit(Events.MANAGE_ENTERPRISE_REFRESH);
        popTopScreen(componentId);
    }, [componentId]);

    const handleQuitOrDissolve = usePreventDoubleTap(useCallback(() => {
        const isDissolve = isCreator === true;

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
                    text: intl.formatMessage({id: 'common.cancel', defaultMessage: 'Cancel'}),
                    style: 'cancel',
                },
                {
                    text: intl.formatMessage({id: 'common.confirm', defaultMessage: 'Confirm'}),
                    style: 'destructive',
                    onPress: async () => {
                        if (isDissolve) {
                            // 解散：先操作通讯录，再操作 Mattermost
                            if (hasContactCompanyRecord) {
                                const contactRes = await dissolveEnterprise(companyId);
                                if (contactRes.error) {
                                    Alert.alert(
                                        intl.formatMessage({id: 'enterprise.detail.dissolve_failed', defaultMessage: 'Failed to dissolve enterprise.'}),
                                    );
                                    return;
                                }
                            }
                            if (isMattermostTeam && serverUrl) {
                                const mmRes = await deleteTeam(serverUrl, companyId);
                                if (mmRes.error) {
                                    Alert.alert(
                                        intl.formatMessage({id: 'enterprise.detail.dissolve_failed', defaultMessage: 'Failed to dissolve enterprise.'}),
                                    );
                                    return;
                                }
                            }
                            handleSuccessAndBack(true);
                            return;
                        }

                        // 退出：先操作通讯录，再操作 Mattermost
                        if (!employeeId) {
                            return;
                        }
                        if (hasContactCompanyRecord) {
                            const contactRes = await quitEnterprise(employeeId, companyId);
                            if (contactRes.error) {
                                Alert.alert(
                                    intl.formatMessage({id: 'enterprise.detail.quit_failed', defaultMessage: 'Failed to leave enterprise.'}),
                                );
                                return;
                            }
                        }
                        if (isMattermostTeam && serverUrl) {
                            const mmRes = await removeCurrentUserFromTeam(serverUrl, companyId);
                            if (mmRes.error) {
                                Alert.alert(
                                    intl.formatMessage({id: 'enterprise.detail.quit_failed', defaultMessage: 'Failed to leave enterprise.'}),
                                );
                                return;
                            }
                        }
                        handleSuccessAndBack(false);
                    },
                },
            ],
        );
    }, [companyId, employeeId, handleSuccessAndBack, hasContactCompanyRecord, intl, isCreator, isMattermostTeam, serverUrl]));

    const renderBody = () => {
        if (loading && !company) {
            return (
                <View style={[styles.card, {marginHorizontal: 20, marginTop: 24}]}>
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
                <View style={[styles.card, {marginHorizontal: 20, marginTop: 24}]}>
                    <Text style={styles.errorText}>
                        {intl.formatMessage({id: 'enterprise.detail.load_failed', defaultMessage: 'Unable to load enterprise information.'})}
                    </Text>
                </View>
            );
        }

        const displayName = company.name || companyName || '';
        const initials = getEnterpriseInitials(displayName);
        const avatarStyle = getEnterpriseAvatarStyle(displayName);

        return (
            <>
                <View style={styles.heroSection}>
                    <View style={[styles.avatarWrapper, avatarStyle]}>
                        <Text
                            style={styles.avatarText}
                            numberOfLines={1}
                        >
                            {initials}
                        </Text>
                    </View>
                    <View style={styles.nameWrapper}>
                        <Text
                            style={styles.name}
                            numberOfLines={2}
                        >
                            {displayName}
                        </Text>
                    </View>
                    {(isCurrentTeam || typeof memberCount === 'number') && (
                        <View style={styles.badgeRow}>
                            {isCurrentTeam && (
                                <View style={styles.currentBadge}>
                                    <Text style={styles.currentBadgeText}>
                                        {intl.formatMessage({id: 'enterprise.detail.current_badge', defaultMessage: 'Current'})}
                                    </Text>
                                </View>
                            )}
                            {typeof memberCount === 'number' && (
                                <View style={styles.metaRow}>
                                    <CompassIcon
                                        name='account-multiple-outline'
                                        size={18}
                                        color={changeOpacity(theme.centerChannelColor, 0.72)}
                                        style={styles.metaIcon}
                                    />
                                    <Text style={styles.metaText}>
                                        {intl.formatMessage(
                                            {id: 'enterprise.detail.member_count', defaultMessage: '{count} members'},
                                            {count: memberCount},
                                        )}
                                    </Text>
                                </View>
                            )}
                        </View>
                    )}
                </View>

                <View style={styles.bodySection}>
                    {company.description?.trim() ? (
                        <View style={styles.descriptionCard}>
                            <Text style={styles.descriptionText}>
                                {company.description.trim()}
                            </Text>
                        </View>
                    ) : null}

                    <TouchableOpacity
                        style={styles.dangerButton}
                        onPress={handleQuitOrDissolve}
                        activeOpacity={0.7}
                        testID={isCreator ? 'enterprise.detail.dissolve.button' : 'enterprise.detail.quit.button'}
                    >
                        <CompassIcon
                            name={isCreator ? 'close-circle-outline' : 'logout-variant'}
                            size={20}
                            color={theme.errorTextColor}
                        />
                        <Text style={styles.dangerButtonText}>
                            {isCreator ?
                                intl.formatMessage({id: 'enterprise.detail.dissolve', defaultMessage: 'Dissolve enterprise'}) :
                                intl.formatMessage({id: 'enterprise.detail.quit', defaultMessage: 'Leave enterprise'})}
                        </Text>
                    </TouchableOpacity>
                </View>
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

const enhanced = withObservables([], ({database}: WithDatabaseArgs) => ({
    currentUser: observeCurrentUser(database),
}));

export default withDatabase(enhanced(ManageEnterpriseDetailScreen));

