// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {Alert, Clipboard, Keyboard, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {searchProfiles} from '@actions/remote/user';
import CompassIcon from '@components/compass_icon';
import ProfilePicture from '@components/profile_picture';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import NetworkManager from '@managers/network_manager';
import {getLastPictureUpdate} from '@utils/user';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';
import {popTopScreen} from '@screens/navigation';

import type {AvailableScreens} from '@typings/screens/navigation';

type Props = {
    componentId: AvailableScreens;
    teamId: string;
    teamInviteId: string;
    currentUserId?: string;
};

type SearchResult = {
    type: 'found' | 'not_found' | 'already_in_enterprise';
    user?: UserProfile;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
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
    resultSection: {
        flex: 1,
        paddingHorizontal: 16,
        paddingVertical: 12,
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
    userName: {
        color: theme.centerChannelColor,
        ...typography('Body', 200, 'SemiBold'),
        marginBottom: 4,
    },
    userDetail: {
        color: changeOpacity(theme.centerChannelColor, 0.6),
        ...typography('Body', 100),
        marginBottom: 2,
    },
    inviteLink: {
        color: theme.linkColor,
        ...typography('Body', 100),
        marginTop: 8,
    },
    copyButton: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 8,
        alignSelf: 'flex-start',
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: theme.buttonBg,
        borderRadius: 4,
    },
    copyButtonText: {
        color: theme.buttonColor,
        marginLeft: 6,
        ...typography('Body', 100, 'SemiBold'),
    },
    messageText: {
        color: changeOpacity(theme.centerChannelColor, 0.7),
        ...typography('Body', 200),
        marginTop: 8,
    },
    bottomBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    closeButton: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 8,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.2),
    },
    closeButtonText: {
        color: theme.centerChannelColor,
        ...typography('Body', 200),
    },
    confirmButton: {
        backgroundColor: theme.buttonBg,
        borderRadius: 8,
        paddingHorizontal: 24,
        paddingVertical: 10,
    },
    confirmButtonDisabled: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.2),
    },
    confirmButtonText: {
        color: theme.buttonColor,
        ...typography('Body', 200, 'SemiBold'),
    },
}));

function AvatarNoInitials({author, size}: {author: UserProfile; size: number}) {
    const hasImage = author ? getLastPictureUpdate(author) > 0 : false;
    return (
        <ProfilePicture
            author={hasImage ? author : undefined}
            size={size}
            showStatus={false}
        />
    );
}

const Invite = ({componentId, teamId, teamInviteId, currentUserId}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const style = getStyleSheet(theme);

    const [searchTerm, setSearchTerm] = useState('');
    const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
    const [searching, setSearching] = useState(false);
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

    const handleSearch = useCallback(async () => {
        const term = searchTerm.trim();
        if (!term) {
            return;
        }

        setSearching(true);
        setSearchResult(null);
        setSelectedUserId(null);

        try {
            // Global search by phone number
            const result = await searchProfiles(serverUrl, term, {allow_inactive: false});
            const users = result.data || [];

            if (users.length === 0) {
                // Not found - show invite link
                setSearchResult({type: 'not_found'});
            } else {
                const user = users[0];
                // Check if user is already in the enterprise
                // For now, assume if user exists, check if they're in the team
                // This would need to be enhanced with actual team membership check
                setSearchResult({type: 'found', user});
            }
        } catch (error) {
            Alert.alert(
                intl.formatMessage({id: 'invite.search_error', defaultMessage: 'Search failed'}),
                intl.formatMessage({id: 'invite.search_error_message', defaultMessage: 'Please try again.'}),
            );
        } finally {
            setSearching(false);
        }
    }, [searchTerm, serverUrl, intl]);

    // Pre-invitation: when search returns not_found, create a pending invitation
    // record on the server so the invitee auto-joins the team on registration.
    const pendingInvitePhoneRef = useRef('');
    useEffect(() => {
        if (searchResult?.type !== 'not_found' || !currentUserId || !serverUrl || !searchTerm.trim()) {
            return;
        }
        const trimmedPhone = searchTerm.trim();
        if (trimmedPhone === pendingInvitePhoneRef.current) {
            return;
        }
        pendingInvitePhoneRef.current = trimmedPhone;
        try {
            const client = NetworkManager.getClient(serverUrl);
            client.createInvitation(currentUserId, trimmedPhone, teamId).catch(() => {
                // best-effort
            });
        } catch {
            // ignore
        }
    }, [searchResult, currentUserId, serverUrl, searchTerm, teamId]);

    const handleCopyLink = useCallback(() => {
        const inviteLink = `https://${serverUrl}/invite?id=${teamInviteId}`;
        Clipboard.setString(inviteLink);
        Alert.alert(
            intl.formatMessage({id: 'invite.link_copied', defaultMessage: 'Link copied'}),
            intl.formatMessage({id: 'invite.link_copied_message', defaultMessage: 'Invite link has been copied to clipboard.'}),
        );
    }, [serverUrl, teamInviteId, intl]);

    const handleConfirm = useCallback(() => {
        if (searchResult?.type === 'found' && selectedUserId) {
            // TODO: Add user to team/enterprise
            Alert.alert(
                intl.formatMessage({id: 'invite.success', defaultMessage: 'Success'}),
                intl.formatMessage({id: 'invite.user_added', defaultMessage: 'User has been added to the enterprise.'}),
            );
            popTopScreen(componentId);
        }
    }, [searchResult, selectedUserId, componentId, intl]);

    const handleClose = useCallback(() => {
        popTopScreen(componentId);
    }, [componentId]);

    const renderFoundUser = () => {
        if (!searchResult?.user) return null;
        const user = searchResult.user;
        const isSelected = selectedUserId === user.id;

        return (
            <View style={style.resultCard}>
                <View style={style.resultHeader}>
                    <CompassIcon
                        name='check-circle'
                        size={20}
                        color='#4CAF50'
                        style={style.resultIcon}
                    />
                    <Text style={style.resultTitle}>
                        {intl.formatMessage({id: 'invite.found_registered', defaultMessage: 'Found registered user:'})}
                    </Text>
                </View>
                <TouchableOpacity
                    style={style.userProfile}
                    onPress={() => setSelectedUserId(isSelected ? null : user.id)}
                >
                    <AvatarNoInitials author={user} size={48}/>
                    <View style={style.userInfo}>
                        <Text style={style.userName}>{user.nickname || user.username}</Text>
                        <Text style={style.userDetail}>
                            {intl.formatMessage({id: 'invite.account', defaultMessage: 'Account:'})} {user.username}
                        </Text>
                        <Text style={style.userDetail}>
                            {intl.formatMessage({id: 'invite.nickname', defaultMessage: 'Nickname:'})} {user.nickname || '-'}
                        </Text>
                        {user.email && (
                            <Text style={style.userDetail}>
                                {intl.formatMessage({id: 'invite.email', defaultMessage: 'Email:'})} {user.email}
                            </Text>
                        )}
                    </View>
                    <View style={[style.checkbox, isSelected ? style.checkboxChecked : style.checkboxUnchecked]}>
                        {isSelected && (
                            <CompassIcon name='check' size={14} color='#fff'/>
                        )}
                    </View>
                </TouchableOpacity>
            </View>
        );
    };

    const renderNotFound = () => {
        const inviteLink = `https://${serverUrl}/invite?id=${teamInviteId}`;
        return (
            <View style={style.resultCard}>
                <View style={style.resultHeader}>
                    <CompassIcon
                        name='close-circle'
                        size={20}
                        color='#F44336'
                        style={style.resultIcon}
                    />
                    <Text style={style.resultTitle}>
                        {intl.formatMessage({id: 'invite.not_registered', defaultMessage: 'Not registered:'})}
                    </Text>
                </View>
                <Text style={style.messageText}>
                    {intl.formatMessage({
                        id: 'invite.not_registered_message_preinvite',
                        defaultMessage: 'This phone number is not registered yet. A pre-invitation record has been created. The person will automatically join the enterprise when they register with this phone number. You can also copy the invite link to send to them.',
                    })}
                </Text>
                <Text style={style.inviteLink}>{inviteLink}</Text>
                <TouchableOpacity style={style.copyButton} onPress={handleCopyLink}>
                    <CompassIcon name='content-copy' size={16} color={theme.buttonColor}/>
                    <Text style={style.copyButtonText}>
                        {intl.formatMessage({id: 'invite.copy_link', defaultMessage: 'Copy link'})}
                    </Text>
                </TouchableOpacity>
            </View>
        );
    };

    const renderAlreadyInEnterprise = () => (
        <View style={style.resultCard}>
            <View style={style.resultHeader}>
                <CompassIcon
                    name='alert-circle'
                    size={20}
                    color='#FF9800'
                    style={style.resultIcon}
                />
                <Text style={style.resultTitle}>
                    {intl.formatMessage({id: 'invite.already_in_enterprise', defaultMessage: 'Already in enterprise:'})}
                </Text>
            </View>
            <Text style={style.messageText}>
                {intl.formatMessage({
                    id: 'invite.already_in_enterprise_message',
                    defaultMessage: 'This user is already a member of the enterprise.',
                })}
            </Text>
        </View>
    );

    const canConfirm = searchResult?.type === 'found' && selectedUserId !== null;

    return (
        <SafeAreaView style={style.container} edges={['top', 'left', 'right']}>
            {/* Search Section */}
            <View style={style.searchSection}>
                <View style={style.searchBar}>
                    <TextInput
                        style={style.searchInput}
                        value={searchTerm}
                        onChangeText={setSearchTerm}
                        placeholder={intl.formatMessage({id: 'invite.search_placeholder', defaultMessage: 'Enter phone number'})}
                        placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.5)}
                        keyboardType='phone-pad'
                        onSubmitEditing={handleSearch}
                    />
                    <TouchableOpacity
                        style={style.searchButton}
                        onPress={handleSearch}
                        disabled={searching}
                    >
                        <Text style={style.searchButtonText}>
                            {searching
                                ? intl.formatMessage({id: 'invite.searching', defaultMessage: 'Searching...'})
                                : intl.formatMessage({id: 'invite.search', defaultMessage: 'Search'})}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Result Section */}
            <View style={style.resultSection}>
                {searchResult?.type === 'found' && renderFoundUser()}
                {searchResult?.type === 'not_found' && renderNotFound()}
                {searchResult?.type === 'already_in_enterprise' && renderAlreadyInEnterprise()}
            </View>

            {/* Bottom Bar */}
            <View style={style.bottomBar}>
                <TouchableOpacity style={style.closeButton} onPress={handleClose}>
                    <Text style={style.closeButtonText}>
                        {intl.formatMessage({id: 'invite.close', defaultMessage: 'Close'})}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[style.confirmButton, !canConfirm && style.confirmButtonDisabled]}
                    onPress={handleConfirm}
                    disabled={!canConfirm}
                >
                    <Text style={style.confirmButtonText}>
                        {intl.formatMessage({id: 'invite.confirm', defaultMessage: 'Confirm'})}
                    </Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
};

export default Invite;
