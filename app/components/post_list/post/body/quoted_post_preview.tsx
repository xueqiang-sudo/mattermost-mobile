// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import React, {useCallback, useMemo} from 'react';
import {useIntl} from 'react-intl';
import {DeviceEventEmitter, Pressable, Text, View} from 'react-native';
import {of as of$} from 'rxjs';
import {switchMap} from 'rxjs/operators';

import {Events, Screens} from '@constants';
import {useTheme} from '@context/theme';
import {observePost, observePostAuthor} from '@queries/servers/post';
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
    post?: PostModel;
    author?: UserModel;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.1),
        borderRadius: 4,
        marginBottom: 6,
        paddingHorizontal: 8,
        paddingVertical: 6,
    },
    ownContainer: {
        backgroundColor: changeOpacity('#FFFFFF', 0.14),
    },
    author: {
        color: theme.linkColor,
        fontSize: 12,
        lineHeight: 16,
        marginBottom: 1,
    },
    text: {
        color: changeOpacity(theme.centerChannelColor, 0.85),
        fontSize: 12,
        lineHeight: 16,
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

const QuotedPostPreview = ({author, channelId, isOwnPost, location, post, quotedPostId}: Props) => {
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

    if (!post) {
        return null;
    }

    const rawUsername = author?.username ?? '';
    const displayAuthor = rawUsername ? (rawUsername.startsWith('@') ? rawUsername : `@${rawUsername}`) : '';
    const source = post.messageSource || post.message || '';
    const snippet = useMemo(() => source.trim().replace(/\n/g, ' ').slice(0, 64), [source]);

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
                {Boolean(displayAuthor) && (
                    <Text
                        numberOfLines={1}
                        style={style.author}
                    >
                        {displayAuthor}
                    </Text>
                )}
                <Text
                    numberOfLines={1}
                    style={style.text}
                >
                    {snippet}
                </Text>
            </View>
        </Pressable>
    );
};

export default withDatabase(enhance(QuotedPostPreview));
