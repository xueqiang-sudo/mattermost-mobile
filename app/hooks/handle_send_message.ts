// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useCallback, useEffect, useMemo, useState} from 'react';
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
import * as DraftUtils from '@utils/draft';
import {isDraftVideoLocalProcessingFile} from '@utils/file/draft_video_local_processing';
import {isReactionMatch} from '@utils/emoji/helpers';
import {getErrorMessage} from '@utils/errors';
import {scheduledPostFromPost} from '@utils/post';
import {canPostDraftInChannelOrThread} from '@utils/scheduled_post';
import {showSnackBar} from '@utils/snack_bar';

import type CustomEmojiModel from '@typings/database/models/servers/custom_emoji';
import { logDebug, logError } from '@utils/log';

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

    const canSend = useMemo(() => {
        if (sendingMessage) {
            return false;
        }

        const messageLength = value.trim().length;

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
        logDebug('[sendVoiceAsr] 开始上传语音文件');
        setSendingMessage(true);
        try {
            const uploadedFiles: FileInfo[] = [];
            for (const file of voiceFiles) {
                logDebug(`[sendVoiceAsr] 开始上传语音文件 ${file.clientId}, 大小 ${file.size}, 路径 ${file.localPath}`);
                const uploaded = await new Promise<FileInfo>((resolve, reject) => {
                    const {error, cancel} = uploadFile(
                        serverUrl,
                        file,
                        channelId,
                        () => {/* progress */},
                        (response) => {
                            if (response.code !== 201 || !response.data?.file_infos?.length) {
                                reject(new Error((response.data?.message as string) || 'Failed to upload voice'));
                                return;
                            }
                            const fi = response.data.file_infos[0] as FileInfo;
                            fi.clientId = file.clientId;
                            fi.localPath = file.localPath;
                            resolve(fi);
                        },
                        (err) => reject(new Error(err?.message || 'Upload failed')),
                    );
                    if (error) {
                        reject(error);
                    }
                });
                uploadedFiles.push(uploaded);
            }

            // Server should create a separate normal post with transcript; this post stays hidden in the list (see selectOrderedPosts).
            const post = {
                user_id: currentUserId,
                channel_id: channelId,
                root_id: rootId,
                message: '',
                type: PostTypes.CUSTOM_VOICE_ASR,
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

            logDebug('[[sendVoiceAsr] 开始创建帖子');
            await createPost(serverUrl, post, uploadedFiles);
            logDebug('[[sendVoiceAsr] 帖子创建完成');
            DeviceEventEmitter.emit(Events.POST_LIST_SCROLL_TO_BOTTOM, Screens.CHANNEL);
            DeviceEventEmitter.emit(Events.POST_DRAFT_CLEAR_REPLY_ROOT);
            DeviceEventEmitter.emit(Events.POST_DRAFT_CLEAR_QUOTED_POST);
        } catch (err) {
            logError('[[sendVoiceAsr] 创建帖子失败]', err);
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
    }, [serverUrl, channelId, rootId, currentUserId, postPriority, createPost, showSnackBar]);

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
