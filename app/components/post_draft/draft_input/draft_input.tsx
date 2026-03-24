// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {AppState, Keyboard, type LayoutChangeEvent, type EmitterSubscription, Modal, PanResponder, Platform, ScrollView, StyleSheet, Text, View} from 'react-native';
import Animated, {cancelAnimation, Easing, type SharedValue, useAnimatedStyle, useSharedValue, withRepeat, withTiming} from 'react-native-reanimated';
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
import {emojiShortNameToMarkdownToken, emojiShortNameToUnicodeString} from '@utils/emoji/helpers';
import {
    changeOpacity,
    getChatBubbleBackground,
    getChatBubbleBorderColor,
    getChatListBackdropColor,
    makeStyleSheetFromTheme,
} from '@utils/theme';
import {showSnackBar} from '@utils/snack_bar';
import {MESSAGE_TYPE, SNACK_BAR_TYPE} from '@constants/snack_bar';

import DraftEmojiPanel from '../draft_emoji_panel';
import PostInput from '../post_input';
import QuickActions, {QuickActionsSheet} from '../quick_actions';
import SendAction from '../send_button';
import Typing from '../typing';
import Uploads from '../uploads';

import Header from './header';

import type {PasteInputRef} from '@mattermost/react-native-paste-input';
import type CustomEmojiModel from '@typings/database/models/servers/custom_emoji';

// 微信风格：圆角与边距（输入区/底栏背景随 theme，见 getStyleSheet）
const CHAT_INPUT_BORDER_RADIUS = 8;
const CHAT_INPUT_MARGIN_H = 10;
const CHAT_INPUT_MARGIN_B = 6;

const CLOSE_DRAFT_MORE = 'close-draft-more-actions';

/** 手指上移超过此阈值（px）进入「取消发送」预览态 */
const VOICE_CANCEL_THRESHOLD_PX = 80;

/** 波形条最大高度，须 ≤ WAVE_STRIP_HEIGHT，避免撑开行高导致上方提示文字随 flex 居中上下抖 */
const WAVE_STRIP_HEIGHT = 28;

const voiceHudStyles = StyleSheet.create({
    overlayRoot: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'transparent',
    },
    card: {
        width: 236,
        minHeight: 176,
        borderRadius: 16,
        backgroundColor: 'rgba(0,0,0,0.72)',
        paddingVertical: 18,
        paddingHorizontal: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    meterRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'center',
        height: 40,
        marginTop: 12,
        gap: 4,
    },
    hudCaption: {
        color: 'rgba(255,255,255,0.95)',
        fontSize: 13,
        marginTop: 12,
        textAlign: 'center',
        lineHeight: 18,
    },
    cancelPill: {
        backgroundColor: '#E64340',
        borderRadius: 8,
        paddingHorizontal: 14,
        paddingVertical: 10,
        marginTop: 12,
        alignSelf: 'stretch',
        minWidth: 0,
    },
    cancelPillText: {
        color: '#FFFFFF',
        fontSize: 12,
        lineHeight: 17,
        textAlign: 'center',
    },
});

type VoiceRecordingHudProps = {
    inCancelZone: boolean;
    slideToCancelHint: string;
    releaseToCancelHint: string;
};

const HUD_SMOOTH_WAVE_COUNT = 8;

/** 中央 HUD 与底部按住条共用：单一相位正弦波，整排连续流动（周期一致） */
const VOICE_WAVE_LOOP_MS = 1400;

function SmoothWaveBar({
    index,
    phase,
    width,
    maxHeightPx,
    color,
}: {
    index: number;
    phase: SharedValue<number>;
    width: number;
    maxHeightPx: number;
    color: string;
}) {
    const barStyle = useAnimatedStyle(() => {
        const p = phase.value;
        const w = Math.sin(p * Math.PI * 2 + index * 0.72);
        const n = (w + 1) / 2;
        const h = 5 + n * maxHeightPx;
        return {
            width,
            height: h,
            backgroundColor: color,
            borderRadius: 2,
        };
    }, [color, index, maxHeightPx, phase, width]);
    return <Animated.View style={barStyle}/>;
}

function SmoothWaveformStrip({
    barWidth,
    maxBarHeightPx,
    gap,
    barColor,
}: {
    barWidth: number;
    maxBarHeightPx: number;
    gap: number;
    barColor: string;
}) {
    const phase = useSharedValue(0);
    useEffect(() => {
        phase.value = 0;
        phase.value = withRepeat(
            withTiming(1, {duration: VOICE_WAVE_LOOP_MS, easing: Easing.linear}),
            -1,
            false,
        );
        return () => {
            cancelAnimation(phase);
        };
    }, [phase]);
    return (
        <View
            style={{
                height: WAVE_STRIP_HEIGHT,
                flexDirection: 'row',
                alignItems: 'flex-end',
                justifyContent: 'center',
                gap,
            }}
        >
            {Array.from({length: HUD_SMOOTH_WAVE_COUNT}, (_, i) => (
                <SmoothWaveBar
                    key={i}
                    color={barColor}
                    index={i}
                    maxHeightPx={maxBarHeightPx}
                    phase={phase}
                    width={barWidth}
                />
            ))}
        </View>
    );
}

/** 微信式中央 HUD：Modal 根层 pointerEvents=none 不挡底部按住条 */
function VoiceRecordingHud({inCancelZone, slideToCancelHint, releaseToCancelHint}: VoiceRecordingHudProps) {
    return (
        <Modal
            visible={true}
            transparent={true}
            animationType={'fade'}
            statusBarTranslucent={true}
        >
            <View
                style={voiceHudStyles.overlayRoot}
                pointerEvents={'none'}
            >
                <View style={voiceHudStyles.card}>
                    {!inCancelZone ? (
                        <>
                            <CompassIcon
                                name={'microphone'}
                                size={40}
                                color={'#FFFFFF'}
                            />
                            <View style={voiceHudStyles.meterRow}>
                                <SmoothWaveformStrip
                                    barColor={'rgba(255,255,255,0.92)'}
                                    barWidth={5}
                                    gap={4}
                                    maxBarHeightPx={28}
                                />
                            </View>
                            <Text style={voiceHudStyles.hudCaption}>{slideToCancelHint}</Text>
                        </>
                    ) : (
                        <>
                            <CompassIcon
                                name={'reply-outline'}
                                size={44}
                                color={'#FFFFFF'}
                            />
                            <View style={voiceHudStyles.meterRow}>
                                <SmoothWaveformStrip
                                    barColor={'rgba(255,255,255,0.85)'}
                                    barWidth={5}
                                    gap={4}
                                    maxBarHeightPx={28}
                                />
                            </View>
                            <View style={voiceHudStyles.cancelPill}>
                                <Text style={voiceHudStyles.cancelPillText}>{releaseToCancelHint}</Text>
                            </View>
                        </>
                    )}
                </View>
            </View>
        </Modal>
    );
}

type HoldToSpeakButtonProps = {
    recording: boolean;
    holdLabel: string;
    recordingBarHint: string;
    cancelBarHint: string;
    onGestureStart: () => void;
    onGestureEnd: (shouldCancel: boolean) => void;
    onCancelZoneChange: (inCancel: boolean) => void;
    embedded?: boolean;
};

/** 千问风格：PanResponder 跟踪上移，松手时取消或发送；embedded 时贴在外壳内 */
function HoldToSpeakButton({
    recording,
    holdLabel,
    recordingBarHint,
    cancelBarHint,
    onGestureStart,
    onGestureEnd,
    onCancelZoneChange,
    embedded,
}: HoldToSpeakButtonProps) {
    const theme = useTheme();
    const idleShellBg = embedded ? 'transparent' : getChatBubbleBackground(theme, 'others');
    const idleBorderColor = getChatBubbleBorderColor(theme);
    const holdLabelColor = changeOpacity(theme.centerChannelColor, 0.52);

    const [isHolding, setIsHolding] = useState(false);
    const [inCancelZone, setInCancelZone] = useState(false);
    const inCancelZoneRef = useRef(false);
    const handlersRef = useRef({onGestureStart, onGestureEnd, onCancelZoneChange});
    useEffect(() => {
        handlersRef.current = {onGestureStart, onGestureEnd, onCancelZoneChange};
    }, [onGestureStart, onGestureEnd, onCancelZoneChange]);

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onStartShouldSetPanResponderCapture: () => true,
            onMoveShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponderCapture: () => true,
            onPanResponderTerminationRequest: () => false,
            onPanResponderGrant: () => {
                inCancelZoneRef.current = false;
                setInCancelZone(false);
                handlersRef.current.onCancelZoneChange(false);
                setIsHolding(true);
                handlersRef.current.onGestureStart();
            },
            onPanResponderMove: (_, gestureState) => {
                const cancel = gestureState.dy < -VOICE_CANCEL_THRESHOLD_PX;
                if (cancel !== inCancelZoneRef.current) {
                    inCancelZoneRef.current = cancel;
                    setInCancelZone(cancel);
                    handlersRef.current.onCancelZoneChange(cancel);
                }
            },
            onPanResponderRelease: () => {
                const shouldCancel = inCancelZoneRef.current;
                inCancelZoneRef.current = false;
                setInCancelZone(false);
                setIsHolding(false);
                handlersRef.current.onCancelZoneChange(false);
                handlersRef.current.onGestureEnd(shouldCancel);
            },
            onPanResponderTerminate: () => {
                const shouldCancel = inCancelZoneRef.current;
                inCancelZoneRef.current = false;
                setInCancelZone(false);
                setIsHolding(false);
                handlersRef.current.onCancelZoneChange(false);
                handlersRef.current.onGestureEnd(shouldCancel);
            },
        }),
    ).current;

    const showRecordUi = isHolding || recording;
    const barBg = !showRecordUi
        ? idleShellBg
        : inCancelZone
            ? '#8A8A8A'
            : '#5D89EA';

    return (
        <View
            style={{flex: 1, minHeight: 40}}
            collapsable={false}
            {...panResponder.panHandlers}
        >
            <View
                style={{
                    flex: 1,
                    minHeight: 40,
                    borderRadius: embedded ? 0 : 6,
                    backgroundColor: barBg,
                    borderWidth: embedded ? 0 : StyleSheet.hairlineWidth,
                    borderColor: showRecordUi ? 'transparent' : idleBorderColor,
                    justifyContent: 'center',
                    alignItems: 'center',
                }}
            >
                {showRecordUi ? (
                    <View style={{alignItems: 'center', justifyContent: 'center', flex: 1, width: '100%'}}>
                        <Text
                            numberOfLines={2}
                            adjustsFontSizeToFit={Platform.OS === 'ios'}
                            minimumFontScale={0.85}
                            style={{
                                color: inCancelZone ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.88)',
                                fontSize: inCancelZone ? 10 : 11,
                                lineHeight: inCancelZone ? 14 : 14,
                                marginBottom: 4,
                                textAlign: 'center',
                                paddingHorizontal: 6,
                                width: '100%',
                            }}
                        >
                            {inCancelZone ? cancelBarHint : recordingBarHint}
                        </Text>
                        <SmoothWaveformStrip
                            barColor={inCancelZone ? 'rgba(255,255,255,0.82)' : '#FFFFFF'}
                            barWidth={3}
                            gap={3}
                            maxBarHeightPx={Math.max(4, WAVE_STRIP_HEIGHT - 6)}
                        />
                    </View>
                ) : (
                    <Text style={{color: holdLabelColor, fontSize: 15}}>{holdLabel}</Text>
                )}
            </View>
        </View>
    );
}

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
    sendStandaloneStickerImage: (file: FileInfo) => Promise<void>;
    updatePostInputTop: (top: number) => void;
    setIsFocused: (isFocused: boolean) => void;
    scheduledPostsEnabled: boolean;

    /** Inline emoji panel (WeChat-style footer) */
    customEmojis?: CustomEmojiModel[];
    customEmojisEnabled?: boolean;
    recentEmojis?: string[];
    skinTone?: string;
}

const SAFE_AREA_VIEW_EDGES: Edge[] = ['left', 'right'];

const SCHEDULED_POST_PICKER_BUTTON = 'close-scheduled-post-picker';

const getStyleSheet = makeStyleSheetFromTheme((theme) => {
    /** 与消息列表 strip 一致，避免切换深/浅色主题后底栏仍停留在浅灰 */
    const footerBarBg = getChatListBackdropColor(theme);
    const inputShellBg = getChatBubbleBackground(theme, 'others');
    const shellBorder = getChatBubbleBorderColor(theme);

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
            backgroundColor: inputShellBg,
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
            alignItems: 'stretch',
            backgroundColor: footerBarBg,
            borderTopWidth: 0,
            flexDirection: 'column',
            minHeight: 56,
            paddingBottom: Platform.select({ios: 6, android: 8}),
            paddingTop: 8,
            width: '100%',
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
            backgroundColor: inputShellBg,
            borderRadius: 6,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: shellBorder,
            marginHorizontal: 2,
            marginBottom: 2,
            minHeight: 40,
            overflow: 'hidden',
        },
        weChatInputInner: {
            flex: 1,
            minWidth: 0,

            /** 与 weChatInputRow 同高，让内层 TextInput 可撑满白底以便垂直对齐 */
            alignSelf: 'stretch',
        },
        weChatSideIconHit: {
            padding: 6,
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
    sendStandaloneStickerImage,
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
    customEmojis = [],
    customEmojisEnabled = false,
    recentEmojis = [],
    skinTone = 'default',
}: Props) {
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const theme = useTheme();
    const isTablet = useIsTablet();

    const handleLayout = useCallback((e: LayoutChangeEvent) => {
        updatePostInputTop(e.nativeEvent.layout.height);
    }, []);

    const inputRef = useRef<PasteInputRef>();
    const [emojiPanelOpen, setEmojiPanelOpen] = useState(false);
    const focus = useCallback(() => {
        inputRef.current?.focus();
    }, []);

    // Render
    const postInputTestID = `${testID}.post.input`;
    const quickActionsTestID = `${testID}.quick_actions`;
    const sendActionTestID = `${testID}.send_action`;
    const style = getStyleSheet(theme);
    const weChatFooterIconColor = changeOpacity(theme.centerChannelColor, 0.52);

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

    /** 手指仍按住；权限弹窗期间松手会置 false，避免权限通过后仍进入录音导致 HUD/波形无法关闭 */
    const voiceFingerDownRef = useRef(false);

    const {state: voiceState, startRecording, stopRecordingAndSend, cancelRecording} = useVoiceRecorder(
        handleVoiceRecorded,
        handleVoiceError,
        {
            shouldProceedAfterPermission: () => voiceFingerDownRef.current,
        },
    );

    const hasVoiceRecording = Boolean(sendVoiceAsr);
    const [voiceMode, setVoiceMode] = useState(false);
    const [voiceCancelZone, setVoiceCancelZone] = useState(false);
    /** 手指按下即 true，用于在 native 录音尚未进入 recording 时仍显示中央 HUD */
    const [voicePressActive, setVoicePressActive] = useState(false);

    useEffect(() => {
        if (voiceState !== 'recording') {
            setVoiceCancelZone(false);
        }
    }, [voiceState]);

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

    useEffect(() => {
        if (voiceMode) {
            setEmojiPanelOpen(false);
        }
    }, [voiceMode]);

    useEffect(() => {
        if (!voiceMode) {
            setVoicePressActive(false);
        }
    }, [voiceMode]);

    const wrappedSetIsFocused = useCallback((focused: boolean) => {
        if (focused) {
            setEmojiPanelOpen(false);
        }
        setIsFocused(focused);
    }, [setIsFocused]);

    const customEmojiNames = useMemo(() => customEmojis.map((e) => e.name), [customEmojis]);

    const handleDraftEmojiPick = useCallback((shortName: string) => {
        const unicode = emojiShortNameToUnicodeString(shortName, skinTone, customEmojiNames);
        const token = unicode ?? emojiShortNameToMarkdownToken(shortName);
        if (!token) {
            return;
        }
        updateValue((v) => v + token);
        updateCursorPosition((cp) => cp + [...token].length);
    }, [customEmojiNames, skinTone, updateValue, updateCursorPosition]);

    const onEmojiToolbarPress = usePreventDoubleTap(useCallback(() => {
        if (emojiPanelOpen) {
            setEmojiPanelOpen(false);
            setTimeout(() => inputRef.current?.focus(), 50);
            return;
        }
        if (voiceMode && hasVoiceRecording) {
            switchToTextMode();
            setTimeout(() => {
                Keyboard.dismiss();
                setEmojiPanelOpen(true);
            }, 120);
            return;
        }
        Keyboard.dismiss();
        setEmojiPanelOpen(true);
    }, [emojiPanelOpen, voiceMode, hasVoiceRecording, switchToTextMode]));

    const handleVoiceGestureStart = useCallback(() => {
        voiceFingerDownRef.current = true;
        setVoicePressActive(true);
        startRecording();
    }, [startRecording]);

    const handleVoiceGestureEnd = useCallback((shouldCancel: boolean) => {
        voiceFingerDownRef.current = false;
        setVoicePressActive(false);
        if (shouldCancel) {
            cancelRecording();
            return;
        }
        stopRecordingAndSend();
    }, [cancelRecording, stopRecordingAndSend]);

    useEffect(() => {
        const sub = AppState.addEventListener('change', (nextAppState) => {
            if (nextAppState === 'background') {
                setVoicePressActive(false);
                cancelRecording();
            }
        });
        return () => sub.remove();
    }, [cancelRecording]);

    useEffect(() => {
        return () => {
            setVoicePressActive(false);
            cancelRecording();
        };
    }, [cancelRecording]);

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

    const voiceRecordingBarHint = intl.formatMessage({
        id: 'post_draft.voice.recording_bar_hint',
        defaultMessage: 'Release to send — slide up to cancel',
    });
    const voiceCancelBarHint = intl.formatMessage({
        id: 'post_draft.voice.cancel_bar_hint',
        defaultMessage: 'Release to cancel sending',
    });
    const voiceHudSlideHint = intl.formatMessage({
        id: 'post_draft.voice.hud_slide_to_cancel',
        defaultMessage: 'Slide up to cancel',
    });
    const voiceHudReleaseCancelHint = intl.formatMessage({
        id: 'post_draft.voice.hud_release_to_cancel',
        defaultMessage: 'Release to cancel sending',
    });

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
                    setIsFocused={wrappedSetIsFocused}
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
                                <CompassIcon name='keyboard-outline' size={22} color={weChatFooterIconColor} />
                            ) : (
                                <CompassIcon name='volume-high' size={22} color={weChatFooterIconColor} />
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
                            recordingBarHint={voiceRecordingBarHint}
                            cancelBarHint={voiceCancelBarHint}
                            onGestureStart={handleVoiceGestureStart}
                            onGestureEnd={handleVoiceGestureEnd}
                            onCancelZoneChange={setVoiceCancelZone}
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
                                setIsFocused={wrappedSetIsFocused}
                                onBlurExtra={stopVoiceIfRecording}
                                weChatCompactRow={true}
                            />
                        </View>
                    )}
                </View>
                <TouchableWithFeedback
                    borderlessRipple={true}
                    hitSlop={sideHitSlop}
                    onPress={onEmojiToolbarPress}
                    rippleRadius={20}
                    type='opacity'
                >
                    <View style={style.weChatSideIconHit}>
                        <CompassIcon
                            color={weChatFooterIconColor}
                            name={emojiPanelOpen ? 'keyboard-outline' : 'emoticon-happy-outline'}
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
                            color={weChatFooterIconColor}
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
            {emojiPanelOpen && (
                <DraftEmojiPanel
                    onPick={handleDraftEmojiPick}
                    recentEmojis={recentEmojis}
                    skinTone={skinTone}
                    testID={`${testID}.draft_emoji_panel`}
                />
            )}
        </SafeAreaView>
    );

    const showVoiceRecordingHud = Boolean(
        weChatPhoneFooter && voiceMode && hasVoiceRecording && (voiceState === 'recording' || voicePressActive),
    );

    return (
        <>
            {showVoiceRecordingHud && (
                <VoiceRecordingHud
                    inCancelZone={voiceCancelZone}
                    slideToCancelHint={voiceHudSlideHint}
                    releaseToCancelHint={voiceHudReleaseCancelHint}
                />
            )}
            <Typing
                channelId={channelId}
                channelType={channelType}
                rootId={rootId}
            />
            {weChatPhoneFooter ? weChatPhoneFooterEl : classicFooter}
        </>
    );
}

export default DraftInput;
