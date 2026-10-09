// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import React, {useCallback, useMemo} from 'react';
import {useIntl} from 'react-intl';
import {DeviceEventEmitter, Pressable, StyleSheet, Text, View} from 'react-native';
import {of as of$} from 'rxjs';
import {switchMap} from 'rxjs/operators';

import {Events, Screens} from '@constants';
import {useTheme} from '@context/theme';
import {observePost, observePostAuthor} from '@queries/servers/post';
import {debugLog} from '@store/debug_log';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';

import type {WithDatabaseArgs} from '@typings/database/database';
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
        color: changeOpacity(theme.centerChannelColor, 0.5),
        fontSize: 12,
        lineHeight: 16,
        flex: 1,
    },
    plainAuthor: {
        color: changeOpacity(theme.centerChannelColor, 0.5),
        fontSize: 12,
        lineHeight: 16,
        marginRight: 4,
    },
}));

const enhance = withObservables(['quotedPostId'], ({database, quotedPostId}: WithDatabaseArgs & {quotedPostId: string}) => {
    const post$ = quotedPostId ? observePost(database, quotedPostId) : of$(undefined);
    const author$ = post$.pipe(switchMap((p) => (p ? observePostAuthor(database, p) : of$(undefined))));
    return {
        post: post$,
        author: author$,
    };
});

const QuotedPostPreview = ({author, channelId, isOwnPost, location, plain, post, quotedPostId}: Props) => {
    const intl = useIntl();
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

    debugLog('QUOTED_PREVIEW', `content: displayAuthor=${displayAuthor}, snippet=${snippet}, source=${source}`);

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
                    <Text
                        numberOfLines={1}
                        style={style.plainText}
                    >
                        {snippet}
                    </Text>
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
                    <Text
                        numberOfLines={1}
                        style={style.text}
                    >
                        {snippet}
                    </Text>
                </View>
            </View>
        </Pressable>
    );
};

export default withDatabase(enhance(QuotedPostPreview));
