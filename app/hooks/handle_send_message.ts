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
import {isReactionMatch} from '@utils/emoji/helpers';
import {getErrorMessage} from '@utils/errors';
import {scheduledPostFromPost} from '@utils/post';
import {canPostDraftInChannelOrThread} from '@utils/scheduled_post';
import {showSnackBar} from '@utils/snack_bar';

import type CustomEmojiModel from '@typings/database/models/servers/custom_emoji';

export type CreateResponse = {
    data?: boolean;
    error?: unknown;
    response?: Post | ScheduledPost;
}

type Props = {
    value: string;
    channelId: string;
    rootId: string;
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
        const postFiles = files.filter((f) => !f.failed);
        const post = {
            user_id: currentUserId,
            channel_id: channelId,
            root_id: rootId,
            message: value,
        } as Post;

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
                return;
            }

            createPost(serverUrl, post, postFiles);
            clearDraft();

            // Early return to avoid calling DeviceEventEmitter.emit
            return;
        } else {
            // Response error is handled at the post level so don't have to wait to clear draft
            createPost(serverUrl, post, postFiles);
            clearDraft();
        }

        setSendingMessage(false);
        DeviceEventEmitter.emit(Events.POST_LIST_SCROLL_TO_BOTTOM, Screens.CHANNEL);
        DeviceEventEmitter.emit(Events.POST_DRAFT_CLEAR_REPLY_ROOT);
    }, [files, currentUserId, channelId, rootId, value, postPriority, isFromDraftView, serverUrl, intl, canPost, channelIsArchived, channelIsReadOnly, deactivatedChannel, clearDraft]);

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

    const sendVoiceAsr = useCallback(async (voiceFiles: FileInfo[]) => {
        if (!voiceFiles.length) {
            return;
        }
        setSendingMessage(true);
        try {
            const uploadedFiles: FileInfo[] = [];
            for (const file of voiceFiles) {
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
            createPost(serverUrl, post, uploadedFiles);
            DeviceEventEmitter.emit(Events.POST_LIST_SCROLL_TO_BOTTOM, Screens.CHANNEL);
            DeviceEventEmitter.emit(Events.POST_DRAFT_CLEAR_REPLY_ROOT);
        } catch (err) {
            showSnackBar({
                barType: SNACK_BAR_TYPE.CREATE_POST_ERROR,
                customMessage: getErrorMessage(err),
                type: MESSAGE_TYPE.ERROR,
            });
        } finally {
            setSendingMessage(false);
        }
    }, [serverUrl, channelId, rootId, currentUserId]);

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
