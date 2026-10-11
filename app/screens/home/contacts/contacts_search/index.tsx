// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import Clipboard from '@react-native-clipboard/clipboard';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import {type Edge, SafeAreaView} from 'react-native-safe-area-context';

import {searchContactEmployees, type TeamMemberSearchItem} from '@actions/remote/contact_new';
import CompassIcon from '@components/compass_icon';
import ContactAvatar from '@components/contact_avatar';
import ContactSearchScopeHint from '@components/contact_search_scope_hint';
import GlobalErrorBoundary from '@components/global_error_fallback';
import {Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import {dismissModal, showModalWithBackButton} from '@screens/navigation';
import {
    cascadePathLabel,
    cascadePathParts,
    filterValidSearchItems,
    normalizeDepartmentName,
} from '@utils/contact_employee_search_path';
import {getContactListDisplayName} from '@utils/contact_section';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {AvailableScreens} from '@typings/screens/navigation';

const SAFE_AREA_EDGES: Edge[] = ['top', 'bottom', 'left', 'right'];

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    flex: {flex: 1},
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 8,
        backgroundColor: theme.sidebarBg,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    backHit: {
        padding: 8,
        marginRight: 4,
    },
    headerTitle: {
        ...typography('Heading', 300, 'SemiBold'),
        color: theme.sidebarHeaderTextColor,
        flex: 1,
        textAlign: 'center',
        marginRight: 40,
    },
    searchWrap: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: theme.centerChannelBg,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    searchInput: {
        ...typography('Body', 200),
        color: theme.centerChannelColor,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.06),
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: Platform.select({ios: 10, android: 8}),
        minHeight: 40,
    },
    listContent: {
        paddingBottom: 24,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.06),
    },
    rowAvatar: {marginRight: 14},
    rowText: {flex: 1, minWidth: 0},
    rowName: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    rowPath: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginTop: 2,
    },
    empty: {
        ...typography('Body', 100),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        textAlign: 'center',
        paddingVertical: 32,
        paddingHorizontal: 24,
    },
    inviteCard: {
        marginTop: 16,
        marginHorizontal: 16,
        padding: 16,
        borderRadius: 12,
        backgroundColor: changeOpacity(theme.buttonBg, 0.06),
        borderWidth: 1,
        borderColor: changeOpacity(theme.buttonBg, 0.2),
    },
    inviteTitle: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.centerChannelColor,
        marginBottom: 8,
        textAlign: 'center',
    },
    inviteDesc: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.64),
        marginBottom: 12,
        textAlign: 'center',
    },
    inviteUrlRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    inviteUrl: {
        flex: 1,
        ...typography('Body', 75),
        color: theme.linkColor,
        paddingVertical: 8,
        paddingHorizontal: 12,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderRadius: 6,
        overflow: 'hidden',
    },
    copyBtn: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 6,
        backgroundColor: theme.buttonBg,
    },
    copyBtnText: {
        color: theme.buttonColor,
        ...typography('Body', 75, 'SemiBold'),
    },
}));

type Props = {
    componentId: AvailableScreens;
    closeButtonId?: string;
    companyId: string;
    companyName?: string;
    departmentId?: number;
    departmentName?: string;

    /** 与部门详情 baseBreadcrumb 一致，用于搜索范围级联展示 */
    departmentBreadcrumb?: string[];
    currentUserId?: string;

    /** 通讯录栈内 push 时使用，替代左上角系统返回 */
    onBack?: () => void;
};

const ContactsSearchContent = ({
    componentId,
    closeButtonId,
    companyId,
    companyName,
    departmentId,
    departmentName,
    departmentBreadcrumb,
    currentUserId,
    onBack,
}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const styles = getStyleSheet(theme);
    const mounted = useRef(true);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    const [query, setQuery] = useState('');
    const [results, setResults] = useState<TeamMemberSearchItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);

    const runSearch = useCallback(async (kw: string) => {
        if (!serverUrl) {
            if (!mounted.current) {
                return;
            }
            setLoading(false);
            setSearched(true);
            setResults([]);
            return;
        }
        const res = await searchContactEmployees(serverUrl, companyId, kw, {
            departmentId,
        });
        if (!mounted.current) {
            return;
        }

        setLoading(false);
        setSearched(true);
        if (res.data?.length) {
            const mapped: TeamMemberSearchItem[] = res.data.map((u) => ({
                employee: u,
                cascade_departments: [],
                company_id: companyId,
            }));
            setResults(filterValidSearchItems(mapped));
            return;
        }

        setResults([]);
    }, [companyId, departmentId, serverUrl]);

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    useEffect(() => {
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }
        const kw = query.trim();
        if (kw) {
            setLoading(true);
            debounceRef.current = setTimeout(() => {
                runSearch(kw);
            }, 300);
        } else {
            setResults([]);
            setSearched(false);
            setLoading(false);
        }

        return () => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }
        };
    }, [query, runSearch]);

    const title = intl.formatMessage({id: 'contacts.search.title', defaultMessage: 'Search contacts'});
    const defaultDepartmentLabel = intl.formatMessage({id: 'contacts.default_department', defaultMessage: 'Default Department'});
    const enterpriseLabel = intl.formatMessage({id: 'contacts.enterprise', defaultMessage: 'Enterprise Contacts'});

    const effectiveScreenId = (closeButtonId ?? componentId) as AvailableScreens;

    const handleClose = useCallback(() => {
        if (onBack) {
            onBack();
            return;
        }
        dismissModal({componentId: effectiveScreenId});
    }, [onBack, effectiveScreenId]);

    useAndroidHardwareBackHandler(effectiveScreenId, handleClose);

    const handleEmployeePress = useCallback((item: TeamMemberSearchItem) => {
        const emp = item.employee;
        const pathParts = cascadePathParts(item, defaultDepartmentLabel);
        const fallbackDepartmentName = departmentName ? normalizeDepartmentName(departmentName, defaultDepartmentLabel) : undefined;
        const leafDepartment = pathParts[pathParts.length - 1] || fallbackDepartmentName;
        const parentPath = pathParts.slice(0, -1).join('/');
        const titleProfile = intl.formatMessage({id: 'contacts.personal_info', defaultMessage: 'Personal Information'});
        const cid = `close-employee-search-${emp.id}`;
        showModalWithBackButton(
            Screens.CONTACTS_EMPLOYEE_PROFILE,
            titleProfile,
            cid,
            {
                employee: emp,
                departmentName: leafDepartment,
                departmentParentPath: parentPath,
                companyName,
                companyId,
                currentUserId,
                closeButtonId: cid,
            },
            {useBackIcon: true},
        );
    }, [companyId, companyName, currentUserId, defaultDepartmentLabel, departmentName, intl]);

    const inviteUrl = `${serverUrl}/invite?invited_by=${currentUserId}`;

    const handleCopyInviteUrl = useCallback(() => {
        Clipboard.setString(inviteUrl);
        Alert.alert(
            intl.formatMessage({id: 'mobile.link.copied', defaultMessage: '已复制'}),
        );
    }, [inviteUrl, intl]);

    const showInviteCard = query.trim() && searched && !loading && results.length === 0;

    let emptyMessage: string | null = null;
    if (query.trim()) {
        if (searched && !loading && !showInviteCard) {
            emptyMessage = intl.formatMessage({id: 'contacts.search.no_results', defaultMessage: '未找到匹配的联系人'});
        }
    } else {
        emptyMessage = intl.formatMessage({id: 'contacts.search.hint', defaultMessage: '输入昵称、邮箱或手机号搜索'});
    }

    const renderItem = useCallback(
        ({item}: {item: TeamMemberSearchItem}) => {
            const path = cascadePathLabel(item, defaultDepartmentLabel, enterpriseLabel);
            return (
                <TouchableOpacity
                    style={styles.row}
                    onPress={() => handleEmployeePress(item)}
                    activeOpacity={0.7}
                    testID={`contacts.search.result.${item.employee.id}`}
                >
                    <View style={styles.rowAvatar}>
                        <ContactAvatar
                            employee={item.employee}
                            size={40}
                        />
                    </View>
                    <View style={styles.rowText}>
                        <Text
                            style={styles.rowName}
                            numberOfLines={1}
                        >
                            {getContactListDisplayName(item.employee)}
                        </Text>
                        {path ? (
                            <Text
                                style={styles.rowPath}
                                numberOfLines={2}
                            >
                                {path}
                            </Text>
                        ) : null}
                    </View>
                </TouchableOpacity>
            );
        },
        [defaultDepartmentLabel, enterpriseLabel, handleEmployeePress, styles],
    );

    return (
        <SafeAreaView
            style={[styles.flex, {backgroundColor: theme.sidebarBg}]}
            edges={SAFE_AREA_EDGES}
        >
            {onBack ? (
                <View style={styles.header}>
                    <TouchableOpacity
                        style={styles.backHit}
                        onPress={handleClose}
                        hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}
                        testID='contacts.search.back'
                    >
                        <CompassIcon
                            name={Platform.select({ios: 'arrow-back-ios', default: 'arrow-left'})}
                            size={22}
                            color={theme.sidebarHeaderTextColor}
                        />
                    </TouchableOpacity>
                    <Text
                        style={styles.headerTitle}
                        numberOfLines={1}
                    >
                        {title}
                    </Text>
                </View>
            ) : null}
            <ContactSearchScopeHint
                variant='onSidebarHeader'
                companyName={companyName}
                departmentBreadcrumb={departmentBreadcrumb}
                departmentName={departmentName}
                departmentScoped={typeof departmentId === 'number' && Boolean(departmentName)}
                testID='contacts.search.scope'
            />
            <View style={styles.searchWrap}>
                <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder={intl.formatMessage({
                        id: 'contacts.search.placeholder',
                        defaultMessage: '昵称、邮箱、手机号…',
                    })}
                    placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.48)}
                    style={styles.searchInput}
                    autoCorrect={false}
                    autoCapitalize='none'
                    clearButtonMode={Platform.OS === 'ios' ? 'while-editing' : 'never'}
                    returnKeyType='search'
                    testID='contacts.search.input'
                />
            </View>
            <FlatList
                style={[styles.flex, {backgroundColor: theme.centerChannelBg}]}
                data={results}
                keyExtractor={(item, index) => item.employee?.id ?? `invalid-contact-${index}`}
                renderItem={renderItem}
                contentContainerStyle={[
                    styles.listContent,
                    results.length === 0 && query.trim() ? {flexGrow: 1} : undefined,
                ]}
                ListHeaderComponent={
                    loading ? (
                        <View style={{paddingVertical: 12, alignItems: 'center'}}>
                            <ActivityIndicator color={theme.buttonBg}/>
                        </View>
                    ) : null
                }
                ListEmptyComponent={
                    !loading ? (
                        showInviteCard ? (
                            <View style={styles.inviteCard}>
                                <Text style={styles.inviteTitle}>
                                    {intl.formatMessage({id: 'contacts.search.no_results', defaultMessage: '未找到该成员'})}
                                </Text>
                                <Text style={styles.inviteDesc}>
                                    {intl.formatMessage({id: 'contacts.search.invite_desc', defaultMessage: '您可以复制邀请链接发送给对方，邀请其加入企业。'})}
                                </Text>
                                <View style={styles.inviteUrlRow}>
                                    <Text style={styles.inviteUrl} numberOfLines={1}>{inviteUrl}</Text>
                                    <TouchableOpacity style={styles.copyBtn} onPress={handleCopyInviteUrl}>
                                        <Text style={styles.copyBtnText}>
                                            {intl.formatMessage({id: 'contacts.external.add.copy', defaultMessage: '复制'})}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ) : emptyMessage ? (
                            <Text style={styles.empty}>{emptyMessage}</Text>
                        ) : null
                    ) : null
                }
                keyboardShouldPersistTaps='handled'
            />
        </SafeAreaView>
    );
};

const ContactsSearchScreen = (props: Props) => {
    return (
        <GlobalErrorBoundary>
            <ContactsSearchContent {...props}/>
        </GlobalErrorBoundary>
    );
};

export default ContactsSearchScreen;
