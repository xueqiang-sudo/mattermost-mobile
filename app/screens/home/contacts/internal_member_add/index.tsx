// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import Clipboard from '@react-native-clipboard/clipboard';
import {useNavigation, useRoute} from '@react-navigation/native';
import type {RouteProp} from '@react-navigation/native';
import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    Alert,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import {type Edge, SafeAreaView} from 'react-native-safe-area-context';

import {
    searchExactGlobalEmployeeContacts,
    addUserToDefaultDepartment,
    type EmployeeContactSearchRow,
} from '@actions/remote/employee_contact_new';
import {addUsersToTeam} from '@actions/remote/team';
import {MMEmployeeContactTypes} from '@client/rest/team_department';
import CompassIcon from '@components/compass_icon';
import ContactAvatar from '@components/contact_avatar';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import NetworkManager from '@managers/network_manager';
import {usePreventDoubleTap} from '@hooks/utils';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';
import {getLastPictureUpdate} from '@utils/user';

import type {ContactsStackParamList} from '../contacts_stack_param_list';

const edges: Edge[] = ['top', 'bottom', 'left', 'right'];

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    flex: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 4,
        backgroundColor: theme.sidebarBg,
    },
    headerBack: {
        padding: 4,
    },
    headerTitle: {
        ...typography('Heading', 300, 'SemiBold'),
        color: theme.sidebarText,
        textAlign: 'center',
        flex: 1,
    },
    headerPlaceholder: {
        width: 32,
    },
    content: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 32,
    },
    formField: {
        marginBottom: 12,
    },
    formLabel: {
        color: changeOpacity(theme.centerChannelColor, 0.64),
        ...typography('Body', 75),
        marginBottom: 4,
    },
    formInput: {
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        borderRadius: 8,
        color: theme.centerChannelColor,
        paddingHorizontal: 12,
        paddingVertical: 8,
        ...typography('Body', 100),
    },
    phoneRow: {
        flexDirection: 'row',
        gap: 8,
    },
    phoneInput: {
        flex: 1,
    },
    btn: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 8,
        backgroundColor: theme.buttonBg,
        justifyContent: 'center',
        alignItems: 'center',
    },
    btnText: {
        color: theme.buttonColor,
        ...typography('Body', 100, 'SemiBold'),
    },
    btnDisabled: {
        opacity: 0.5,
    },
    saveBtnWrap: {
        marginTop: 20,
        alignItems: 'center',
    },
    saveBtn: {
        paddingHorizontal: 40,
        paddingVertical: 12,
        minWidth: 120,
    },
    formError: {
        ...typography('Body', 75),
        color: theme.errorTextColor,
        marginTop: 4,
    },
    resultSection: {
        marginTop: 16,
        paddingTop: 16,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    resultGrid: {
        paddingVertical: 8,
    },
    nicknameValueRow: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
    },
    nicknameAvatar: {
        marginRight: 8,
    },
    resultRow: {
        flexDirection: 'row',
        paddingVertical: 6,
    },
    resultLabel: {
        width: 80,
        color: changeOpacity(theme.centerChannelColor, 0.56),
        ...typography('Body', 100),
    },
    resultValue: {
        flex: 1,
        color: theme.centerChannelColor,
        ...typography('Body', 100),
    },
    duplicateMessage: {
        ...typography('Body', 100),
        color: theme.errorTextColor,
        textAlign: 'center',
        paddingVertical: 16,
    },
    inviteCard: {
        marginTop: 16,
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
    },
    inviteDesc: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.64),
        marginBottom: 12,
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

type ContactsInternalMemberAddScreenRouteProp = RouteProp<ContactsStackParamList, typeof import('@constants').Screens.INTERNAL_MEMBER_ADD>;

const ContactsInternalMemberAddScreen = () => {
    const theme = useTheme();
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const navigation = useNavigation();
    const route = useRoute<ContactsInternalMemberAddScreenRouteProp>();
    const styles = getStyleSheet(theme);

    const {ownerId, companyId, companyName} = route.params;
    const kind = MMEmployeeContactTypes.External;

    const [phone, setPhone] = useState('');
    const [searching, setSearching] = useState(false);
    const [searchResult, setSearchResult] = useState<EmployeeContactSearchRow | null>(null);
    const [notFound, setNotFound] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [alreadyInTeam, setAlreadyInTeam] = useState(false);
    const [teamInviteId, setTeamInviteId] = useState('');

    // Gender i18n helper
    const getGenderLabel = useCallback((gender: string): string => {
        switch (gender.toLowerCase()) {
            case 'male':
            case '男':
                return intl.formatMessage({id: 'contacts.gender.male', defaultMessage: '男'});
            case 'female':
            case '女':
                return intl.formatMessage({id: 'contacts.gender.female', defaultMessage: '女'});
            case 'other':
            case '其他':
                return intl.formatMessage({id: 'contacts.gender.other', defaultMessage: '其他'});
            default:
                return gender;
        }
    }, [intl]);

    // Load team invite ID
    useEffect(() => {
        const loadTeamInfo = async () => {
            if (!serverUrl || !companyId) {
                return;
            }
            try {
                const client = NetworkManager.getClient(serverUrl);
                const team = await client.getTeam(companyId);
                if (team?.invite_id) {
                    setTeamInviteId(team.invite_id);
                }
            } catch {
                // ignore
            }
        };
        loadTeamInfo();
    }, [companyId, serverUrl]);

    const inviteUrl = `${serverUrl}/invite?id=${teamInviteId}`;

    const handleSearch = usePreventDoubleTap(useCallback(async () => {
        const trimmedPhone = phone.trim();
        if (!trimmedPhone || !ownerId) {
            return;
        }
        Keyboard.dismiss();
        setSearching(true);
        setSearchResult(null);
        setNotFound(false);
        setAlreadyInTeam(false);
        setError('');
        try {
            const result = await searchExactGlobalEmployeeContacts(serverUrl, kind, ownerId, trimmedPhone);
            if (result.error || !result.data || result.data.length === 0) {
                setNotFound(true);
            } else {
                // Check if user is already in team
                try {
                    const client = NetworkManager.getClient(serverUrl);
                    const members = await client.getTeamMembers(companyId, 0, 1000);
                    const isInTeam = members.some((m: any) => m.user_id === result.data![0].employee.id);
                    if (isInTeam) {
                        setAlreadyInTeam(true);
                    } else {
                        setSearchResult(result.data[0]);
                    }
                } catch {
                    // If check fails, proceed with search result
                    setSearchResult(result.data[0]);
                }
            }
        } catch {
            setNotFound(true);
        } finally {
            setSearching(false);
        }
    }, [phone, ownerId, serverUrl, kind, companyId]));

    const handleSave = usePreventDoubleTap(useCallback(async () => {
        if (!searchResult || !companyId) {
            return;
        }
        setSaving(true);
        setError('');
        try {
            // 1. Add user to team
            const teamResult = await addUsersToTeam(serverUrl, companyId, [searchResult.employee.id]);
            if (teamResult.error) {
                setError(intl.formatMessage({id: 'contacts.add_to_team_failed', defaultMessage: '添加到团队失败'}));
                return;
            }

            // 2. Add user to default department (fire-and-forget)
            try {
                await addUserToDefaultDepartment(serverUrl, companyId, searchResult.employee.id);
            } catch {
                // Even if adding to department fails, user is already in team
            }

            navigation.goBack();
        } catch {
            setError(intl.formatMessage({id: 'contacts.add_member_failed', defaultMessage: '添加成员失败'}));
        } finally {
            setSaving(false);
        }
    }, [searchResult, companyId, serverUrl, intl, navigation]));

    const handlePhoneChange = useCallback((text: string) => {
        setPhone(text);
        if (searchResult || notFound || alreadyInTeam) {
            setSearchResult(null);
            setNotFound(false);
            setAlreadyInTeam(false);
            setError('');
        }
    }, [searchResult, notFound, alreadyInTeam]);

    const handleCopyInviteUrl = useCallback(() => {
        Clipboard.setString(inviteUrl);
        Alert.alert(
            intl.formatMessage({id: 'mobile.link.copied', defaultMessage: '已复制'}),
        );
    }, [inviteUrl, intl]);

    const canSearch = phone.trim().length > 0 && !searching && !saving;
    const canSave = searchResult && !saving;

    return (
        <SafeAreaView
            edges={edges}
            style={[styles.flex, {backgroundColor: theme.sidebarBg}]}
        >
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.headerBack}
                    onPress={() => navigation.goBack()}
                    hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                    testID='internal_member_add.back'
                >
                    <CompassIcon
                        name='arrow-left'
                        size={24}
                        color={theme.sidebarText}
                    />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>
                    {intl.formatMessage({id: 'contacts.add_member', defaultMessage: '添加成员'})}
                </Text>
                <View style={styles.headerPlaceholder}/>
            </View>
            <KeyboardAvoidingView
                style={styles.content}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <ScrollView
                    style={styles.flex}
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps='handled'
                >
                    {/* Phone search */}
                    <View style={styles.formField}>
                        <Text style={styles.formLabel}>
                            {intl.formatMessage({id: 'contacts.add_member.phone', defaultMessage: '手机号'})}
                        </Text>
                        <View style={styles.phoneRow}>
                            <TextInput
                                style={[styles.formInput, styles.phoneInput]}
                                value={phone}
                                onChangeText={handlePhoneChange}
                                placeholder={intl.formatMessage({id: 'contacts.add_member.phone_placeholder', defaultMessage: '输入手机号查找'})}
                                placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.32)}
                                keyboardType='phone-pad'
                                returnKeyType='search'
                                onSubmitEditing={handleSearch}
                                editable={!saving}
                                autoFocus={true}
                            />
                            <TouchableOpacity
                                style={[styles.btn, !canSearch && styles.btnDisabled]}
                                onPress={handleSearch}
                                disabled={!canSearch}
                            >
                                <Text style={styles.btnText}>
                                    {searching
                                        ? intl.formatMessage({id: 'contacts.add_member.searching', defaultMessage: '搜索中...'})
                                        : intl.formatMessage({id: 'contacts.add_member.search', defaultMessage: '查找'})
                                    }
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Not found - show invite card */}
                    {notFound && (
                        <View style={styles.inviteCard}>
                            <Text style={styles.inviteTitle}>
                                {intl.formatMessage({id: 'contacts.add_member_not_found', defaultMessage: '未找到该用户'})}
                            </Text>
                            <Text style={styles.inviteDesc}>
                                {intl.formatMessage({id: 'contacts.add_member_invite_desc', defaultMessage: '您可以复制邀请链接发送给对方，邀请其加入企业。'})}
                            </Text>
                            <View style={styles.inviteUrlRow}>
                                <Text style={styles.inviteUrl} numberOfLines={1}>{inviteUrl}</Text>
                                <TouchableOpacity style={styles.copyBtn} onPress={handleCopyInviteUrl}>
                                    <Text style={styles.copyBtnText}>
                                        {intl.formatMessage({id: 'contacts.add_member.copy', defaultMessage: '复制'})}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}

                    {/* Already in team message */}
                    {alreadyInTeam && (
                        <Text style={styles.duplicateMessage}>
                            {intl.formatMessage({id: 'contacts.already_in_team', defaultMessage: '该用户已是企业成员'})}
                        </Text>
                    )}

                    {/* Search result */}
                    {searchResult && (
                        <View style={styles.resultSection}>
                            {/* User info (read-only) */}
                            <View style={styles.resultGrid}>
                                <View style={styles.resultRow}>
                                    <Text style={styles.resultLabel}>
                                        {intl.formatMessage({id: 'contacts.nickname', defaultMessage: '昵称'})}
                                    </Text>
                                    <View style={styles.nicknameValueRow}>
                                        <View style={styles.nicknameAvatar}>
                                            <ContactAvatar
                                                employee={getLastPictureUpdate(searchResult.employee) > 0 ? searchResult.employee : undefined}
                                                size={32}
                                            />
                                        </View>
                                        <Text style={styles.resultValue}>
                                            {searchResult.employee.nickname || searchResult.employee.first_name || searchResult.employee.username}
                                        </Text>
                                    </View>
                                </View>
                                <View style={styles.resultRow}>
                                    <Text style={styles.resultLabel}>
                                        {intl.formatMessage({id: 'contacts.phone', defaultMessage: '手机号'})}
                                    </Text>
                                    <Text style={styles.resultValue}>
                                        {searchResult.employee.phone || '-'}
                                    </Text>
                                </View>
                                <View style={styles.resultRow}>
                                    <Text style={styles.resultLabel}>
                                        {intl.formatMessage({id: 'address_book.email', defaultMessage: '邮箱'})}
                                    </Text>
                                    <Text style={styles.resultValue}>
                                        {searchResult.employee.email || '-'}
                                    </Text>
                                </View>
                                <View style={styles.resultRow}>
                                    <Text style={styles.resultLabel}>
                                        {intl.formatMessage({id: 'channel_info.position', defaultMessage: '职位'})}
                                    </Text>
                                    <Text style={styles.resultValue}>
                                        {searchResult.employee.position || '-'}
                                    </Text>
                                </View>
                                {searchResult.employee.gender && (
                                    <View style={styles.resultRow}>
                                        <Text style={styles.resultLabel}>
                                            {intl.formatMessage({id: 'contacts.gender', defaultMessage: '性别'})}
                                        </Text>
                                        <Text style={styles.resultValue}>
                                            {getGenderLabel(searchResult.employee.gender)}
                                        </Text>
                                    </View>
                                )}
                            </View>

                            {error ? <Text style={styles.formError}>{error}</Text> : null}

                            {/* Save button - centered */}
                            <View style={styles.saveBtnWrap}>
                                <TouchableOpacity
                                    style={[styles.btn, styles.saveBtn, !canSave && styles.btnDisabled]}
                                    onPress={handleSave}
                                    disabled={!canSave}
                                >
                                    <Text style={styles.btnText}>
                                        {saving
                                            ? intl.formatMessage({id: 'contacts.add_member_saving', defaultMessage: '添加中...'})
                                            : intl.formatMessage({id: 'contacts.add_member_confirm', defaultMessage: '添加到部门'})
                                        }
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

export default ContactsInternalMemberAddScreen;
