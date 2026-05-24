// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {defineMessage, defineMessages, useIntl} from 'react-intl';
import {Keyboard, type LayoutChangeEvent, Platform, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {addMembersToChannel, fetchChannelMemberships} from '@actions/remote/channel';
import {getEmployeeCandidates, searchEmployeeCandidates, type CandidateDraft} from '@actions/remote/candidate_search';
import CompassIcon from '@components/compass_icon';
import Loading from '@components/loading';
import Search from '@components/search';
import SectionNotice from '@components/section_notice';
import SelectedUsers from '@components/selected_users';
import ServerUserList from '@components/server_user_list';
import {Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {useAccessControlAttributes} from '@hooks/access_control_attributes';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import {useKeyboardOverlap} from '@hooks/device';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import SecurityManager from '@managers/security_manager';
import {dismissModal} from '@screens/navigation';
import {alertErrorWithFallback} from '@utils/draft';
import {mergeNavigationOptions} from '@utils/navigation';
import {showAddChannelMembersSnackbar} from '@utils/snack_bar';
import {changeOpacity, getKeyboardAppearanceFromTheme, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';
import {createContactSectionsByNickname} from '@utils/contact_section';

import type ChannelModel from '@typings/database/models/servers/channel';
import type {AvailableScreens} from '@typings/screens/navigation';

const CLOSE_BUTTON_ID = 'close-add-member';
const TEST_ID = 'add_members';
const CLOSE_BUTTON_TEST_ID = 'close.button';
const SCREEN_PADDING_H = 16;

const messages = defineMessages({
    selectionHintPrefix: {
        id: 'channel_add_members.selection_hint_prefix',
        defaultMessage: 'Select users to add to this channel',
    },
});

type CandidateTag = 'exactMatch' | 'customer' | 'supplier' | 'enterprise' | 'self';
type CandidateProfile = UserProfile & {mmCandidateTags?: CandidateTag[]};

/**
 * 从 CandidateDraft 提取标签集合
 */
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

/**
 * 将 CandidateDraft 列表转换为带标签的 UserProfile 列表
 */
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

export const getHeaderOptions = async (theme: Theme, displayName: string, inModal = false) => {
    let leftButtons;
    if (!inModal) {
        const closeButton = await CompassIcon.getImageSourceSync('close', 24, theme.sidebarHeaderTextColor);
        leftButtons = [{
            id: CLOSE_BUTTON_ID,
            icon: closeButton,
            testID: `${TEST_ID}.${CLOSE_BUTTON_TEST_ID}`,
        }];
    }
    return {
        topBar: {
            subtitle: {
                color: changeOpacity(theme.sidebarHeaderTextColor, 0.72),
                text: displayName,
            },
            leftButtons,
            backButton: inModal ? {
                color: theme.sidebarHeaderTextColor,
            } : undefined,
        },
    };
};

type Props = {
    componentId: AvailableScreens;
    channel?: ChannelModel;
    currentTeamId: string;
    currentUserId: string;
    teammateNameDisplay: string;
    tutorialWatched: boolean;
    inModal?: boolean;
}

const close = () => {
    Keyboard.dismiss();
    dismissModal();
};

const getStyleFromTheme = makeStyleSheetFromTheme((theme: Theme) => {
    return {
        container: {
            flex: 1,
            backgroundColor: theme.centerChannelBg,
        },
        contentContainer: {
            flex: 1,
            paddingHorizontal: SCREEN_PADDING_H,
            paddingTop: 12,
        },
        listFlex: {
            flex: 1,
            minHeight: 0,
            marginTop: 16,
        },
        searchCard: {
            borderRadius: 12,
            padding: 12,
            backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: changeOpacity(theme.centerChannelColor, 0.1),
        },
        searchBar: {
            marginBottom: 0,
        },
        selectionHintPrefix: {
            fontWeight: '600',
            fontSize: 14,
            color: changeOpacity(theme.centerChannelColor, 0.8),
            paddingTop: 8,
        },
        searchBarContainer: {
            backgroundColor: changeOpacity(theme.centerChannelColor, 0.06),
            borderRadius: 8,
            height: 56,
        },
        searchBarInput: {
            backgroundColor: 'transparent',
        },
        loadingContainer: {
            alignItems: 'center',
            backgroundColor: theme.centerChannelBg,
            height: 70,
            justifyContent: 'center',
        },
        loadingText: {
            color: changeOpacity(theme.centerChannelColor, 0.6),
        },
        noResultContainer: {
            flexGrow: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
        },
        noResultText: {
            color: changeOpacity(theme.centerChannelColor, 0.5),
            ...typography('Body', 600, 'Regular'),
        },
        flatBottomBanner: {
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0,
        },
    };
});

function removeProfileFromList(list: Set<string>, id: string) {
    const newSelectedIds = new Set(list);
    newSelectedIds.delete(id);
    return newSelectedIds;
}

export default function ChannelAddMembers({
    componentId,
    channel,
    currentTeamId,
    currentUserId,
    teammateNameDisplay,
    tutorialWatched,
    inModal,
}: Props) {
    const serverUrl = useServerUrl();
    const theme = useTheme();
    const style = getStyleFromTheme(theme);
    const intl = useIntl();
    const {formatMessage} = intl;

    const mainView = useRef<View>(null);
    const [containerHeight, setContainerHeight] = useState(0);
    const keyboardOverlap = useKeyboardOverlap(mainView, containerHeight);

    const [term, setTerm] = useState('');
    const [addingMembers, setAddingMembers] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set<string>());
    const [showBanner, setShowBanner] = useState(Boolean(channel?.abacPolicyEnforced));

    // Use the hook to fetch access control attributes
    const {attributeTags} = useAccessControlAttributes('channel', channel?.id, channel?.abacPolicyEnforced);

    const handleDismissBanner = useCallback(() => {
        setShowBanner(false);
    }, []);

    const clearSearch = useCallback(() => {
        setTerm('');
    }, []);

    const handleRemoveProfile = useCallback((id: string) => {
        setSelectedIds((current) => removeProfileFromList(current, id));
    }, []);

    const addMembers = useCallback(async () => {
        if (!channel) {
            return;
        }

        if (addingMembers) {
            return;
        }

        const idsToUse = Array.from(selectedIds);
        if (!idsToUse.length) {
            return;
        }

        setAddingMembers(true);
        const result = await addMembersToChannel(serverUrl, channel.id, idsToUse);

        if (result.error) {
            alertErrorWithFallback(intl, result.error, defineMessage({id: 'mobile.channel_add_members.error', defaultMessage: 'There has been an error and we could not add those users to the channel.'}));
            setAddingMembers(false);
        } else {
            close();
            showAddChannelMembersSnackbar(idsToUse.length);
        }
    }, [channel, addingMembers, selectedIds, serverUrl, intl]);

    const handleSelectProfile = useCallback((user: UserProfile) => {
        clearSearch();
        setSelectedIds((current) => {
            if (current.has(user.id)) {
                return removeProfileFromList(current, user.id);
            }

            const newSelectedIds = new Set(current);
            newSelectedIds.add(user.id);

            return newSelectedIds;
        });
    }, [clearSearch]);

    const onTextChange = useCallback((searchTerm: string) => {
        setTerm(searchTerm);
    }, []);

    const onLayout = useCallback((e: LayoutChangeEvent) => {
        setContainerHeight(e.nativeEvent.layout.height);
    }, []);

    const updateNavigationButtons = useCallback(async () => {
        const options = await getHeaderOptions(theme, channel?.displayName || '', inModal);
        mergeNavigationOptions(componentId, options);
    }, [theme, channel?.displayName, inModal, componentId]);

    const teamIdForMembersList = channel?.teamId || currentTeamId || '';

    const userFetchFunction = useCallback(async (page: number) => {
        if (page > 0 || !channel) {
            return [];
        }

        const candidates = await getEmployeeCandidates(serverUrl, teamIdForMembersList, currentUserId);
        const {members = []} = await fetchChannelMemberships(serverUrl, channel.id, {}, true);
        const existingMemberIds = new Set(members.map((m: ChannelMembership) => m.user_id));

        const profiles = mapCandidateDraftsToProfiles(candidates);
        return profiles.filter((p) => !existingMemberIds.has(p.id) && !p.delete_at);
    }, [serverUrl, channel, teamIdForMembersList, currentUserId]);

    const userSearchFunction = useCallback(async (searchTerm: string) => {
        if (!channel) {
            return [];
        }

        const trimmedTerm = searchTerm.trim();
        if (!trimmedTerm) {
            return [];
        }

        const candidates = await searchEmployeeCandidates(serverUrl, teamIdForMembersList, currentUserId, trimmedTerm);
        const {members = []} = await fetchChannelMemberships(serverUrl, channel.id, {}, true);
        const existingMemberIds = new Set(members.map((m: ChannelMembership) => m.user_id));

        const profiles = mapCandidateDraftsToProfiles(candidates);
        return profiles.filter((p) => !existingMemberIds.has(p.id));
    }, [serverUrl, channel, teamIdForMembersList, currentUserId]);

    const createUserFilter = useCallback(() => {
        return () => true;
    }, []);

    useNavButtonPressed(CLOSE_BUTTON_ID, componentId, close, [close]);
    useAndroidHardwareBackHandler(componentId, close);

    useEffect(() => {
        updateNavigationButtons();
    }, [updateNavigationButtons, channel, serverUrl]);

    if (addingMembers) {
        return (
            <View style={style.container}>
                <Loading color={theme.centerChannelColor}/>
            </View>
        );
    }

    return (
        <SafeAreaView
            style={style.container}
            testID={`${TEST_ID}.screen`}
            onLayout={onLayout}
            ref={mainView}
            edges={['top', 'left', 'right']}
            nativeID={SecurityManager.getShieldScreenId(componentId)}
        >
            {showBanner && (
                <SectionNotice
                    type='info'
                    title={formatMessage({
                        id: 'channel.abac_policy_enforced.title',
                        defaultMessage: 'Channel access is restricted by user attributes',
                    })}
                    text={formatMessage({
                        id: 'channel.abac_policy_enforced.description',
                        defaultMessage: 'Only people who match the specified access rules can be selected and added to this channel.',
                    })}
                    tags={attributeTags.length > 0 ? attributeTags : undefined}
                    isDismissable={true}
                    onDismissClick={handleDismissBanner}
                    location={Screens.CHANNEL_ADD_MEMBERS}
                    testID={`${TEST_ID}.notice`}
                    squareCorners={true}
                />
            )}
            <View style={style.contentContainer}>
                <View style={style.searchCard}>
                    <View style={style.searchBar}>
                        <Search
                            testID={`${TEST_ID}.search_bar`}
                            placeholder={formatMessage({id: 'search_bar.search', defaultMessage: 'Search'})}
                            cancelButtonTitle={formatMessage({id: 'common.cancel', defaultMessage: 'Cancel'})}
                            placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.5)}
                            onChangeText={onTextChange}
                            onCancel={clearSearch}
                            autoCapitalize='none'
                            keyboardAppearance={getKeyboardAppearanceFromTheme(theme)}
                            value={term}
                            inputContainerStyle={style.searchBarContainer}
                            inputStyle={style.searchBarInput}
                        />
                    </View>
                    <Text
                        style={style.selectionHintPrefix}
                        testID={`${TEST_ID}.selection_hint`}
                        allowFontScaling={false}
                        maxFontSizeMultiplier={1}
                    >
                        {formatMessage(messages.selectionHintPrefix)}
                    </Text>
                </View>
                <View style={style.listFlex}>
                    <ServerUserList
                        handleSelectProfile={handleSelectProfile}
                        selectedIds={selectedIds}
                        term={term}
                        testID={`${TEST_ID}.user_list`}
                        tutorialWatched={tutorialWatched}
                        fetchFunction={userFetchFunction}
                        searchFunction={userSearchFunction}
                        createFilter={createUserFilter}
                        location={Screens.CHANNEL_ADD_MEMBERS}
                        contactSelectLayout={true}
                        customSection={createContactSectionsByNickname}
                        disableClientFilter={true}
                    />
                </View>
                <SelectedUsers
                    keyboardOverlap={keyboardOverlap}
                    selectedIds={selectedIds}
                    onRemove={handleRemoveProfile}
                    teammateNameDisplay={teammateNameDisplay}
                    onPress={addMembers}
                    buttonIcon={'account-plus-outline'}
                    buttonText={formatMessage({id: 'channel_add_members.add_members.button', defaultMessage: 'Add Members'})}
                    testID={`${TEST_ID}.selected`}
                />
            </View>
        </SafeAreaView>
    );
}
