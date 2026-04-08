// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    Alert,
    DeviceEventEmitter,
    Dimensions,
    FlatList,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import {type Edge, SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';

import {
    dissolveEnterprise,
    fetchCanDissolveTeam,
    fetchCompany,
    fetchEmployeeCountOfCompany,
    fetchSearchContactEmployees,
    quitEnterprise,
    syncEnterpriseDisplayNameWithMattermost,
    transferContactCompanyOwnership,
    type FetchCompanyResult,
    type FetchEmployeeCountOfCompanyResult,
} from '@actions/remote/contact';
import {deleteTeam, fetchTeamMemberCount, removeCurrentUserFromTeam} from '@actions/remote/team';
import {type ContactCompany, type ContactEmployee, type ContactEmployeeSearchItem} from '@client/rest/contact';
import CompassIcon from '@components/compass_icon';
import ContactAvatar from '@components/contact_avatar';
import {CustomInputModal, useCustomInputModal} from '@components/custom_input_modal';
import Loading from '@components/loading';
import {Events} from '@constants';
import {SNACK_BAR_TYPE} from '@constants/snack_bar';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {usePreventDoubleTap} from '@hooks/utils';
import {observeCurrentUser} from '@queries/servers/user';
import {popTopScreen} from '@screens/navigation';
import {cascadePathLabel, filterValidSearchItems} from '@utils/contact_employee_search_path';
import {showSnackBar} from '@utils/snack_bar';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {WithDatabaseArgs} from '@typings/database/database';
import type UserModel from '@typings/database/models/servers/user';

type TransferOwnershipListEntry = {mode: 'search'; item: ContactEmployeeSearchItem};

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
    secondaryButton: {
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: changeOpacity(theme.buttonBg, 0.1),
        flexDirection: 'row',
        columnGap: 8,
        borderWidth: 1,
        borderColor: changeOpacity(theme.buttonBg, 0.35),
        marginBottom: 12,
    },
    secondaryButtonText: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.buttonBg,
    },
    managementCard: {
        borderRadius: 12,
        borderWidth: 1,
        borderColor: changeOpacity(theme.buttonBg, 0.35),
        backgroundColor: changeOpacity(theme.buttonBg, 0.1),
        overflow: 'hidden',
        marginBottom: 12,
    },
    managementCardRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        columnGap: 8,
        paddingVertical: 14,
        paddingHorizontal: 12,
    },
    managementCardDivider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: changeOpacity(theme.buttonBg, 0.22),
    },
    modalBackdrop: {
        flex: 1,
        backgroundColor: changeOpacity('#000000', 0.45),
        justifyContent: 'flex-end',
    },
    transferSheet: {
        width: '100%',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        backgroundColor: theme.centerChannelBg,
        overflow: 'hidden',
    },
    transferSheetInner: {
        flex: 1,
    },
    transferSheetHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
        flexShrink: 0,
    },
    transferSheetTitle: {
        ...typography('Heading', 300, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    transferSearchWrap: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: theme.centerChannelBg,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
        flexShrink: 0,
    },
    transferSearchInput: {
        ...typography('Body', 200),
        color: theme.centerChannelColor,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.06),
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: Platform.select({ios: 10, android: 8}),
        minHeight: 40,
    },
    transferList: {
        flex: 1,
    },
    transferMemberRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.06),
    },
    transferMemberAvatar: {
        marginRight: 14,
    },
    transferMemberText: {
        flex: 1,
        minWidth: 0,
    },
    transferMemberName: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    transferMemberPath: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginTop: 2,
    },
    transferHint: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.64),
        paddingHorizontal: 16,
        paddingVertical: 12,
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
    const [transferVisible, setTransferVisible] = useState(false);
    const [transferSearchQuery, setTransferSearchQuery] = useState('');
    const [transferSearchMembers, setTransferSearchMembers] = useState<ContactEmployeeSearchItem[]>([]);
    const [transferSearchRawCount, setTransferSearchRawCount] = useState(0);
    const [transferSearchPending, setTransferSearchPending] = useState(false);
    const transferSearchSeq = useRef(0);

    const transferSheetHeight = React.useMemo(
        () => Math.min(Math.round(Dimensions.get('window').height * 0.72), 560),
        [],
    );

    const defaultDepartmentLabel = intl.formatMessage({id: 'contacts.default_department', defaultMessage: 'Default Department'});
    const enterpriseLabelForPath = company?.name ?? companyName ?? '';

    const transferListEntries = React.useMemo((): TransferOwnershipListEntry[] => {
        if (!transferSearchQuery.trim()) {
            return [];
        }
        return transferSearchMembers.map((item) => ({mode: 'search' as const, item}));
    }, [transferSearchQuery, transferSearchMembers]);
    const hasTransferSearchQuery = transferSearchQuery.trim().length > 0;
    const transferSearchOnlySelf = hasTransferSearchQuery && transferSearchRawCount > 0 && transferListEntries.length === 0;
    const transferEmptyText = hasTransferSearchQuery ?
        (transferSearchOnlySelf ?
            intl.formatMessage({
                id: 'enterprise.detail.transfer.self_only_result',
                defaultMessage: 'Search result only contains yourself. Ownership cannot be transferred to yourself.',
            }) :
            intl.formatMessage({
                id: 'contacts.search.no_results',
                defaultMessage: 'No matching contacts',
            })) :
        intl.formatMessage({
            id: 'contacts.search.hint',
            defaultMessage: 'Please enter a nickname, email, or phone number to search',
        });

    const employeeId = currentUser?.id;
    const editNameModal = useCustomInputModal();

    const refreshCompanyAfterRename = useCallback(async (fallbackName: string) => {
        const companyRes = await fetchCompany(companyId);
        if (!companyRes.error && companyRes.data) {
            setCompany(companyRes.data);
        } else {
            setCompany((prev) => ({
                id: companyId,
                name: fallbackName,
                type: 'team' as const,
                owner_id: prev?.owner_id ?? '',
            }));
        }
        DeviceEventEmitter.emit(Events.MANAGE_ENTERPRISE_REFRESH);
    }, [companyId]);

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

    const handleSuccessAndBack = useCallback((isDissolve: boolean, enterpriseDisplayName: string) => {
        const name = enterpriseDisplayName.trim() || companyId;
        showSnackBar({
            barType: isDissolve ? SNACK_BAR_TYPE.ENTERPRISE_DISSOLVED_SUCCESS : SNACK_BAR_TYPE.ENTERPRISE_QUIT_SUCCESS,
            messageValues: {name},
            ignoreNavigationEvents: true,
            duration: 2000,
        });
        DeviceEventEmitter.emit(Events.MANAGE_ENTERPRISE_REFRESH);
        popTopScreen(componentId);
    }, [companyId, componentId]);

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
                        const resolvedName = (company?.name || companyName || companyId).trim() || companyId;
                        if (isDissolve) {
                            // 解散：先操作通讯录，再操作 Mattermost
                            if (hasContactCompanyRecord) {
                                const contactRes = await dissolveEnterprise(companyId);
                                if (contactRes.error) {
                                    Alert.alert(
                                        intl.formatMessage(
                                            {id: 'enterprise.detail.dissolve_failed', defaultMessage: 'Failed to dissolve {name}.'},
                                            {name: resolvedName},
                                        ),
                                    );
                                    return;
                                }
                            }
                            if (isMattermostTeam && serverUrl) {
                                const mmRes = await deleteTeam(serverUrl, companyId);
                                if (mmRes.error) {
                                    Alert.alert(
                                        intl.formatMessage(
                                            {id: 'enterprise.detail.dissolve_failed', defaultMessage: 'Failed to dissolve {name}.'},
                                            {name: resolvedName},
                                        ),
                                    );
                                    return;
                                }
                            }
                            handleSuccessAndBack(true, resolvedName);
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
                                    intl.formatMessage(
                                        {id: 'enterprise.detail.quit_failed', defaultMessage: 'Failed to leave {name}.'},
                                        {name: resolvedName},
                                    ),
                                );
                                return;
                            }
                        }
                        if (isMattermostTeam && serverUrl) {
                            const mmRes = await removeCurrentUserFromTeam(serverUrl, companyId);
                            if (mmRes.error) {
                                Alert.alert(
                                    intl.formatMessage(
                                        {id: 'enterprise.detail.quit_failed', defaultMessage: 'Failed to leave {name}.'},
                                        {name: resolvedName},
                                    ),
                                );
                                return;
                            }
                        }
                        handleSuccessAndBack(false, resolvedName);
                    },
                },
            ],
        );
    }, [company, companyId, companyName, employeeId, handleSuccessAndBack, hasContactCompanyRecord, intl, isCreator, isMattermostTeam, serverUrl]));

    const handleEditEnterprise = usePreventDoubleTap(useCallback(async () => {
        const current = (company?.name || companyName || '').trim();
        const name = await editNameModal.showModal({
            title: intl.formatMessage({id: 'enterprise.detail.modify_enterprise_name_title', defaultMessage: 'Modify enterprise name'}),
            placeholder: intl.formatMessage({id: 'enterprise.detail.name_placeholder', defaultMessage: 'Enterprise name'}),
            defaultValue: current,
            confirmContent: intl.formatMessage({id: 'common.confirm', defaultMessage: 'Confirm'}),
            cancelContent: intl.formatMessage({id: 'common.cancel', defaultMessage: 'Cancel'}),
        });
        if (!name?.trim()) {
            return;
        }
        const trimmed = name.trim();
        const res = await syncEnterpriseDisplayNameWithMattermost(serverUrl, {
            companyId,
            displayName: trimmed,
            hasContactCompanyRecord,
            isMattermostTeam: Boolean(isMattermostTeam),
        });
        if (res.error) {
            Alert.alert(
                intl.formatMessage({id: 'enterprise.detail.modify_enterprise_name_title', defaultMessage: 'Modify enterprise name'}),
                intl.formatMessage({id: 'enterprise.detail.edit_failed', defaultMessage: 'Failed to update enterprise. Please try again.'}),
            );
            return;
        }
        await refreshCompanyAfterRename(trimmed);
        Alert.alert(
            intl.formatMessage({id: 'enterprise.detail.modify_enterprise_name_title', defaultMessage: 'Modify enterprise name'}),
            intl.formatMessage({id: 'enterprise.detail.edit_success', defaultMessage: 'Enterprise name was updated.'}),
        );
    }, [company?.name, companyId, companyName, editNameModal, hasContactCompanyRecord, intl, isMattermostTeam, refreshCompanyAfterRename, serverUrl]));

    const runTransferToUserId = useCallback(async (newOwnerId: string) => {
        if (!employeeId) {
            return;
        }
        const tr = await transferContactCompanyOwnership(employeeId, companyId, newOwnerId);
        if (tr.error) {
            Alert.alert(
                intl.formatMessage({id: 'enterprise.detail.transfer_title', defaultMessage: 'Transfer ownership'}),
                intl.formatMessage({id: 'enterprise.detail.transfer_failed', defaultMessage: 'Failed to transfer ownership. Please try again.'}),
            );
            return;
        }
        setTransferVisible(false);
        setCompany((prev) => prev ? {...prev, owner_id: newOwnerId} : prev);
        setIsCreator(false);
        DeviceEventEmitter.emit(Events.MANAGE_ENTERPRISE_REFRESH);
        Alert.alert(
            intl.formatMessage({id: 'enterprise.detail.transfer_title', defaultMessage: 'Transfer ownership'}),
            intl.formatMessage({id: 'enterprise.detail.transfer_success', defaultMessage: 'Ownership was transferred.'}),
        );
    }, [companyId, employeeId, intl]);

    const handlePickTransferMember = usePreventDoubleTap(useCallback((member: ContactEmployee) => {
        Alert.alert(
            intl.formatMessage({id: 'enterprise.detail.transfer_confirm_title', defaultMessage: 'Transfer ownership?'}),
            intl.formatMessage(
                {id: 'enterprise.detail.transfer_confirm_message', defaultMessage: 'Make {name} the new owner of this enterprise?'},
                {name: member.name},
            ),
            [
                {text: intl.formatMessage({id: 'common.cancel', defaultMessage: 'Cancel'}), style: 'cancel'},
                {
                    text: intl.formatMessage({id: 'common.confirm', defaultMessage: 'Confirm'}),
                    onPress: () => {
                        runTransferToUserId(member.id);
                    },
                },
            ],
        );
    }, [intl, runTransferToUserId]));

    const openTransferSheet = usePreventDoubleTap(useCallback(() => {
        if (!employeeId) {
            return;
        }
        setTransferSearchQuery('');
        setTransferSearchMembers([]);
        setTransferSearchRawCount(0);
        setTransferSearchPending(false);
        setTransferVisible(true);
    }, [employeeId]));

    useEffect(() => {
        if (!transferVisible || !employeeId) {
            return;
        }
        const q = transferSearchQuery.trim();
        if (!q) {
            setTransferSearchMembers([]);
            setTransferSearchRawCount(0);
            setTransferSearchPending(false);
            return;
        }
        setTransferSearchPending(true);
        const seq = ++transferSearchSeq.current;
        const handle = setTimeout(async () => {
            const res = await fetchSearchContactEmployees(companyId, q);
            if (seq !== transferSearchSeq.current) {
                return;
            }
            setTransferSearchPending(false);
            if (res.error || !res.data?.length) {
                setTransferSearchMembers([]);
                setTransferSearchRawCount(0);
                return;
            }
            setTransferSearchRawCount(res.data.length);
            const mapped = filterValidSearchItems(res.data).filter((item) => item.employee.id !== employeeId);
            setTransferSearchMembers(mapped);
        }, 320);
        return () => clearTimeout(handle);
    }, [transferSearchQuery, transferVisible, companyId, employeeId]);

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

                    {isCreator === true && (
                        <View style={styles.managementCard}>
                            <TouchableOpacity
                                style={styles.managementCardRow}
                                onPress={handleEditEnterprise}
                                activeOpacity={0.7}
                                testID='enterprise.detail.modify_name.button'
                            >
                                <CompassIcon
                                    name='pencil-outline'
                                    size={20}
                                    color={theme.buttonBg}
                                />
                                <Text style={styles.secondaryButtonText}>
                                    {intl.formatMessage({id: 'enterprise.detail.modify_enterprise_name', defaultMessage: 'Modify enterprise name'})}
                                </Text>
                            </TouchableOpacity>
                            {hasContactCompanyRecord && (
                                <>
                                    <View style={styles.managementCardDivider} />
                                    <TouchableOpacity
                                        style={styles.managementCardRow}
                                        onPress={openTransferSheet}
                                        activeOpacity={0.7}
                                        testID='enterprise.detail.transfer.button'
                                    >
                                        <CompassIcon
                                            name='account-outline'
                                            size={20}
                                            color={theme.buttonBg}
                                        />
                                        <Text style={styles.secondaryButtonText}>
                                            {intl.formatMessage({id: 'enterprise.detail.transfer', defaultMessage: 'Transfer ownership'})}
                                        </Text>
                                    </TouchableOpacity>
                                </>
                            )}
                        </View>
                    )}

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
            <Modal
                visible={transferVisible}
                animationType='slide'
                transparent={true}
                onRequestClose={() => setTransferVisible(false)}
            >
                <View style={styles.modalBackdrop}>
                    <TouchableOpacity
                        style={styles.flex}
                        activeOpacity={1}
                        onPress={() => setTransferVisible(false)}
                    />
                    <View
                        style={[
                            styles.transferSheet,
                            {
                                height: transferSheetHeight,
                                paddingBottom: insets.bottom + 12,
                            },
                        ]}
                    >
                        <View style={[styles.transferSheetInner, styles.flex]}>
                            <View style={styles.transferSheetHeader}>
                                <Text style={styles.transferSheetTitle}>
                                    {intl.formatMessage({id: 'enterprise.detail.transfer_title', defaultMessage: 'Transfer ownership'})}
                                </Text>
                                <TouchableOpacity
                                    onPress={() => setTransferVisible(false)}
                                    hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                                    testID='enterprise.detail.transfer.close'
                                >
                                    <CompassIcon
                                        name='close'
                                        size={22}
                                        color={theme.centerChannelColor}
                                    />
                                </TouchableOpacity>
                            </View>
                            <>
                                <View style={styles.transferSearchWrap}>
                                    <TextInput
                                        value={transferSearchQuery}
                                        onChangeText={setTransferSearchQuery}
                                        placeholder={intl.formatMessage({
                                            id: 'contacts.search.placeholder',
                                            defaultMessage: 'Nickname, email, phone number…',
                                        })}
                                        placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.54)}
                                        style={styles.transferSearchInput}
                                        autoCorrect={false}
                                        autoCapitalize='none'
                                        returnKeyType='search'
                                        clearButtonMode={Platform.OS === 'ios' ? 'while-editing' : 'never'}
                                        testID='enterprise.detail.transfer.search_input'
                                    />
                                </View>
                                <FlatList<TransferOwnershipListEntry>
                                    style={styles.transferList}
                                    keyboardShouldPersistTaps='handled'
                                    data={transferListEntries}
                                    keyExtractor={(entry: TransferOwnershipListEntry) => `s-${entry.item.employee.id}`}
                                    ListEmptyComponent={(
                                        transferSearchQuery.trim() && transferSearchPending ?
                                            <View style={{paddingVertical: 24, alignItems: 'center'}}>
                                                <Loading
                                                    color={theme.centerChannelColor}
                                                    size='small'
                                                />
                                            </View> :
                                            <Text style={styles.transferHint}>
                                                {transferEmptyText}
                                            </Text>
                                    )}
                                    contentContainerStyle={
                                        transferListEntries.length === 0 ? {flexGrow: 1} : undefined
                                    }
                                    renderItem={({item: entry}: {item: TransferOwnershipListEntry}) => {
                                        const employee = entry.item.employee;
                                        const path = cascadePathLabel(entry.item, defaultDepartmentLabel, enterpriseLabelForPath);
                                        return (
                                            <TouchableOpacity
                                                style={styles.transferMemberRow}
                                                onPress={() => handlePickTransferMember(employee)}
                                                activeOpacity={0.7}
                                                testID={`enterprise.detail.transfer.member.${employee.id}`}
                                            >
                                                <View style={styles.transferMemberAvatar}>
                                                    <ContactAvatar
                                                        employee={employee}
                                                        size={40}
                                                    />
                                                </View>
                                                <View style={styles.transferMemberText}>
                                                    <Text
                                                        style={styles.transferMemberName}
                                                        numberOfLines={1}
                                                    >
                                                        {employee.name}
                                                    </Text>
                                                    {path ? (
                                                        <Text
                                                            style={styles.transferMemberPath}
                                                            numberOfLines={2}
                                                        >
                                                            {path}
                                                        </Text>
                                                    ) : null}
                                                </View>
                                            </TouchableOpacity>
                                        );
                                    }}
                                />
                            </>
                        </View>
                    </View>
                </View>
            </Modal>
            <CustomInputModal
                key={editNameModal.visible ? 'edit-open' : 'edit-closed'}
                visible={editNameModal.visible}
                title={editNameModal.options.title}
                placeholder={editNameModal.options.placeholder}
                defaultValue={editNameModal.options.defaultValue}
                confirmContent={editNameModal.options.confirmContent}
                showCancelButton={editNameModal.options.showCancelButton}
                cancelContent={editNameModal.options.cancelContent}
                onConfirm={editNameModal.handleConfirm}
                onCancel={editNameModal.handleCancel}
            />
        </SafeAreaView>
    );
};

const enhanced = withObservables([], ({database}: WithDatabaseArgs) => ({
    currentUser: observeCurrentUser(database),
}));

export default withDatabase(enhanced(ManageEnterpriseDetailScreen));

