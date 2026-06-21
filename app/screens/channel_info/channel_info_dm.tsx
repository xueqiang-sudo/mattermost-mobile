// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';
import {useIntl} from 'react-intl';
import {Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {type Edge, SafeAreaView} from 'react-native-safe-area-context';

import {clearChannelHistory, toggleMuteChannel} from '@actions/remote/channel';
import {toggleFavoriteChannel} from '@actions/remote/category';
import CompassIcon from '@components/compass_icon';
import ProfilePicture from '@components/profile_picture';
import {Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import SecurityManager from '@managers/security_manager';
import {dismissAllModalsAndPopToRoot, dismissModal, goToScreen} from '@screens/navigation';
import {displayUsername} from '@utils/user';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import {DangerSection, SearchNavRow, ToggleRow} from './shared';

import type UserModel from '@typings/database/models/servers/user';
import type {AvailableScreens} from '@typings/screens/navigation';

type Props = {
    channelId: string;
    closeButtonId: string;
    componentId: AvailableScreens;
    dmUser?: UserModel;
    isFavorite: boolean;
    isMuted: boolean;
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
        paddingVertical: 24,
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
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    addActionGrid: {
        flexDirection: 'row',
        justifyContent: 'center',
        paddingVertical: 16,
        paddingHorizontal: 16,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.12),
    },
    addActionItem: {
        alignItems: 'center',
        width: 68,
    },
    addActionIcon: {
        width: 48,
        height: 48,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderRadius: 4,
        borderColor: changeOpacity(theme.centerChannelColor, 0.3),
        alignItems: 'center',
        justifyContent: 'center',
    },
    addActionLabel: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginTop: 4,
        ...typography('Body', 75),
    },
}));

const ChannelInfoDM = ({
    channelId,
    closeButtonId,
    componentId,
    dmUser,
    isFavorite,
    isMuted,
}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const styles = getStyleSheet(theme);

    const displayName = displayUsername(dmUser);

    const close = useCallback(() => {
        return dismissModal({componentId});
    }, [componentId]);

    useNavButtonPressed(closeButtonId, componentId, close, [close]);
    useAndroidHardwareBackHandler(componentId, close);

    const handleAddPeople = useCallback(async () => {
        await dismissModal({componentId});
        await dismissAllModalsAndPopToRoot();
        const title = intl.formatMessage({id: 'more_direct_channels.title', defaultMessage: 'Direct Messages'});
        goToScreen(Screens.CREATE_DIRECT_MESSAGE, title, {channelId});
    }, [channelId, componentId, intl]);

    const handleSearchHistory = useCallback(async () => {
        const title = intl.formatMessage({id: 'gm_settings.search_chat_history', defaultMessage: 'Search Chat History'});
        goToScreen(Screens.SEARCH_CHAT_HISTORY, title, {channelId, memberIds: []});
    }, [channelId, intl]);

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
                testID='channel_info_dm.screen'
            >
                <ScrollView
                    bounces={true}
                    alwaysBounceVertical={false}
                    contentContainerStyle={styles.content}
                >
                    {/* Header: Avatar + Name */}
                    <View style={styles.headerSection}>
                        <ProfilePicture
                            author={dmUser}
                            size={80}
                            showStatus={true}
                            statusSize={20}
                        />
                        <Text style={styles.displayName}>{displayName}</Text>
                    </View>

                    {/* Add people action */}
                    <View style={styles.addActionGrid}>
                        <TouchableOpacity
                            onPress={handleAddPeople}
                            style={styles.addActionItem}
                            testID='channel_info_dm.add_people'
                        >
                            <View style={styles.addActionIcon}>
                                <CompassIcon
                                    name='plus'
                                    size={24}
                                    color={changeOpacity(theme.centerChannelColor, 0.5)}
                                />
                            </View>
                            <Text style={styles.addActionLabel}>
                                {intl.formatMessage({id: 'gm_settings.add_label', defaultMessage: 'Add'})}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {/* Search chat history */}
                    <SearchNavRow
                        onPress={handleSearchHistory}
                        testID='channel_info_dm.search_history'
                    />

                    {/* Toggle section */}
                    <View style={styles.section}>
                        <ToggleRow
                            icon='bell-outline'
                            activeIcon='bell-off-outline'
                            label={intl.formatMessage({id: 'channel_info_rhs.gm.mute_notifications', defaultMessage: 'Mute Notifications'})}
                            value={isMuted}
                            onToggle={handleToggleMute}
                            testID='channel_info_dm.mute'
                        />
                        <ToggleRow
                            icon='star-outline'
                            activeIcon='star'
                            label={intl.formatMessage({id: 'channel_info_rhs.gm.pin_to_top', defaultMessage: 'Pin to Top'})}
                            value={isFavorite}
                            onToggle={handleToggleFavorite}
                            testID='channel_info_dm.favorite'
                        />
                    </View>

                    {/* Danger section */}
                    <DangerSection
                        buttons={[
                            {
                                label: intl.formatMessage({id: 'channel_info_rhs.gm.clear_history', defaultMessage: 'Clear Chat History'}),
                                onPress: handleClearHistory,
                                testID: 'channel_info_dm.clear_history',
                            },
                        ]}
                        testID='channel_info_dm.danger_section'
                    />
                </ScrollView>
            </SafeAreaView>
        </View>
    );
};

export default ChannelInfoDM;
