// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {Keyboard, type LayoutChangeEvent, type EmitterSubscription, Platform, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import Animated, {cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming} from 'react-native-reanimated';
import {type Edge, SafeAreaView} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import TouchableWithFeedback from '@components/touchable_with_feedback';
import {Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {useIsTablet} from '@hooks/device';
import {usePersistentNotificationProps} from '@hooks/persistent_notification_props';
import {useVoiceRecorder, type VoiceRecorderErrorCode} from '@hooks/use_voice_recorder';
import {usePreventDoubleTap} from '@hooks/utils';
import {BOTTOM_SHEET_ANDROID_OFFSET} from '@screens/bottom_sheet';
import {bottomSheet, dismissBottomSheet, openAsBottomSheet} from '@screens/navigation';
import {persistentNotificationsConfirmation} from '@utils/post';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {showSnackBar} from '@utils/snack_bar';
import {MESSAGE_TYPE, SNACK_BAR_TYPE} from '@constants/snack_bar';

import PostInput from '../post_input';
import QuickActions, {QuickActionsSheet} from '../quick_actions';
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

/** 波形条最大高度，须 ≤ WAVE_STRIP_HEIGHT，避免撑开行高导致上方提示文字随 flex 居中上下抖 */
const WAVE_STRIP_HEIGHT = 28;

/** 千问风格：单个波形条（自下而上伸缩，父容器固定高度） */
function WaveformBar({index, recording}: {index: number; recording: boolean}) {
    const height = useSharedValue(8);
    const animatedStyle = useAnimatedStyle(() => ({
        height: height.value,
        width: 3,
        backgroundColor: '#FFFFFF',
        borderRadius: 2,
    }));
    useEffect(() => {
        if (recording) {
            const maxDelta = Math.max(4, WAVE_STRIP_HEIGHT - 8);
            height.value = withRepeat(
                withTiming(8 + Math.random() * maxDelta, {duration: 150 + index * 25}),
                -1,
                true,
            );
        } else {
            cancelAnimation(height);
            height.value = withTiming(8);
        }
        return () => cancelAnimation(height);
    }, [recording, index]);
    return <Animated.View style={animatedStyle}/>;
}

/** 千问风格：录制时波形动画（固定条带高度 + 底对齐，避免条高度变化带动整列重排） */
function WaveformBars({recording}: {recording: boolean}) {
    return (
        <View
            style={{
                height: WAVE_STRIP_HEIGHT,
                flexDirection: 'row',
                alignItems: 'flex-end',
                justifyContent: 'center',
                gap: 3,
            }}
        >
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                <WaveformBar key={i} index={i} recording={recording} />
            ))}
        </View>
    );
}

/** 千问风格：按住说话按钮（含波形）；embedded 时贴在外壳内，不再画内边框避免与键盘之间出现分隔线 */
function HoldToSpeakButton({
    recording,
    holdLabel,
    releaseLabel,
    onPressIn,
    onPressOut,
    embedded,
}: {
    recording: boolean;
    holdLabel: string;
    releaseLabel: string;
    onPressIn: () => void;
    onPressOut: () => void;
    embedded?: boolean;
}) {
    return (
        <Pressable
            onPressIn={onPressIn}
            onPressOut={onPressOut}
            style={({pressed}) => [
                {
                    flex: 1,
                    minHeight: 40,
                    borderRadius: embedded ? 0 : 6,
                    backgroundColor: recording ? '#5D89EA' : (embedded ? 'transparent' : CHAT_INPUT_BG),
                    borderWidth: embedded ? 0 : StyleSheet.hairlineWidth,
                    borderColor: recording ? 'transparent' : 'rgba(0,0,0,0.08)',
                    justifyContent: 'center',
                    alignItems: 'center',
                },
                pressed && !recording && {opacity: 0.8},
            ]}
        >
            {recording ? (
                <View style={{alignItems: 'center', justifyContent: 'center', flex: 1, width: '100%'}}>
                    <Text style={{color: 'rgba(255,255,255,0.8)', fontSize: 11, marginBottom: 4, textAlign: 'center'}}>
                        {releaseLabel}
                    </Text>
                    <WaveformBars recording={true} />
                </View>
            ) : (
                <Text style={{color: WECHAT_ICON_MUTED, fontSize: 15}}>{holdLabel}</Text>
            )}
        </Pressable>
    );
}

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
    sendVoiceAsr?: (voiceFiles: FileInfo[]) => Promise<void>;
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
            borderTopWidth: 0,
            paddingTop: 8,
            paddingBottom: Platform.select({ios: 6, android: 8}),
            minHeight: 56,
        },
        weChatInputRow: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 4,
            minHeight: 48,
        },
        /** 喇叭/键盘：在输入框白底容器外侧最左 */
        weChatLeftModeToggle: {
            paddingHorizontal: 4,
            paddingVertical: 6,
            marginRight: 2,
            justifyContent: 'center',
            alignItems: 'center',
            minWidth: 36,
            minHeight: 40,
        },
        weChatInputShell: {
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: CHAT_INPUT_BG,
            borderRadius: 6,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: 'rgba(0, 0, 0, 0.08)',
            marginHorizontal: 2,
            marginBottom: 2,
            minHeight: 40,
            overflow: 'hidden',
        },
        weChatInputInner: {
            flex: 1,
            minWidth: 0,
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
    sendVoiceAsr,
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

    const handleVoiceRecorded = useCallback((voiceFiles: FileInfo[]) => {
        sendVoiceAsr?.(voiceFiles);
    }, [sendVoiceAsr]);

    const handleVoiceError = useCallback((code: VoiceRecorderErrorCode) => {
        const ids: Record<VoiceRecorderErrorCode, string> = {
            permission_denied: intl.formatMessage({id: 'post_draft.voice.permission_denied', defaultMessage: 'Microphone permission denied'}),
            record_failed: intl.formatMessage({id: 'post_draft.voice.record_failed', defaultMessage: 'Failed to record voice'}),
            process_failed: intl.formatMessage({id: 'post_draft.voice.process_failed', defaultMessage: 'Failed to process recording'}),
            too_short: intl.formatMessage({id: 'post_draft.voice.too_short', defaultMessage: 'Recording too short'}),
        };
        showSnackBar({
            barType: SNACK_BAR_TYPE.CREATE_POST_ERROR,
            customMessage: ids[code],
            type: MESSAGE_TYPE.ERROR,
        });
    }, [intl]);

    const {state: voiceState, startRecording, stopRecordingAndSend, cancelRecording} = useVoiceRecorder(
        handleVoiceRecorded,
        handleVoiceError,
    );

    const hasVoiceRecording = Boolean(sendVoiceAsr);
    const [voiceMode, setVoiceMode] = useState(false);

    const stopVoiceIfRecording = useCallback(() => {
        if (voiceState === 'recording') {
            stopRecordingAndSend();
        }
    }, [voiceState, stopRecordingAndSend]);

    const cancelVoiceIfRecording = useCallback(() => {
        if (voiceState === 'recording') {
            cancelRecording();
        }
    }, [voiceState, cancelRecording]);

    useEffect(() => {
        if (voiceState !== 'recording') {
            return;
        }
        const event = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
        const sub: EmitterSubscription = Keyboard.addListener(event, stopVoiceIfRecording);
        return () => sub.remove();
    }, [voiceState, stopVoiceIfRecording]);

    useEffect(() => {
        if (voiceState !== 'recording') {
            return;
        }
        const MAX_RECORDING_MS = 60000;
        const t = setTimeout(stopVoiceIfRecording, MAX_RECORDING_MS);
        return () => clearTimeout(t);
    }, [voiceState, stopVoiceIfRecording]);

    const handleSendMessageWithVoiceCleanup = useCallback(async (schedulingInfoParam?: SchedulingInfo) => {
        cancelVoiceIfRecording();
        await handleSendMessage(schedulingInfoParam);
    }, [handleSendMessage, cancelVoiceIfRecording]);

    const switchToVoiceMode = usePreventDoubleTap(useCallback(() => {
        Keyboard.dismiss();
        setVoiceMode(true);
    }, []));

    const switchToTextMode = usePreventDoubleTap(useCallback(() => {
        stopVoiceIfRecording();
        setVoiceMode(false);
        setTimeout(() => inputRef.current?.focus(), 100);
    }, [stopVoiceIfRecording]));

    const handleHoldPressIn = useCallback(() => {
        startRecording();
    }, [startRecording]);

    const handleHoldPressOut = useCallback(() => {
        if (voiceState === 'recording') {
            stopRecordingAndSend();
        }
    }, [voiceState, stopRecordingAndSend]);

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
        <QuickActionsSheet
            testID={`${quickActionsTestID}.more_sheet`}
            addFiles={addFiles}
            canShowPostPriority={canShowPostPriority}
            fileCount={files.length}
            focus={focus}
            postPriority={postPriority}
            updatePostPriority={updatePostPriority}
            updateValue={updateValue}
            value={value}
            onDismiss={() => dismissBottomSheet()}
        />
    ), [addFiles, canShowPostPriority, files.length, focus, postPriority, quickActionsTestID, updatePostPriority, updateValue, value]);

    const openDraftMoreSheet = usePreventDoubleTap(useCallback(() => {
        Keyboard.dismiss();
        const QUICK_ACTIONS_SHEET_HEIGHT = 220;
        let sheetHeight = QUICK_ACTIONS_SHEET_HEIGHT;
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
                {hasVoiceRecording && (
                    <TouchableWithFeedback
                        borderlessRipple={true}
                        onPress={voiceMode ? switchToTextMode : switchToVoiceMode}
                        style={style.weChatLeftModeToggle}
                        type='opacity'
                        testID={voiceMode ? `${quickActionsTestID}.keyboard.button` : `${quickActionsTestID}.voice.button`}
                    >
                        <View style={{justifyContent: 'center', alignItems: 'center'}}>
                            {voiceMode ? (
                                <CompassIcon name='keyboard-outline' size={22} color={WECHAT_ICON_MUTED} />
                            ) : (
                                <CompassIcon name='volume-high' size={22} color={WECHAT_ICON_MUTED} />
                            )}
                        </View>
                    </TouchableWithFeedback>
                )}
                <View style={style.weChatInputShell}>
                    {voiceMode && hasVoiceRecording ? (
                        <HoldToSpeakButton
                            embedded={true}
                            recording={voiceState === 'recording'}
                            holdLabel={intl.formatMessage({id: 'post_draft.voice.hold_to_speak', defaultMessage: 'Hold to speak'})}
                            releaseLabel={intl.formatMessage({id: 'post_draft.voice.release_to_send', defaultMessage: 'Release to send, slide up to cancel'})}
                            onPressIn={handleHoldPressIn}
                            onPressOut={handleHoldPressOut}
                        />
                    ) : (
                        <View style={style.weChatInputInner}>
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
                                sendMessage={handleSendMessageWithVoiceCleanup}
                                inputRef={inputRef}
                                setIsFocused={setIsFocused}
                                onBlurExtra={stopVoiceIfRecording}
                            />
                        </View>
                    )}
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
                <SendAction
                    testID={sendActionTestID}
                    disabled={sendActionDisabled}
                    sendMessage={handleSendMessageWithVoiceCleanup}
                    showScheduledPostOptions={handleShowScheduledPostOptions}
                    scheduledPostEnabled={scheduledPostsEnabled}
                    weChatCompact={true}
                />
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
