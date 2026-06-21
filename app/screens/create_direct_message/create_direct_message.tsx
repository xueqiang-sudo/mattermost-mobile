// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {defineMessages, useIntl} from 'react-intl';
import {FlatList, Keyboard, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {getEmployeeCandidates, searchEmployeeCandidates, type CandidateDraft} from '@actions/remote/candidate_search';
import {addMembersToChannel, makeDirectChannel, makeGroupChannel} from '@actions/remote/channel';
import {queryChannelMembers} from '@queries/servers/channel';
import CompassIcon from '@components/compass_icon';
import ProfilePicture from '@components/profile_picture';
import {ACCOUNT_OUTLINE_IMAGE} from '@constants/profile';
import {General} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import SecurityManager from '@managers/security_manager';
import {dismissModal, popTopScreen, setButtons} from '@screens/navigation';
import {alertErrorWithFallback} from '@utils/draft';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';
import {displayUsername, getLastPictureUpdate} from '@utils/user';

import type {AvailableScreens} from '@typings/screens/navigation';
import type {Database} from '@nozbe/watermelondb';

export type CreateDMWindowVariant = 'default' | 'group_only' | 'dm_only';

const messages = defineMessages({
    dm: {
        id: 'mobile.open_dm.error',
        defaultMessage: "We couldn't open a direct message with {displayName}. Please check your connection and try again.",
    },
    gm: {
        id: 'mobile.open_gm.error',
        defaultMessage: "We couldn't open a discussion group with those users. Please check your connection and try again.",
    },
});

const CLOSE_BUTTON = 'close-dms';

type Props = {
    componentId: AvailableScreens;
    currentTeamId: string;
    currentUserId: string;
    teammateNameDisplay: string;
    tutorialWatched: boolean;
    variant?: CreateDMWindowVariant;
    channelId?: string;
    isExistingChannel?: boolean;
    database: Database;
}

type CandidateTag = 'exactMatch' | 'customer' | 'supplier' | 'enterprise' | 'self';
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
    if (draft.sourceFlags.enterpriseSearch) {
        tags.push('enterprise');
    }
    if (draft.sourceFlags.self) {
        tags.push('self');
    }
    return tags;
}

function mapCandidateDraftsToProfiles(drafts: CandidateDraft[]): CandidateProfile[] {
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

function AvatarNoInitials({author, size, showStatus = false}: {author: CandidateProfile; size: number; showStatus?: boolean}) {
    const hasImage = author ? getLastPictureUpdate(author) > 0 : false;
    return (
        <ProfilePicture
            author={hasImage ? author : undefined}
            size={size}
            showStatus={showStatus}
        />
    );
}

const close = () => {
    Keyboard.dismiss();
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
    memberName: {
        flex: 1,
        color: theme.centerChannelColor,
        ...typography('Body', 200),
    },
    bottomBar: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.1),
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

export default function CreateDirectMessage({
    componentId,
    currentTeamId,
    currentUserId,
    teammateNameDisplay,
    variant = 'default',
    channelId,
    isExistingChannel,
    database,
}: Props) {
    const intl = useIntl();
    const theme = useTheme();
    const style = getStyleSheet(theme);
    const serverUrl = useServerUrl();

    const [lockedIds, setLockedIds] = useState<Set<string>>(new Set());
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [searchTerm, setSearchTerm] = useState('');
    const [candidates, setCandidates] = useState<{
        suppliers: CandidateProfile[];
        customers: CandidateProfile[];
        enterprise: CandidateProfile[];
        external: CandidateProfile[];
        searchResults: CandidateProfile[];
    }>({suppliers: [], customers: [], enterprise: [], external: [], searchResults: []});
    const [knownProfiles, setKnownProfiles] = useState<Map<string, CandidateProfile>>(new Map());
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['suppliers', 'customers', 'enterprise', 'external', 'searchResults']));
    const [startingConversation, setStartingConversation] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);

    const teamIdForMembersList = currentTeamId || '';

    // Newly selected = selected minus locked
    const newSelectedIds = useMemo(() => {
        const s = new Set<string>();
        selectedIds.forEach((id) => {
            if (!lockedIds.has(id)) {
                s.add(id);
            }
        });
        return s;
    }, [selectedIds, lockedIds]);

    // Initialize locked/existing members when in "Add Members" mode
    useEffect(() => {
        if (!isExistingChannel || !channelId) {
            return;
        }
        queryChannelMembers(database, channelId).fetch().then((members) => {
            const ids = new Set<string>();
            members.forEach((m) => {
                if (m.userId !== currentUserId) {
                    ids.add(m.userId);
                }
            });
            setLockedIds(ids);
            setSelectedIds(ids);
        });
    }, [isExistingChannel, channelId, database, currentUserId]);

    // Fetch candidates
    useEffect(() => {
        getEmployeeCandidates(serverUrl, teamIdForMembersList, currentUserId).then((drafts) => {
            const profiles = mapCandidateDraftsToProfiles(drafts);
            const notSelf = (p: CandidateProfile) => !p.mmCandidateTags?.includes('self');
            setCandidates((prev) => ({
                ...prev,
                suppliers: profiles.filter((p) => p.mmCandidateTags?.includes('supplier') && notSelf(p)),
                customers: profiles.filter((p) => p.mmCandidateTags?.includes('customer') && notSelf(p)),
                enterprise: profiles.filter((p) => p.mmCandidateTags?.includes('enterprise') && notSelf(p)),
            }));
            setKnownProfiles((prev) => {
                const next = new Map(prev);
                profiles.forEach((p) => next.set(p.id, p));
                return next;
            });
        });
    }, [serverUrl, teamIdForMembersList, currentUserId]);

    // Search
    useEffect(() => {
        if (!searchTerm.trim()) {
            setCandidates((prev) => ({...prev, searchResults: []}));
            return;
        }
        searchEmployeeCandidates(serverUrl, teamIdForMembersList, currentUserId, searchTerm).then((drafts) => {
            const profiles = mapCandidateDraftsToProfiles(drafts);
            const notSelf = (p: CandidateProfile) => !p.mmCandidateTags?.includes('self');
            const isExternal = (p: CandidateProfile) =>
                !p.mmCandidateTags?.includes('customer') &&
                !p.mmCandidateTags?.includes('supplier') &&
                !p.mmCandidateTags?.includes('enterprise');
            setCandidates((prev) => ({
                ...prev,
                searchResults: profiles.filter(notSelf),
                external: profiles.filter((p) => notSelf(p) && isExternal(p)),
            }));
            setKnownProfiles((prev) => {
                const next = new Map(prev);
                profiles.forEach((p) => next.set(p.id, p));
                return next;
            });
        });
    }, [searchTerm, serverUrl, teamIdForMembersList, currentUserId]);

    // Filter candidates by search term (client-side for the 3 sections)
    const filteredCandidates = useMemo(() => {
        if (!searchTerm.trim()) {
            return candidates;
        }
        const term = searchTerm.toLowerCase();
        const filterFn = (p: CandidateProfile) => {
            const name = displayUsername(p, teammateNameDisplay).toLowerCase();
            const username = (p.username || '').toLowerCase();
            return name.includes(term) || username.includes(term);
        };
        return {
            suppliers: candidates.suppliers.filter(filterFn),
            customers: candidates.customers.filter(filterFn),
            enterprise: candidates.enterprise.filter(filterFn),
            external: candidates.external.filter(filterFn),
            searchResults: candidates.searchResults,
        };
    }, [candidates, searchTerm, teammateNameDisplay]);

    // Close handler that works for both pushed screens (goToScreen) and modals (showModal)
    const handleClose = useCallback(async () => {
        Keyboard.dismiss();
        await popTopScreen(componentId);
        await dismissModal({componentId});
    }, [componentId]);

    // Set up the left close button in the navigation bar
    const updateNavigationButtons = useCallback(async () => {
        const closeIconColor = changeOpacity(theme.centerChannelColor, 0.72);
        const closeIcon = await CompassIcon.getImageSource('close', 24, closeIconColor);
        setButtons(componentId, {
            leftButtons: [{
                id: CLOSE_BUTTON,
                icon: closeIcon,
                testID: 'close.create_direct_message.button',
            }],
        });
    }, [componentId, theme.centerChannelColor]);

    useEffect(() => {
        updateNavigationButtons();
    }, [updateNavigationButtons]);

    useNavButtonPressed(CLOSE_BUTTON, componentId, handleClose, [handleClose]);
    useAndroidHardwareBackHandler(componentId, handleClose);

    // Create direct channel
    const createDirectChannel = useCallback(async (id: string): Promise<boolean> => {
        const result = await makeDirectChannel(serverUrl, id);
        if (result.error) {
            alertErrorWithFallback(intl, result.error, messages.dm);
        }
        return !result.error;
    }, [intl, serverUrl]);

    // Create group channel
    const createGroupChannel = useCallback(async (ids: string[]): Promise<boolean> => {
        const result = await makeGroupChannel(serverUrl, ids);
        if (result.error) {
            alertErrorWithFallback(intl, result.error, messages.gm);
        }
        return !result.error;
    }, [intl, serverUrl]);

    // Start conversation / add members
    const startConversation = useCallback(async (selectedId?: string) => {
        if (startingConversation) {
            return;
        }
        setStartingConversation(true);

        let success;
        if (isExistingChannel && channelId) {
            const idsToAdd = selectedId ? [selectedId] : Array.from(newSelectedIds);
            if (idsToAdd.length === 0) {
                success = false;
            } else {
                const result = await addMembersToChannel(serverUrl, channelId, idsToAdd);
                success = !result.error;
            }
        } else {
            const idsToUse = selectedId ? [selectedId] : Array.from(newSelectedIds);
            if (idsToUse.length === 0) {
                success = false;
            } else if (variant === 'group_only' || (variant === 'default' && idsToUse.length > 1)) {
                success = await createGroupChannel(idsToUse);
            } else {
                success = await createDirectChannel(idsToUse[0]);
            }
        }

        if (success) {
            handleClose();
        } else {
            setStartingConversation(false);
        }
    }, [startingConversation, newSelectedIds, isExistingChannel, channelId, serverUrl, createGroupChannel, createDirectChannel, variant]);

    // Toggle select
    const toggleSelect = useCallback((userId: string) => {
        if (userId === currentUserId || lockedIds.has(userId)) {
            return;
        }

        // dm_only: single tap starts conversation immediately
        if (variant === 'dm_only') {
            startConversation(userId);
            return;
        }

        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(userId)) {
                next.delete(userId);
            } else {
                if (newSelectedIds.size >= General.MAX_USERS_IN_GM) {
                    return prev;
                }
                next.add(userId);
            }
            return next;
        });
        setSearchTerm('');
    }, [currentUserId, lockedIds, newSelectedIds.size, startConversation, variant]);

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

    const handleDone = useCallback(() => {
        startConversation();
    }, [startConversation]);

    // Done button label
    const doneLabel = useMemo(() => {
        const count = newSelectedIds.size;
        if (count > 1) {
            return intl.formatMessage({id: 'create_direct_message.done_with_count', defaultMessage: 'Done ({count})'}, {count});
        }
        if (isExistingChannel) {
            return intl.formatMessage({id: 'mobile.add_members.done', defaultMessage: 'Done'});
        }
        return intl.formatMessage({id: 'mobile.create_direct_message.start', defaultMessage: 'Start Conversation'});
    }, [intl, newSelectedIds.size, isExistingChannel]);

    const renderCheckbox = (userId: string) => {
        const isSelected = selectedIds.has(userId);
        const isLocked = lockedIds.has(userId);

        if (isLocked) {
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
        const isLocked = lockedIds.has(user.id);
        const name = displayUsername(user, teammateNameDisplay);

        return (
            <TouchableOpacity
                key={user.id}
                style={[style.memberRow, isLocked && {opacity: 0.5}]}
                onPress={() => toggleSelect(user.id)}
                disabled={isLocked || user.id === currentUserId}
            >
                {variant !== 'dm_only' && renderCheckbox(user.id)}
                <AvatarNoInitials author={user} size={40} showStatus={false}/>
                <Text style={style.memberName}>{name}</Text>
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

    // Selected profiles for avatar display in search bar
    const selectedProfiles = useMemo(() => {
        return Array.from(knownProfiles.values()).filter((p) => newSelectedIds.has(p.id));
    }, [knownProfiles, newSelectedIds]);

    return (
        <SafeAreaView
            style={style.container}
            testID='create_direct_message.screen'
            nativeID={SecurityManager.getShieldScreenId(componentId)}
            edges={['top', 'left', 'right']}
        >
            {/* Search bar */}
            <View style={style.searchSection}>
                <View style={style.searchBar}>
                    {selectedProfiles.length === 0 && (
                        <CompassIcon name='magnify' size={20} style={style.searchIcon}/>
                    )}
                    {selectedProfiles.length > 0 && variant !== 'dm_only' && (
                        <TouchableOpacity
                            style={{flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginRight: 8}}
                            onPress={() => setShowDropdown(true)}
                        >
                            {selectedProfiles.map((user) => (
                                <AvatarNoInitials
                                    key={user.id}
                                    author={user}
                                    size={28}
                                    showStatus={false}
                                />
                            ))}
                        </TouchableOpacity>
                    )}
                    <TextInput
                        style={style.searchInput}
                        value={searchTerm}
                        onChangeText={setSearchTerm}
                        placeholder={intl.formatMessage({id: 'channel_add_members.search_placeholder', defaultMessage: 'Search...'})}
                        placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.5)}
                        autoCapitalize='none'
                    />
                </View>
                {showDropdown && (
                    <View style={style.dropdownOverlay}>
                        <View style={style.dropdownList}>
                            {selectedProfiles.map((user) => {
                                const name = displayUsername(user, teammateNameDisplay);
                                return (
                                    <TouchableOpacity
                                        key={user.id}
                                        style={style.selectedMemberRow}
                                        onPress={() => toggleSelect(user.id)}
                                    >
                                        {renderCheckbox(user.id)}
                                        <AvatarNoInitials
                                            author={user}
                                            size={32}
                                            showStatus={false}
                                        />
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
                        {renderSection(
                            intl.formatMessage({id: 'channel_add_members.suppliers', defaultMessage: 'My Suppliers'}),
                            'suppliers',
                            filteredCandidates.suppliers,
                        )}
                        {renderSection(
                            intl.formatMessage({id: 'channel_add_members.customers', defaultMessage: 'My Customers'}),
                            'customers',
                            filteredCandidates.customers,
                        )}
                        {renderSection(
                            intl.formatMessage({id: 'channel_add_members.enterprise', defaultMessage: 'Enterprise Members'}),
                            'enterprise',
                            filteredCandidates.enterprise,
                        )}
                        {filteredCandidates.external.length > 0 && renderSection(
                            intl.formatMessage({id: 'channel_add_members.external', defaultMessage: 'External Contacts'}),
                            'external',
                            filteredCandidates.external,
                        )}
                        {filteredCandidates.searchResults.length > 0 && renderSection(
                            intl.formatMessage({id: 'channel_add_members.search_results', defaultMessage: 'Search Results'}),
                            'searchResults',
                            filteredCandidates.searchResults,
                        )}
                    </>
                }
            />

            {/* Bottom bar — only for default and group_only variants */}
            {variant !== 'dm_only' && (
                <View style={style.bottomBar}>
                    <TouchableOpacity
                        style={[style.doneButton, newSelectedIds.size === 0 && style.doneButtonDisabled]}
                        onPress={handleDone}
                        disabled={newSelectedIds.size === 0 || startingConversation}
                    >
                        <Text style={style.doneButtonText}>{doneLabel}</Text>
                    </TouchableOpacity>
                </View>
            )}
        </SafeAreaView>
    );
}
