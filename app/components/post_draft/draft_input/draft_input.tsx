// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useRef} from 'react';
import {useIntl} from 'react-intl';
import {Keyboard, type LayoutChangeEvent, Platform, ScrollView, StyleSheet, View} from 'react-native';
import {type Edge, SafeAreaView} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import TouchableWithFeedback from '@components/touchable_with_feedback';
import {Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {useIsTablet} from '@hooks/device';
import {usePersistentNotificationProps} from '@hooks/persistent_notification_props';
import {usePreventDoubleTap} from '@hooks/utils';
import {BOTTOM_SHEET_ANDROID_OFFSET} from '@screens/bottom_sheet';
import {bottomSheet, openAsBottomSheet} from '@screens/navigation';
import {persistentNotificationsConfirmation} from '@utils/post';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';

import PostInput from '../post_input';
import QuickActions from '../quick_actions';
import SendAction from '../send_button';
import Typing from '../typing';
import Uploads from '../uploads';

import Header from './header';

import type {PasteInputRef} from '@mattermost/react-native-paste-input';

// 微信风格：输入栏白底、简洁圆角
const CHAT_INPUT_BG = '#FFFFFF';
const CHAT_INPUT_BORDER_RADIUS = 8;
const CHAT_INPUT_MARGIN_H = 10;
const CHAT_INPUT_MARGIN_B = 6;

const CLOSE_DRAFT_MORE = 'close-draft-more-actions';
const CLOSE_DRAFT_EMOJI = 'close-draft-emoji-picker';

/** 微信底栏背景 #F3F3F3，与头部一致（参考微信图2） */
const WECHAT_FOOTER_BG = '#F3F3F3';
const WECHAT_ICON_MUTED = 'rgba(0, 0, 0, 0.55)';

export type Props = {
    testID?: string;
    channelId: string;
    channelType?: ChannelType;
    channelName?: string;
    rootId?: string;
    currentUserId: string;
    canShowPostPriority?: boolean;

    /** 用于聊天界面：白色圆角输入栏 */
    useChatInputStyle?: boolean;

    // Post Props
    postPriority: PostPriority;
    updatePostPriority: (postPriority: PostPriority) => void;
    persistentNotificationInterval: number;
    persistentNotificationMaxRecipients: number;

    // Cursor Position Handler
    updateCursorPosition: React.Dispatch<React.SetStateAction<number>>;
    cursorPosition: number;

    // Send Handler
    sendMessage: (schedulingInfo?: SchedulingInfo) => Promise<void | {data?: boolean; error?: unknown}>;
    canSend: boolean;
    maxMessageLength: number;

    // Draft Handler
    files: FileInfo[];
    value: string;
    uploadFileError: React.ReactNode;
    updateValue: React.Dispatch<React.SetStateAction<string>>;
    addFiles: (files: FileInfo[]) => void;
    updatePostInputTop: (top: number) => void;
    setIsFocused: (isFocused: boolean) => void;
    scheduledPostsEnabled: boolean;
}

const SAFE_AREA_VIEW_EDGES: Edge[] = ['left', 'right'];

const SCHEDULED_POST_PICKER_BUTTON = 'close-scheduled-post-picker';

const getStyleSheet = makeStyleSheetFromTheme((theme) => {
    return {
        actionsContainer: {
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingBottom: Platform.select({
                ios: 1,
                android: 2,
            }),
        },
        inputContainer: {
            flex: 1,
            flexDirection: 'column',
        },
        inputContentContainer: {
            alignItems: 'stretch',
            paddingTop: Platform.select({
                ios: 7,
                android: 0,
            }),
        },
        inputContentContainerChatStyle: {
            paddingTop: 4,
        },
        inputWrapper: {
            alignItems: 'flex-end',
            flexDirection: 'row',
            justifyContent: 'center',
            paddingBottom: 2,
            backgroundColor: changeOpacity(theme.centerChannelColor, 0.06),
            borderTopWidth: 1,
            borderColor: changeOpacity(theme.centerChannelColor, 0.12),
        },
        inputWrapperChatStyle: {
            backgroundColor: CHAT_INPUT_BG,
            borderTopWidth: 0,
            borderColor: 'transparent',
            marginHorizontal: CHAT_INPUT_MARGIN_H,
            marginBottom: CHAT_INPUT_MARGIN_B,
            borderRadius: CHAT_INPUT_BORDER_RADIUS,
            overflow: 'hidden',
            paddingHorizontal: 8,
            paddingTop: 6,
        },
        inputWrapperWeChatPhone: {
            backgroundColor: WECHAT_FOOTER_BG,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: 'rgba(0, 0, 0, 0.08)',
            paddingTop: 8,
            paddingBottom: Platform.select({ios: 6, android: 8}),
        },
        weChatInputRow: {
            flexDirection: 'row',
            alignItems: 'flex-end',
            paddingHorizontal: 6,
            minHeight: 44,
        },
        weChatInputShell: {
            flex: 1,
            backgroundColor: CHAT_INPUT_BG,
            borderRadius: 6,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: 'rgba(0, 0, 0, 0.08)',
            marginHorizontal: 4,
            marginBottom: 2,
            minHeight: 36,
            justifyContent: 'center',
        },
        weChatSideIconHit: {
            padding: 6,
            marginBottom: 4,
        },
        postPriorityLabel: {
            marginLeft: 12,
            marginTop: Platform.select({
                ios: 3,
                android: 10,
            }),
        },
    };
});

function DraftInput({
    testID,
    channelId,
    channelType,
    channelName,
    currentUserId,
    canShowPostPriority,
    files,
    maxMessageLength,
    rootId = '',
    value,
    uploadFileError,
    sendMessage,
    canSend,
    updateValue,
    addFiles,
    updateCursorPosition,
    cursorPosition,
    updatePostInputTop,
    postPriority,
    updatePostPriority,
    persistentNotificationInterval,
    persistentNotificationMaxRecipients,
    setIsFocused,
    scheduledPostsEnabled,
    useChatInputStyle = false,
}: Props) {
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const theme = useTheme();
    const isTablet = useIsTablet();

    const handleLayout = useCallback((e: LayoutChangeEvent) => {
        updatePostInputTop(e.nativeEvent.layout.height);
    }, []);

    const inputRef = useRef<PasteInputRef>();
    const focus = useCallback(() => {
        inputRef.current?.focus();
    }, []);

    // Render
    const postInputTestID = `${testID}.post.input`;
    const quickActionsTestID = `${testID}.quick_actions`;
    const sendActionTestID = `${testID}.send_action`;
    const style = getStyleSheet(theme);

    const {persistentNotificationsEnabled, noMentionsError, mentionsList} = usePersistentNotificationProps({
        value,
        channelType,
        postPriority,
    });

    const handleSendMessage = useCallback(async (schedulingInfoParam?: SchedulingInfo) => {
        const schedulingInfo = (schedulingInfoParam && 'scheduled_at' in schedulingInfoParam) ? schedulingInfoParam : undefined;

        if (persistentNotificationsEnabled) {
            const sendMessageWithScheduledPost = () => sendMessage(schedulingInfo);
            await persistentNotificationsConfirmation(serverUrl, value, mentionsList, intl, sendMessageWithScheduledPost, persistentNotificationMaxRecipients, persistentNotificationInterval, currentUserId, channelName, channelType);
            return Promise.resolve();
        }
        return sendMessage(schedulingInfo);
    }, [persistentNotificationsEnabled, serverUrl, value, mentionsList, intl, sendMessage, persistentNotificationMaxRecipients, persistentNotificationInterval, currentUserId, channelName, channelType]);

    const handleShowScheduledPostOptions = useCallback(() => {
        if (!scheduledPostsEnabled) {
            return;
        }

        Keyboard.dismiss();
        const title = isTablet ? intl.formatMessage({id: 'scheduled_post.picker.title', defaultMessage: 'Schedule draft'}) : '';

        openAsBottomSheet({
            closeButtonId: SCHEDULED_POST_PICKER_BUTTON,
            screen: Screens.SCHEDULED_POST_OPTIONS,
            theme,
            title,
            props: {
                closeButtonId: SCHEDULED_POST_PICKER_BUTTON,
                onSchedule: handleSendMessage,
            },
        });
    }, [handleSendMessage, intl, isTablet, scheduledPostsEnabled, theme]);

    const sendActionDisabled = !canSend || noMentionsError;

    const weChatPhoneFooter = useChatInputStyle;

    const openDraftEmojiPicker = usePreventDoubleTap(useCallback(() => {
        Keyboard.dismiss();
        openAsBottomSheet({
            closeButtonId: CLOSE_DRAFT_EMOJI,
            screen: Screens.EMOJI_PICKER,
            theme,
            title: intl.formatMessage({id: 'mobile.post_info.add_reaction', defaultMessage: 'Add Reaction'}),
            props: {
                closeButtonId: CLOSE_DRAFT_EMOJI,
                onEmojiPress: (emoji: string) => {
                    updateValue((v) => v + emoji);
                    updateCursorPosition((cp) => cp + [...emoji].length);
                },
            },
        });
    }, [intl, theme, updateValue, updateCursorPosition]));

    const renderQuickActionsForSheet = useCallback(() => (
        <View style={{paddingVertical: 8, paddingHorizontal: 4}}>
            <QuickActions
                testID={`${quickActionsTestID}.more_sheet`}
                addFiles={addFiles}
                canShowPostPriority={canShowPostPriority}
                fileCount={files.length}
                focus={focus}
                postPriority={postPriority}
                updatePostPriority={updatePostPriority}
                updateValue={updateValue}
                value={value}
            />
        </View>
    ), [addFiles, canShowPostPriority, files.length, focus, postPriority, quickActionsTestID, updatePostPriority, updateValue, value]);

    const openDraftMoreSheet = usePreventDoubleTap(useCallback(() => {
        Keyboard.dismiss();
        let sheetHeight = 56 + 44 + 24;
        if (Platform.OS === 'android') {
            sheetHeight += BOTTOM_SHEET_ANDROID_OFFSET;
        }
        bottomSheet({
            title: intl.formatMessage({id: 'post_draft.more_actions', defaultMessage: 'More'}),
            renderContent: renderQuickActionsForSheet,
            snapPoints: [1, sheetHeight],
            theme,
            closeButtonId: CLOSE_DRAFT_MORE,
        });
    }, [intl, renderQuickActionsForSheet, theme]));

    const dismissKeyboardOnly = useCallback(() => {
        Keyboard.dismiss();
    }, []);

    const sideHitSlop = {top: 10, bottom: 10, left: 10, right: 10};

    const classicFooter = (
        <SafeAreaView
            edges={SAFE_AREA_VIEW_EDGES}
            onLayout={handleLayout}
            style={useChatInputStyle ? [style.inputWrapper, style.inputWrapperChatStyle] : style.inputWrapper}
            testID={testID}
        >
            <ScrollView
                style={style.inputContainer}
                contentContainerStyle={useChatInputStyle ? [style.inputContentContainer, style.inputContentContainerChatStyle] : style.inputContentContainer}
                keyboardShouldPersistTaps={'always'}
                scrollEnabled={false}
                showsVerticalScrollIndicator={false}
                showsHorizontalScrollIndicator={false}
                pinchGestureEnabled={false}
                overScrollMode={'never'}
                disableScrollViewPanResponder={true}
            >
                {(!useChatInputStyle || postPriority.priority !== '' || postPriority.requested_ack || postPriority.persistent_notifications) && (
                    <Header
                        noMentionsError={noMentionsError}
                        postPriority={postPriority}
                    />
                )}
                <PostInput
                    testID={postInputTestID}
                    channelId={channelId}
                    maxMessageLength={maxMessageLength}
                    rootId={rootId}
                    cursorPosition={cursorPosition}
                    updateCursorPosition={updateCursorPosition}
                    updateValue={updateValue}
                    value={value}
                    addFiles={addFiles}
                    sendMessage={handleSendMessage}
                    inputRef={inputRef}
                    setIsFocused={setIsFocused}
                />
                <Uploads
                    currentUserId={currentUserId}
                    files={files}
                    uploadFileError={uploadFileError}
                    channelId={channelId}
                    rootId={rootId}
                />
                <View style={style.actionsContainer}>
                    <QuickActions
                        testID={quickActionsTestID}
                        fileCount={files.length}
                        addFiles={addFiles}
                        updateValue={updateValue}
                        value={value}
                        postPriority={postPriority}
                        updatePostPriority={updatePostPriority}
                        canShowPostPriority={canShowPostPriority}
                        focus={focus}
                    />
                    <SendAction
                        testID={sendActionTestID}
                        disabled={sendActionDisabled}
                        sendMessage={handleSendMessage}
                        showScheduledPostOptions={handleShowScheduledPostOptions}
                        scheduledPostEnabled={scheduledPostsEnabled}
                    />
                </View>
            </ScrollView>
        </SafeAreaView>
    );

    const weChatPhoneFooterEl = (
        <SafeAreaView
            edges={SAFE_AREA_VIEW_EDGES}
            onLayout={handleLayout}
            style={[style.inputWrapper, style.inputWrapperWeChatPhone]}
            testID={testID}
        >
            {(postPriority.priority !== '' || postPriority.requested_ack || postPriority.persistent_notifications) && (
                <View style={{paddingHorizontal: 8}}>
                    <Header
                        noMentionsError={noMentionsError}
                        postPriority={postPriority}
                    />
                </View>
            )}
            <Uploads
                currentUserId={currentUserId}
                files={files}
                uploadFileError={uploadFileError}
                channelId={channelId}
                rootId={rootId}
            />
            <View style={style.weChatInputRow}>
                <TouchableWithFeedback
                    borderlessRipple={true}
                    hitSlop={sideHitSlop}
                    onPress={dismissKeyboardOnly}
                    rippleRadius={20}
                    type='opacity'
                    testID={`${quickActionsTestID}.voice.button`}
                >
                    <View style={style.weChatSideIconHit}>
                        <CompassIcon
                            color={WECHAT_ICON_MUTED}
                            name='microphone-outline'
                            size={26}
                        />
                    </View>
                </TouchableWithFeedback>
                <View style={style.weChatInputShell}>
                    <PostInput
                        testID={postInputTestID}
                        channelId={channelId}
                        maxMessageLength={maxMessageLength}
                        rootId={rootId}
                        cursorPosition={cursorPosition}
                        updateCursorPosition={updateCursorPosition}
                        updateValue={updateValue}
                        value={value}
                        addFiles={addFiles}
                        sendMessage={handleSendMessage}
                        inputRef={inputRef}
                        setIsFocused={setIsFocused}
                    />
                </View>
                <TouchableWithFeedback
                    borderlessRipple={true}
                    hitSlop={sideHitSlop}
                    onPress={openDraftEmojiPicker}
                    rippleRadius={20}
                    type='opacity'
                >
                    <View style={style.weChatSideIconHit}>
                        <CompassIcon
                            color={WECHAT_ICON_MUTED}
                            name='emoticon-happy-outline'
                            size={26}
                        />
                    </View>
                </TouchableWithFeedback>
                {!sendActionDisabled && (
                    <SendAction
                        testID={sendActionTestID}
                        disabled={sendActionDisabled}
                        sendMessage={handleSendMessage}
                        showScheduledPostOptions={handleShowScheduledPostOptions}
                        scheduledPostEnabled={scheduledPostsEnabled}
                        weChatCompact={true}
                    />
                )}
                <TouchableWithFeedback
                    borderlessRipple={true}
                    hitSlop={sideHitSlop}
                    onPress={openDraftMoreSheet}
                    rippleRadius={20}
                    type='opacity'
                    testID={`${quickActionsTestID}.more.button`}
                >
                    <View style={style.weChatSideIconHit}>
                        <CompassIcon
                            color={WECHAT_ICON_MUTED}
                            name='plus-box-outline'
                            size={26}
                        />
                    </View>
                </TouchableWithFeedback>
            </View>
        </SafeAreaView>
    );

    return (
        <>
            <Typing
                channelId={channelId}
                rootId={rootId}
            />
            {weChatPhoneFooter ? weChatPhoneFooterEl : classicFooter}
        </>
    );
}

export default DraftInput;
