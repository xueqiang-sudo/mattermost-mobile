// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useMemo} from 'react';
import {useIntl} from 'react-intl';
import {Alert, ScrollView, StyleSheet, Text, View} from 'react-native';
import {type Edge, SafeAreaView} from 'react-native-safe-area-context';

import {clearChannelHistory, toggleMuteChannel} from '@actions/remote/channel';
import {toggleFavoriteChannel} from '@actions/remote/category';
import CompassIcon from '@components/compass_icon';
import {General, Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import SecurityManager from '@managers/security_manager';
import {dismissModal, goToScreen} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import {DangerSection, IdField, MemberGrid, SearchNavRow, ToggleRow} from './shared';

import type {AvailableScreens} from '@typings/screens/navigation';

type Props = {
    channelId: string;
    closeButtonId: string;
    componentId: AvailableScreens;
    displayName?: string;
    isFavorite: boolean;
    isMuted: boolean;
    memberIds: string[];
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
    headerSection: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 20,
        paddingHorizontal: 16,
    },
    headerIcon: {
        width: 48,
        height: 48,
        borderRadius: 4,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    headerInfo: {
        flex: 1,
    },
    headerName: {
        color: theme.centerChannelColor,
        ...typography('Heading', 400, 'SemiBold'),
    },
    headerType: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginTop: 2,
        ...typography('Body', 75),
    },
    section: {
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.12),
        paddingHorizontal: 0,
        paddingVertical: 0,
    },
}));

const ChannelInfoPublicPrivate = ({
    channelId,
    closeButtonId,
    componentId,
    displayName,
    isFavorite,
    isMuted,
    memberIds,
    type,
}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const styles = getStyleSheet(theme);

    const isPrivate = type === General.PRIVATE_CHANNEL;
    const channelIcon = isPrivate ? 'lock-outline' : 'globe';
    const channelTypeName = isPrivate
        ? intl.formatMessage({id: 'channel_settings.type_private', defaultMessage: 'Private Channel'})
        : intl.formatMessage({id: 'channel_settings.type_public', defaultMessage: 'Public Channel'});
    const membersCountText = intl.formatMessage(
        {id: 'channel_settings.members_count', defaultMessage: '{count} members'},
        {count: memberIds.length},
    );

    const close = useCallback(() => {
        return dismissModal({componentId});
    }, [componentId]);

    useNavButtonPressed(closeButtonId, componentId, close, [close]);
    useAndroidHardwareBackHandler(componentId, close);

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
                    {/* Header: Icon + Name + Type */}
                    <View style={styles.headerSection}>
                        <View style={styles.headerIcon}>
                            <CompassIcon
                                name={channelIcon}
                                size={24}
                                color={changeOpacity(theme.centerChannelColor, 0.72)}
                            />
                        </View>
                        <View style={styles.headerInfo}>
                            <Text style={styles.headerName} numberOfLines={1}>{displayName}</Text>
                            <Text style={styles.headerType}>{channelTypeName} · {membersCountText}</Text>
                        </View>
                    </View>

                    {/* Channel ID */}
                    <IdField
                        id={channelId}
                        label={intl.formatMessage({id: 'channel_settings.channel_id', defaultMessage: 'Channel ID'})}
                        testID='channel_info_public_private.channel_id'
                    />

                    {/* Member grid with search (no add/remove buttons) */}
                    <View style={styles.section}>
                        <MemberGrid
                            memberIds={memberIds}
                            showAddButton={false}
                            showRemoveButton={false}
                            showSearch={true}
                            maxVisible={MAX_VISIBLE_MEMBERS}
                            testID='channel_info_public_private.member_grid'
                        />
                    </View>

                    {/* Search chat history */}
                    <SearchNavRow
                        onPress={handleSearchHistory}
                        testID='channel_info_public_private.search_history'
                    />

                    {/* Toggle section */}
                    <View style={styles.section}>
                        <ToggleRow
                            icon='bell-outline'
                            activeIcon='bell-off-outline'
                            label={intl.formatMessage({id: 'channel_info_rhs.gm.mute_notifications', defaultMessage: 'Mute Notifications'})}
                            value={isMuted}
                            onToggle={handleToggleMute}
                            testID='channel_info_public_private.mute'
                        />
                        <ToggleRow
                            icon='star-outline'
                            activeIcon='star'
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
