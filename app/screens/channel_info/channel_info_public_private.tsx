// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect} from 'react';
import {useIntl} from 'react-intl';
import {Alert, ScrollView, StyleSheet, View} from 'react-native';
import {type Edge, SafeAreaView} from 'react-native-safe-area-context';

import {clearChannelHistory, toggleMuteChannel} from '@actions/remote/channel';
import {toggleFavoriteChannel} from '@actions/remote/category';
import {fetchProfilesInChannel} from '@actions/remote/user';
import {Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import SecurityManager from '@managers/security_manager';
import {dismissModal, goToScreen, showModal} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';

import {DangerSection, IdField, MemberGrid, SearchNavRow, ToggleRow} from './shared';

import type {AvailableScreens} from '@typings/screens/navigation';

type Props = {
    channelId: string;
    closeButtonId: string;
    componentId: AvailableScreens;
    displayName?: string;
    isFavorite: boolean;
    isMuted: boolean;
    isTeamAdmin: boolean;
    memberIds: string[];
    teamInviteId?: string;
    teamDisplayName?: string;
    type?: ChannelType;
}

const edges: Edge[] = ['bottom', 'left', 'right'];
const MAX_VISIBLE_MEMBERS = 16;

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    content: {
        paddingBottom: 24,
    },
    flex: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    safeArea: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    section: {
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.12),
        paddingHorizontal: 0,
        paddingVertical: 0,
    },
    toggleSection: {
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.12),
        paddingHorizontal: 16,
        paddingVertical: 0,
    },
}));

const ChannelInfoPublicPrivate = ({
    channelId,
    closeButtonId,
    componentId,
    isFavorite,
    isMuted,
    isTeamAdmin,
    memberIds,
    teamInviteId,
    teamDisplayName,
}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const styles = getStyleSheet(theme);

    // Fetch all channel members from server so local DB has complete membership records
    useEffect(() => {
        fetchProfilesInChannel(serverUrl, channelId, undefined, {page: 0, per_page: 200});
    }, [serverUrl, channelId]);

    const close = useCallback(() => {
        return dismissModal({componentId});
    }, [componentId]);

    useNavButtonPressed(closeButtonId, componentId, close, [close]);
    useAndroidHardwareBackHandler(componentId, close);

    const handleInvitePeople = useCallback(() => {
        showModal(
            Screens.INVITE,
            intl.formatMessage({id: 'invite.title', defaultMessage: 'Invite'}),
        );
    }, [intl]);

    const handleRemovePeople = useCallback(() => {
        const title = intl.formatMessage({id: 'channel_info.remove_members', defaultMessage: 'Remove Members'});
        goToScreen(Screens.REMOVE_MEMBERS, title, {channelId});
    }, [channelId, intl]);

    const handleSearchHistory = useCallback(async () => {
        const title = intl.formatMessage({id: 'gm_settings.search_chat_history', defaultMessage: 'Search Chat History'});
        goToScreen(Screens.SEARCH_CHAT_HISTORY, title, {channelId, memberIds});
    }, [channelId, memberIds, intl]);

    const handleToggleMute = useCallback(() => {
        toggleMuteChannel(serverUrl, channelId);
    }, [channelId, serverUrl]);

    const handleToggleFavorite = useCallback(() => {
        toggleFavoriteChannel(serverUrl, channelId);
    }, [channelId, serverUrl]);

    const handleClearHistory = useCallback(() => {
        Alert.alert(
            intl.formatMessage({id: 'clear_history.title', defaultMessage: 'Clear Chat History'}),
            intl.formatMessage({
                id: 'clear_history.message',
                defaultMessage: 'Are you sure you want to clear the chat history? Messages will no longer be visible to you, but other members can still see them.',
            }),
            [
                {
                    text: intl.formatMessage({id: 'gm_settings.cancel', defaultMessage: 'Cancel'}),
                    style: 'cancel',
                },
                {
                    text: intl.formatMessage({id: 'clear_history.confirm', defaultMessage: 'Clear'}),
                    style: 'destructive',
                    onPress: async () => {
                        await clearChannelHistory(serverUrl, channelId);
                    },
                },
            ],
            {cancelable: false},
        );
    }, [channelId, intl, serverUrl]);

    return (
        <View
            style={styles.flex}
            nativeID={SecurityManager.getShieldScreenId(componentId)}
        >
            <SafeAreaView
                edges={edges}
                style={styles.safeArea}
                testID='channel_info_public_private.screen'
            >
                <ScrollView
                    bounces={true}
                    alwaysBounceVertical={false}
                    contentContainerStyle={styles.content}
                >
                    {/* 企业名称 */}
                    {teamDisplayName ? (
                        <IdField
                            id={teamDisplayName}
                            label={intl.formatMessage({id: 'channel_settings.enterprise_name', defaultMessage: 'Enterprise Name'})}
                            testID='channel_info_public_private.enterprise_name'
                        />
                    ) : null}

                    {/* Invite ID */}
                    {teamInviteId ? (
                        <IdField
                            id={teamInviteId}
                            label={intl.formatMessage({id: 'channel_settings.invite_id', defaultMessage: 'Invite ID'})}
                            testID='channel_info_public_private.invite_id'
                        />
                    ) : null}

                    {/* Member grid with search (no add/remove buttons) */}
                    <View style={styles.section}>
                        <MemberGrid
                            memberIds={memberIds}
                            showAddButton={true}
                            showRemoveButton={isTeamAdmin}
                            showSearch={true}
                            maxVisible={MAX_VISIBLE_MEMBERS}
                            onAddPress={handleInvitePeople}
                            onRemovePress={handleRemovePeople}
                            testID='channel_info_public_private.member_grid'
                        />
                    </View>

                    {/* Search chat history */}
                    <SearchNavRow
                        onPress={handleSearchHistory}
                        testID='channel_info_public_private.search_history'
                    />

                    {/* Toggle section */}
                    <View style={styles.toggleSection}>
                        <ToggleRow
                            icon=''
                            label={intl.formatMessage({id: 'channel_info_rhs.gm.mute_notifications', defaultMessage: 'Mute Notifications'})}
                            value={isMuted}
                            onToggle={handleToggleMute}
                            testID='channel_info_public_private.mute'
                        />
                        <ToggleRow
                            icon=''
                            label={intl.formatMessage({id: 'channel_info_rhs.gm.pin_to_top', defaultMessage: 'Pin to Top'})}
                            value={isFavorite}
                            onToggle={handleToggleFavorite}
                            testID='channel_info_public_private.favorite'
                        />
                    </View>

                    {/* Danger section */}
                    <DangerSection
                        buttons={[
                            {
                                label: intl.formatMessage({id: 'channel_info_rhs.gm.clear_history', defaultMessage: 'Clear Chat History'}),
                                onPress: handleClearHistory,
                                testID: 'channel_info_public_private.clear_history',
                            },
                        ]}
                        testID='channel_info_public_private.danger_section'
                    />
                </ScrollView>
            </SafeAreaView>
        </View>
    );
};

export default ChannelInfoPublicPrivate;
