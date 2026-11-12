// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {Alert, Clipboard, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';

import {searchProfiles} from '@actions/remote/user';
import CompassIcon from '@components/compass_icon';
import ProfilePicture from '@components/profile_picture';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import NetworkManager from '@managers/network_manager';
import {getLastPictureUpdate} from '@utils/user';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';
import {buildNavigationButton, popTopScreen, setButtons} from '@screens/navigation';

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
    invitationId?: string;
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

    const handleSearch = useCallback(async () => {
        const term = searchTerm.trim();
        if (!term) {
            return;
        }

        setSearching(true);
        setSearchResult(null);

        try {
            // Search by phone number
            const result = await searchProfiles(serverUrl, term, {allow_inactive: false});
            const users = result.data || [];

            // Filter to exact phone or username match
            const exactMatch = users.find((u: UserProfile) => u.phone === term || u.username === term);

            if (!exactMatch) {
                // Not found - show invite link
                setSearchResult({type: 'not_found'});
            } else {
                // Check if user is already in the team
                try {
                    const client = NetworkManager.getClient(serverUrl);
                    await client.getTeamMember(teamId, exactMatch.id);
                    // User is already a team member
                    setSearchResult({type: 'already_in_enterprise'});
                } catch {
                    // User exists but not in team - can be invited
                    setSearchResult({type: 'found', user: exactMatch});
                }
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
            client.createInvitation(currentUserId, trimmedPhone, teamId).then((invitation: any) => {
                // Save invitation ID for the link
                if (invitation?.id) {
                    setSearchResult((prev) => {
                        if (prev?.type === 'not_found') {
                            return {...prev, invitationId: invitation.id};
                        }
                        return prev;
                    });
                }
            }).catch(() => {
                // best-effort
            });
        } catch {
            // ignore
        }
    }, [searchResult, currentUserId, serverUrl, searchTerm, teamId]);

    const handleCopyLink = useCallback(() => {
        const inviteId = searchResult?.invitationId || teamInviteId;
        const inviteLink = `${serverUrl}/invite?id=${inviteId}`;
        Clipboard.setString(inviteLink);
        Alert.alert(
            intl.formatMessage({id: 'invite.link_copied', defaultMessage: 'Link copied'}),
            intl.formatMessage({id: 'invite.link_copied_message', defaultMessage: 'Invite link has been copied to clipboard.'}),
        );
    }, [serverUrl, teamInviteId, searchResult?.invitationId, intl]);

    const handleConfirm = useCallback(async () => {
        if (searchResult?.type === 'found' && searchResult.user && serverUrl) {
            const userId = searchResult.user.id;
            try {
                const client = NetworkManager.getClient(serverUrl);
                await client.addToTeam(teamId, userId);
                Alert.alert(
                    intl.formatMessage({id: 'invite.success', defaultMessage: 'Success'}),
                    intl.formatMessage({id: 'invite.user_added', defaultMessage: 'User has been added to the enterprise.'}),
                );
                popTopScreen(componentId);
            } catch (error) {
                Alert.alert(
                    intl.formatMessage({id: 'invite.add_failed', defaultMessage: 'Failed to add user'}),
                    error instanceof Error ? error.message : intl.formatMessage({id: 'invite.add_failed_message', defaultMessage: 'Please try again.'}),
                );
            }
        }
    }, [searchResult, componentId, intl, serverUrl, teamId]);

    // Handle navigation bar right button press
    useNavButtonPressed('confirm', componentId, handleConfirm, [handleConfirm]);

    const renderFoundUser = () => {
        if (!searchResult?.user) return null;
        const user = searchResult.user;

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
                <View style={style.userProfile}>
                    <AvatarNoInitials author={user} size={48}/>
                    <View style={style.userInfo}>
                        <Text style={style.userDetail}>
                            {intl.formatMessage({id: 'invite.account', defaultMessage: 'Account:'})} {user.phone || user.username}
                        </Text>
                        <Text style={style.userDetail}>
                            {intl.formatMessage({id: 'invite.nickname', defaultMessage: 'Nickname:'})} {user.nickname || user.first_name || user.username}
                        </Text>
                    </View>
                </View>
            </View>
        );
    };

    const renderNotFound = () => {
        const inviteId = searchResult?.invitationId || teamInviteId;
        const inviteLink = `${serverUrl}/invite?id=${inviteId}`;
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
                    name='information-outline'
                    size={20}
                    color='#FF9800'
                    style={style.resultIcon}
                />
                <Text style={style.resultTitle}>
                    {intl.formatMessage({id: 'invite.already_in_enterprise', defaultMessage: '该用户已是企业成员'})}
                </Text>
            </View>
        </View>
    );

    const canConfirm = searchResult?.type === 'found';

    // Set right button in navigation bar
    useEffect(() => {
        setButtons(componentId, {
            rightButtons: [{
                ...buildNavigationButton(
                    'confirm',
                    'invite.add.button',
                    undefined,
                    intl.formatMessage({id: 'invite.add', defaultMessage: 'Add'}),
                ),
                color: theme.sidebarHeaderTextColor,
                disabledColor: changeOpacity(theme.sidebarHeaderTextColor, 0.32),
                enabled: canConfirm,
            }],
        });
    }, [componentId, canConfirm, intl, theme]);

    return (
        <View style={style.container}>
            {/* Search Section */}
            <View style={style.searchSection}>
                <View style={style.searchBar}>
                    <TextInput
                        style={style.searchInput}
                        value={searchTerm}
                        onChangeText={setSearchTerm}
                        placeholder={intl.formatMessage({id: 'invite.search_placeholder', defaultMessage: '输入手机号或用户名'})}
                        placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.5)}
                        keyboardType='default'
                        autoCapitalize='none'
                        autoCorrect={false}
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
        </View>
    );
};

export default Invite;
