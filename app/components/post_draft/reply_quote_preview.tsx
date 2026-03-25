// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import React, {useCallback, useMemo} from 'react';
import {DeviceEventEmitter, Text, TouchableOpacity, View} from 'react-native';
import {of as of$} from 'rxjs';
import {switchMap} from 'rxjs/operators';

import {showPermalink} from '@actions/remote/permalink';
import CompassIcon from '@components/compass_icon';
import FormattedText from '@components/formatted_text';
import {Events} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {observePost, observePostAuthor} from '@queries/servers/post';
import {makeStyleSheetFromTheme, changeOpacity} from '@utils/theme';

import type {WithDatabaseArgs} from '@typings/database/database';
import type PostModel from '@typings/database/models/servers/post';
import type UserModel from '@typings/database/models/servers/user';

type Props = {
    rootId: string;
    channelId: string;
    post?: PostModel;
    author?: UserModel;
}

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        marginHorizontal: 12,
        marginBottom: 8,
        borderRadius: 8,
        paddingVertical: 8,
        paddingHorizontal: 10,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.06),
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.14),
    },
    topRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    title: {
        color: theme.centerChannelColor,
        fontSize: 12,
        fontWeight: '600',
    },
    closeButton: {
        padding: 4,
    },
    quotePressArea: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 10,
    },
    quoteTextContainer: {
        flex: 1,
        minWidth: 0,
    },
    quoteAuthor: {
        color: theme.linkColor,
        fontSize: 13,
        marginBottom: 2,
        lineHeight: 16,
    },
    quoteMessage: {
        color: theme.centerChannelColor,
        fontSize: 13,
        lineHeight: 16,
    },
}));

const enhance = withObservables(['rootId'], ({database, rootId}: WithDatabaseArgs & {rootId: string}) => {
    const post$ = rootId ? observePost(database, rootId) : of$(undefined);
    const author$ = post$.pipe(switchMap((post) => (post ? observePostAuthor(database, post) : of$(undefined))));

    return {
        post: post$,
        author: author$,
    };
});

const ReplyQuotePreview = ({post, author}: Props) => {
    const serverUrl = useServerUrl();
    const theme = useTheme();
    const styles = getStyleSheet(theme);

    const onClose = useCallback(() => {
        DeviceEventEmitter.emit(Events.POST_DRAFT_CLEAR_REPLY_ROOT);
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
        const rawUsername = author?.username ?? '';
        if (!rawUsername) {
            return '';
        }

        return rawUsername.startsWith('@') ? rawUsername : `@${rawUsername}`;
    }, [author?.username]);

    // PostDraft 的 rootId 指向“引用的根帖”；展示时只做轻量摘要（避免重复复杂渲染）
    const messageSource = post.messageSource || post.message;
    const snippet = (messageSource || '').
        trim().
        split('\n')[0].
        slice(0, 56);

    return (
        <View style={styles.container}>
            <View style={styles.topRow}>
                <FormattedText
                    id='mobile.post_draft.quote_title'
                    defaultMessage='Quote'
                    style={styles.title}
                />
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

            <TouchableOpacity
                onPress={onJump}
                activeOpacity={0.8}
                testID='post_draft.quote.jump_area'
            >
                <View style={styles.quotePressArea}>
                    <View style={styles.quoteTextContainer}>
                        {Boolean(formattedAuthor) && <Text style={styles.quoteAuthor}>{formattedAuthor}</Text>}
                        <Text
                            style={styles.quoteMessage}
                            numberOfLines={1}
                        >
                            {snippet}
                        </Text>
                    </View>
                </View>
            </TouchableOpacity>
        </View>
    );
};

export default withDatabase(enhance(ReplyQuotePreview));

