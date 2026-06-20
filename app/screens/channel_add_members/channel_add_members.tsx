// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useIntl} from 'react-intl';
import {FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {addMembersToChannel, fetchChannelMemberships} from '@actions/remote/channel';
import {getEmployeeCandidates, searchEmployeeCandidates, type CandidateDraft} from '@actions/remote/candidate_search';
import CompassIcon from '@components/compass_icon';
import ProfilePicture from '@components/profile_picture';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import {popTopScreen} from '@screens/navigation';
import {alertErrorWithFallback} from '@utils/draft';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';
import {displayUsername} from '@utils/user';

import type ChannelModel from '@typings/database/models/servers/channel';
import type {AvailableScreens} from '@typings/screens/navigation';

const TEST_ID = 'add_members';

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

type Props = {
    componentId: AvailableScreens;
    channel?: ChannelModel;
    currentUserId: string;
    currentTeamId: string;
    teammateNameDisplay: string;
    tutorialWatched: boolean;
    inModal?: boolean;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    closeButton: {
        padding: 4,
    },
    closeIcon: {
        color: theme.centerChannelColor,
    },
    title: {
        flex: 1,
        textAlign: 'center',
        color: theme.centerChannelColor,
        ...typography('Heading', 600, 'SemiBold'),
    },
    titlePlaceholder: {
        width: 32,
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
    searchBarExpanded: {
        flexDirection: 'column',
        alignItems: 'stretch',
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
    avatarChips: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        marginBottom: 8,
    },
    avatarChip: {
        position: 'relative',
    },
    selectedMembersList: {
        marginBottom: 12,
    },
    selectedMemberRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        gap: 12,
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
    selectedMemberName: {
        flex: 1,
        color: theme.centerChannelColor,
        ...typography('Body', 200),
    },
    listContainer: {
        flex: 1,
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
    memberRowLocked: {
        opacity: 0.5,
    },
    memberName: {
        flex: 1,
        color: theme.centerChannelColor,
        ...typography('Body', 200),
    },
    memberNameLocked: {
        color: changeOpacity(theme.centerChannelColor, 0.5),
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
}));

export default function ChannelAddMembers({
    componentId,
    channel,
    currentUserId,
    currentTeamId,
    teammateNameDisplay,
}: Props) {
    const intl = useIntl();
    const theme = useTheme();
    const style = getStyleSheet(theme);
    const serverUrl = useServerUrl();

    const [lockedIds, setLockedIds] = useState<Set<string>>(new Set());
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isSearchExpanded, setIsSearchExpanded] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [candidates, setCandidates] = useState<{
        suppliers: CandidateProfile[];
        customers: CandidateProfile[];
        enterprise: CandidateProfile[];
    }>({suppliers: [], customers: [], enterprise: []});
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['suppliers', 'customers', 'enterprise']));
    const [isAdding, setIsAdding] = useState(false);

    const teamIdForMembersList = channel?.teamId || currentTeamId || '';

    // Fetch existing channel members
    useEffect(() => {
        if (!channel) {
            return;
        }
        fetchChannelMemberships(serverUrl, channel.id, {}, true).then(({members = []}) => {
            const ids = new Set<string>();
            members.forEach((m: ChannelMembership) => {
                if (m.user_id !== currentUserId) {
                    ids.add(m.user_id);
                }
            });
            setLockedIds(ids);
            setSelectedIds(ids);
        });
    }, [channel, serverUrl, currentUserId]);

    // Fetch candidates
    useEffect(() => {
        getEmployeeCandidates(serverUrl, teamIdForMembersList, currentUserId).then((drafts) => {
            const profiles = mapCandidateDraftsToProfiles(drafts);
            setCandidates({
                suppliers: profiles.filter((p) => p.mmCandidateTags?.includes('supplier')),
                customers: profiles.filter((p) => p.mmCandidateTags?.includes('customer')),
                enterprise: profiles.filter((p) => p.mmCandidateTags?.includes('enterprise')),
            });
        });
    }, [serverUrl, teamIdForMembersList, currentUserId]);

    // Compute newSelectedIds
    const newSelectedIds = useMemo(() => {
        const s = new Set<string>();
        selectedIds.forEach((id) => {
            if (!lockedIds.has(id)) {
                s.add(id);
            }
        });
        return s;
    }, [selectedIds, lockedIds]);

    // Filter candidates by search term
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
        };
    }, [candidates, searchTerm, teammateNameDisplay]);

    const handleClose = useCallback(() => {
        popTopScreen(componentId);
    }, [componentId]);

    useAndroidHardwareBackHandler(componentId, handleClose);

    const toggleSelect = useCallback((userId: string) => {
        if (lockedIds.has(userId)) {
            return;
        }
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(userId)) {
                next.delete(userId);
            } else {
                next.add(userId);
            }
            return next;
        });
    }, [lockedIds]);

    const handleDone = useCallback(async () => {
        if (!channel || isAdding || newSelectedIds.size === 0) {
            return;
        }
        setIsAdding(true);
        const idsToUse = Array.from(newSelectedIds);
        const result = await addMembersToChannel(serverUrl, channel.id, idsToUse);
        if (result.error) {
            alertErrorWithFallback(intl, result.error, {
                id: 'mobile.channel_add_members.error',
                defaultMessage: 'There has been an error and we could not add those users to the channel.',
            });
            setIsAdding(false);
        } else {
            popTopScreen(componentId);
        }
    }, [channel, isAdding, newSelectedIds, serverUrl, intl, componentId]);

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
                style={[style.memberRow, isLocked && style.memberRowLocked]}
                onPress={() => toggleSelect(user.id)}
                disabled={isLocked}
            >
                {renderCheckbox(user.id)}
                <ProfilePicture
                    author={user}
                    size={40}
                    showStatus={false}
                />
                <Text style={[style.memberName, isLocked && style.memberNameLocked]}>
                    {name}
                    {isLocked && ` (${intl.formatMessage({id: 'channel_add_members.existing', defaultMessage: 'Existing member'})})`}
                </Text>
            </TouchableOpacity>
        );
    };

    const renderSection = (title: string, sectionKey: string, members: CandidateProfile[]) => {
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

    const selectedProfiles = useMemo(() => {
        const allProfiles = [
            ...candidates.suppliers,
            ...candidates.customers,
            ...candidates.enterprise,
        ];
        return allProfiles.filter((p) => newSelectedIds.has(p.id));
    }, [candidates, newSelectedIds]);

    const renderSearchSection = () => {
        if (isSearchExpanded) {
            return (
                <View style={style.searchSection}>
                    <View style={[style.searchBar, style.searchBarExpanded]}>
                        {selectedProfiles.length > 0 && (
                            <View style={style.selectedMembersList}>
                                {selectedProfiles.map((user) => {
                                    const name = displayUsername(user, teammateNameDisplay);
                                    return (
                                        <TouchableOpacity
                                            key={user.id}
                                            style={style.selectedMemberRow}
                                            onPress={() => toggleSelect(user.id)}
                                        >
                                            {renderCheckbox(user.id)}
                                            <ProfilePicture
                                                author={user}
                                                size={32}
                                                showStatus={false}
                                            />
                                            <Text style={style.selectedMemberName}>{name}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        )}
                        <View style={{flexDirection: 'row', alignItems: 'center'}}>
                            <CompassIcon name='magnify' size={20} style={style.searchIcon}/>
                            <TextInput
                                style={style.searchInput}
                                value={searchTerm}
                                onChangeText={setSearchTerm}
                                placeholder={intl.formatMessage({id: 'channel_add_members.search_placeholder', defaultMessage: 'Search nickname...'})}
                                placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.5)}
                                autoFocus={true}
                            />
                        </View>
                    </View>
                </View>
            );
        }

        return (
            <View style={style.searchSection}>
                <TouchableOpacity
                    style={style.searchBar}
                    onPress={() => setIsSearchExpanded(true)}
                >
                    {selectedProfiles.length === 0 && (
                        <CompassIcon name='magnify' size={20} style={style.searchIcon}/>
                    )}
                    {selectedProfiles.length > 0 && (
                        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 4, flex: 1}}>
                            {selectedProfiles.slice(0, 5).map((user) => (
                                <ProfilePicture
                                    key={user.id}
                                    author={user}
                                    size={28}
                                    showStatus={false}
                                />
                            ))}
                            {selectedProfiles.length > 5 && (
                                <View style={{alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 14, backgroundColor: changeOpacity(theme.centerChannelColor, 0.1)}}>
                                    <Text style={{color: theme.centerChannelColor, fontSize: 12}}>+{selectedProfiles.length - 5}</Text>
                                </View>
                            )}
                        </View>
                    )}
                    <TextInput
                        style={style.searchInput}
                        value={searchTerm}
                        onChangeText={setSearchTerm}
                        placeholder={intl.formatMessage({id: 'channel_add_members.search_placeholder', defaultMessage: 'Search nickname...'})}
                        placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.5)}
                        editable={false}
                    />
                </TouchableOpacity>
            </View>
        );
    };

    return (
        <SafeAreaView style={style.container} edges={['top', 'left', 'right']}>
            {/* Top Bar */}
            <View style={style.topBar}>
                <TouchableOpacity style={style.closeButton} onPress={handleClose}>
                    <CompassIcon name='close' size={24} style={style.closeIcon}/>
                </TouchableOpacity>
                <Text style={style.title}>
                    {intl.formatMessage({id: 'channel_add_members.title', defaultMessage: 'Add Members'})}
                </Text>
                <View style={style.titlePlaceholder}/>
            </View>

            {/* Search Section */}
            {renderSearchSection()}

            {/* Member List */}
            <FlatList
                style={style.listContainer}
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
                    </>
                }
            />

            {/* Bottom Bar */}
            <View style={style.bottomBar}>
                <TouchableOpacity
                    style={[style.doneButton, newSelectedIds.size === 0 && style.doneButtonDisabled]}
                    onPress={handleDone}
                    disabled={newSelectedIds.size === 0 || isAdding}
                >
                    <Text style={style.doneButtonText}>
                        {newSelectedIds.size > 0
                            ? intl.formatMessage({id: 'channel_add_members.done_with_count', defaultMessage: 'Done ({count})'}, {count: newSelectedIds.size})
                            : intl.formatMessage({id: 'channel_add_members.done', defaultMessage: 'Done'})}
                    </Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}
