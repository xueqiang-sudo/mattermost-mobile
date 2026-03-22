// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useMemo, useState} from 'react';
import {type LayoutChangeEvent, ScrollView, type StyleProp, useWindowDimensions, View} from 'react-native';
import Animated from 'react-native-reanimated';

import Markdown from '@components/markdown';
import {isChannelMentions} from '@components/markdown/channel_mention/channel_mention';
import {CHANNEL, PERMALINK, SEARCH, THREAD} from '@constants/screens';
import {useShowMoreAnimatedStyle} from '@hooks/show_more';
import {makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import ShowMoreButton from './show_more_button';

import type PostModel from '@typings/database/models/servers/post';
import type UserModel from '@typings/database/models/servers/user';
import type {HighlightWithoutNotificationKey, SearchPattern} from '@typings/global/markdown';
import type {AvailableScreens} from '@typings/screens/navigation';
import type {TextStyle} from 'react-native';

type MessageProps = {
    baseTextStyle?: StyleProp<TextStyle>;
    currentUser?: UserModel;
    isHighlightWithoutNotificationLicensed?: boolean;
    highlight: boolean;
    isEdited: boolean;
    isPendingOrFailed: boolean;
    isReplyPost: boolean;
    layoutWidth?: number;
    location: AvailableScreens;

    /**
     * 微信气泡等：Markdown 区域随内容完整增高，不使用半屏 maxHeight +「展开」裁剪。
     * 为 false 时保持频道内长帖折叠逻辑（仅频道/线程/固定链接在 height 未测量前用无界首帧）。
     */
    unboundedMarkdownHeight?: boolean;
    post: PostModel;
    searchPatterns?: SearchPattern[];
    theme: Theme;
}

const SHOW_MORE_HEIGHT = 54;

const EMPTY_HIGHLIGHT_KEYS: HighlightWithoutNotificationKey[] = [];

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => {
    return {
        messageContainer: {
            width: '100%',
        },
        reply: {
            paddingRight: 10,
        },
        message: {
            color: theme.centerChannelColor,
            ...typography('Body', 200),
            lineHeight: undefined, // remove line height, not needed and causes problems with md images
        },
        pendingPost: {
            opacity: 0.5,
        },
    };
});

const Message = ({baseTextStyle, currentUser, isHighlightWithoutNotificationLicensed, highlight, isEdited, isPendingOrFailed, isReplyPost, layoutWidth, location, unboundedMarkdownHeight = false, post, searchPatterns, theme}: MessageProps) => {
    const [open, setOpen] = useState(false);
    const [height, setHeight] = useState<number|undefined>();
    const dimensions = useWindowDimensions();
    const maxHeight = Math.round((dimensions.height * 0.5) + SHOW_MORE_HEIGHT);
    const animatedStyle = useShowMoreAnimatedStyle(height, maxHeight, open);
    const style = getStyleSheet(theme);
    /** 气泡仅传 color 时须与默认排版合并，否则丢失字号/行高会导致英文被裁切 */
    const textStyle = baseTextStyle ? [style.message, baseTextStyle] : style.message;

    const isChannelThreadPermalink = location === CHANNEL || location === PERMALINK || location === THREAD;

    // We need to memoize these two values because they are actually getters that return a new list
    // on every render. We need to trust that changes in the currentUser will trigger the recalculation.
    const mentionKeys = useMemo(() => currentUser?.mentionKeys ?? undefined, [currentUser]);
    const highlightKeys = useMemo(() => {
        if (isHighlightWithoutNotificationLicensed) {
            return currentUser?.highlightKeys ?? EMPTY_HIGHLIGHT_KEYS;
        }
        return EMPTY_HIGHLIGHT_KEYS;
    }, [currentUser, isHighlightWithoutNotificationLicensed]);

    const onLayout = useCallback((event: LayoutChangeEvent) => {
        const h = event.nativeEvent.layout.height;
        if (h > maxHeight && !unboundedMarkdownHeight) {
            setHeight(event.nativeEvent.layout.height);
        }
    }, [maxHeight, unboundedMarkdownHeight]);
    const onPress = () => setOpen(!open);

    const channelMentions = useMemo(() => {
        return isChannelMentions(post.props?.channel_mentions) ? post.props.channel_mentions : {};
    }, [post.props?.channel_mentions]);

    /**
     * 微信气泡：始终无界。否则保持原逻辑：频道/线程/固定链接仅在 height 未记录前无界，长文记录后套半屏折叠。
     */
    const useSimpleUnboundedBody = unboundedMarkdownHeight || (isChannelThreadPermalink && height === undefined);
    const wrapperStyle = useSimpleUnboundedBody ? {} : animatedStyle;

    const messageInner = (
        <View
            style={[style.messageContainer, (isReplyPost && style.reply), (isPendingOrFailed && style.pendingPost)]}
            onLayout={onLayout}
        >
            <Markdown
                baseTextStyle={textStyle}
                channelId={post.channelId}
                channelMentions={channelMentions}
                imagesMetadata={post.metadata?.images}
                isEdited={isEdited}
                isReplyPost={isReplyPost}
                isSearchResult={location === SEARCH}
                layoutWidth={layoutWidth}
                location={location}
                postId={post.id}
                value={post.message}
                mentionKeys={mentionKeys}
                highlightKeys={highlightKeys}
                searchPatterns={searchPatterns}
                theme={theme}
                isUnsafeLinksPost={Boolean(post.props?.unsafe_links && post.props.unsafe_links !== '')}
            />
        </View>
    );

    return (
        <>
            <Animated.View style={wrapperStyle}>
                {useSimpleUnboundedBody ? (
                    messageInner
                ) : (
                    <ScrollView
                        keyboardShouldPersistTaps={'always'}
                        scrollEnabled={false}
                        showsVerticalScrollIndicator={false}
                        showsHorizontalScrollIndicator={false}
                    >
                        {messageInner}
                    </ScrollView>
                )}
            </Animated.View>
            {!unboundedMarkdownHeight && (height || 0) > maxHeight &&
            <ShowMoreButton
                highlight={highlight}
                theme={theme}
                showMore={!open}
                onPress={onPress}
            />
            }
        </>
    );
};

export default Message;
