// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useIntl} from 'react-intl';
import {Alert, Keyboard, Platform, Text, View} from 'react-native';

import {getCallsConfig} from '@calls/state';
import CompassIcon from '@components/compass_icon';
import CustomStatusEmoji from '@components/custom_status/custom_status_emoji';
import NavigationHeader from '@components/navigation_header';
import SlideUpPanelItem, {ITEM_HEIGHT} from '@components/slide_up_panel_item';
import {switchToChannelById} from '@actions/remote/channel';
import {General, Screens} from '@constants';
import {type PlusMenuEntry, usePlusMenu} from '@context/plus_menu';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {useIsTablet} from '@hooks/device';
import {usePreventDoubleTap} from '@hooks/utils';
import {fetchPlaybookRunsForChannel} from '@playbooks/actions/remote/runs';
import {goToCreateQuickChecklist, goToPlaybookRun, goToPlaybookRuns} from '@playbooks/screens/navigation';
import {type BotInfo, getChannelBots, openDirectChannelWithBot} from '@screens/channel/ai_actions/ai_api';
import ChannelAnnouncementBar from '@screens/channel/header/channel_announcement_bar';
import ChannelBanner from '@screens/channel/header/channel_banner';
import {bottomSheet, popTopScreen, showModal} from '@screens/navigation';
import EphemeralStore from '@store/ephemeral_store';
import {debugLog} from '@store/debug_log';
import {isTypeDMorGM, usesDiscussionGroupChannelCopy} from '@utils/channel';
import {bottomSheetSnapPoint} from '@utils/helpers';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import ChannelHeaderBookmarks from './bookmarks';

import type {HeaderRightButton} from '@components/navigation_header/header';
import type {AvailableScreens} from '@typings/screens/navigation';


type ChannelProps = {
    announcementMarkdown: string;
    canAddBookmarks: boolean;
    canEditAnnouncement: boolean;
    channelId: string;
    channelName: string;
    channelType: ChannelType;
    currentUserId: string;
    customStatus?: UserCustomStatus;
    isBookmarksEnabled: boolean;
    isCustomStatusEnabled: boolean;
    isCustomStatusExpired: boolean;
    hasBookmarks: boolean;
    componentId?: AvailableScreens;
    displayName: string;
    displayNameCustomized: boolean;
    isOwnDirectMessage: boolean;
    memberCount?: number;
    teamId: string;
    callsEnabledInChannel: boolean;
    groupCallsAllowed: boolean;
    isTabletView?: boolean;
    shouldRenderBookmarks: boolean;
    shouldRenderChannelBanner: boolean;
    hasPlaybookRuns: boolean;
    playbooksActiveRuns: number;
    isPlaybooksEnabled: boolean;
    activeRunId?: string;

    // searchTerm: string;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    customStatusContainer: {
        flexDirection: 'row',
        height: 15,
        left: Platform.select({ios: undefined, default: -2}),
        marginTop: Platform.select({ios: undefined, default: 1}),
    },
    customStatusEmoji: {
        marginRight: 5,
        marginTop: Platform.select({ios: undefined, default: -2}),
    },
    customStatusText: {
        alignItems: 'center',
        height: 15,
    },
    subtitle: {
        color: changeOpacity(theme.sidebarHeaderTextColor, 0.72),
        ...typography('Body', 75),
        lineHeight: 12,
        marginBottom: 8,
        marginTop: 2,
        height: 13,
    },
}));

const ChannelHeader = ({
    announcementMarkdown,
    canAddBookmarks,
    canEditAnnouncement,
    channelId,
    channelName,
    channelType,
    componentId,
    currentUserId,
    customStatus,
    displayName,
    displayNameCustomized,
    hasBookmarks,
    isBookmarksEnabled,
    isCustomStatusEnabled,
    isCustomStatusExpired,
    isOwnDirectMessage,
    memberCount,
    teamId,
    callsEnabledInChannel,
    groupCallsAllowed,
    isTabletView,
    shouldRenderBookmarks,
    shouldRenderChannelBanner,
    playbooksActiveRuns,
    hasPlaybookRuns,
    isPlaybooksEnabled,
    activeRunId,
}: ChannelProps) => {
    const intl = useIntl();
    const isTablet = useIsTablet();
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const serverUrl = useServerUrl();

    const callsConfig = getCallsConfig(serverUrl);

    // NOTE: callsEnabledInChannel will be true/false (not undefined) based on explicit state + the DefaultEnabled system setting
    //   which ultimately comes from channel/index.tsx, and observeIsCallsEnabledInChannel
    let callsAvailable = callsConfig.pluginEnabled && callsEnabledInChannel;
    if (!groupCallsAllowed && channelType !== General.DM_CHANNEL) {
        callsAvailable = false;
    }

    const isDMorGM = isTypeDMorGM(channelType);
    const isGM = channelType === General.GM_CHANNEL;

    // Pre-fetch bots for GM channels to conditionally show AI Customer Service
    const [channelBots, setChannelBots] = useState<BotInfo[]>([]);
    useEffect(() => {
        if (!isGM) {
            setChannelBots([]);
            return;
        }
        let cancelled = false;
        getChannelBots(serverUrl, channelId).then((bots) => {
            if (!cancelled) {
                setChannelBots(bots);
            }
        }).catch(() => {/* ignore */});
        return () => { cancelled = true; };
    }, [serverUrl, channelId, isGM]);

    const onBackPress = useCallback(() => {
        Keyboard.dismiss();
        popTopScreen(componentId);
    }, [componentId]);

    const onTitlePress = usePreventDoubleTap(useCallback((() => {
        const isChannel = channelType === General.OPEN_CHANNEL || channelType === General.PRIVATE_CHANNEL;
        const title = isChannel
            ? intl.formatMessage({id: 'screens.channel_info', defaultMessage: 'Channel info'})
            : intl.formatMessage({id: 'screens.group_info', defaultMessage: 'Group info'});

        const closeButton = CompassIcon.getImageSourceSync('close', 24, theme.sidebarHeaderTextColor);
        const closeButtonId = 'close-channel-info';

        const options = {
            topBar: {
                leftButtons: [{
                    id: closeButtonId,
                    icon: closeButton,
                    testID: 'close.channel_info.button',
                }],
            },
        };
        showModal(Screens.CHANNEL_INFO, title, {channelId, closeButtonId}, options);
    }), [channelId, channelName, channelType, intl, theme]));

    const openBotChat = useCallback(async (bot: BotInfo) => {
        debugLog('AI_ASSISTANT', `openBotChat: botId=${bot.botId}, teamId=${bot.teamId}`);
        try {
            const channel = await openDirectChannelWithBot(serverUrl, bot.botId, bot.teamId);
            debugLog('AI_ASSISTANT', `openBotChat: channel=${JSON.stringify(channel)}`);
            if (channel) {
                switchToChannelById(serverUrl, channel.id);
                debugLog('AI_ASSISTANT', `openBotChat: switched to channel ${channel.id}`);
            } else {
                debugLog('AI_ASSISTANT', 'openBotChat: channel is null');
                Alert.alert('Error', 'Failed to create bot channel');
            }
        } catch (err) {
            debugLog('AI_ASSISTANT', `openBotChat error: ${err}`);
            Alert.alert('Error', `openBotChat failed: ${err}`);
        }
    }, [serverUrl]);

    const openAICustomerService = useCallback(async () => {
        debugLog('AI_ASSISTANT', `openAICustomerService: channelId=${channelId}, serverUrl=${serverUrl}`);
        try {
            const bots = await getChannelBots(serverUrl, channelId);
            debugLog('AI_ASSISTANT', `openAICustomerService: got ${bots.length} bots: ${JSON.stringify(bots)}`);

            if (bots.length === 0) {
                Alert.alert(
                    intl.formatMessage({id: 'ai_customer_service.no_bots', defaultMessage: 'No AI assistants available'}),
                    intl.formatMessage({id: 'ai_customer_service.no_bots_detail', defaultMessage: 'Please contact your administrator to add AI assistants.'})
                );
                return;
            }

            if (bots.length === 1) {
                await openBotChat(bots[0]);
                return;
            }

            // Multiple bots: show bottom sheet for selection
            const CLOSE_BUTTON_ID = 'close-bot-selection';
            const snapPoint = bottomSheetSnapPoint(bots.length, ITEM_HEIGHT);

            const renderContent = () => (
                <View>
                    {bots.map((bot) => (
                        <SlideUpPanelItem
                            key={bot.botId}
                            leftIcon='robot-happy-outline'
                            onPress={async () => {
                                await openBotChat(bot);
                            }}
                            text={bot.label}
                            testID={`bot_selection.${bot.botId}`}
                        />
                    ))}
                </View>
            );

            bottomSheet({
                closeButtonId: CLOSE_BUTTON_ID,
                title: intl.formatMessage({id: 'ai_customer_service.select_bot', defaultMessage: 'Select AI Assistant'}),
                snapPoints: [1, snapPoint],
                renderContent,
                theme,
            });
        } catch (error) {
            debugLog('AI_ASSISTANT', `openAICustomerService error: ${error}`);
            Alert.alert(
                intl.formatMessage({id: 'ai_customer_service.error', defaultMessage: 'Failed to load AI assistants'}),
                intl.formatMessage({id: 'ai_customer_service.error_detail', defaultMessage: 'Please try again later.'}) + `\n\n${error}`
            );
        }
    }, [channelId, serverUrl, intl, theme, openBotChat]);

    const openConsultation = useCallback(() => {
        const closeButtonId = 'close-consultation-panel';
        const options = {
            topBar: {
                visible: false,
            },
        };
        showModal(Screens.CONSULTATION_PANEL, '', {channelId, teamId, closeButtonId}, options);
    }, [channelId, teamId]);

    const openAIAssistant = useCallback(() => {
        const closeButtonId = 'close-ai-assistant-panel';
        const options = {
            topBar: {
                visible: false,
            },
        };
        showModal(Screens.AI_ASSISTANT_PANEL, '', {channelId, teamId, closeButtonId}, options);
    }, [channelId, teamId]);

    const {openPlusMenu} = usePlusMenu();

    const onChannelQuickAction = useCallback((event: any) => {
        // Public channel: directly open channel info, skip dropdown menu
        if (channelType === General.OPEN_CHANNEL) {
            onTitlePress();
            return;
        }

        // Show overflow menu dropdown below the "..." button
        const menuItems: PlusMenuEntry[] = [];

        // 在所有频道类型都显示 AI 助手（不限于 GM）
        // 如果 channelBots 尚未加载，在点击时动态获取
        menuItems.push({
            labelId: 'channel_header.ai_customer_service',
            defaultLabel: 'AI Assistant',
            onPress: openAICustomerService,
            testID: 'channel_header.overflow.ai_customer_service',
        });

        menuItems.push({
            labelId: 'consultation.title',
            defaultLabel: 'Consult Expert',
            onPress: openConsultation,
            testID: 'channel_header.overflow.consultation',
        });

        menuItems.push({
            labelId: 'channel_header.group_summary',
            defaultLabel: 'Group Summary',
            onPress: openAIAssistant,
            testID: 'channel_header.overflow.group_summary',
        });

        menuItems.push({
            labelId: 'screens.group_info',
            defaultLabel: 'Group Info',
            onPress: onTitlePress,
            testID: 'channel_header.overflow.channel_settings',
        });

        // Use event to get button position
        const {pageX, pageY} = event?.nativeEvent || {};
        const buttonWidth = 40; // Approximate button width
        const buttonHeight = 40; // Approximate button height

        openPlusMenu({
            anchorLeft: pageX || 0,
            anchorWidth: buttonWidth,
            anchorTop: (pageY || 0) + buttonHeight + 4, // 4px gap below button
            items: menuItems,
        });
    }, [channelType, isGM, channelBots, openAICustomerService, openConsultation, openAIAssistant, onTitlePress, openPlusMenu]);

    const openPlaybooksRuns = useCallback(() => {
        // If no active runs, create a new one instead
        if (playbooksActiveRuns === 0) {
            goToCreateQuickChecklist(
                intl,
                channelId,
                displayName,
                currentUserId,
                teamId,
                serverUrl,
            );
            return;
        }

        if (activeRunId) {
            goToPlaybookRun(intl, activeRunId);
            return;
        }
        goToPlaybookRuns(intl, channelId, displayName);
    }, [playbooksActiveRuns, activeRunId, channelId, displayName, intl, currentUserId, teamId, serverUrl]);

    const rightButtons = useMemo(() => {
        const buttons: HeaderRightButton[] = [];

        // 手机微信风格：仅保留「…」，AI功能等收入底部菜单
        if (isTablet && isPlaybooksEnabled && !isDMorGM) {
            buttons.push({
                iconName: 'product-playbooks',
                onPress: openPlaybooksRuns,
                buttonType: 'opacity',
                count: playbooksActiveRuns || '+',
            });
        }

        buttons.push({
            iconName: 'dots-horizontal',
            onPress: onChannelQuickAction,
            buttonType: 'opacity',
            testID: 'channel_header.channel_quick_actions.button',
        });

        return buttons;
    }, [isTablet, isPlaybooksEnabled, playbooksActiveRuns, isDMorGM, onChannelQuickAction, openPlaybooksRuns]);

    let title = displayName;
    let titleSuffix: string | undefined;
    if (isOwnDirectMessage) {
        title = intl.formatMessage({id: 'channel_header.directchannel.you', defaultMessage: '{displayName} (you)'}, {displayName});
    } else if (channelType === General.GM_CHANNEL && !displayNameCustomized) {
        title = intl.formatMessage({id: 'channel_header.groupchannel.default_title', defaultMessage: 'Group Chat'});
    }

    // 手机微信风格：标题单行含人数，如「频道名 (7)」
    // 群名可以被截断，但人数始终可见
    const weChatPhoneTitle = !isTablet && Boolean(memberCount) && channelType !== General.DM_CHANNEL;
    if (weChatPhoneTitle && memberCount) {
        titleSuffix = `(${memberCount})`;
    }

    let subtitle: string | undefined;
    if (weChatPhoneTitle) {
        subtitle = undefined;
    } else if (memberCount) {
        subtitle = intl.formatMessage({id: 'channel_header.member_count', defaultMessage: '{count, plural, one {# member} other {# members}}'}, {count: memberCount});
    }

    const subtitleCompanion = useMemo(() => {
        if (weChatPhoneTitle) {
            return undefined;
        }
        if (memberCount) {
            return (
                <CompassIcon
                    color={changeOpacity(theme.sidebarHeaderTextColor, 0.72)}
                    name='chevron-right'
                    size={14}
                />
            );
        }
        if (customStatus?.text && !isCustomStatusExpired) {
            return (
                <View style={styles.customStatusContainer}>
                    {isCustomStatusEnabled && Boolean(customStatus.emoji) &&
                    <CustomStatusEmoji
                        customStatus={customStatus}
                        emojiSize={13}
                        style={styles.customStatusEmoji}
                    />
                    }
                    <View style={styles.customStatusText}>
                        <Text
                            numberOfLines={1}
                            ellipsizeMode='tail'
                            style={styles.subtitle}
                            testID='channel_header.custom_status.custom_status_text'
                        >
                            {customStatus.text}
                        </Text>
                    </View>
                </View>
            );
        }
        if (channelType === General.DM_CHANNEL) {
            return undefined;
        }
        return (
            <CompassIcon
                color={changeOpacity(theme.sidebarHeaderTextColor, 0.72)}
                name='chevron-right'
                size={14}
            />
        );
    }, [weChatPhoneTitle, memberCount, channelType, customStatus, isCustomStatusExpired, theme.sidebarHeaderTextColor, styles.customStatusContainer, styles.customStatusEmoji, styles.customStatusText, styles.subtitle, isCustomStatusEnabled]);

    useEffect(() => {
        const asyncEffect = async () => {
            if (isPlaybooksEnabled && !EphemeralStore.getChannelPlaybooksSynced(serverUrl, channelId)) {
                await fetchPlaybookRunsForChannel(serverUrl, channelId);
            }
        };
        asyncEffect();
    }, [channelId, serverUrl, isPlaybooksEnabled]);

    const showBookmarkBar = isBookmarksEnabled && hasBookmarks && shouldRenderBookmarks;

    return (
        <>
            <NavigationHeader
                isLargeTitle={false}
                onBackPress={onBackPress}
                onTitlePress={onTitlePress}
                rightButtons={rightButtons}
                showBackButton={!isTablet || !isTabletView}
                subtitle={subtitle}
                subtitleCompanion={subtitleCompanion}
                title={title}
                titleSuffix={titleSuffix}
                useChatStyle={true}
            />
            {showBookmarkBar &&
            <ChannelHeaderBookmarks
                canAddBookmarks={canAddBookmarks}
                channelId={channelId}
            />
            }
            {
                shouldRenderChannelBanner &&
                <ChannelBanner
                    channelId={channelId}
                    isTopItem={!showBookmarkBar}
                />
            }
            {(channelType === General.PRIVATE_CHANNEL || channelType === General.DM_CHANNEL || channelType === General.GM_CHANNEL) && Boolean(announcementMarkdown.trim()) &&
                <ChannelAnnouncementBar
                    canEditAnnouncement={canEditAnnouncement}
                    channelId={channelId}
                    channelType={channelType}
                    headerMarkdown={announcementMarkdown}
                />
            }
        </>
    );
};

export default ChannelHeader;
