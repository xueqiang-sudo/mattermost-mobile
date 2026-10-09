// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import React, {useCallback, useMemo} from 'react';
import {useIntl} from 'react-intl';
import {DeviceEventEmitter, Image, Pressable, StyleSheet, Text, View} from 'react-native';
import {of as of$} from 'rxjs';
import {switchMap} from 'rxjs/operators';

import {buildFileThumbnailUrl} from '@actions/remote/file';
import CompassIcon from '@components/compass_icon';
import {Events, Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {observeFilesForPost} from '@queries/servers/file';
import {observePost, observePostAuthor} from '@queries/servers/post';
import {debugLog} from '@store/debug_log';
import {isImage, isVideo} from '@utils/file';
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
        flexWrap: 'wrap',
        alignItems: 'baseline',
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
        flex: 1,
    },
    plainText: {
        color: changeOpacity(theme.centerChannelColor, 0.72),
        fontSize: 12,
        lineHeight: 16,
        flex: 1,
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
        if (location !== Screens.CHANNEL && location !== Screens.PERMALINK) {
            return;
        }
        DeviceEventEmitter.emit(Events.POST_LIST_JUMP_TO_POST, {
            postId: quotedPostId,
            channelId,
            location,
        });
    }, [channelId, location, quotedPostId]);

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

        if (fileIsImage || fileIsVideo) {
            // Show thumbnail for images/videos
            const localUri = firstFile.localPath ? (
                firstFile.localPath.startsWith('file://') ? firstFile.localPath : `file://${firstFile.localPath}`
            ) : undefined;
            const thumbnailUri = localUri || (firstFile.id ? buildFileThumbnailUrl(serverUrl, firstFile.id) : undefined);

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
        const fileName = firstFile?.name || 'File';
        return (
            <>
                <CompassIcon
                    name='file-outline'
                    size={18}
                    color={theme.centerChannelColor}
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
                    {Boolean(snippet) && !fileContent && (
                        <Text
                            numberOfLines={1}
                            style={style.plainText}
                        >
                            {snippet}
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
                    {Boolean(snippet) && !fileContent && (
                        <Text
                            numberOfLines={1}
                            style={style.text}
                        >
                            {snippet}
                        </Text>
                    )}
                </View>
            </View>
        </Pressable>
    );
};

export default withDatabase(enhance(QuotedPostPreview));
