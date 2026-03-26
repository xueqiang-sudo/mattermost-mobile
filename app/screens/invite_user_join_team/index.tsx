// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useDatabase} from '@nozbe/watermelondb/react';
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useIntl} from 'react-intl';
import {Alert, ScrollView, Text, TouchableOpacity, View} from 'react-native';

import {ensureContactEmployeeForUser} from '@actions/remote/contact';
import {addUsersToTeam, fetchMyTeams, getTeamMembersByIds} from '@actions/remote/team';
import {fetchUsersByIds} from '@actions/remote/user';
import CompassIcon from '@components/compass_icon';
import Loading from '@components/loading';
import ProfilePicture from '@components/profile_picture';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import {usePreventDoubleTap} from '@hooks/utils';
import SecurityManager from '@managers/security_manager';
import {getCurrentUserId} from '@queries/servers/system';
import {dismissModal} from '@screens/navigation';
import {makeStyleSheetFromTheme, changeOpacity} from '@utils/theme';
import {typography} from '@utils/typography';
import {username2Nickname} from '@utils/user';

import type {AvailableScreens} from '@typings/screens/navigation';

type InviteUserJoinTeamProps = {
    componentId: AvailableScreens;
    closeButtonId: string;
    uid?: string;

    /** 从企业通讯录入口添加成员时，传入的目标部门 ID（null 表示默认部门） */
    contactTargetDepartmentId?: number | null;
};

type TeamItem = {
    id: string;
    displayName: string;
    joined: boolean;
    inviting: boolean;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    content: {
        paddingHorizontal: 20,
        paddingBottom: 24,
    },
    userCard: {
        marginTop: 16,
        marginBottom: 20,
        borderRadius: 16,
        backgroundColor: theme.centerChannelBg,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.12),
        paddingHorizontal: 16,
        paddingVertical: 16,
        flexDirection: 'row',
        alignItems: 'center',
    },
    userTextContainer: {
        flex: 1,
        marginLeft: 12,
    },
    userName: {
        color: theme.centerChannelColor,
        ...typography('Heading', 300, 'SemiBold'),
    },
    userAccount: {
        marginTop: 2,
        color: changeOpacity(theme.centerChannelColor, 0.72),
        ...typography('Body', 75, 'Regular'),
    },
    sectionTitle: {
        marginBottom: 8,
        color: theme.centerChannelColor,
        ...typography('Heading', 200, 'SemiBold'),
    },
    sectionSubtitle: {
        marginBottom: 12,
        color: changeOpacity(theme.centerChannelColor, 0.72),
        ...typography('Body', 75, 'Regular'),
    },
    teamListCard: {
        borderRadius: 12,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.12),
        overflow: 'hidden',
    },
    teamRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 14,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
        backgroundColor: theme.centerChannelBg,
    },
    teamRowLast: {
        borderBottomWidth: 0,
    },
    teamName: {
        flex: 1,
        paddingRight: 12,
        color: theme.centerChannelColor,
        ...typography('Body', 100, 'Regular'),
    },
    joinedText: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
        ...typography('Body', 75, 'SemiBold'),
    },
    inviteButton: {
        minWidth: 90,
        borderRadius: 6,
        backgroundColor: theme.buttonBg,
        paddingHorizontal: 12,
        paddingVertical: 7,
        alignItems: 'center',
    },
    inviteButtonDisabled: {
        opacity: 0.7,
    },
    inviteButtonText: {
        color: theme.buttonColor,
        ...typography('Body', 75, 'SemiBold'),
    },
    centerContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 40,
    },
    centerText: {
        marginTop: 12,
        textAlign: 'center',
        color: changeOpacity(theme.centerChannelColor, 0.72),
        ...typography('Body', 100, 'Regular'),
    },
    emptyStateIcon: {
        marginBottom: 24,
    },
    emptyStateTitle: {
        color: theme.centerChannelColor,
        textAlign: 'center',
        ...typography('Heading', 400, 'SemiBold'),
    },
    emptyStateParagraph: {
        marginTop: 8,
        textAlign: 'center',
        color: changeOpacity(theme.centerChannelColor, 0.72),
        ...typography('Body', 200),
        maxWidth: 320,
    },
}));

const InviteUserJoinTeam = ({componentId, closeButtonId, uid, contactTargetDepartmentId}: InviteUserJoinTeamProps) => {
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const database = useDatabase();

    const [loading, setLoading] = useState(true);
    const [targetUser, setTargetUser] = useState<UserProfile | undefined>();
    const [teams, setTeams] = useState<TeamItem[]>([]);
    const [isSelf, setIsSelf] = useState(false);

    const userDisplayName = useMemo(() => {
        if (!targetUser) {
            return '';
        }
        return username2Nickname(targetUser, {locale: intl.locale});
    }, [targetUser, intl.locale]);

    const onClosePressed = useCallback(() => {
        dismissModal({componentId});
    }, [componentId]);

    useNavButtonPressed(closeButtonId, componentId, onClosePressed, []);
    useAndroidHardwareBackHandler(componentId, onClosePressed);

    useEffect(() => {
        let mounted = true;

        const loadData = async () => {
            if (!uid) {
                if (mounted) {
                    setLoading(false);
                }
                return;
            }

            setLoading(true);
            const currentUserId = await getCurrentUserId(database);
            if (uid === currentUserId) {
                if (mounted) {
                    setIsSelf(true);
                    setTargetUser(undefined);
                    setTeams([]);
                    setLoading(false);
                }
                return;
            }

            const [{users, existingUsers}, {teams: myTeams}] = await Promise.all([
                fetchUsersByIds(serverUrl, [uid], false),
                fetchMyTeams(serverUrl, true),
            ]);

            const resolvedUser = (users?.[0] ?? existingUsers?.[0]) as UserProfile | undefined;
            if (!resolvedUser || !myTeams?.length) {
                if (mounted) {
                    setTargetUser(resolvedUser);
                    setTeams([]);
                    setLoading(false);
                }
                return;
            }

            const joinedResults = await Promise.all(myTeams.map(async (team) => {
                const {members} = await getTeamMembersByIds(serverUrl, team.id, [uid], true);
                return {
                    id: team.id,
                    displayName: team.display_name || team.name || team.id,
                    joined: members.length > 0,
                    inviting: false,
                };
            }));

            if (mounted) {
                setIsSelf(false);
                setTargetUser(resolvedUser);
                setTeams(joinedResults);
                setLoading(false);
            }
        };

        loadData();

        return () => {
            mounted = false;
        };
    }, [database, serverUrl, uid]);

    const inviteToTeam = usePreventDoubleTap(useCallback(async (teamId: string, teamName: string) => {
        if (!uid) {
            return;
        }

        // eslint-disable-next-line max-nested-callbacks
        setTeams((current) => current.map((team) => (
            team.id === teamId ? {...team, inviting: true} : team
        )));

        const {members, error} = await addUsersToTeam(serverUrl, teamId, [uid], false);
        const memberError = members[0]?.error;
        const hasError = Boolean(error || memberError);

        if (hasError) {
            Alert.alert(
                intl.formatMessage({
                    id: 'invite_user_join_team.invite_failed_title',
                    defaultMessage: 'Invite failed',
                }),
                intl.formatMessage({
                    id: 'invite_user_join_team.invite_failed_message',
                    defaultMessage: 'Unable to invite this user to {teamName}. Please try again.',
                }, {teamName}),
            );
            // eslint-disable-next-line max-nested-callbacks
            setTeams((current) => current.map((team) => (
                team.id === teamId ? {...team, inviting: false} : team
            )));
            return;
        }

        // eslint-disable-next-line max-nested-callbacks
        setTeams((current) => current.map((team) => (
            team.id === teamId ? {...team, joined: true, inviting: false} : team
        )));

        if (targetUser) {
            await ensureContactEmployeeForUser(
                serverUrl,
                teamId,
                targetUser,
                contactTargetDepartmentId ?? null,
            );
        }
    }, [contactTargetDepartmentId, intl, serverUrl, targetUser, uid]));

    if (loading) {
        return (
            <View
                style={styles.centerContainer}
                nativeID={SecurityManager.getShieldScreenId(componentId)}
            >
                <Loading
                    size='large'
                    color={theme.centerChannelColor}
                />
                <Text style={styles.centerText}>
                    {intl.formatMessage({
                        id: 'invite_user_join_team.loading',
                        defaultMessage: 'Loading...',
                    })}
                </Text>
            </View>
        );
    }

    if (isSelf) {
        return (
            <View
                style={styles.centerContainer}
                nativeID={SecurityManager.getShieldScreenId(componentId)}
                testID='invite_user_join_team.cannot_invite_self'
            >
                <View style={styles.emptyStateIcon}>
                    <CompassIcon
                        name='account-outline'
                        size={64}
                        color={changeOpacity(theme.centerChannelColor, 0.4)}
                    />
                </View>
                <Text style={styles.emptyStateTitle}>
                    {intl.formatMessage({
                        id: 'invite_user_join_team.cannot_invite_self',
                        defaultMessage: 'You cannot invite yourself',
                    })}
                </Text>
                <Text style={styles.emptyStateParagraph}>
                    {intl.formatMessage({
                        id: 'invite_user_join_team.cannot_invite_self_hint',
                        defaultMessage: 'Please scan another user\'s QR code to invite them to join your enterprise.',
                    })}
                </Text>
            </View>
        );
    }

    if (!uid || !targetUser) {
        return (
            <View
                style={styles.centerContainer}
                nativeID={SecurityManager.getShieldScreenId(componentId)}
                testID='invite_user_join_team.user_not_found'
            >
                <View style={styles.emptyStateIcon}>
                    <CompassIcon
                        name='account-outline'
                        size={64}
                        color={changeOpacity(theme.centerChannelColor, 0.4)}
                    />
                </View>
                <Text style={styles.emptyStateTitle}>
                    {intl.formatMessage({
                        id: 'invite_user_join_team.user_not_found',
                        defaultMessage: 'User not found',
                    })}
                </Text>
                <Text style={styles.emptyStateParagraph}>
                    {intl.formatMessage({
                        id: 'invite_user_join_team.user_not_found_hint',
                        defaultMessage: 'The user may not exist or the QR code may have expired. Please ask the user to share a new QR code.',
                    })}
                </Text>
            </View>
        );
    }

    return (
        <View
            style={styles.container}
            nativeID={SecurityManager.getShieldScreenId(componentId)}
        >
            <ScrollView contentContainerStyle={styles.content}>
                <View style={styles.userCard}>
                    <ProfilePicture
                        author={targetUser}
                        size={48}
                        iconSize={24}
                        showStatus={false}
                    />
                    <View style={styles.userTextContainer}>
                        <Text
                            style={styles.userName}
                            numberOfLines={1}
                        >
                            {userDisplayName}
                        </Text>
                        <Text
                            style={styles.userAccount}
                            numberOfLines={1}
                        >
                            {`@${username2Nickname(targetUser, {locale: intl.locale, includeFullName: false})}`}
                        </Text>
                    </View>
                </View>

                <Text style={styles.sectionTitle}>
                    {intl.formatMessage({
                        id: 'invite_user_join_team.team_list_title',
                        defaultMessage: 'Enterprise List',
                    })}
                </Text>
                <Text style={styles.sectionSubtitle}>
                    {intl.formatMessage({
                        id: 'invite_user_join_team.team_list_subtitle',
                        defaultMessage: 'Invite this user to one or more enterprises below.',
                    })}
                </Text>

                {!teams.length && (
                    <View style={styles.teamListCard}>
                        <View style={[styles.teamRow, styles.teamRowLast]}>
                            <Text style={styles.teamName}>
                                {intl.formatMessage({
                                    id: 'invite_user_join_team.empty_teams',
                                    defaultMessage: 'No enterprises available',
                                })}
                            </Text>
                        </View>
                    </View>
                )}

                {teams.length > 0 && (
                    <View style={styles.teamListCard}>
                        {teams.map((team, index) => {
                            const isLast = index === teams.length - 1;
                            return (
                                <View
                                    key={team.id}
                                    style={[styles.teamRow, isLast && styles.teamRowLast]}
                                >
                                    <Text
                                        style={styles.teamName}
                                        numberOfLines={1}
                                    >
                                        {team.displayName}
                                    </Text>
                                    {team.joined ? (
                                        <Text style={styles.joinedText}>
                                            {intl.formatMessage({
                                                id: 'invite_user_join_team.joined',
                                                defaultMessage: 'Joined',
                                            })}
                                        </Text>
                                    ) : (
                                        <TouchableOpacity
                                            style={[styles.inviteButton, team.inviting && styles.inviteButtonDisabled]}
                                            onPress={() => inviteToTeam(team.id, team.displayName)}
                                            disabled={team.inviting}
                                            testID={`invite_user_join_team.team.${team.id}.invite`}
                                        >
                                            <Text style={styles.inviteButtonText}>
                                                {team.inviting ? intl.formatMessage({
                                                    id: 'invite_user_join_team.inviting',
                                                    defaultMessage: 'Inviting...',
                                                }) : intl.formatMessage({
                                                    id: 'invite_user_join_team.invite',
                                                    defaultMessage: 'Invite',
                                                })}
                                            </Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            );
                        })}
                    </View>
                )}
            </ScrollView>
        </View>
    );
};

export default InviteUserJoinTeam;
