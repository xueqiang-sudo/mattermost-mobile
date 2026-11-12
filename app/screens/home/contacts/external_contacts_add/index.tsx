// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import Clipboard from '@react-native-clipboard/clipboard';
import {useNavigation} from '@react-navigation/native';
import type {RouteProp} from '@react-navigation/native';
import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    Alert,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
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
    addEmployeeContact,
    searchExactGlobalEmployeeContacts,
    type EmployeeContactSearchRow,
} from '@actions/remote/employee_contact_new';
import {MMEmployeeContactTypes} from '@client/rest/team_department';
import CompassIcon from '@components/compass_icon';
import ContactAvatar from '@components/contact_avatar';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import NetworkManager from '@managers/network_manager';
import {usePreventDoubleTap} from '@hooks/utils';
import {popTopScreen} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';
import {getLastPictureUpdate} from '@utils/user';

import type {ContactsStackParamList} from '../contacts_stack_param_list';
import type {Team} from '@mattermost/types/teams';

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
    formInputDisabled: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        color: changeOpacity(theme.centerChannelColor, 0.56),
    },
    formTextArea: {
        minHeight: 60,
        textAlignVertical: 'top',
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
    btnSecondary: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: theme.buttonBg,
    },
    btnSecondaryText: {
        color: theme.buttonBg,
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
    searchError: {
        ...typography('Body', 75),
        color: theme.errorTextColor,
        marginTop: 4,
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
    userDetail: {
        color: changeOpacity(theme.centerChannelColor, 0.6),
        ...typography('Body', 100),
        marginBottom: 2,
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
    companyDropdownBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: theme.centerChannelBg,
    },
    companyDropdownText: {
        ...typography('Body', 100),
        color: theme.centerChannelColor,
        flex: 1,
    },
    companyDropdownPlaceholder: {
        color: changeOpacity(theme.centerChannelColor, 0.5),
    },
    dropdownOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.3)',
        zIndex: 100,
    },
    dropdown: {
        position: 'absolute',
        left: 16,
        right: 16,
        backgroundColor: theme.centerChannelBg,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.12),
        maxHeight: 200,
        zIndex: 101,
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.15,
        shadowRadius: 4,
    },
    dropdownItem: {
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.06),
    },
    dropdownItemText: {
        ...typography('Body', 100),
        color: theme.centerChannelColor,
    },
    dropdownItemSelected: {
        backgroundColor: changeOpacity(theme.buttonBg, 0.08),
    },
}));

type ContactsExternalAddScreenRouteProp = RouteProp<ContactsStackParamList, typeof import('@constants').Screens.CONTACTS_EXTERNAL_ADD>;

type ExternalAddProps = {
    ownerId?: string;
    companyId?: string;
};

const ContactsExternalAddScreen = (props: ExternalAddProps) => {
    const theme = useTheme();
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const navigation = useNavigation();
    const styles = getStyleSheet(theme);

    // Support both React Navigation (from contacts stack) and RNN modal (from "+" menu)
    const ownerId = props.ownerId || '';
    const companyId = props.companyId || '';
    const kind = MMEmployeeContactTypes.External;

    const [phone, setPhone] = useState('');
    const [searching, setSearching] = useState(false);
    const [searchResult, setSearchResult] = useState<EmployeeContactSearchRow | null>(null);
    const [searchError, setSearchError] = useState('');
    const [notFound, setNotFound] = useState(false);
    const [remark, setRemark] = useState('');
    const [company, setCompany] = useState('');
    const [description, setDescription] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    // Multi-company state
    const [userTeams, setUserTeams] = useState<Team[]>([]);
    const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
    const [teamDropdownOpen, setTeamDropdownOpen] = useState(false);

    // Track whether we've already created a pending invitation for the current phone
    const [pendingInvitePhone, setPendingInvitePhone] = useState('');
    const [invitationId, setInvitationId] = useState<string | null>(null);

    const handleGoBack = useCallback(() => {
        try {
            handleGoBack();
        } catch {
            popTopScreen();
        }
    }, [navigation]);

    const inviteUrl = invitationId
        ? `${serverUrl}/invite?id=${invitationId}`
        : `${serverUrl}/invite?invited_by=${ownerId}`;

    const handleSearch = usePreventDoubleTap(useCallback(async () => {
        const trimmedPhone = phone.trim();
        if (!trimmedPhone || !ownerId) {
            return;
        }
        Keyboard.dismiss();
        setSearching(true);
        setSearchError('');
        setSearchResult(null);
        setNotFound(false);
        setUserTeams([]);
        setSelectedTeamId(null);
        setCompany('');
        try {
            const result = await searchExactGlobalEmployeeContacts(serverUrl, kind, ownerId, trimmedPhone);
            if (result.error || !result.data || result.data.length === 0) {
                setNotFound(true);
            } else {
                setSearchResult(result.data[0]);
                // Fetch user's teams for multi-company handling
                try {
                    const client = NetworkManager.getClient(serverUrl);
                    const teams = await client.getTeamsForUser(result.data[0].employee.id);
                    const filteredTeams = (teams || []).filter((t: Team) => t.type !== 'P');
                    setUserTeams(filteredTeams);
                    if (filteredTeams.length === 1) {
                        setCompany(filteredTeams[0].display_name);
                        setSelectedTeamId(filteredTeams[0].id);
                    }
                } catch {
                    // Ignore team fetch errors
                }
            }
        } catch {
            setNotFound(true);
        } finally {
            setSearching(false);
        }
    }, [phone, ownerId, serverUrl, kind]));

    // Pre-invitation: when search returns not found, create a pending invitation
    // record on the server so that the invitee is auto-matched on registration.
    useEffect(() => {
        if (!notFound || !ownerId || !serverUrl || !phone.trim()) {
            return;
        }
        const trimmedPhone = phone.trim();
        if (trimmedPhone === pendingInvitePhone) {
            return; // already created for this phone
        }
        setPendingInvitePhone(trimmedPhone);
        try {
            const client = NetworkManager.getClient(serverUrl);
            client.createInvitation(ownerId, trimmedPhone).then((invitation: any) => {
                if (invitation?.id) {
                    setInvitationId(invitation.id);
                }
            }).catch(() => {
                // best-effort: don't block UI if server call fails
            });
        } catch {
            // ignore
        }
    }, [notFound, ownerId, serverUrl, phone, pendingInvitePhone]);

    const handleSave = usePreventDoubleTap(useCallback(async () => {
        if (!ownerId || !searchResult || searchResult.alreadyAdded) {
            return;
        }
        setSaving(true);
        setError('');
        const result = await addEmployeeContact(serverUrl, ownerId, {
            contact_id: searchResult.employee.id,
            contact_type: kind,
            company: company.trim(),
            remark: remark.trim(),
            description: description.trim(),
        });
        setSaving(false);
        if (result.error) {
            setError(intl.formatMessage({id: 'contacts.external.add_failed', defaultMessage: 'Failed to add contact'}));
        } else {
            handleGoBack();
        }
    }, [ownerId, searchResult, remark, company, description, serverUrl, kind, intl, navigation]));

    const handlePhoneChange = useCallback((text: string) => {
        setPhone(text);
        if (searchResult || searchError || notFound) {
            setSearchResult(null);
            setSearchError('');
            setNotFound(false);
            setUserTeams([]);
            setSelectedTeamId(null);
            setCompany('');
            setTeamDropdownOpen(false);
            setInvitationId(null);
        }
    }, [searchResult, searchError, notFound]);

    const handleCopyInviteUrl = useCallback(() => {
        Clipboard.setString(inviteUrl);
        Alert.alert(
            intl.formatMessage({id: 'mobile.link.copied', defaultMessage: 'Copied to clipboard'}),
        );
    }, [inviteUrl, intl]);

    const handleTeamSelect = useCallback((teamId: string | null) => {
        setSelectedTeamId(teamId);
        setTeamDropdownOpen(false);
        if (teamId) {
            const team = userTeams.find((t) => t.id === teamId);
            setCompany(team?.display_name || '');
        } else {
            setCompany('');
        }
    }, [userTeams]);

    const canSearch = phone.trim().length > 0 && !searching && !saving;
    const canSave = searchResult && !searchResult.alreadyAdded && !saving;

    const renderCompanyField = () => {
        // Multiple teams: show dropdown
        if (userTeams.length > 1) {
            const selectedTeam = userTeams.find((t) => t.id === selectedTeamId);
            return (
                <View style={styles.formField}>
                    <Text style={styles.formLabel}>
                        {intl.formatMessage({id: 'contacts.external.add.company', defaultMessage: 'Company'})}
                    </Text>
                    <TouchableOpacity
                        style={styles.companyDropdownBtn}
                        onPress={() => setTeamDropdownOpen(!teamDropdownOpen)}
                        disabled={saving}
                    >
                        <Text style={[styles.companyDropdownText, !selectedTeam && styles.companyDropdownPlaceholder]}>
                            {selectedTeam?.display_name || intl.formatMessage({id: 'contacts.external.add.company_select', defaultMessage: 'Select company'})}
                        </Text>
                        <CompassIcon
                            name={teamDropdownOpen ? 'menu-up' : 'menu-down'}
                            size={20}
                            color={changeOpacity(theme.centerChannelColor, 0.56)}
                        />
                    </TouchableOpacity>
                    {teamDropdownOpen && (
                        <ScrollView style={styles.dropdown} nestedScrollEnabled={true}>
                            <TouchableOpacity
                                style={[styles.dropdownItem, !selectedTeamId && styles.dropdownItemSelected]}
                                onPress={() => handleTeamSelect(null)}
                            >
                                <Text style={styles.dropdownItemText}>
                                    {intl.formatMessage({id: 'contacts.external.add.no_company', defaultMessage: 'None (individual client)'})}
                                </Text>
                            </TouchableOpacity>
                            {userTeams.map((team) => (
                                <TouchableOpacity
                                    key={team.id}
                                    style={[styles.dropdownItem, selectedTeamId === team.id && styles.dropdownItemSelected]}
                                    onPress={() => handleTeamSelect(team.id)}
                                >
                                    <Text style={styles.dropdownItemText}>{team.display_name}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    )}
                </View>
            );
        }

        // Single team: show read-only
        if (userTeams.length === 1) {
            return (
                <View style={styles.formField}>
                    <Text style={styles.formLabel}>
                        {intl.formatMessage({id: 'contacts.external.add.company', defaultMessage: 'Company'})}
                    </Text>
                    <TextInput
                        style={[styles.formInput, styles.formInputDisabled]}
                        value={userTeams[0].display_name}
                        editable={false}
                    />
                </View>
            );
        }

        // No teams: show editable text input
        return (
            <View style={styles.formField}>
                <Text style={styles.formLabel}>
                    {intl.formatMessage({id: 'contacts.external.add.company', defaultMessage: 'Company'})}
                </Text>
                <TextInput
                    style={styles.formInput}
                    value={company}
                    onChangeText={setCompany}
                    placeholder={intl.formatMessage({id: 'contacts.external.add.company_placeholder', defaultMessage: 'Leave empty for individual client'})}
                    placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.32)}
                    editable={!saving}
                />
            </View>
        );
    };

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
                    testID='external_contacts_add.back'
                >
                    <CompassIcon
                        name='arrow-left'
                        size={24}
                        color={theme.sidebarText}
                    />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>
                    {intl.formatMessage({id: 'contacts.external.add', defaultMessage: '添加外部联系人'})}
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
                            {intl.formatMessage({id: 'contacts.external.add.phone', defaultMessage: '手机号'})}
                        </Text>
                        <View style={styles.phoneRow}>
                            <TextInput
                                style={[styles.formInput, styles.phoneInput]}
                                value={phone}
                                onChangeText={handlePhoneChange}
                                placeholder={intl.formatMessage({id: 'contacts.external.add.phone_placeholder', defaultMessage: '输入手机号查找'})}
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
                                        ? intl.formatMessage({id: 'contacts.external.add.searching', defaultMessage: '搜索中...'})
                                        : intl.formatMessage({id: 'contacts.external.add.search', defaultMessage: '查找'})
                                    }
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Not found - show invite card */}
                    {notFound && (
                        <View style={styles.inviteCard}>
                            <View style={{flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8}}>
                                <CompassIcon name='information-outline' size={16} color={theme.linkColor} style={{marginRight: 6, marginTop: 2}}/>
                                <View style={{flex: 1}}>
                                    <Text style={[styles.inviteTitle, {marginBottom: 4}]}>
                                        {intl.formatMessage({id: 'contacts.external.add.not_found', defaultMessage: '未注册'})}
                                    </Text>
                                    <Text style={styles.inviteDesc}>
                                        {intl.formatMessage({id: 'contacts.external.add.invite_desc', defaultMessage: '该手机号尚未注册。请复制邀请链接发送给对方，对方使用该手机号注册后将自动与您建立外部联系人关系。'})}
                                    </Text>
                                </View>
                            </View>
                            <View style={styles.inviteUrlRow}>
                                <Text style={styles.inviteUrl} numberOfLines={1}>{inviteUrl}</Text>
                                <TouchableOpacity style={styles.copyBtn} onPress={handleCopyInviteUrl}>
                                    <Text style={styles.copyBtnText}>
                                        {intl.formatMessage({id: 'contacts.external.add.copy_link', defaultMessage: '复制链接'})}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}

                    {/* Already a contact - warning style */}
                    {searchResult && searchResult.alreadyAdded && (
                        <View style={[styles.inviteCard, {backgroundColor: changeOpacity('#FF9800', 0.08), borderColor: changeOpacity('#FF9800', 0.3)}]}>
                            <View style={{flexDirection: 'row', alignItems: 'center'}}>
                                <CompassIcon name='information-outline' size={16} color='#FF9800' style={{marginRight: 6}}/>
                                <Text style={{...typography('Body', 100), color: '#FF9800'}}>
                                    {intl.formatMessage({id: 'contacts.external.add.duplicate', defaultMessage: '该外部联系人已在您的列表中'})}
                                </Text>
                            </View>
                        </View>
                    )}

                    {/* Search result */}
                    {searchResult && !searchResult.alreadyAdded && (
                        <View style={styles.resultSection}>
                            {/* Found registered user header */}
                            <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 12}}>
                                <CompassIcon name='information-outline' size={16} color={theme.linkColor} style={{marginRight: 6}}/>
                                <Text style={{...typography('Body', 200, 'SemiBold'), color: theme.centerChannelColor}}>
                                    {intl.formatMessage({id: 'contacts.external.add.found_registered', defaultMessage: '找到了已注册用户'})}
                                </Text>
                            </View>

                            {/* User info card - webapp style */}
                            <View style={[styles.inviteCard, {marginBottom: 16}]}>
                                <View style={{flexDirection: 'row', alignItems: 'center'}}>
                                    <ContactAvatar
                                        employee={getLastPictureUpdate(searchResult.employee) > 0 ? searchResult.employee : undefined}
                                        size={48}
                                    />
                                    <View style={{flex: 1, marginLeft: 12}}>
                                        <Text style={styles.userDetail}>
                                            {intl.formatMessage({id: 'contacts.external.add.account_label', defaultMessage: '账号'})}: {searchResult.employee.phone || searchResult.employee.username}
                                        </Text>
                                        <Text style={styles.userDetail}>
                                            {intl.formatMessage({id: 'contacts.external.add.nickname_label', defaultMessage: '昵称'})}: {searchResult.employee.nickname || searchResult.employee.first_name || searchResult.employee.username}
                                        </Text>
                                    </View>
                                </View>
                            </View>

                            {/* Editable fields */}
                            <View style={styles.formField}>
                                <Text style={styles.formLabel}>
                                    {intl.formatMessage({id: 'contacts.external.add.remark', defaultMessage: '备注名'})}
                                </Text>
                                <TextInput
                                    style={styles.formInput}
                                    value={remark}
                                    onChangeText={setRemark}
                                    placeholder={intl.formatMessage({id: 'contacts.external.add.remark_placeholder', defaultMessage: '显示名称'})}
                                    placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.32)}
                                    editable={!saving}
                                />
                            </View>

                            {renderCompanyField()}

                            <View style={styles.formField}>
                                <Text style={styles.formLabel}>
                                    {intl.formatMessage({id: 'contacts.external.add.description', defaultMessage: '描述'})}
                                </Text>
                                <TextInput
                                    style={[styles.formInput, styles.formTextArea]}
                                    value={description}
                                    onChangeText={setDescription}
                                    placeholder={intl.formatMessage({id: 'contacts.external.add.description_placeholder', defaultMessage: '可选备注'})}
                                    placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.32)}
                                    multiline={true}
                                    numberOfLines={3}
                                    editable={!saving}
                                />
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
                                            ? intl.formatMessage({id: 'contacts.external.add.adding', defaultMessage: '添加中...'})
                                            : intl.formatMessage({id: 'contacts.external.add.add_btn', defaultMessage: '添加'})
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

export default ContactsExternalAddScreen;
