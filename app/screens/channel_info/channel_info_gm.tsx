// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useMemo} from 'react';
import {useIntl} from 'react-intl';
import {Alert, ScrollView, StyleSheet, Text, View} from 'react-native';
import {type Edge, SafeAreaView} from 'react-native-safe-area-context';

import {clearChannelHistory, leaveChannel, patchChannel, toggleMuteChannel, updateChannelNotifyProps} from '@actions/remote/channel';
import {toggleFavoriteChannel} from '@actions/remote/category';
import {Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import SecurityManager from '@managers/security_manager';
import {dismissAllModalsAndPopToRoot, dismissModal, goToScreen} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import {DangerSection, EditableField, IdField, MemberGrid, SearchNavRow, ToggleRow} from './shared';
import GroupAvatars from './title/group_message/avatars';

import type {AvailableScreens} from '@typings/screens/navigation';

type Props = {
    channelId: string;
    closeButtonId: string;
    componentId: AvailableScreens;
    currentUserId: string;
    displayName?: string;
    isFavorite: boolean;
    isMuted: boolean;
    memberIds: string[];
    myNickname?: string;
}

const edges: Edge[] = ['bottom', 'left', 'right'];

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
    headerSection: {
        alignItems: 'center',
        paddingVertical: 20,
        paddingHorizontal: 16,
    },
    displayName: {
        color: theme.centerChannelColor,
        marginTop: 12,
        ...typography('Heading', 600, 'SemiBold'),
        textAlign: 'center',
    },
    section: {
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.12),
        paddingHorizontal: 0,
        paddingVertical: 0,
    },
}));

const ChannelInfoGM = ({
    channelId,
    closeButtonId,
    componentId,
    currentUserId,
    displayName,
    isFavorite,
    isMuted,
    memberIds,
    myNickname,
}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const styles = getStyleSheet(theme);

    // Exclude current user from avatar display (matching PC webapp behavior: show all including current user)
    const avatarUserIds = useMemo(() => memberIds.filter((id) => id !== currentUserId), [memberIds, currentUserId]);

    const close = useCallback(() => {
        return dismissModal({componentId});
    }, [componentId]);

    useNavButtonPressed(closeButtonId, componentId, close, [close]);
    useAndroidHardwareBackHandler(componentId, close);

    const handleAddPeople = useCallback(async () => {
        await dismissModal({componentId});
        await dismissAllModalsAndPopToRoot();
        const title = intl.formatMessage({id: 'more_direct_channels.title', defaultMessage: 'Direct Messages'});
        goToScreen(Screens.CREATE_DIRECT_MESSAGE, title, {channelId, isExistingChannel: true});
    }, [channelId, componentId, intl]);

    const handleRemovePeople = useCallback(async () => {
        // TODO: Implement remove members modal
    }, []);

    const handleSearchHistory = useCallback(async () => {
        // TODO: Implement dedicated search history screen
    }, []);

    const handleToggleMute = useCallback(() => {
        toggleMuteChannel(serverUrl, channelId);
    }, [channelId, serverUrl]);

    const handleToggleFavorite = useCallback(() => {
        toggleFavoriteChannel(serverUrl, channelId);
    }, [channelId, serverUrl]);

    const handleSaveGroupName = useCallback((newName: string) => {
        patchChannel(serverUrl, channelId, {display_name: newName});
    }, [channelId, serverUrl]);

    const handleSaveNickname = useCallback((newNickname: string) => {
        updateChannelNotifyProps(serverUrl, channelId, {nickname: newNickname});
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

    const handleLeaveGroup = useCallback(() => {
        Alert.alert(
            intl.formatMessage({id: 'channel_info.close_gm', defaultMessage: 'Close discussion group'}),
            intl.formatMessage({
                id: 'channel_info.close_gm_channel',
                defaultMessage: 'Are you sure you want to close this discussion group? This will remove it from your home screen, but you can always open it again.',
            }),
            [
                {
                    text: intl.formatMessage({id: 'common.cancel', defaultMessage: 'Cancel'}),
                    style: 'cancel',
                },
                {
                    text: intl.formatMessage({id: 'channel_info.leave', defaultMessage: 'Leave'}),
                    style: 'destructive',
                    onPress: async () => {
                        await leaveChannel(serverUrl, channelId);
                        await dismissAllModalsAndPopToRoot();
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
                testID='channel_info_gm.screen'
            >
                <ScrollView
                    bounces={true}
                    alwaysBounceVertical={false}
                    contentContainerStyle={styles.content}
                >
                    {/* Header: Avatars + Name */}
                    <View style={styles.headerSection}>
                        <GroupAvatars userIds={avatarUserIds}/>
                        <Text style={styles.displayName}>{displayName}</Text>
                    </View>

                    {/* Member grid with search + add/remove buttons */}
                    <View style={styles.section}>
                        <MemberGrid
                            memberIds={memberIds}
                            currentUserId={currentUserId}
                            myNickname={myNickname}
                            showAddButton={true}
                            showRemoveButton={true}
                            showSearch={true}
                            onAddPress={handleAddPeople}
                            onRemovePress={handleRemovePeople}
                            testID='channel_info_gm.member_grid'
                        />
                    </View>

                    {/* Group ID */}
                    <IdField
                        id={channelId}
                        label={intl.formatMessage({id: 'channel_info_rhs.gm.group_id', defaultMessage: 'Group ID'})}
                        testID='channel_info_gm.group_id'
                    />

                    {/* Group Name (editable) */}
                    <EditableField
                        label={intl.formatMessage({id: 'channel_info_rhs.gm.group_name', defaultMessage: 'Group Name'})}
                        value={displayName || ''}
                        placeholder={intl.formatMessage({id: 'channel_info_rhs.gm.group_name_placeholder', defaultMessage: 'Other members will be notified after modification'})}
                        onSave={handleSaveGroupName}
                        testID='channel_info_gm.group_name'
                    />

                    {/* My Nickname in this group */}
                    <EditableField
                        label={intl.formatMessage({id: 'channel_info_rhs.gm.my_nickname', defaultMessage: 'My Nickname in This Group'})}
                        value={myNickname || ''}
                        placeholder={intl.formatMessage({id: 'channel_info_rhs.gm.nickname_placeholder', defaultMessage: 'Your real name will be used if empty'})}
                        onSave={handleSaveNickname}
                        testID='channel_info_gm.my_nickname'
                    />

                    {/* Search chat history */}
                    <SearchNavRow
                        onPress={handleSearchHistory}
                        testID='channel_info_gm.search_history'
                    />

                    {/* Toggle section */}
                    <View style={styles.section}>
                        <ToggleRow
                            icon='star-outline'
                            activeIcon='star'
                            label={intl.formatMessage({id: 'channel_info_rhs.gm.pin_to_top', defaultMessage: 'Pin to Top'})}
                            value={isFavorite}
                            onToggle={handleToggleFavorite}
                            testID='channel_info_gm.favorite'
                        />
                        <ToggleRow
                            icon='bell-outline'
                            activeIcon='bell-off-outline'
                            label={intl.formatMessage({id: 'channel_info_rhs.gm.mute_notifications', defaultMessage: 'Mute Notifications'})}
                            value={isMuted}
                            onToggle={handleToggleMute}
                            testID='channel_info_gm.mute'
                        />
                    </View>

                    {/* Danger section */}
                    <DangerSection
                        buttons={[
                            {
                                label: intl.formatMessage({id: 'channel_info_rhs.gm.clear_history', defaultMessage: 'Clear Chat History'}),
                                onPress: handleClearHistory,
                                testID: 'channel_info_gm.clear_history',
                            },
                            {
                                label: intl.formatMessage({id: 'channel_info_rhs.gm.leave_group', defaultMessage: 'Leave Group'}),
                                onPress: handleLeaveGroup,
                                testID: 'channel_info_gm.leave_group',
                            },
                        ]}
                        testID='channel_info_gm.danger_section'
                    />
                </ScrollView>
            </SafeAreaView>
        </View>
    );
};

export default ChannelInfoGM;
