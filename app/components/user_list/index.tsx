// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useMemo} from 'react';
import {defineMessages, type IntlShape, useIntl} from 'react-intl';
import {FlatList, Keyboard, type ListRenderItemInfo, Platform, SectionList, type SectionListData, StyleSheet, Text, View} from 'react-native';

import {storeProfile} from '@actions/local/user';
import Loading from '@components/loading';
import NoResultsWithTerm from '@components/no_results_with_term';
import UserListRow from '@components/user_list_row';
import {General} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {useKeyboardHeight} from '@hooks/device';
import {openUserProfileModal} from '@screens/navigation';
import {getContactListDisplayName, getContactSectionId, createContactSectionsByNickname} from '@utils/contact_section';
import {
    changeOpacity,
    makeStyleSheetFromTheme,
} from '@utils/theme';
import {typography} from '@utils/typography';

import type UserModel from '@typings/database/models/servers/user';
import type {AvailableScreens} from '@typings/screens/navigation';

type UserProfileWithChannelAdmin = UserProfile & {scheme_admin?: boolean}
type RenderItemType = ListRenderItemInfo<UserProfileWithChannelAdmin> & {section?: SectionListData<UserProfileWithChannelAdmin>}

const INITIAL_BATCH_TO_RENDER = 15;
const SCROLL_EVENT_THROTTLE = 60;

const messages = defineMessages({
    admins: {
        id: 'mobile.manage_members.section_title_admins',
        defaultMessage: 'CHANNEL ADMINS',
    },
    members: {
        id: 'mobile.manage_members.section_title_members',
        defaultMessage: 'MEMBERS',
    },
});

const keyboardDismissProp = Platform.select({
    android: {
        onScrollBeginDrag: Keyboard.dismiss,
    },
    ios: {
        keyboardDismissMode: 'on-drag' as const,
    },
});

const keyExtractor = (item: UserProfile) => {
    return item.id;
};

const sectionKeyExtractor = (profile: UserProfile) => {
    const displayName = getContactListDisplayName(profile);
    return getContactSectionId(displayName);
};

const sectionRoleKeyExtractor = (cAdmin: boolean) => {
    // Group items by channel admin or channel member
    return cAdmin ? messages.admins : messages.members;
};

export function createProfilesSections(intl: IntlShape, profiles: UserProfile[], members?: ChannelMembership[]) {
    if (!profiles.length) {
        return [];
    }

    const sections = new Map<string, UserProfileWithChannelAdmin[]>();

    if (members?.length) {
        // when channel members are provided, build the sections by admins and members
        const membersDictionary = new Map<string, ChannelMembership>();
        const membersSections = new Map<string, UserProfileWithChannelAdmin[]>();
        const {formatMessage} = intl;
        members.forEach((m) => membersDictionary.set(m.user_id, m));
        profiles.forEach((p) => {
            const member = membersDictionary.get(p.id);
            if (member) {
                const sectionKey = sectionRoleKeyExtractor(member.scheme_admin!).id;
                const section = membersSections.get(sectionKey) || [];
                section.push({...p, scheme_admin: member.scheme_admin});
                membersSections.set(sectionKey, section);
            }
        });
        sections.set(formatMessage(messages.admins), membersSections.get(messages.admins.id) || []);
        sections.set(formatMessage(messages.members), membersSections.get(messages.members.id) || []);
    } else {
        // when channel members are not provided, build the sections alphabetically
        profiles.forEach((p) => {
            const sectionKey = sectionKeyExtractor(p);
            const sectionValue = sections.get(sectionKey) || [];
            const section = [...sectionValue, p];
            sections.set(sectionKey, section);
        });
    }

    const results = [];
    let index = 0;
    for (const [k, v] of sections) {
        if (v.length) {
            results.push({
                first: index === 0,
                id: k,
                data: v,
            });
            index++;
        }
    }
    return results;
}

function createProfiles(profiles: UserProfile[], members?: ChannelMembership[]): UserProfileWithChannelAdmin[] {
    if (!profiles.length) {
        return [];
    }

    const profileMap = new Map<string, UserProfileWithChannelAdmin>();
    profiles.forEach((profile) => {
        profileMap.set(profile.id, profile);
    });

    if (members?.length) {
        members.forEach((m) => {
            const profileFound = profileMap.get(m.user_id);
            if (profileFound) {
                profileFound.scheme_admin = m.scheme_admin;
            }
        });
    }

    return Array.from(profileMap.values());
}

const getStyleFromTheme = makeStyleSheetFromTheme((theme) => {
    return {
        list: {
            backgroundColor: theme.centerChannelBg,
            flex: 1,
        },
        listContactSelectGrouped: {
            backgroundColor: 'transparent',
            flex: 1,
        },
        groupedListShell: {
            flex: 1,
            minHeight: 0,
            borderRadius: 12,
            overflow: 'hidden',
            borderTopWidth: StyleSheet.hairlineWidth,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderTopColor: changeOpacity(theme.centerChannelColor, 0.1),
            borderBottomColor: changeOpacity(theme.centerChannelColor, 0.1),
            backgroundColor: theme.centerChannelBg,
        },
        container: {
            flexGrow: 1,
        },
        loadingContainer: {
            flex: 1,
            justifyContent: 'center' as const,
            alignItems: 'center' as const,
        },
        loadingContainerGrouped: {
            backgroundColor: 'transparent',
        },
        noResultContainer: {
            flexGrow: 1,
            alignItems: 'center' as const,
            justifyContent: 'center' as const,
        },
        sectionContainer: {
            backgroundColor: theme.centerChannelBg,
            paddingLeft: 16,
            justifyContent: 'center',
        },
        sectionContainerContactSelect: {
            backgroundColor: changeOpacity(theme.centerChannelColor, 0.25),
            paddingVertical: 12,
            paddingHorizontal: 12,
            justifyContent: 'center',
        },
        sectionWrapper: {
            backgroundColor: theme.centerChannelBg,
        },
        sectionWrapperContactSelect: {
            backgroundColor: 'transparent',
        },
        sectionText: {
            color: theme.centerChannelColor,
            ...typography('Body', 300, 'SemiBold'),
        },
        sectionTextContactSelect: {
            color: changeOpacity(theme.centerChannelColor, 0.88),
            ...typography('Body', 300, 'SemiBold'),
        },
    };
});

type Props = {
    profiles: UserProfile[];
    channelMembers?: ChannelMembership[];
    handleSelectProfile: (user: UserProfile | UserModel) => void;
    fetchMore?: () => void;
    loading: boolean;
    manageMode?: boolean;
    showManageMode?: boolean;
    showNoResults: boolean;
    selectedIds: Set<string>;
    lockedIds?: Set<string>;
    testID?: string;
    term?: string;
    tutorialWatched: boolean;
    includeUserMargin?: boolean;
    location: AvailableScreens;
    customSection?: (profiles: UserProfile[]) => Array<SectionListData<UserProfile>>;
    contactSelectLayout?: boolean;
    variant?: import('@screens/create_direct_message/create_direct_message').CreateDMWindowVariant;
    currentUserId?: string;
}

export default function UserList({
    profiles,
    channelMembers,
    selectedIds,
    lockedIds,
    handleSelectProfile,
    fetchMore,
    loading,
    manageMode = false,
    showManageMode = false,
    showNoResults,
    term,
    testID,
    tutorialWatched,
    includeUserMargin,
    location,
    customSection,
    contactSelectLayout = false,
    variant,
    currentUserId,
}: Props) {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const style = getStyleFromTheme(theme);
    const keyboardHeight = useKeyboardHeight();
    const noResutsStyle = useMemo(() => [
        style.noResultContainer,
        {paddingBottom: keyboardHeight},
    ], [style, keyboardHeight]);

    const data = useMemo(() => {
        if (profiles.length === 0 && !loading) {
            return [];
        }

        if (term) {
            return createProfiles(profiles, channelMembers);
        }

        if (customSection) {
            return customSection(profiles);
        }
        return createProfilesSections(intl, profiles, channelMembers);
    }, [channelMembers, customSection, intl, loading, profiles, term]);

    const openUserProfile = useCallback(async (profile: UserProfile | UserModel) => {
        let user: UserModel;
        if ('create_at' in profile) {
            const res = await storeProfile(serverUrl, profile);
            if (!res.user) {
                return;
            }
            user = res.user;
        } else {
            user = profile;
        }

        openUserProfileModal(intl, theme, {
            userId: user.id,
            location,
        });
    }, [intl, location, serverUrl, theme]);

    const renderItem = useCallback(({item, index, section}: RenderItemType) => {
        // The list will re-render when the selection changes because it's passed into the list as extraData
        if (!item?.id) {
            return null;
        }

        const selected = selectedIds.has(item.id);
        const locked = Boolean(lockedIds?.has(item.id));
        const isSelf = item.id === currentUserId;
        const canAdd = variant === 'dm_only' ? true : selectedIds.size < General.MAX_USERS_IN_GM;

        const isChAdmin = item.scheme_admin || false;

        return (
            <UserListRow
                key={item.id}
                contactSelectLayout={contactSelectLayout}
                listRowIndex={contactSelectLayout ? index : undefined}
                highlight={section?.first && index === 0}
                id={item.id}
                isChannelAdmin={isChAdmin}
                manageMode={manageMode}
                onPress={handleSelectProfile}
                onLongPress={openUserProfile}
                selectable={variant === 'dm_only' ? false : (manageMode || canAdd)}
                disabled={isSelf || !canAdd}
                selected={selected}
                locked={locked}
                showManageMode={showManageMode}
                testID='create_direct_message.user_list.user_item'
                tutorialWatched={tutorialWatched}
                user={item}
                includeMargin={includeUserMargin}
                variant={variant}
            />
        );
    }, [selectedIds, lockedIds, manageMode, handleSelectProfile, openUserProfile, showManageMode, tutorialWatched, includeUserMargin, contactSelectLayout, variant, currentUserId]);

    const renderLoading = useCallback(() => {
        if (!loading) {
            return null;
        }

        return (
            <Loading
                color={theme.buttonBg}
                containerStyle={[
                    style.loadingContainer,
                    contactSelectLayout && style.loadingContainerGrouped,
                ]}
                size='large'
            />
        );
    }, [loading, style.loadingContainer, style.loadingContainerGrouped, theme.buttonBg, contactSelectLayout]);

    const renderNoResults = useCallback(() => {
        if (!showNoResults || !term) {
            return null;
        }

        return (
            <View style={noResutsStyle}>
                <NoResultsWithTerm term={term}/>
            </View>
        );
    }, [showNoResults, term, noResutsStyle]);

    const renderSectionHeader = useCallback(({section}: {section: SectionListData<UserProfile> & {id?: string; mmSectionLabel?: string}}) => {
        const s = section as SectionListData<UserProfile> & {id?: string; mmSectionLabel?: string; title?: string};
        const headerText = s.mmSectionLabel ?? s.title ?? s.id ?? '';
        return (
            <View style={[style.sectionWrapper, contactSelectLayout && style.sectionWrapperContactSelect]}>
                <View style={[style.sectionContainer, contactSelectLayout && style.sectionContainerContactSelect]}>
                    <Text style={[style.sectionText, contactSelectLayout && style.sectionTextContactSelect]}>{String(headerText)}</Text>
                </View>
            </View>
        );
    }, [style, contactSelectLayout]);

    const renderFlatList = (items: UserProfile[]) => {
        const list = (
            <FlatList
                contentContainerStyle={style.container}
                data={items}
                extraData={selectedIds}
                keyboardShouldPersistTaps='always'
                {...keyboardDismissProp}
                keyExtractor={keyExtractor}
                initialNumToRender={INITIAL_BATCH_TO_RENDER}
                ListEmptyComponent={renderNoResults}
                ListFooterComponent={renderLoading}
                maxToRenderPerBatch={INITIAL_BATCH_TO_RENDER + 1}
                removeClippedSubviews={true}
                renderItem={renderItem}
                scrollEventThrottle={SCROLL_EVENT_THROTTLE}
                style={contactSelectLayout ? style.listContactSelectGrouped : style.list}
                testID={`${testID}.flat_list`}
            />
        );

        if (contactSelectLayout) {
            return (
                <View style={style.groupedListShell}>
                    {list}
                </View>
            );
        }
        return list;
    };

    const renderSectionList = (sections: Array<SectionListData<UserProfile>>) => {
        const list = (
            <SectionList
                contentContainerStyle={style.container}
                extraData={selectedIds}
                keyboardShouldPersistTaps='always'
                {...keyboardDismissProp}
                keyExtractor={keyExtractor}
                initialNumToRender={INITIAL_BATCH_TO_RENDER}
                ListEmptyComponent={renderNoResults}
                ListFooterComponent={renderLoading}
                maxToRenderPerBatch={INITIAL_BATCH_TO_RENDER + 1}
                removeClippedSubviews={!contactSelectLayout}
                renderItem={renderItem}
                renderSectionHeader={renderSectionHeader}
                scrollEventThrottle={SCROLL_EVENT_THROTTLE}
                sections={sections}
                style={contactSelectLayout ? style.listContactSelectGrouped : style.list}
                stickySectionHeadersEnabled={false}
                testID={`${testID}.section_list`}
                onEndReached={fetchMore}
            />
        );

        if (contactSelectLayout) {
            return (
                <View style={style.groupedListShell}>
                    {list}
                </View>
            );
        }
        return list;
    };

    if (term) {
        return renderFlatList(data as UserProfileWithChannelAdmin[]);
    }
    return renderSectionList(data as Array<SectionListData<UserProfileWithChannelAdmin>>);
}
