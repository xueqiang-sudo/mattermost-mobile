// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import React, {useCallback, useMemo} from 'react';
import {useIntl} from 'react-intl';
import {DeviceEventEmitter, Image, Pressable, StyleSheet, Text, View} from 'react-native';
import {of as of$} from 'rxjs';
import {switchMap} from 'rxjs/operators';

import {buildFileThumbnailUrl, buildFileUrl} from '@actions/remote/file';
import CompassIcon from '@components/compass_icon';
import {getFileIconInfo} from '@components/files/file_icon';
import {Events, Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {observeFilesForPost} from '@queries/servers/file';
import {observePost, observePostAuthor} from '@queries/servers/post';
import {debugLog} from '@store/debug_log';
import {isAudio, isImage, isVideo} from '@utils/file';
import {showMediaViewer} from '@utils/gallery';
import {openUnifiedFileViewer} from '@utils/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';

import type {WithDatabaseArgs} from '@typings/database/database';
import type FileModel from '@typings/database/models/servers/file';
import type PostModel from '@typings/database/models/servers/post';
import type UserModel from '@typings/database/models/servers/user';
import type {AvailableScreens} from '@typings/screens/navigation';

type Props = {
    quotedPostId: string;
    channelId: string;
    location: AvailableScreens;
    isOwnPost?: boolean;
    plain?: boolean;
    post?: PostModel;
    author?: UserModel;
    files?: FileModel[];
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.12),
        borderRadius: 6,
        marginBottom: 6,
        paddingHorizontal: 10,
        paddingVertical: 8,
    },
    ownContainer: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.12),
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        flexShrink: 1,
    },
    author: {
        color: theme.linkColor,
        fontSize: 12,
        lineHeight: 16,
        marginRight: 4,
    },
    text: {
        color: changeOpacity(theme.centerChannelColor, 0.85),
        fontSize: 12,
        lineHeight: 16,
        flexShrink: 1,
    },
    plainText: {
        color: changeOpacity(theme.centerChannelColor, 0.72),
        fontSize: 12,
        lineHeight: 16,
        flexShrink: 1,
    },
    plainAuthor: {
        color: theme.linkColor,
        fontSize: 12,
        lineHeight: 16,
        fontWeight: '600',
        marginRight: 4,
    },
    thumbnail: {
        width: 32,
        height: 32,
        borderRadius: 4,
        marginRight: 6,
    },
    fileIcon: {
        marginRight: 6,
    },
}));

const enhance = withObservables(['quotedPostId'], ({database, quotedPostId}: WithDatabaseArgs & {quotedPostId: string}) => {
    const post$ = quotedPostId ? observePost(database, quotedPostId) : of$(undefined);
    const author$ = post$.pipe(switchMap((p) => (p ? observePostAuthor(database, p) : of$(undefined))));
    const files$ = post$.pipe(switchMap((p) => (p ? observeFilesForPost(database, p.id) : of$([]))));
    return {
        post: post$,
        author: author$,
        files: files$,
    };
});

const QuotedPostPreview = ({author, channelId, files = [], isOwnPost, location, plain, post, quotedPostId}: Props) => {
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const theme = useTheme();
    const style = getStyleSheet(theme);

    const onPress = useCallback(() => {
        // If the quoted post has files, open the file directly (like clicking the original file)
        if (files.length > 0) {
            const file = files[0];
            const fileInfo: FileInfo = {
                id: file.id,
                name: file.name,
                extension: file.extension,
                mime_type: file.mimeType,
                size: file.size,
                width: file.width,
                height: file.height,
                has_preview_image: file.hasPreviewImage,
                localPath: file.localPath,
                uri: buildFileUrl(serverUrl, file.id),
                post_id: file.postId,
                user_id: file.userId,
                create_at: file.createAt,
                update_at: file.updateAt,
            };

            if (isImage(file) || isVideo(file) || isAudio(file)) {
                showMediaViewer(fileInfo);
            } else {
                openUnifiedFileViewer(fileInfo, theme);
            }
            return;
        }

        if (location !== Screens.CHANNEL && location !== Screens.PERMALINK) {
            return;
        }
        DeviceEventEmitter.emit(Events.POST_LIST_JUMP_TO_POST, {
            postId: quotedPostId,
            channelId,
            location,
        });
    }, [channelId, files, location, quotedPostId, serverUrl, theme]);

    debugLog('QUOTED_PREVIEW', `rendering: quotedPostId=${quotedPostId}, plain=${plain}, hasPost=${Boolean(post)}, hasAuthor=${Boolean(author)}`);

    if (!post) {
        debugLog('QUOTED_PREVIEW', `no post found for quotedPostId=${quotedPostId}, returning null`);
        return null;
    }

    const displayAuthor = useMemo(() => {
        const nickname = author?.nickname?.trim();
        const firstName = author?.firstName?.trim();
        const lastName = author?.lastName?.trim();
        const username = author?.username ?? '';

        if (nickname) {
            return nickname;
        }
        if (firstName || lastName) {
            return `${firstName} ${lastName}`.trim();
        }
        return username;
    }, [author?.nickname, author?.firstName, author?.lastName, author?.username]);
    // Strip !{file:ID} markers from quoted post preview
    const FILE_MARKER_RE = /!\{file:[a-z0-9_-]+\}\s*/g;
    const source = (post.messageSource || post.message || '').replace(FILE_MARKER_RE, '').trim();
    const snippet = useMemo(() => source.trim().replace(/\n/g, ' ').slice(0, 64), [source]);

    // Determine file content to display
    const fileContent = useMemo(() => {
        if (!files.length) {
            return null;
        }
        const firstFile = files[0];
        const fileIsImage = firstFile && isImage(firstFile);
        const fileIsVideo = firstFile && isVideo(firstFile);
        const fileName = firstFile?.name || 'File';

        debugLog('QUOTED_PREVIEW', `file: name=${fileName}, id=${firstFile?.id}, localPath=${firstFile?.localPath}, isImage=${fileIsImage}, isVideo=${fileIsVideo}`);

        if (fileIsImage || fileIsVideo) {
            // Show thumbnail for images/videos
            const localUri = firstFile.localPath ? (
                firstFile.localPath.startsWith('file://') ? firstFile.localPath : `file://${firstFile.localPath}`
            ) : undefined;
            const thumbnailUri = localUri || (firstFile.id ? buildFileThumbnailUrl(serverUrl, firstFile.id) : undefined);

            debugLog('QUOTED_PREVIEW', `thumbnail: localUri=${localUri}, thumbnailUri=${thumbnailUri}`);

            if (thumbnailUri) {
                return (
                    <Image
                        source={{uri: thumbnailUri}}
                        style={style.thumbnail}
                    />
                );
            }
        }

        // Show file icon for non-media files or media without thumbnail
        const {iconName, color: iconColor} = getFileIconInfo(firstFile);
        return (
            <>
                <CompassIcon
                    name={iconName}
                    size={18}
                    color={iconColor}
                    style={style.fileIcon}
                />
                <Text
                    numberOfLines={1}
                    style={plain ? style.plainText : style.text}
                >
                    {fileName}
                </Text>
            </>
        );
    }, [files, serverUrl, style, theme, plain]);

    debugLog('QUOTED_PREVIEW', `content: displayAuthor=${displayAuthor}, snippet=${snippet}, source=${source}, hasFiles=${files.length > 0}`);

    if (plain) {
        return (
            <Pressable
                onPress={onPress}
                accessibilityRole='button'
                accessibilityLabel={intl.formatMessage({
                    id: 'mobile.post_body.quoted_jump_a11y',
                    defaultMessage: 'Jump to quoted message',
                })}
            >
                <View style={style.content}>
                    {Boolean(displayAuthor) && (
                        <Text
                            numberOfLines={1}
                            style={style.plainAuthor}
                        >
                            {displayAuthor}:
                        </Text>
                    )}
                    {fileContent}
                    {!fileContent && Boolean(snippet) && (
                        <Text
                            numberOfLines={1}
                            style={[style.plainText, {flexShrink: 1}]}
                        >
                            {snippet}
                        </Text>
                    )}
                    {!fileContent && !snippet && (
                        <Text
                            numberOfLines={1}
                            style={style.plainText}
                        >
                            {'[消息]'}
                        </Text>
                    )}
                </View>
            </Pressable>
        );
    }

    return (
        <Pressable
            onPress={onPress}
            accessibilityRole='button'
            accessibilityLabel={intl.formatMessage({
                id: 'mobile.post_body.quoted_jump_a11y',
                defaultMessage: 'Jump to quoted message',
            })}
        >
            <View style={[style.container, isOwnPost && style.ownContainer]}>
                <View style={style.content}>
                    {Boolean(displayAuthor) && (
                        <Text
                            numberOfLines={1}
                            style={style.author}
                        >
                            {displayAuthor}:
                        </Text>
                    )}
                    {fileContent}
                    {!fileContent && Boolean(snippet) && (
                        <Text
                            numberOfLines={1}
                            style={[style.text, {flexShrink: 1}]}
                        >
                            {snippet}
                        </Text>
                    )}
                    {!fileContent && !snippet && (
                        <Text
                            numberOfLines={1}
                            style={style.text}
                        >
                            {'[消息]'}
                        </Text>
                    )}
                </View>
            </View>
        </Pressable>
    );
};

export default withDatabase(enhance(QuotedPostPreview));
