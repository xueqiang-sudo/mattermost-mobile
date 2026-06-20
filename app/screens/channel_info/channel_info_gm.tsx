// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';
import {useIntl} from 'react-intl';
import {Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {type Edge, SafeAreaView} from 'react-native-safe-area-context';

import {clearChannelHistory, leaveChannel, toggleMuteChannel} from '@actions/remote/channel';
import {toggleFavoriteChannel} from '@actions/remote/category';
import CompassIcon from '@components/compass_icon';
import {Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import SecurityManager from '@managers/security_manager';
import {dismissAllModalsAndPopToRoot, dismissModal, goToScreen} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';
import {DangerSection, IdField, MemberGrid, SearchNavRow, ToggleRow} from './shared';

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
    nicknameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    nicknameArrow: {
        color: changeOpacity(theme.centerChannelColor, 0.32),
    },
    navRowLabel: {
        color: theme.centerChannelColor,
        ...typography('Body', 200),
    },
    navRowValue: {
        flex: 1,
        color: changeOpacity(theme.centerChannelColor, 0.56),
        textAlign: 'right',
        marginRight: 4,
        ...typography('Body', 200),
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

    const close = useCallback(() => {
        return dismissModal({componentId});
    }, [componentId]);

    useNavButtonPressed(closeButtonId, componentId, close, [close]);
    useAndroidHardwareBackHandler(componentId, close);

    const handleAddPeople = useCallback(async () => {
        await dismissModal({componentId});
        await dismissAllModalsAndPopToRoot();
        const title = intl.formatMessage({id: 'mobile.add_members.title', defaultMessage: 'Add Members'});
        goToScreen(Screens.CREATE_DIRECT_MESSAGE, title, {channelId, isExistingChannel: true});
    }, [channelId, componentId, intl]);

    const handleRemovePeople = useCallback(async () => {
        const title = intl.formatMessage({id: 'gm_settings.remove_title', defaultMessage: 'Remove Members'});
        goToScreen(Screens.REMOVE_MEMBERS, title, {channelId});
    }, [channelId, intl]);

    const handleSearchHistory = useCallback(async () => {
        // TODO: Implement dedicated search history screen
    }, []);

    const handleToggleMute = useCallback(() => {
        toggleMuteChannel(serverUrl, channelId);
    }, [channelId, serverUrl]);

    const handleToggleFavorite = useCallback(() => {
        toggleFavoriteChannel(serverUrl, channelId);
    }, [channelId, serverUrl]);

    const handleEditGroupName = useCallback(() => {
        const title = intl.formatMessage({id: 'gm_settings.edit_group_name_title', defaultMessage: 'Edit Group Name'});
        goToScreen(Screens.EDIT_GROUP_NAME, title, {
            channelId,
            initialDisplayName: displayName || '',
            memberIds,
        });
    }, [channelId, displayName, memberIds, intl]);

    const handleEditNickname = useCallback(() => {
        const title = intl.formatMessage({id: 'channel_info_rhs.gm.my_nickname', defaultMessage: 'My Nickname in This Group'});
        goToScreen(Screens.EDIT_GROUP_NICKNAME, title, {
            channelId,
            initialNickname: myNickname || '',
        });
    }, [channelId, myNickname, intl]);

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

                    {/* Group Name — tap to open edit screen */}
                    <TouchableOpacity
                        onPress={handleEditGroupName}
                        style={styles.nicknameRow}
                        testID='channel_info_gm.group_name'
                    >
                        <Text style={styles.navRowLabel}>
                            {intl.formatMessage({id: 'channel_info_rhs.gm.group_name', defaultMessage: 'Group Name'})}
                        </Text>
                        <Text style={styles.navRowValue} numberOfLines={1}>
                            {displayName || ''}
                        </Text>
                        <CompassIcon name='chevron-right' size={20} style={styles.nicknameArrow}/>
                    </TouchableOpacity>

                    {/* My Nickname in this group — tap to open edit screen */}
                    <TouchableOpacity
                        onPress={handleEditNickname}
                        style={styles.nicknameRow}
                        testID='channel_info_gm.my_nickname'
                    >
                        <Text style={styles.navRowLabel}>
                            {intl.formatMessage({id: 'channel_info_rhs.gm.my_nickname', defaultMessage: 'My Nickname in This Group'})}
                        </Text>
                        <Text style={styles.navRowValue} numberOfLines={1}>
                            {myNickname || ''}
                        </Text>
                        <CompassIcon name='chevron-right' size={20} style={styles.nicknameArrow}/>
                    </TouchableOpacity>

                    {/* Search chat history */}
                    <SearchNavRow
                        onPress={handleSearchHistory}
                        testID='channel_info_gm.search_history'
                    />

                    {/* Toggle section */}
                    <View style={styles.toggleSection}>
                        <ToggleRow
                            icon=''
                            label={intl.formatMessage({id: 'channel_info_rhs.gm.pin_to_top', defaultMessage: 'Pin Chat to Top'})}
                            value={isFavorite}
                            onToggle={handleToggleFavorite}
                            testID='channel_info_gm.favorite'
                        />
                        <ToggleRow
                            icon=''
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
