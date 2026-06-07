// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useMemo} from 'react';
import {ScrollView, View} from 'react-native';
import {type Edge, SafeAreaView} from 'react-native-safe-area-context';

import ChannelInfoEnableCalls from '@calls/components/channel_info_enable_calls';
import ChannelActions from '@components/channel_actions';
import ConvertToChannelLabel from '@components/channel_actions/convert_to_channel/convert_to_channel_label';
import ChannelBookmarks from '@components/channel_bookmarks';
import {General} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import SecurityManager from '@managers/security_manager';
import {dismissModal} from '@screens/navigation';
import {makeStyleSheetFromTheme} from '@utils/theme';

import ChannelInfoAppBindings from './app_bindings';
import ChannelInfoCard from './channel_info_card';
import {
    CHANNEL_INFO_CARD_INNER_PADDING,
    CHANNEL_INFO_HERO_TO_ACTIONS_GAP,
    CHANNEL_INFO_SCREEN_PADDING_H,
    makeChannelInfoModalOptionBoxStyle,
} from './channel_info_constants';
import DestructiveOptions from './destructive_options';
import Extra from './extra';
import Options from './options';
import Title from './title';

import type {AvailableScreens} from '@typings/screens/navigation';

type Props = {
    canAddBookmarks: boolean;
    canEnableDisableCalls: boolean;
    canManageSettings: boolean;
    channelId: string;
    closeButtonId: string;
    componentId: AvailableScreens;
    isBookmarksEnabled: boolean;
    isCallsEnabledInChannel: boolean;
    isPlaybooksEnabled: boolean;
    groupCallsAllowed: boolean;
    canManageMembers: boolean;
    isConvertGMFeatureAvailable: boolean;
    isCRTEnabled: boolean;
    isGuestUser: boolean;
    isTeamDefaultOpenChannel?: boolean;
    type?: ChannelType;
}

const edges: Edge[] = ['bottom', 'left', 'right'];

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    content: {
        paddingHorizontal: CHANNEL_INFO_SCREEN_PADDING_H,
        paddingTop: 8,
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
    extraBelowActions: {
        marginTop: 8,
        marginBottom: 16,
    },
}));

const ChannelInfo = ({
    canAddBookmarks,
    canEnableDisableCalls,
    canManageMembers,
    canManageSettings,
    channelId,
    closeButtonId,
    componentId,
    isBookmarksEnabled,
    isCallsEnabledInChannel,
    isPlaybooksEnabled,
    groupCallsAllowed,
    isConvertGMFeatureAvailable,
    isCRTEnabled,
    isGuestUser,
    isTeamDefaultOpenChannel = false,
    type,
}: Props) => {
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const styles = getStyleSheet(theme);

    const modalOptionBoxStyle = useMemo(
        () => makeChannelInfoModalOptionBoxStyle(theme),
        [theme],
    );

    // NOTE: isCallsEnabledInChannel will be true/false (not undefined) based on explicit state + the DefaultEnabled system setting
    //   which comes from observeIsCallsEnabledInChannel
    let callsAvailable = isCallsEnabledInChannel;
    if (!groupCallsAllowed && type !== General.DM_CHANNEL) {
        callsAvailable = false;
    }

    const onPressed = useCallback(() => {
        return dismissModal({componentId});
    }, [componentId]);

    useNavButtonPressed(closeButtonId, componentId, onPressed, [onPressed]);
    useAndroidHardwareBackHandler(componentId, onPressed);

    // 群聊不显示"转换为内部群"选项
    const convertGMOptionAvailable = false;

    return (
        <View
            style={styles.flex}
            nativeID={SecurityManager.getShieldScreenId(componentId)}
        >
            <SafeAreaView
                edges={edges}
                style={styles.safeArea}
                testID='channel_info.screen'
            >
                <ScrollView
                    bounces={true}
                    alwaysBounceVertical={false}
                    contentContainerStyle={styles.content}
                    testID='channel_info.scroll_view'
                >
                    <ChannelInfoCard
                        contentStyle={{padding: CHANNEL_INFO_CARD_INNER_PADDING}}
                        testID='channel_info.card.hero'
                    >
                        <Title
                            channelId={channelId}
                            type={type}
                        />
                        {isBookmarksEnabled &&
                            <ChannelBookmarks
                                canAddBookmarks={canAddBookmarks}
                                channelId={channelId}
                                hideAddBookmarkWhenEmptyInInfo={true}
                                separator={false}
                                showInInfo={true}
                            />
                        }
                    </ChannelInfoCard>
                    <ChannelInfoCard
                        contentStyle={{
                            paddingVertical: 12,
                            paddingHorizontal: 8,
                        }}
                        style={{marginTop: CHANNEL_INFO_HERO_TO_ACTIONS_GAP}}
                        testID='channel_info.card.actions'
                    >
                        <ChannelActions
                            canManageMembers={canManageMembers}
                            channelId={channelId}
                            channelType={type}
                            dismissChannelInfo={onPressed}
                            callsEnabled={callsAvailable}
                            inModal={true}
                            optionBoxContainerStyle={modalOptionBoxStyle}
                            testID='channel_info.channel_actions'
                        />
                    </ChannelInfoCard>
                    <View style={styles.extraBelowActions}>
                        <Extra channelId={channelId}/>
                    </View>
                    <ChannelInfoCard
                        contentStyle={{
                            paddingVertical: 8,
                            paddingHorizontal: CHANNEL_INFO_CARD_INNER_PADDING,
                        }}
                        testID='channel_info.card.options'
                    >
                        <Options
                            channelId={channelId}
                            type={type}
                            callsEnabled={callsAvailable}
                            canManageMembers={canManageMembers}
                            isCRTEnabled={isCRTEnabled}
                            canManageSettings={canManageSettings}
                            isPlaybooksEnabled={isPlaybooksEnabled}
                            isTeamDefaultOpenChannel={isTeamDefaultOpenChannel}
                        />
                        {convertGMOptionAvailable &&
                            <ConvertToChannelLabel channelId={channelId}/>
                        }
                        {canEnableDisableCalls &&
                            <ChannelInfoEnableCalls
                                channelId={channelId}
                                enabled={isCallsEnabledInChannel}
                            />
                        }
                        <DestructiveOptions
                            channelId={channelId}
                            componentId={componentId}
                        />
                    </ChannelInfoCard>
                    <ChannelInfoAppBindings
                        channelId={channelId}
                        dismissChannelInfo={onPressed}
                        serverUrl={serverUrl}
                    />
                </ScrollView>
            </SafeAreaView>
        </View>
    );
};

export default ChannelInfo;
