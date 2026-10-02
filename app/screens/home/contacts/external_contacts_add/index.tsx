// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useNavigation, useRoute} from '@react-navigation/native';
import type {RouteProp} from '@react-navigation/native';
import React, {useCallback, useState} from 'react';
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
    searchBtn: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
        backgroundColor: theme.buttonBg,
        justifyContent: 'center',
    },
    searchBtnText: {
        color: theme.buttonColor,
        ...typography('Body', 100, 'SemiBold'),
    },
    searchBtnDisabled: {
        opacity: 0.5,
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
    resultAvatarSection: {
        alignItems: 'center',
        marginBottom: 16,
    },
    resultName: {
        ...typography('Heading', 300, 'SemiBold'),
        color: theme.centerChannelColor,
        marginTop: 8,
    },
    resultGrid: {
        paddingVertical: 8,
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
}));

type ContactsExternalAddScreenRouteProp = RouteProp<ContactsStackParamList, typeof import('@constants').Screens.CONTACTS_EXTERNAL_ADD>;

const ContactsExternalAddScreen = () => {
    const theme = useTheme();
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const navigation = useNavigation();
    const route = useRoute<ContactsExternalAddScreenRouteProp>();
    const styles = getStyleSheet(theme);

    const {ownerId} = route.params;
    const kind = MMEmployeeContactTypes.External;

    const [phone, setPhone] = useState('');
    const [searching, setSearching] = useState(false);
    const [searchResult, setSearchResult] = useState<EmployeeContactSearchRow | null>(null);
    const [searchError, setSearchError] = useState('');
    const [remark, setRemark] = useState('');
    const [company, setCompany] = useState('');
    const [description, setDescription] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const handleSearch = usePreventDoubleTap(useCallback(async () => {
        const trimmedPhone = phone.trim();
        if (!trimmedPhone || !ownerId) {
            return;
        }
        Keyboard.dismiss();
        setSearching(true);
        setSearchError('');
        setSearchResult(null);
        try {
            const result = await searchExactGlobalEmployeeContacts(serverUrl, kind, ownerId, trimmedPhone);
            if (result.error) {
                setSearchError(intl.formatMessage({id: 'contacts.external.add.not_found', defaultMessage: 'User not found'}));
            } else if (result.data && result.data.length > 0) {
                setSearchResult(result.data[0]);
            } else {
                setSearchError(intl.formatMessage({id: 'contacts.external.add.not_found', defaultMessage: 'User not found'}));
            }
        } catch {
            setSearchError(intl.formatMessage({id: 'contacts.external.add.not_found', defaultMessage: 'User not found'}));
        } finally {
            setSearching(false);
        }
    }, [phone, ownerId, serverUrl, kind, intl]));

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
            navigation.goBack();
        }
    }, [ownerId, searchResult, remark, company, description, serverUrl, kind, intl, navigation]));

    const handlePhoneChange = useCallback((text: string) => {
        setPhone(text);
        if (searchResult || searchError) {
            setSearchResult(null);
            setSearchError('');
        }
    }, [searchResult, searchError]);

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
                    {intl.formatMessage({id: 'contacts.external.add', defaultMessage: 'Add External Contact'})}
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
                            {intl.formatMessage({id: 'contacts.external.add.phone', defaultMessage: 'Phone Number'})}
                        </Text>
                        <View style={styles.phoneRow}>
                            <TextInput
                                style={[styles.formInput, styles.phoneInput]}
                                value={phone}
                                onChangeText={handlePhoneChange}
                                placeholder={intl.formatMessage({id: 'contacts.external.add.phone_placeholder', defaultMessage: 'Enter phone number to search'})}
                                placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.32)}
                                keyboardType='phone-pad'
                                returnKeyType='search'
                                onSubmitEditing={handleSearch}
                                editable={!saving}
                                autoFocus={true}
                            />
                            <TouchableOpacity
                                style={[styles.searchBtn, !canSearch && styles.searchBtnDisabled]}
                                onPress={handleSearch}
                                disabled={!canSearch}
                            >
                                <Text style={styles.searchBtnText}>
                                    {searching
                                        ? intl.formatMessage({id: 'contacts.external.add.searching', defaultMessage: 'Searching...'})
                                        : intl.formatMessage({id: 'contacts.external.add.search', defaultMessage: 'Search'})
                                    }
                                </Text>
                            </TouchableOpacity>
                        </View>
                        {searchError ? (
                            <Text style={styles.searchError}>{searchError}</Text>
                        ) : null}
                    </View>

                    {/* Search result */}
                    {searchResult && searchResult.alreadyAdded && (
                        <Text style={styles.duplicateMessage}>
                            {intl.formatMessage({id: 'contacts.external.add.duplicate', defaultMessage: 'Contact already exists'})}
                        </Text>
                    )}

                    {searchResult && !searchResult.alreadyAdded && (
                        <View style={styles.resultSection}>
                            {/* User info (read-only) */}
                            <View style={styles.resultAvatarSection}>
                                <ContactAvatar
                                    employee={getLastPictureUpdate(searchResult.employee) > 0 ? searchResult.employee : undefined}
                                    size={64}
                                />
                                <Text style={styles.resultName}>
                                    {searchResult.employee.nickname || searchResult.employee.first_name || searchResult.employee.username}
                                </Text>
                            </View>
                            <View style={styles.resultGrid}>
                                <View style={styles.resultRow}>
                                    <Text style={styles.resultLabel}>
                                        {intl.formatMessage({id: 'address_book.email', defaultMessage: 'Email'})}
                                    </Text>
                                    <Text style={styles.resultValue}>
                                        {searchResult.employee.email || '-'}
                                    </Text>
                                </View>
                            </View>

                            {/* Editable fields */}
                            <View style={styles.formField}>
                                <Text style={styles.formLabel}>
                                    {intl.formatMessage({id: 'contacts.external.add.remark', defaultMessage: 'Remark'})}
                                </Text>
                                <TextInput
                                    style={styles.formInput}
                                    value={remark}
                                    onChangeText={setRemark}
                                    placeholder={intl.formatMessage({id: 'contacts.external.add.remark_placeholder', defaultMessage: 'Display name'})}
                                    placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.32)}
                                    editable={!saving}
                                />
                            </View>
                            <View style={styles.formField}>
                                <Text style={styles.formLabel}>
                                    {intl.formatMessage({id: 'contacts.external.add.company', defaultMessage: '企业名称'})}
                                </Text>
                                <TextInput
                                    style={styles.formInput}
                                    value={company}
                                    onChangeText={setCompany}
                                    placeholder={intl.formatMessage({id: 'contacts.external.add.company_placeholder', defaultMessage: 'Company name'})}
                                    placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.32)}
                                    editable={!saving}
                                />
                            </View>
                            <View style={styles.formField}>
                                <Text style={styles.formLabel}>
                                    {intl.formatMessage({id: 'contacts.external.add.description', defaultMessage: 'Description'})}
                                </Text>
                                <TextInput
                                    style={[styles.formInput, styles.formTextArea]}
                                    value={description}
                                    onChangeText={setDescription}
                                    placeholder={intl.formatMessage({id: 'contacts.external.add.description_placeholder', defaultMessage: 'Optional notes'})}
                                    placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.32)}
                                    multiline={true}
                                    numberOfLines={3}
                                    editable={!saving}
                                />
                            </View>

                            {error ? <Text style={styles.formError}>{error}</Text> : null}

                            {/* Save button */}
                            <TouchableOpacity
                                style={[styles.searchBtn, {marginTop: 16}, !canSave && styles.searchBtnDisabled]}
                                onPress={handleSave}
                                disabled={!canSave}
                            >
                                <Text style={styles.searchBtnText}>
                                    {saving
                                        ? intl.formatMessage({id: 'contacts.external.add.saving', defaultMessage: 'Saving...'})
                                        : intl.formatMessage({id: 'contacts.external.add.save', defaultMessage: 'Save'})
                                    }
                                </Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

export default ContactsExternalAddScreen;
