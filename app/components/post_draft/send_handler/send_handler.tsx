// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';

import {updateDraftPriority} from '@actions/local/draft';
import SendDraft from '@components/draft_scheduled_post/draft_scheduled_post_actions/send_draft';
import DraftInput from '@components/post_draft/draft_input/';
import {PostPriorityType} from '@constants/post';
import {useServerUrl} from '@context/server';
import {useHandleSendMessage} from '@hooks/handle_send_message';

import type {DraftType} from '@constants/draft';
import type CustomEmojiModel from '@typings/database/models/servers/custom_emoji';
import type {AvailableScreens} from '@typings/screens/navigation';

type Props = {
    testID?: string;
    channelId: string;
    channelType?: ChannelType;
    channelName?: string;
    rootId: string;
    quotedPostId?: string;
    canShowPostPriority?: boolean;
    useChatInputStyle?: boolean;
    setIsFocused: (isFocused: boolean) => void;

    // From database
    currentUserId: string;
    cursorPosition: number;
    enableConfirmNotificationsToChannel?: boolean;
    maxMessageLength: number;
    membersCount?: number;
    useChannelMentions: boolean;
    userIsOutOfOffice: boolean;
    customEmojis: CustomEmojiModel[];
    customEmojisEnabled: boolean;
    recentEmojis: string[];
    skinTone: string;

    // DRAFT Handler
    value: string;
    files: FileInfo[];
    clearDraft: () => void;
    updateValue: React.Dispatch<React.SetStateAction<string>>;
    updateCursorPosition: React.Dispatch<React.SetStateAction<number>>;
    updatePostInputTop: (top: number) => void;
    addFiles: (file: FileInfo[]) => void;

    /** Immediate image-only post (local sticker); does not modify draft. */
    sendStandaloneStickerImage: (file: FileInfo) => Promise<void>;
    uploadFileError: React.ReactNode;
    persistentNotificationInterval: number;
    persistentNotificationMaxRecipients: number;
    postPriority: PostPriority;

    draftType?: DraftType;
    postId?: string;
    bottomSheetId?: AvailableScreens;
    channelDisplayName?: string;
    isFromDraftView?: boolean;
    draftReceiverUserName?: string;
}

export const INITIAL_PRIORITY = {
    priority: PostPriorityType.STANDARD,
    requested_ack: false,
    persistent_notifications: false,
};

export default function SendHandler({
    testID,
    channelId,
    channelType,
    channelName,
    channelDisplayName,
    currentUserId,
    enableConfirmNotificationsToChannel,
    files,
    maxMessageLength,
    membersCount = 0,
    cursorPosition,
    rootId,
    quotedPostId = '',
    canShowPostPriority,
    useChatInputStyle,
    useChannelMentions,
    userIsOutOfOffice,
    customEmojis,
    customEmojisEnabled,
    recentEmojis,
    skinTone,
    value,
    clearDraft,
    updateValue,
    addFiles,
    sendStandaloneStickerImage,
    uploadFileError,
    updateCursorPosition,
    updatePostInputTop,
    setIsFocused,
    persistentNotificationInterval,
    persistentNotificationMaxRecipients,
    postPriority,
    bottomSheetId,
    draftReceiverUserName,
    isFromDraftView,
    draftType,
    postId,
}: Props) {
    const serverUrl = useServerUrl();

    const handlePostPriority = useCallback((priority: PostPriority) => {
        updateDraftPriority(serverUrl, channelId, rootId, priority);
    }, [serverUrl, channelId, rootId]);

    const {handleSendMessage, canSend, sendVoiceAsr} = useHandleSendMessage({
        value,
        channelId,
        rootId,
        quotedPostId,
        files,
        maxMessageLength,
        customEmojis,
        enableConfirmNotificationsToChannel,
        useChannelMentions,
        membersCount,
        userIsOutOfOffice,
        currentUserId,
        channelType,
        postPriority,
        clearDraft,
    });

    if (isFromDraftView) {
        return (
            <SendDraft
                channelId={channelId}
                rootId={rootId}
                quotedPostId={quotedPostId}
                channelType={channelType}
                currentUserId={currentUserId}
                channelName={channelName}
                channelDisplayName={channelDisplayName}
                enableConfirmNotificationsToChannel={enableConfirmNotificationsToChannel}
                maxMessageLength={maxMessageLength}
                membersCount={membersCount}
                useChannelMentions={useChannelMentions}
                userIsOutOfOffice={userIsOutOfOffice}
                customEmojis={customEmojis}
                bottomSheetId={bottomSheetId}
                value={value}
                files={files}
                postPriority={postPriority}
                persistentNotificationInterval={persistentNotificationInterval}
                persistentNotificationMaxRecipients={persistentNotificationMaxRecipients}
                draftReceiverUserName={draftReceiverUserName}
                draftType={draftType}
                postId={postId}
            />
        );
    }

    return (
        <DraftInput
            testID={testID}
            channelId={channelId}
            channelType={channelType}
            channelName={channelName}
            currentUserId={currentUserId}
            rootId={rootId}
            canShowPostPriority={canShowPostPriority}
            useChatInputStyle={useChatInputStyle}
            cursorPosition={cursorPosition}
            updateCursorPosition={updateCursorPosition}
            value={value}
            files={files}
            updateValue={updateValue}
            addFiles={addFiles}
            sendStandaloneStickerImage={sendStandaloneStickerImage}
            uploadFileError={uploadFileError}
            sendMessage={handleSendMessage}
            sendVoiceAsr={sendVoiceAsr}
            canSend={canSend}
            maxMessageLength={maxMessageLength}
            updatePostInputTop={updatePostInputTop}
            postPriority={postPriority}
            updatePostPriority={handlePostPriority}
            persistentNotificationInterval={persistentNotificationInterval}
            persistentNotificationMaxRecipients={persistentNotificationMaxRecipients}
            setIsFocused={setIsFocused}
            customEmojis={customEmojis}
            customEmojisEnabled={customEmojisEnabled}
            recentEmojis={recentEmojis}
            skinTone={skinTone}
        />
    );
}
