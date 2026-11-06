// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {DeviceEventEmitter} from 'react-native';

import {getChannelTimezones} from '@actions/remote/channel';
import {uploadFile} from '@actions/remote/file';
import {createPost} from '@actions/remote/post';
import {handleReactionToLatestPost} from '@actions/remote/reactions';
import {createScheduledPost} from '@actions/remote/scheduled_post';
import {Events, PostTypes, Screens} from '@constants';
import {NOTIFY_ALL_MEMBERS} from '@constants/post_draft';
import {MESSAGE_TYPE, SNACK_BAR_TYPE} from '@constants/snack_bar';
import {useServerUrl} from '@context/server';
import DraftUploadManager from '@managers/draft_upload_manager';
import NetworkManager from '@managers/network_manager';
import * as DraftUtils from '@utils/draft';
import {isDraftVideoLocalProcessingFile} from '@utils/file/draft_video_local_processing';
import {isReactionMatch} from '@utils/emoji/helpers';
import {getErrorMessage} from '@utils/errors';
import {scheduledPostFromPost} from '@utils/post';
import {canPostDraftInChannelOrThread} from '@utils/scheduled_post';
import {showSnackBar} from '@utils/snack_bar';
import type CustomEmojiModel from '@typings/database/models/servers/custom_emoji';
import { logError } from '@utils/log';

export type CreateResponse = {
    data?: boolean;
    error?: unknown;
    response?: Post | ScheduledPost;
}

type Props = {
    value: string;
    channelId: string;
    rootId: string;
    quotedPostId?: string;
    maxMessageLength: number;
    files: FileInfo[];
    customEmojis: CustomEmojiModel[];
    enableConfirmNotificationsToChannel?: boolean;
    useChannelMentions: boolean;
    membersCount: number;
    userIsOutOfOffice: boolean;
    currentUserId: string;
    channelType: ChannelType | undefined;
    postPriority: PostPriority;
    isFromDraftView?: boolean;
    clearDraft: () => void;
    canPost?: boolean;
    channelIsArchived?: boolean;
    channelIsReadOnly?: boolean;
    deactivatedChannel?: boolean;
}

export const useHandleSendMessage = ({
    value,
    channelId,
    rootId,
    quotedPostId = '',
    files,
    maxMessageLength,
    customEmojis,
    enableConfirmNotificationsToChannel,
    useChannelMentions,
    membersCount = 0,
    currentUserId,
    postPriority,
    isFromDraftView,
    canPost,
    channelIsArchived,
    channelIsReadOnly,
    deactivatedChannel,
    clearDraft,
}: Props) => {
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const [sendingMessage, setSendingMessage] = useState(false);
    const [channelTimezoneCount, setChannelTimezoneCount] = useState(0);

    /** 用 ref 追踪最新值，避免 IME 组合输入时 canSend 闭包中 value 过期 */
    const valueRef = useRef(value);
    valueRef.current = value;

    const canSend = useMemo(() => {
        if (sendingMessage) {
            return false;
        }

        const messageLength = valueRef.current.trim().length;

        if (messageLength > maxMessageLength) {
            return false;
        }

        if (files.length) {
            if (files.some((file) => isDraftVideoLocalProcessingFile(file))) {
                return false;
            }
            const loadingComplete = !files.some((file) => DraftUploadManager.isUploading(file.clientId!));
            return loadingComplete;
        }

        return messageLength > 0;
    }, [sendingMessage, value, files, maxMessageLength]);

    const handleReaction = useCallback((emoji: string, add: boolean) => {
        handleReactionToLatestPost(serverUrl, emoji, add, rootId);
        clearDraft();
        setSendingMessage(false);
    }, [serverUrl, rootId, clearDraft]);

    const doSubmitMessage = useCallback(async (schedulingInfo?: SchedulingInfo) => {
        if (files.some((f) => isDraftVideoLocalProcessingFile(f))) {
            setSendingMessage(false);
            return;
        }

        const postFiles = files.filter((f) => !f.failed);
        const post = {
            user_id: currentUserId,
            channel_id: channelId,
            root_id: rootId,
            message: value,
        } as Post;

        if (quotedPostId) {
            post.props = {
                ...(post.props || {}),
                quoted_post_id: quotedPostId,
            };
        }

        if (!rootId && (
            postPriority.priority ||
            postPriority.requested_ack ||
            postPriority.persistent_notifications)
        ) {
            post.metadata = {
                priority: postPriority,
            };
        }

        let response: CreateResponse;
        if (schedulingInfo) {
            response = await createScheduledPost(serverUrl, scheduledPostFromPost(post, schedulingInfo, postPriority, postFiles));
            if (response.error) {
                showSnackBar({
                    barType: SNACK_BAR_TYPE.SCHEDULED_POST_CREATION_ERROR,
                    customMessage: getErrorMessage(response.error),
                    type: MESSAGE_TYPE.ERROR,
                });
            } else {
                clearDraft();
            }
        } else if (isFromDraftView) {
            const shouldClearDraft = await canPostDraftInChannelOrThread({
                serverUrl,
                rootId,
                intl,
                canPost,
                channelIsArchived,
                channelIsReadOnly,
                deactivatedChannel,
            });

            if (!shouldClearDraft) {
                setSendingMessage(false);
                return;
            }

            const draftViewPostPromise = createPost(serverUrl, post, postFiles);
            clearDraft();
            await draftViewPostPromise;

            // Early return to avoid calling DeviceEventEmitter.emit
            setSendingMessage(false);
            return;
        } else {
            // Optimistic clear: same UX as before; await keeps sendingMessage true until request settles
            const postPromise = createPost(serverUrl, post, postFiles);
            clearDraft();
            await postPromise;
        }

        setSendingMessage(false);
        DeviceEventEmitter.emit(Events.POST_LIST_SCROLL_TO_BOTTOM, Screens.CHANNEL);
        DeviceEventEmitter.emit(Events.POST_DRAFT_CLEAR_REPLY_ROOT);
        DeviceEventEmitter.emit(Events.POST_DRAFT_CLEAR_QUOTED_POST);
    }, [files, currentUserId, channelId, rootId, quotedPostId, value, postPriority, isFromDraftView, serverUrl, intl, canPost, channelIsArchived, channelIsReadOnly, deactivatedChannel, clearDraft]);

    const showSendToAllOrChannelOrHereAlert = useCallback((calculatedMembersCount: number, atHere: boolean, schedulingInfo?: SchedulingInfo) => {
        const notifyAllMessage = DraftUtils.buildChannelWideMentionMessage(intl, calculatedMembersCount, channelTimezoneCount, atHere);
        const cancel = () => {
            setSendingMessage(false);
        };

        // Creating a wrapper function to pass the schedulingInfo to the doSubmitMessage function as the accepted
        // function signature causes conflict.
        // TODO for later - change alert message if this is a scheduled post
        const doSubmitMessageScheduledPostWrapper = () => doSubmitMessage(schedulingInfo);
        DraftUtils.alertChannelWideMention(intl, notifyAllMessage, doSubmitMessageScheduledPostWrapper, cancel);
    }, [intl, channelTimezoneCount, doSubmitMessage]);

    const sendMessage = useCallback(async (schedulingInfo?: SchedulingInfo) => {
        const notificationsToChannel = enableConfirmNotificationsToChannel && useChannelMentions;
        const toAllOrChannel = DraftUtils.textContainsAtAllAtChannel(value);
        const toHere = DraftUtils.textContainsAtHere(value);

        if (notificationsToChannel && membersCount > NOTIFY_ALL_MEMBERS && (toAllOrChannel || toHere)) {
            showSendToAllOrChannelOrHereAlert(membersCount, toHere && !toAllOrChannel, schedulingInfo);
        } else {
            return doSubmitMessage(schedulingInfo);
        }

        return Promise.resolve();
    }, [enableConfirmNotificationsToChannel, useChannelMentions, value, membersCount, showSendToAllOrChannelOrHereAlert, doSubmitMessage]);

    const handleSendMessage = useCallback(async (schedulingInfo?: SchedulingInfo) => {
        if (!canSend) {
            return Promise.resolve();
        }

        if (files.some((f) => isDraftVideoLocalProcessingFile(f))) {
            return Promise.resolve();
        }

        setSendingMessage(true);

        const match = isReactionMatch(value, customEmojis);
        if (match && !files.length) {
            handleReaction(match.emoji, match.add);
            return Promise.resolve();
        }

        const hasFailedAttachments = files.some((f) => f.failed);
        if (hasFailedAttachments) {
            const cancel = () => {
                setSendingMessage(false);
            };
            const accept = () => {
                // Files are filtered on doSubmitMessage
                sendMessage(schedulingInfo);
            };

            DraftUtils.alertAttachmentFail(intl, accept, cancel);
        } else {
            return sendMessage(schedulingInfo);
        }

        return Promise.resolve();
    }, [canSend, value, customEmojis, files, handleReaction, intl, sendMessage]);

    const sendVoiceAsr = useCallback(async (voiceFiles: FileInfo[], onError?: (message: string) => void) => {
        if (!voiceFiles.length) {
            return;
        }

        setSendingMessage(true);
        try {
            // 【关键修复】先转写语音为文本，然后只发送文本（不发送音频文件）
            const file = voiceFiles[0];

            if (!file.localPath) {
                throw new Error('No local path for voice file');
            }

            // 步骤 1: 调用转写 API
            const VOICE_PLUGIN_BASE = '/plugins/com.superera.voice-recognition';
            const endpoint = VOICE_PLUGIN_BASE + '/api/v1/transcribe';

            const client = NetworkManager.getClient(serverUrl);

            // 准备文件名和类型
            let fileName = file.name || 'voice.aac';
            const extension = fileName.split('.').pop()?.toLowerCase();
            if (!extension || !['mp3', 'wav', 'amr', 'aac', 'm4a', 'ogg'].includes(extension)) {
                const mimeToExt: Record<string, string> = {
                    'audio/mpeg': 'mp3',
                    'audio/wav': 'wav',
                    'audio/x-wav': 'wav',
                    'audio/amr': 'amr',
                    'audio/aac': 'aac',
                    'audio/mp4': 'm4a',
                    'audio/x-m4a': 'm4a',
                    'audio/ogg': 'ogg',
                };
                const correctExt = mimeToExt[file.mime_type || ''] || 'aac';
                fileName = `voice.${correctExt}`;
            }

            const formData = new FormData();
            formData.append('audio', {
                uri: file.localPath,
                name: fileName,
                type: file.mime_type || 'audio/aac',
            } as any);

            const transcribeResp = await client.doFetch(endpoint, {
                method: 'post',
                body: formData,
            });

            const transcribedText = transcribeResp?.data?.text || transcribeResp?.text || '';

            if (!transcribedText || !transcribedText.trim()) {
                throw new Error('语音转写结果为空');
            }

            // 步骤 2: 发送转写文本作为普通消息（不发送音频文件）
            const post = {
                user_id: currentUserId,
                channel_id: channelId,
                root_id: rootId,
                message: transcribedText.trim(),
                // 不使用 CUSTOM_VOICE_ASR 类型，不添加 file_ids
            } as Post;

            // 添加优先级信息
            if (!rootId && (
                postPriority.priority ||
                postPriority.requested_ack ||
                postPriority.persistent_notifications)
            ) {
                post.metadata = {
                    priority: postPriority,
                };
            }

            const createResult = await createPost(serverUrl, post, []);

            if (createResult.error) {
                throw createResult.error;
            }

            // 步骤 3: 发送事件
            DeviceEventEmitter.emit(Events.POST_LIST_SCROLL_TO_BOTTOM, Screens.CHANNEL);
            DeviceEventEmitter.emit(Events.POST_DRAFT_CLEAR_REPLY_ROOT);
            DeviceEventEmitter.emit(Events.POST_DRAFT_CLEAR_QUOTED_POST);

        } catch (err) {
            logError('[sendVoiceAsr] 流程失败', err);
            const errorMessage = getErrorMessage(err);
            if (onError) {
                onError(errorMessage as string);
            } else {
                showSnackBar({
                    barType: SNACK_BAR_TYPE.CREATE_POST_ERROR,
                    customMessage: errorMessage as string,
                    type: MESSAGE_TYPE.ERROR,
                });
            }
        } finally {
            setSendingMessage(false);
        }
    }, [serverUrl, channelId, rootId, currentUserId, postPriority]);

    useEffect(() => {
        getChannelTimezones(serverUrl, channelId).then(({channelTimezones}) => {
            setChannelTimezoneCount(channelTimezones?.length || 0);
        });
    }, [serverUrl, channelId]);

    return {
        handleSendMessage,
        canSend,
        sendVoiceAsr,
    };
};
