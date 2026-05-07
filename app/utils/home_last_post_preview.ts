// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {defineMessages, type IntlShape} from 'react-intl';

import {General, Post} from '@constants';

const changeChannelPrivacyPreview = defineMessages({
    toPrivate: {
        id: 'mobile.system_message.change_channel_privacy.to_private',
        defaultMessage: 'This group chat is now invite-only. Only invited members can view it.',
    },
    toPublic: {
        id: 'mobile.system_message.change_channel_privacy.to_public',
        defaultMessage: 'This group chat is now public. Team members can join.',
    },
});

const mediaPreviewMessages = defineMessages({
    photo: {
        id: 'home.last_post_preview.photo',
        defaultMessage: '[Photo]',
    },
    photos: {
        id: 'home.last_post_preview.photos',
        defaultMessage: '[{count} photos]',
    },
    video: {
        id: 'home.last_post_preview.video',
        defaultMessage: '[Video]',
    },
    videos: {
        id: 'home.last_post_preview.videos',
        defaultMessage: '[{count} videos]',
    },
    file: {
        id: 'home.last_post_preview.file',
        defaultMessage: '[File: {fileName}]',
    },
    files: {
        id: 'home.last_post_preview.files',
        defaultMessage: '[File: {fileName}, {count} total]',
    },
    photoWithText: {
        id: 'home.last_post_preview.photo_with_text',
        defaultMessage: '[Photo] {text}',
    },
    photosWithText: {
        id: 'home.last_post_preview.photos_with_text',
        defaultMessage: '[{count} photos] {text}',
    },
    videoWithText: {
        id: 'home.last_post_preview.video_with_text',
        defaultMessage: '[Video] {text}',
    },
    videosWithText: {
        id: 'home.last_post_preview.videos_with_text',
        defaultMessage: '[{count} videos] {text}',
    },
    fileWithText: {
        id: 'home.last_post_preview.file_with_text',
        defaultMessage: '[File: {fileName}] {text}',
    },
    filesWithText: {
        id: 'home.last_post_preview.files_with_text',
        defaultMessage: '[File: {fileName}, {count} total] {text}',
    },
    mixedPhotoVideo: {
        id: 'home.last_post_preview.mixed_photo_video',
        defaultMessage: '[{photoCount} photos, {videoCount} videos]',
    },
    mixedPhotoVideoWithText: {
        id: 'home.last_post_preview.mixed_photo_video_with_text',
        defaultMessage: '[{photoCount} photos, {videoCount} videos] {text}',
    },
    mixedPhotoFile: {
        id: 'home.last_post_preview.mixed_photo_file',
        defaultMessage: '[{photoCount} photos, {fileCount} files]',
    },
    mixedPhotoFileWithText: {
        id: 'home.last_post_preview.mixed_photo_file_with_text',
        defaultMessage: '[{photoCount} photos, {fileCount} files] {text}',
    },
    mixedVideoFile: {
        id: 'home.last_post_preview.mixed_video_file',
        defaultMessage: '[{videoCount} videos, {fileCount} files]',
    },
    mixedVideoFileWithText: {
        id: 'home.last_post_preview.mixed_video_file_with_text',
        defaultMessage: '[{videoCount} videos, {fileCount} files] {text}',
    },
    mixedAll: {
        id: 'home.last_post_preview.mixed_all',
        defaultMessage: '[{photoCount} photos, {videoCount} videos, {fileCount} files]',
    },
    mixedAllWithText: {
        id: 'home.last_post_preview.mixed_all_with_text',
        defaultMessage: '[{photoCount} photos, {videoCount} videos, {fileCount} files] {text}',
    },
    announcement: {
        id: 'home.last_post_preview.announcement',
        defaultMessage: '[Announcement] {text}',
    },
    conversationNote: {
        id: 'home.last_post_preview.conversation_note',
        defaultMessage: '[Note] {text}',
    },
});

type FileInfo = {
    mimeType: string;
    name: string;
};

type PreviewInput = {
    message: string;
    files: FileInfo[];
    header: string;
    channelType: ChannelType;
};

/**
 * 判断是否为图片类型
 */
function isImage(mimeType: string): boolean {
    return mimeType.startsWith('image/');
}

/**
 * 判断是否为视频类型
 */
function isVideo(mimeType: string): boolean {
    return mimeType.startsWith('video/');
}



/**
 * Home conversation list: align last-line preview with in-thread system message copy
 * (avoids raw server "channel" wording in previews).
 * Also handles media/file previews like WeChat.
 */
export function getHomeLastPostPreviewText(
    intl: IntlShape,
    rawMessageOrInput: string | PreviewInput,
    postType: string | undefined,
    channelType: ChannelType,
): string {
    if (postType === Post.POST_TYPES.CHANGE_CHANNEL_PRIVACY) {
        const isNowPrivate = channelType === General.PRIVATE_CHANNEL;
        return intl.formatMessage(
            isNowPrivate ? changeChannelPrivacyPreview.toPrivate : changeChannelPrivacyPreview.toPublic,
        );
    }

    // 处理包含文件的情况
    let message = '';
    let files: FileInfo[] = [];
    let header = '';
    let inputChannelType = channelType;

    if (typeof rawMessageOrInput === 'object') {
        message = rawMessageOrInput.message || '';
        files = rawMessageOrInput.files || [];
        header = rawMessageOrInput.header || '';
        inputChannelType = rawMessageOrInput.channelType || channelType;
    } else {
        message = rawMessageOrInput;
    }

    // 优先检查是否有公告/备注
    const trimmedHeader = header.trim();
    if (trimmedHeader.length > 0) {
        // 根据频道类型判断是公告还是备注
        if (inputChannelType === General.DM_CHANNEL) {
            // 私聊备注
            return intl.formatMessage(mediaPreviewMessages.conversationNote, {text: trimmedHeader});
        }

        // 内部群公告
        return intl.formatMessage(mediaPreviewMessages.announcement, {text: trimmedHeader});

    }

    const trimmedMessage = message.trim();
    const hasText = trimmedMessage.length > 0;

    // 统计各类文件数量
    let photoCount = 0;
    let videoCount = 0;
    let fileCount = 0;
    let firstFileName = '';

    files.forEach((file) => {
        if (isImage(file.mimeType)) {
            photoCount++;
            if (!firstFileName) {
                firstFileName = file.name;
            }
        } else if (isVideo(file.mimeType)) {
            videoCount++;
            if (!firstFileName) {
                firstFileName = file.name;
            }
        } else {
            fileCount++;
            if (!firstFileName) {
                firstFileName = file.name;
            }
        }
    });

    const hasFiles = photoCount + videoCount + fileCount > 0;

    if (!hasFiles) {
        return message;
    }

    const hasMultipleTypes = (photoCount > 0 ? 1 : 0) + (videoCount > 0 ? 1 : 0) + (fileCount > 0 ? 1 : 0) > 1;

    if (hasMultipleTypes) {
        // 混合类型
        if (photoCount > 0 && videoCount > 0 && fileCount > 0) {
            // 三种都有
            return hasText ?intl.formatMessage(mediaPreviewMessages.mixedAllWithText, {photoCount, videoCount, fileCount, text: trimmedMessage}) :intl.formatMessage(mediaPreviewMessages.mixedAll, {photoCount, videoCount, fileCount});
        } else if (photoCount > 0 && videoCount > 0) {
            // 图片+视频
            return hasText ?intl.formatMessage(mediaPreviewMessages.mixedPhotoVideoWithText, {photoCount, videoCount, text: trimmedMessage}) :intl.formatMessage(mediaPreviewMessages.mixedPhotoVideo, {photoCount, videoCount});
        } else if (photoCount > 0 && fileCount > 0) {
            // 图片+文件
            return hasText ?intl.formatMessage(mediaPreviewMessages.mixedPhotoFileWithText, {photoCount, fileCount, text: trimmedMessage}) :intl.formatMessage(mediaPreviewMessages.mixedPhotoFile, {photoCount, fileCount});
        } else if (videoCount > 0 && fileCount > 0) {
            // 视频+文件
            return hasText ?intl.formatMessage(mediaPreviewMessages.mixedVideoFileWithText, {videoCount, fileCount, text: trimmedMessage}) :intl.formatMessage(mediaPreviewMessages.mixedVideoFile, {videoCount, fileCount});
        }
    }

    // 单一类型
    if (photoCount > 0) {
        // 只有图片
        if (photoCount === 1) {
            return hasText ?intl.formatMessage(mediaPreviewMessages.photoWithText, {text: trimmedMessage}) :intl.formatMessage(mediaPreviewMessages.photo);
        }
        return hasText ?intl.formatMessage(mediaPreviewMessages.photosWithText, {count: photoCount, text: trimmedMessage}) :intl.formatMessage(mediaPreviewMessages.photos, {count: photoCount});

    } else if (videoCount > 0) {
        // 只有视频
        if (videoCount === 1) {
            return hasText ?intl.formatMessage(mediaPreviewMessages.videoWithText, {text: trimmedMessage}) :intl.formatMessage(mediaPreviewMessages.video);
        }
        return hasText ?intl.formatMessage(mediaPreviewMessages.videosWithText, {count: videoCount, text: trimmedMessage}) :intl.formatMessage(mediaPreviewMessages.videos, {count: videoCount});

    } else if (fileCount > 0) {
        // 只有文件
        if (fileCount === 1) {
            return hasText ?intl.formatMessage(mediaPreviewMessages.fileWithText, {fileName: firstFileName, text: trimmedMessage}) :intl.formatMessage(mediaPreviewMessages.file, {fileName: firstFileName});
        }
        return hasText ?intl.formatMessage(mediaPreviewMessages.filesWithText, {fileName: firstFileName, count: fileCount, text: trimmedMessage}) :intl.formatMessage(mediaPreviewMessages.files, {fileName: firstFileName, count: fileCount});

    }

    // 默认返回原始消息
    return message;
}
