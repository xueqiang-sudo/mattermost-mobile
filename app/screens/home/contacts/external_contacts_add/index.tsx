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
    headerRightBtn: {
        paddingHorizontal: 4,
        paddingVertical: 4,
    },
    headerRightBtnText: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.sidebarText,
    },
    headerRightBtnDisabled: {
        opacity: 0.32,
    },
    searchSection: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        minHeight: 40,
    },
    searchInput: {
        flex: 1,
        color: theme.centerChannelColor,
        fontSize: 16,
        padding: 0,
    },
    searchButton: {
        marginLeft: 8,
        paddingHorizontal: 16,
        paddingVertical: 6,
        backgroundColor: theme.buttonBg,
        borderRadius: 4,
    },
    searchButtonText: {
        color: theme.buttonColor,
        fontSize: 14,
        fontWeight: '600',
    },
    resultCard: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderRadius: 8,
        padding: 16,
        marginBottom: 12,
    },
    resultHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    resultIcon: {
        marginRight: 8,
    },
    resultTitle: {
        color: theme.centerChannelColor,
        ...typography('Heading', 200, 'SemiBold'),
    },
    userProfile: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    userInfo: {
        flex: 1,
        marginLeft: 12,
    },
    messageText: {
        color: changeOpacity(theme.centerChannelColor, 0.7),
        ...typography('Body', 200),
        marginTop: 8,
    },
    inviteLinkText: {
        color: theme.linkColor,
        ...typography('Body', 100),
        marginTop: 8,
    },
    copyLinkButton: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 8,
        alignSelf: 'flex-start',
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: theme.buttonBg,
        borderRadius: 4,
    },
    copyLinkButtonText: {
        color: theme.buttonColor,
        marginLeft: 6,
        ...typography('Body', 100, 'SemiBold'),
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
    formError: {
        ...typography('Body', 75),
        color: theme.errorTextColor,
        marginTop: 4,
    },
    userDetail: {
        color: changeOpacity(theme.centerChannelColor, 0.6),
        ...typography('Body', 100),
        marginBottom: 2,
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
    const route = useRoute<ContactsExternalAddScreenRouteProp>();
    const styles = getStyleSheet(theme);

    // Support both React Navigation (route.params) and RNN modal (direct props)
    const ownerId = route.params?.ownerId || props.ownerId || '';
    const companyId = route.params?.companyId || props.companyId || '';
    const kind = MMEmployeeContactTypes.External;

    const [phone, setPhone] = useState('');
    const [searching, setSearching] = useState(false);
    const [searchResult, setSearchResult] = useState<EmployeeContactSearchRow | null>(null);
    const [searchError, setSearchError] = useState('');
    const [notFound, setNotFound] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    // Track whether we've already created a pending invitation for the current phone
    const [pendingInvitePhone, setPendingInvitePhone] = useState('');

    const handleGoBack = useCallback(() => {
        try {
            handleGoBack();
        } catch {
            popTopScreen();
        }
    }, [navigation]);

    const inviteUrl = `${serverUrl}/invite?invited_by=${ownerId}`;

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
        try {
            const result = await searchExactGlobalEmployeeContacts(serverUrl, kind, ownerId, trimmedPhone);
            if (result.error || !result.data || result.data.length === 0) {
                setNotFound(true);
            } else {
                setSearchResult(result.data[0]);
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
            client.createInvitation(ownerId, trimmedPhone).catch(() => {
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
        });
        setSaving(false);
        if (result.error) {
            setError(intl.formatMessage({id: 'contacts.external.add_failed', defaultMessage: 'Failed to add contact'}));
        } else {
            handleGoBack();
        }
    }, [ownerId, searchResult, serverUrl, kind, intl, navigation]));

    const handlePhoneChange = useCallback((text: string) => {
        setPhone(text);
        if (searchResult || searchError || notFound) {
            setSearchResult(null);
            setSearchError('');
            setNotFound(false);
        }
    }, [searchResult, searchError, notFound]);

    const handleCopyInviteUrl = useCallback(() => {
        Clipboard.setString(inviteUrl);
        Alert.alert(
            intl.formatMessage({id: 'mobile.link.copied', defaultMessage: 'Copied to clipboard'}),
        );
    }, [inviteUrl, intl]);

    const canSearch = phone.trim().length > 0 && !searching && !saving;
    const canSave = searchResult && !searchResult.alreadyAdded && !saving;

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
                <TouchableOpacity
                    style={[styles.headerRightBtn, !canSave && styles.headerRightBtnDisabled]}
                    onPress={handleSave}
                    disabled={!canSave || saving}
                    testID='external_contacts_add.add_button'
                >
                    <Text style={styles.headerRightBtnText}>
                        {saving
                            ? intl.formatMessage({id: 'contacts.external.add.adding', defaultMessage: '添加中...'})
                            : intl.formatMessage({id: 'contacts.external.add.add_btn', defaultMessage: '添加'})
                        }
                    </Text>
                </TouchableOpacity>
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
                    <View style={styles.searchSection}>
                        <View style={styles.searchBar}>
                            <TextInput
                                style={styles.searchInput}
                                value={phone}
                                onChangeText={handlePhoneChange}
                                placeholder={intl.formatMessage({id: 'contacts.external.add.phone_placeholder', defaultMessage: '输入手机号搜索'})}
                                placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.5)}
                                keyboardType='phone-pad'
                                returnKeyType='search'
                                onSubmitEditing={handleSearch}
                                editable={!saving}
                                autoFocus={true}
                            />
                            <TouchableOpacity
                                style={styles.searchButton}
                                onPress={handleSearch}
                                disabled={!canSearch}
                            >
                                <Text style={styles.searchButtonText}>
                                    {searching
                                        ? intl.formatMessage({id: 'contacts.external.add.searching', defaultMessage: '搜索中...'})
                                        : intl.formatMessage({id: 'contacts.external.add.search', defaultMessage: '搜索'})
                                    }
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Not found - show invite card */}
                    {notFound && (
                        <View style={styles.resultCard}>
                            <View style={styles.resultHeader}>
                                <CompassIcon
                                    name='close-circle'
                                    size={20}
                                    color='#F44336'
                                    style={styles.resultIcon}
                                />
                                <Text style={styles.resultTitle}>
                                    {intl.formatMessage({id: 'contacts.external.add.not_found', defaultMessage: '未注册'})}
                                </Text>
                            </View>
                            <Text style={styles.messageText}>
                                {intl.formatMessage({id: 'contacts.external.add.invite_desc', defaultMessage: '该手机号尚未注册。请复制邀请链接发送给对方，对方使用该手机号注册后将自动与您建立外部联系人关系。'})}
                            </Text>
                            <Text style={styles.inviteLinkText} numberOfLines={1}>{inviteUrl}</Text>
                            <TouchableOpacity style={styles.copyLinkButton} onPress={handleCopyInviteUrl}>
                                <CompassIcon name='content-copy' size={16} color={theme.buttonColor}/>
                                <Text style={styles.copyLinkButtonText}>
                                    {intl.formatMessage({id: 'contacts.external.add.copy_link', defaultMessage: '复制链接'})}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* Already a contact - warning style */}
                    {searchResult && searchResult.alreadyAdded && (
                        <View style={styles.resultCard}>
                            <View style={styles.resultHeader}>
                                <CompassIcon
                                    name='information-outline'
                                    size={20}
                                    color='#FF9800'
                                    style={styles.resultIcon}
                                />
                                <Text style={styles.resultTitle}>
                                    {intl.formatMessage({id: 'contacts.external.add.duplicate', defaultMessage: '该外部联系人已在您的列表中'})}
                                </Text>
                            </View>
                        </View>
                    )}

                    {/* Search result - found user */}
                    {searchResult && !searchResult.alreadyAdded && (
                        <>
                            <View style={styles.resultCard}>
                                <View style={styles.resultHeader}>
                                    <CompassIcon
                                        name='check-circle'
                                        size={20}
                                        color='#4CAF50'
                                        style={styles.resultIcon}
                                    />
                                    <Text style={styles.resultTitle}>
                                        {intl.formatMessage({id: 'contacts.external.add.found_registered', defaultMessage: '找到了已注册用户'})}
                                    </Text>
                                </View>
                                <View style={styles.userProfile}>
                                    <ContactAvatar
                                        employee={getLastPictureUpdate(searchResult.employee) > 0 ? searchResult.employee : undefined}
                                        size={48}
                                    />
                                    <View style={styles.userInfo}>
                                        <Text style={styles.userDetail}>
                                            {intl.formatMessage({id: 'contacts.external.add.account_label', defaultMessage: '账号'})}: {searchResult.employee.phone || searchResult.employee.username}
                                        </Text>
                                        <Text style={styles.userDetail}>
                                            {intl.formatMessage({id: 'contacts.external.add.nickname_label', defaultMessage: '昵称'})}: {searchResult.employee.nickname || searchResult.employee.first_name || searchResult.employee.username}
                                        </Text>
                                    </View>
                                </View>
                            </View>

                            {error ? <Text style={styles.formError}>{error}</Text> : null}
                        </>
                    )}
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

export default ContactsExternalAddScreen;
