// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import React, {useCallback, useMemo} from 'react';
import {DeviceEventEmitter, Image, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {of as of$} from 'rxjs';
import {switchMap} from 'rxjs/operators';

import {showPermalink} from '@actions/remote/permalink';
import CompassIcon from '@components/compass_icon';
import {Events} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {observePost, observePostAuthor} from '@queries/servers/post';
import {observeFilesForPost} from '@queries/servers/file';
import {makeStyleSheetFromTheme, changeOpacity} from '@utils/theme';
import {isImage, isVideo} from '@utils/file';

import type {WithDatabaseArgs} from '@typings/database/database';
import type PostModel from '@typings/database/models/servers/post';
import type UserModel from '@typings/database/models/servers/user';
import type FileModel from '@typings/database/models/servers/file';

type Props = {
    quotedPostId: string;
    channelId: string;
    post?: PostModel;
    author?: UserModel;
    files?: FileModel[];
}

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 12,
        marginBottom: 8,
        borderRadius: 8,
        paddingVertical: 8,
        paddingHorizontal: 12,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        alignSelf: 'flex-start',
        maxWidth: '90%',
    },
    content: {
        flexShrink: 1,
        flexDirection: 'row',
        alignItems: 'center',
        minWidth: 0,
    },
    quoteAuthor: {
        color: theme.linkColor,
        fontSize: 13,
        fontWeight: '600',
        marginRight: 4,
    },
    quoteMessage: {
        color: theme.centerChannelColor,
        fontSize: 13,
        flexShrink: 1,
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
    closeButton: {
        padding: 4,
        marginLeft: 4,
    },
}));

const enhance = withObservables(['quotedPostId'], ({database, quotedPostId}: WithDatabaseArgs & {quotedPostId: string}) => {
    const post$ = quotedPostId ? observePost(database, quotedPostId) : of$(undefined);
    const author$ = post$.pipe(switchMap((post) => (post ? observePostAuthor(database, post) : of$(undefined))));
    const files$ = post$.pipe(switchMap((post) => (post ? observeFilesForPost(database, post.id) : of$([]))));

    return {
        post: post$,
        author: author$,
        files: files$,
    };
});

const ReplyQuotePreview = ({post, author, files = []}: Props) => {
    const serverUrl = useServerUrl();
    const theme = useTheme();
    const styles = getStyleSheet(theme);

    const onClose = useCallback(() => {
        DeviceEventEmitter.emit(Events.POST_DRAFT_CLEAR_QUOTED_POST);
    }, []);

    const onJump = useCallback(() => {
        if (!post?.id) {
            return;
        }

        void showPermalink(serverUrl, '', post.id);
    }, [post?.id, serverUrl]);

    if (!post) {
        return null;
    }

    const formattedAuthor = useMemo(() => {
        // Use nickname first, then firstName + lastName, then username
        const nickname = author?.nickname?.trim();
        const firstName = author?.firstName?.trim();
        const lastName = author?.lastName?.trim();
        const username = author?.username ?? '';

        let displayName = '';
        if (nickname) {
            displayName = nickname;
        } else if (firstName || lastName) {
            displayName = `${firstName} ${lastName}`.trim();
        } else if (username) {
            displayName = username;
        }

        if (!displayName) {
            return '';
        }

        return displayName.startsWith('@') ? displayName : `@${displayName}`;
    }, [author?.nickname, author?.firstName, author?.lastName, author?.username]);

    // Determine content type and display
    const {contentElement, displayText} = useMemo(() => {
        const messageSource = post.messageSource || post.message;
        const hasFiles = files.length > 0;
        const hasText = Boolean(messageSource?.trim());

        // Case 1: Has files
        if (hasFiles) {
            const firstFile = files[0];
            const fileIsImage = firstFile && isImage(firstFile);
            const fileIsVideo = firstFile && isVideo(firstFile);

            if ((fileIsImage || fileIsVideo) && firstFile.localPath) {
                // Image or Video: show thumbnail, no filename
                return {
                    contentElement: (
                        <Image
                            source={{uri: firstFile.localPath}}
                            style={styles.thumbnail}
                        />
                    ),
                    displayText: '',
                };
            } else {
                // Other files: show filename + file type icon
                const fileName = firstFile?.name || 'File';
                return {
                    contentElement: (
                        <CompassIcon
                            name='file-outline'
                            size={18}
                            color={theme.centerChannelColor}
                            style={styles.fileIcon}
                        />
                    ),
                    displayText: fileName,
                };
            }
        }

        // Case 2: Text only
        if (hasText) {
            const snippet = messageSource!.trim().split('\n')[0].slice(0, 56);
            return {
                contentElement: null,
                displayText: snippet,
            };
        }

        // Case 3: Empty post
        return {
            contentElement: null,
            displayText: '',
        };
    }, [post, files, styles, theme]);

    return (
        <View style={styles.container}>
            <TouchableOpacity
                onPress={onJump}
                activeOpacity={0.8}
                style={styles.content}
                testID='post_draft.quote.jump_area'
            >
                {contentElement}
                {Boolean(formattedAuthor) && (
                    <Text style={styles.quoteAuthor}>{formattedAuthor}:</Text>
                )}
                {Boolean(displayText) && (
                    <Text
                        style={styles.quoteMessage}
                        numberOfLines={1}
                    >
                        {displayText}
                    </Text>
                )}
            </TouchableOpacity>
            <TouchableOpacity
                onPress={onClose}
                style={styles.closeButton}
                testID='post_draft.quote.close.button'
            >
                <CompassIcon
                    name='close'
                    size={18}
                    color={theme.centerChannelColor}
                />
            </TouchableOpacity>
        </View>
    );
};

export default withDatabase(enhance(ReplyQuotePreview));

