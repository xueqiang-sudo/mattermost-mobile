// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useIntl, type IntlShape} from 'react-intl';
import {Alert, FlatList, Keyboard, Share, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {searchExternalCandidates, type CandidateDraft} from '@actions/remote/candidate_search';
import {addUserToDefaultDepartment, addUserToDepartment} from '@actions/remote/contact_new';
import {getTeamMembersByIds} from '@actions/remote/team';
import CompassIcon from '@components/compass_icon';
import ProfilePicture from '@components/profile_picture';
import Loading from '@components/loading';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import NetworkManager from '@managers/network_manager';
import SecurityManager from '@managers/security_manager';
import {dismissModal, setButtons} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';
import {displayUsername, getLastPictureUpdate} from '@utils/user';

import {sendMembersInvites} from './actions';
import Summary from './summary';

import type {InviteResult, Result, SearchResult} from './types';
import type {AvailableScreens} from '@typings/screens/navigation';

const CLOSE_BUTTON_ID = 'close-invite';
const DEFAULT_RESULT: Result = {sent: [], notSent: []};

type CandidateTag = 'exactMatch' | 'customer' | 'supplier' | 'self';
type CandidateProfile = UserProfile & {mmCandidateTags?: CandidateTag[]};

function getCandidateTags(draft: CandidateDraft): CandidateTag[] {
    const tags: CandidateTag[] = [];
    if (draft.sourceFlags.globalSearch) {
        tags.push('exactMatch');
    }
    if (draft.sourceFlags.customer) {
        tags.push('customer');
    }
    if (draft.sourceFlags.supplier) {
        tags.push('supplier');
    }
    if (draft.sourceFlags.self) {
        tags.push('self');
    }
    return tags;
}

function mapDraftsToProfiles(drafts: CandidateDraft[]): CandidateProfile[] {
    const profiles: CandidateProfile[] = [];
    for (const draft of drafts) {
        if (!draft.user) {
            continue;
        }
        profiles.push({
            ...draft.user,
            mmCandidateTags: getCandidateTags(draft),
        });
    }
    return profiles;
}

function AvatarNoInitials({author, size}: {author: CandidateProfile; size: number}) {
    const hasImage = author ? getLastPictureUpdate(author) > 0 : false;
    return (
        <ProfilePicture
            author={hasImage ? author : undefined}
            size={size}
            showStatus={false}
        />
    );
}

const closeModal = async () => {
    Keyboard.dismiss();
    await dismissModal();
};

type Props = {
    componentId: AvailableScreens;
    teamId: string;
    teamDisplayName: string;
    teamLastIconUpdate: number;
    teamInviteId: string;
    isAdmin: boolean;
    canInviteGuests: boolean;
    allowGuestMagicLink: boolean;
    currentUserId?: string;
    currentUserName?: string;
    contactTargetDepartmentId?: number | null;
}

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
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
    searchIcon: {
        color: changeOpacity(theme.centerChannelColor, 0.5),
        marginRight: 8,
    },
    searchInput: {
        flex: 1,
        color: theme.centerChannelColor,
        fontSize: 16,
        padding: 0,
    },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxChecked: {
        backgroundColor: theme.buttonBg,
        borderColor: theme.buttonBg,
    },
    checkboxUnchecked: {
        borderColor: changeOpacity(theme.centerChannelColor, 0.3),
    },
    checkIcon: {
        color: '#fff',
        fontSize: 14,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
    },
    sectionHeaderText: {
        flex: 1,
        color: changeOpacity(theme.centerChannelColor, 0.7),
        ...typography('Body', 100, 'SemiBold'),
    },
    sectionCount: {
        color: changeOpacity(theme.centerChannelColor, 0.5),
        ...typography('Body', 100),
    },
    chevron: {
        color: changeOpacity(theme.centerChannelColor, 0.5),
        marginRight: 4,
    },
    memberRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        gap: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.05),
    },
    memberRowJoined: {
        opacity: 0.5,
    },
    memberName: {
        flex: 1,
        color: theme.centerChannelColor,
        ...typography('Body', 200),
    },
    memberJoined: {
        color: changeOpacity(theme.centerChannelColor, 0.5),
        fontSize: 12,
        marginLeft: 4,
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
    shareLinkButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    shareLinkText: {
        color: theme.buttonBg,
        marginLeft: 6,
        ...typography('Body', 200, 'SemiBold'),
    },
    doneButton: {
        backgroundColor: theme.buttonBg,
        borderRadius: 8,
        paddingHorizontal: 24,
        paddingVertical: 10,
    },
    doneButtonDisabled: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.2),
    },
    doneButtonText: {
        color: theme.buttonColor,
        ...typography('Body', 200, 'SemiBold'),
    },
    dropdownOverlay: {
        backgroundColor: theme.centerChannelBg,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.1),
        maxHeight: 300,
    },
    dropdownList: {
        paddingHorizontal: 16,
    },
    selectedMemberRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        gap: 12,
    },
    selectedMemberName: {
        flex: 1,
        color: theme.centerChannelColor,
        ...typography('Body', 200),
    },
    collapseButtonContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
}));

enum Stage {
    SELECTION = 'selection',
    RESULT = 'result',
    LOADING = 'loading',
}

export default function Invite({
    componentId,
    teamId,
    teamDisplayName,
    teamInviteId,
    isAdmin,
    currentUserId,
    currentUserName,
    contactTargetDepartmentId,
}: Props) {
    const intl = useIntl();
    const {formatMessage} = intl;
    const theme = useTheme();
    const style = getStyleSheet(theme);
    const serverUrl = useServerUrl();

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [selectedProfiles, setSelectedProfiles] = useState<Map<string, CandidateProfile>>(new Map());
    const [searchTerm, setSearchTerm] = useState('');
    const [candidates, setCandidates] = useState<{
        suppliers: CandidateProfile[];
        customers: CandidateProfile[];
        enterprise: CandidateProfile[];
        searchResults: CandidateProfile[];
    }>({suppliers: [], customers: [], enterprise: [], searchResults: []});
    const [alreadyJoinedIds, setAlreadyJoinedIds] = useState<Set<string>>(new Set());
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['enterprise', 'suppliers', 'customers', 'searchResults']));
    const [showDropdown, setShowDropdown] = useState(false);
    const [stage, setStage] = useState(Stage.SELECTION);
    const [result, setResult] = useState<Result>(DEFAULT_RESULT);
    const [sendError, setSendError] = useState('');
    const [sending, setSending] = useState(false);

    // invite_id：优先使用 enhancer 传入的 teamInviteId，为空时从 API 获取
    const [resolvedInviteId, setResolvedInviteId] = useState(teamInviteId);
    useEffect(() => {
        if (teamInviteId) {
            setResolvedInviteId(teamInviteId);
            return;
        }
        if (!serverUrl || !teamId) {
            return;
        }
        NetworkManager.getClient(serverUrl).getTeam(teamId).then((team) => {
            if (team?.invite_id) {
                setResolvedInviteId(team.invite_id);
            }
        }).catch(() => {
            // ignore
        });
    }, [teamInviteId, serverUrl, teamId]);

    // 初始候选人列表为空，仅通过搜索框查找外部候选人

    // Search external candidates (exact match only)
    useEffect(() => {
        if (!searchTerm.trim()) {
            setCandidates((prev) => ({...prev, searchResults: []}));
            return;
        }
        searchExternalCandidates(serverUrl, currentUserId ?? '', searchTerm).then(async (drafts) => {
            const profiles = mapDraftsToProfiles(drafts);
            // Check which users are already team members
            const userIds = profiles.map((p) => p.id);
            const joined = new Set<string>();
            if (userIds.length) {
                const {members = []} = await getTeamMembersByIds(serverUrl, teamId, userIds);
                for (const member of members) {
                    joined.add(member.user_id);
                }
            }
            setAlreadyJoinedIds((prev) => {
                const next = new Set(prev);
                joined.forEach((id) => next.add(id));
                return next;
            });
            setCandidates((prev) => ({...prev, searchResults: profiles}));
        });
    }, [searchTerm, serverUrl, currentUserId, teamId]);

    // Filter candidates by search term (client-side for suppliers/customers/enterprise)
    const filteredCandidates = useMemo(() => {
        if (!searchTerm.trim()) {
            return candidates;
        }
        const term = searchTerm.toLowerCase();
        const filterFn = (p: CandidateProfile) => {
            const name = displayUsername(p).toLowerCase();
            const username = (p.username || '').toLowerCase();
            return name.includes(term) || username.includes(term);
        };
        return {
            suppliers: candidates.suppliers.filter(filterFn),
            customers: candidates.customers.filter(filterFn),
            enterprise: candidates.enterprise.filter(filterFn),
            searchResults: candidates.searchResults,
        };
    }, [candidates, searchTerm]);

    // Selected profiles array for display
    const selectedProfilesArray = useMemo(() => {
        return Array.from(selectedProfiles.values());
    }, [selectedProfiles]);

    // Navigation buttons
    useEffect(() => {
        const closeIconColor = theme.sidebarHeaderTextColor;
        const closeIcon = CompassIcon.getImageSourceSync('close', 24, closeIconColor);
        setButtons(componentId, {
            leftButtons: [{
                id: CLOSE_BUTTON_ID,
                icon: closeIcon,
                testID: 'invite.close.button',
            }],
        });
    }, [componentId, theme.sidebarHeaderTextColor]);

    useNavButtonPressed(CLOSE_BUTTON_ID, componentId, closeModal, []);
    useAndroidHardwareBackHandler(componentId, closeModal);

    // Toggle select
    const toggleSelect = useCallback((userId: string) => {
        if (alreadyJoinedIds.has(userId)) {
            return;
        }
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(userId)) {
                next.delete(userId);
                setSelectedProfiles((prevP) => {
                    const nextP = new Map(prevP);
                    nextP.delete(userId);
                    return nextP;
                });
            } else {
                next.add(userId);
                // Find profile from candidates
                const allProfiles = [...candidates.enterprise, ...candidates.suppliers, ...candidates.customers, ...candidates.searchResults];
                const profile = allProfiles.find((p) => p.id === userId);
                if (profile) {
                    setSelectedProfiles((prevP) => {
                        const nextP = new Map(prevP);
                        nextP.set(userId, profile);
                        return nextP;
                    });
                }
            }
            return next;
        });
        setSearchTerm('');
    }, [alreadyJoinedIds, candidates]);

    const toggleSection = useCallback((section: string) => {
        setExpandedSections((prev) => {
            const next = new Set(prev);
            if (next.has(section)) {
                next.delete(section);
            } else {
                next.add(section);
            }
            return next;
        });
    }, []);

    // Add sent users to department
    const addSentUsersToDepartment = useCallback(async (sent: InviteResult[]) => {
        await Promise.all(sent.map(async (item) => {
            if (!item.userId) {
                return;
            }
            const uid = item.userId;
            if (typeof contactTargetDepartmentId === 'number') {
                await addUserToDepartment(serverUrl, teamId, contactTargetDepartmentId, uid);
                return;
            }
            await addUserToDefaultDepartment(serverUrl, teamId, uid);
        }));
    }, [contactTargetDepartmentId, serverUrl, teamId]);

    // Handle send (invite selected users)
    const handleSend = useCallback(async () => {
        if (selectedIds.size === 0 || sending) {
            return;
        }
        setSending(true);
        setStage(Stage.LOADING);

        // Convert selectedProfiles Map to the format expected by sendMembersInvites
        const selectedMap = Object.fromEntries(selectedProfiles) as {[id: string]: SearchResult};

        const {sent, notSent, error} = await sendMembersInvites(serverUrl, teamId, selectedMap, isAdmin, teamDisplayName, formatMessage);
        if (error) {
            setSendError(formatMessage({id: 'invite.send_error', defaultMessage: 'Something went wrong while trying to send invitations.'}));
            setResult(DEFAULT_RESULT);
            setStage(Stage.RESULT);
        } else {
            setResult({sent, notSent});
            await addSentUsersToDepartment(sent);
            setStage(Stage.SELECTION);
            setSelectedIds(new Set());
            setSelectedProfiles(new Map());
            Alert.alert(
                formatMessage({id: 'invite.add_success', defaultMessage: 'Added successfully'}),
            );
        }
        setSending(false);
    }, [selectedIds, sending, selectedProfiles, serverUrl, teamId, isAdmin, teamDisplayName, formatMessage, addSentUsersToDepartment]);

    // Share link
    const handleShareLink = useCallback(async () => {
        const url = `${serverUrl}/signup_user_complete/?id=${resolvedInviteId}`;
        const title = formatMessage(
            {id: 'invite_people_to_team.title', defaultMessage: 'Join the {team} enterprise'},
            {team: teamDisplayName},
        );
        const message = formatMessage(
            {id: 'invite.share_invite_message', defaultMessage: '{name} invites you to join {team} for communication and collaboration'},
            {name: currentUserName || '', team: teamDisplayName},
        );

        await closeModal();
        try {
            await Share.share({
                title,
                message: `${message}\n${url}`,
                url,
            });
        } catch {
            // User cancelled share
        }
    }, [serverUrl, resolvedInviteId, teamDisplayName, currentUserName, formatMessage]);

    // 底部按钮始终显示"添加成员"
    const doneLabel = formatMessage({id: 'contacts.add_member', defaultMessage: 'Add Member'});

    // Handle back from summary
    const handleBackToSelection = useCallback(() => {
        setSendError('');
        setResult(DEFAULT_RESULT);
        setStage(Stage.SELECTION);
    }, []);

    const renderCheckbox = (userId: string) => {
        const isSelected = selectedIds.has(userId);
        const isJoined = alreadyJoinedIds.has(userId);

        if (isJoined) {
            return (
                <View style={[style.checkbox, {backgroundColor: changeOpacity(theme.centerChannelColor, 0.3), borderColor: changeOpacity(theme.centerChannelColor, 0.3)}]}>
                    <CompassIcon name='check' size={14} style={style.checkIcon}/>
                </View>
            );
        }
        if (isSelected) {
            return (
                <View style={[style.checkbox, style.checkboxChecked]}>
                    <CompassIcon name='check' size={14} style={style.checkIcon}/>
                </View>
            );
        }
        return <View style={[style.checkbox, style.checkboxUnchecked]}/>;
    };

    const renderMemberRow = (user: CandidateProfile) => {
        const isJoined = alreadyJoinedIds.has(user.id);
        const name = displayUsername(user);

        return (
            <TouchableOpacity
                key={user.id}
                style={[style.memberRow, isJoined && style.memberRowJoined]}
                onPress={() => toggleSelect(user.id)}
                disabled={isJoined}
            >
                {renderCheckbox(user.id)}
                <AvatarNoInitials author={user} size={40}/>
                <Text style={style.memberName}>
                    {name}
                    {isJoined && (
                        <Text style={style.memberJoined}>
                            {` (${formatMessage({id: 'invite.tag.already_joined', defaultMessage: 'Already added'})})`}
                        </Text>
                    )}
                </Text>
            </TouchableOpacity>
        );
    };

    const renderSection = (title: string, sectionKey: string, members: CandidateProfile[]) => {
        if (members.length === 0) {
            return null;
        }
        const isExpanded = expandedSections.has(sectionKey);
        return (
            <View key={sectionKey}>
                <TouchableOpacity style={style.sectionHeader} onPress={() => toggleSection(sectionKey)}>
                    <CompassIcon
                        name={isExpanded ? 'chevron-down' : 'chevron-right'}
                        size={20}
                        style={style.chevron}
                    />
                    <Text style={style.sectionHeaderText}>{title}</Text>
                    <Text style={style.sectionCount}>({members.length})</Text>
                </TouchableOpacity>
                {isExpanded && members.map(renderMemberRow)}
            </View>
        );
    };

    if (stage === Stage.LOADING) {
        return (
            <SafeAreaView style={style.container} edges={['top', 'left', 'right']}>
                <View style={style.loadingContainer}>
                    <Loading color={theme.centerChannelColor} size='large'/>
                </View>
            </SafeAreaView>
        );
    }

    if (stage === Stage.RESULT) {
        return (
            <SafeAreaView style={style.container} edges={['top', 'left', 'right']}>
                <Summary
                    result={result}
                    selectedIds={Object.fromEntries(selectedProfiles)}
                    error={sendError}
                    onClose={closeModal}
                    onRetry={handleSend}
                    onBack={handleBackToSelection}
                    testID='invite.screen.summary'
                />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView
            style={style.container}
            testID='invite.screen'
            nativeID={SecurityManager.getShieldScreenId(componentId)}
            edges={['top', 'left', 'right']}
        >
            {/* Search bar */}
            <View style={style.searchSection}>
                <View style={style.searchBar}>
                    {selectedProfilesArray.length === 0 && (
                        <CompassIcon name='magnify' size={20} style={style.searchIcon}/>
                    )}
                    {selectedProfilesArray.length > 0 && (
                        <TouchableOpacity
                            style={{flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginRight: 8}}
                            onPress={() => setShowDropdown(true)}
                        >
                            {selectedProfilesArray.map((user) => (
                                <AvatarNoInitials
                                    key={user.id}
                                    author={user}
                                    size={28}
                                />
                            ))}
                        </TouchableOpacity>
                    )}
                    <TextInput
                        style={style.searchInput}
                        value={searchTerm}
                        onChangeText={setSearchTerm}
                        placeholder={formatMessage({id: 'invite.search_placeholder_phone_name_email', defaultMessage: '@手机号、昵称、email'})}
                        placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.5)}
                        autoCapitalize='none'
                    />
                </View>
                {showDropdown && (
                    <View style={style.dropdownOverlay}>
                        <View style={style.dropdownList}>
                            {selectedProfilesArray.map((user) => {
                                const name = displayUsername(user);
                                return (
                                    <TouchableOpacity
                                        key={user.id}
                                        style={style.selectedMemberRow}
                                        onPress={() => toggleSelect(user.id)}
                                    >
                                        {renderCheckbox(user.id)}
                                        <AvatarNoInitials author={user} size={32}/>
                                        <Text style={style.selectedMemberName}>{name}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                        <TouchableOpacity
                            style={style.collapseButtonContainer}
                            onPress={() => setShowDropdown(false)}
                        >
                            <CompassIcon name='chevron-up' size={24} style={{color: theme.buttonBg}}/>
                        </TouchableOpacity>
                    </View>
                )}
            </View>

            {/* Member list */}
            <FlatList
                style={{flex: 1}}
                data={[]}
                renderItem={() => null}
                ListHeaderComponent={
                    <>
                        {filteredCandidates.searchResults.length > 0 && renderSection(
                            formatMessage({id: 'channel_add_members.search_results', defaultMessage: 'Search Results'}),
                            'searchResults',
                            filteredCandidates.searchResults,
                        )}
                    </>
                }
            />

            {/* Bottom bar: Share invite link + Add member */}
            <View style={style.bottomBar}>
                <TouchableOpacity
                    style={style.doneButton}
                    onPress={handleShareLink}
                >
                    <Text style={style.doneButtonText}>
                        {formatMessage({id: 'invite.share_invite_link', defaultMessage: 'Share invite link'})}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[style.doneButton, selectedIds.size === 0 && style.doneButtonDisabled]}
                    onPress={handleSend}
                    disabled={selectedIds.size === 0 || sending}
                >
                    <Text style={style.doneButtonText}>{doneLabel}</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}
