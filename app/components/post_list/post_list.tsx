// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {FlatList} from '@stream-io/flat-list-mvcp';
import React, {type ReactElement, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {DeviceEventEmitter, type ListRenderItemInfo, Platform, type StyleProp, StyleSheet, View, type ViewStyle, type NativeSyntheticEvent, type NativeScrollEvent} from 'react-native';
import Animated, {type AnimatedStyle} from 'react-native-reanimated';

import {removePost} from '@actions/local/post';
import {fetchPosts} from '@actions/remote/post';
import CombinedUserActivity from '@components/post_list/combined_user_activity';
import DateSeparator from '@components/post_list/date_separator';
import MessageTimeSeparator from '@components/post_list/message_time_separator';
import NewMessagesLine from '@components/post_list/new_message_line';
import Post from '@components/post_list/post';
import ThreadOverview from '@components/post_list/thread_overview';
import {Events, Screens} from '@constants';
import {PostTypes} from '@constants/post';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {getDateForDateLine, getTimeForTimeLine, preparePostList} from '@utils/post_list';
import {changeOpacity, getChatListBackdropColor} from '@utils/theme';

import {INITIAL_BATCH_TO_RENDER, SCROLL_POSITION_CONFIG, VIEWABILITY_CONFIG} from './config';
import MoreMessages from './more_messages';
import ScrollToEndView from './scroll_to_end_view';

import type {PostListItem, PostListOtherItem, ViewableItemsChanged, ViewableItemsChangedListenerEvent} from '@typings/components/post_list';
import type PostModel from '@typings/database/models/servers/post';
import type {AvailableScreens} from '@typings/screens/navigation';

type Props = {
    appsEnabled: boolean;
    channelId: string;
    contentContainerStyle?: StyleProp<AnimatedStyle<ViewStyle>>;
    currentTimezone: string | null;
    currentUserId: string;
    currentUsername: string;
    customEmojiNames: string[];
    disablePullToRefresh?: boolean;
    highlightedId?: PostModel['id'];
    highlightPinnedOrSaved?: boolean;
    isCRTEnabled?: boolean;
    isMilitaryTime: boolean;
    isPostAcknowledgementEnabled?: boolean;
    lastViewedAt: number;
    location: AvailableScreens;
    nativeID: string;
    onEndReached?: () => void;
    posts: PostModel[];
    rootId?: string;
    shouldRenderReplyButton?: boolean;
    shouldShowJoinLeaveMessages: boolean;
    showMoreMessages?: boolean;
    showNewMessageLine?: boolean;
    footer?: ReactElement;
    header?: ReactElement;
    testID: string;
    currentCallBarVisible?: boolean;
    savedPostIds: Set<string>;
    unreadCount?: number;
    isManualUnread?: boolean;
}

type onScrollEndIndexListenerEvent = (endIndex: number) => void;

type ScrollIndexFailed = {
    index: number;
    highestMeasuredFrameIndex: number;
    averageItemLength: number;
};

const CONTENT_OFFSET_THRESHOLD = 160;
const SCROLL_EVENT_THROTTLE = Platform.select({android: 17, default: 60});

/** 与当前可视项 ±N 行的帖子一并标记可加载媒体，便于即将滚入时预加载 */
const POST_MEDIA_NEAR_VIEWPORT_RANGE = 5;

const keyExtractor = (item: PostListItem | PostListOtherItem) => (item.type === 'post' ? item.value.currentPost.id : item.value);

const styles = StyleSheet.create({
    flex: {
        flex: 1,
    },
    container: {
        flex: 1,
    },
});

const PostList = ({
    appsEnabled,
    channelId,
    contentContainerStyle,
    currentTimezone,
    currentUserId,
    currentUsername,
    customEmojiNames,
    disablePullToRefresh,
    footer,
    header,
    highlightedId,
    highlightPinnedOrSaved = true,
    isCRTEnabled,
    isMilitaryTime,
    isPostAcknowledgementEnabled,
    lastViewedAt,
    location,
    nativeID,
    onEndReached,
    posts,
    rootId,
    shouldRenderReplyButton = true,
    shouldShowJoinLeaveMessages,
    showMoreMessages,
    showNewMessageLine = false,
    testID,
    savedPostIds,
    unreadCount = 0,
    isManualUnread = false,
}: Props) => {
    // 反转后数组尾部是最新帖子，用于检测新消息到达
    const newestPostId = posts[posts.length - 1]?.id;

    const listRef = useRef<FlatList<string | PostModel>>(null);
    const onScrollEndIndexListener = useRef<onScrollEndIndexListenerEvent>();
    const onViewableItemsChangedListener = useRef<ViewableItemsChangedListenerEvent>();
    const scrolledToHighlighted = useRef(false);
    const [jumpHighlightPostId, setJumpHighlightPostId] = useState<string | undefined>();
    const effectiveHighlightedId = jumpHighlightPostId || highlightedId;
    const [refreshing, setRefreshing] = useState(false);
    const [showScrollToEndBtn, setShowScrollToEndBtn] = useState(false);
    const [lastPostId, setLastPostId] = useState<string | undefined>(newestPostId);
    // 跟踪内容尺寸和视口尺寸，用于判断是否在列表底部
    const contentSizeRef = useRef(0);
    const layoutSizeRef = useRef(0);
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const listContentStyle = useMemo(() => {
        const isChatStyle = location === Screens.CHANNEL || location === Screens.PERMALINK;
        if (!isChatStyle) {
            return undefined;
        }
        const base = {backgroundColor: getChatListBackdropColor(theme)};
        /** 频道正序列表：不使用 flexGrow 避免消息少时顶部出现大片空白 */
        if (location === Screens.CHANNEL) {
            return base;
        }
        return {...base, flexGrow: 1};
    }, [location, theme]);
    const orderedPosts = useMemo(() => {
        const isThreadView = Boolean(rootId);
        const result = preparePostList(posts, lastViewedAt, showNewMessageLine, currentUserId, currentUsername, shouldShowJoinLeaveMessages, currentTimezone, isThreadView, savedPostIds);
        // 反转数组：原为降序（最新在前），反转后升序（最旧在前），
        // 配合 inverted={false} 实现自上而下显示（最旧在顶部，最新在底部）
        return [...result].reverse();
    }, [posts, lastViewedAt, showNewMessageLine, currentUserId, currentUsername, shouldShowJoinLeaveMessages, currentTimezone, rootId, savedPostIds]);

    const orderedPostsRef = useRef(orderedPosts);
    orderedPostsRef.current = orderedPosts;

    const initialIndex = useMemo(() => {
        return orderedPosts.findIndex((i) => i.type === 'start-of-new-messages');
    }, [orderedPosts]);

    const isNewMessage = lastPostId ? newestPostId !== lastPostId : false;

    // 非反转列表：scrollToEnd 滚动到内容最底部（最新帖子所在位置）
    const scrollToEnd = useCallback((animated = true) => {
        listRef.current?.scrollToEnd({animated});
    }, []);

    useEffect(() => {
        const t = setTimeout(() => {
            scrollToEnd();
        }, 300);

        return () => clearTimeout(t);
    }, [channelId, rootId, scrollToEnd]);

    useEffect(() => {
        const scrollToBottom = (screen: string) => {
            if (screen === location) {
                const scrollToBottomTimer = setTimeout(() => {
                    scrollToEnd(false);
                    clearTimeout(scrollToBottomTimer);
                }, 400);
            }
        };

        const scrollBottomListener = DeviceEventEmitter.addListener(Events.POST_LIST_SCROLL_TO_BOTTOM, scrollToBottom);

        return () => {
            scrollBottomListener.remove();
        };
    }, [location, scrollToEnd]);

    useEffect(() => {
        const sub = DeviceEventEmitter.addListener(
            Events.POST_LIST_JUMP_TO_POST,
            ({postId, channelId: eventChannelId, location: eventLocation}: {postId: string; channelId: string; location: AvailableScreens}) => {
                if (eventChannelId === channelId && eventLocation === location) {
                    setJumpHighlightPostId(postId);
                }
            },
        );
        return () => sub.remove();
    }, [channelId, location]);

    useEffect(() => {
        if (!jumpHighlightPostId) {
            return undefined;
        }
        const t = setTimeout(() => setJumpHighlightPostId(undefined), 2500);
        return () => clearTimeout(t);
    }, [jumpHighlightPostId]);

    useEffect(() => {
        if (jumpHighlightPostId) {
            scrolledToHighlighted.current = false;
        }
    }, [jumpHighlightPostId]);

    useEffect(() => {
        scrolledToHighlighted.current = false;
    }, [highlightedId]);

    const onRefresh = useCallback(async () => {
        if (disablePullToRefresh) {
            return;
        }
        setRefreshing(true);
        if (location === Screens.CHANNEL && channelId) {
            await fetchPosts(serverUrl, channelId);
        }
        const removalPromises = posts.
            filter((post) => post.type === PostTypes.EPHEMERAL).
            map((post) => removePost(serverUrl, post));
        await Promise.all(removalPromises);
        setRefreshing(false);
    }, [disablePullToRefresh, location, channelId, posts, serverUrl]);

    const scrollToIndex = useCallback((index: number, animated = true, applyOffset = true) => {
        listRef.current?.scrollToIndex({
            animated,
            index,
            viewOffset: applyOffset ? Platform.select({ios: -45, default: 0}) : 0,
            viewPosition: 0, // 0 = 项显示在视口顶部（非反转列表的标准行为）
        });
    }, []);

    const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const {contentOffset, contentSize, layoutMeasurement} = event.nativeEvent;
        const y = contentOffset.y;
        contentSizeRef.current = contentSize.height;
        layoutSizeRef.current = layoutMeasurement.height;

        // 非反转列表：距底部的距离 = 内容高度 - 视口高度 - 当前偏移
        const distanceFromBottom = contentSize.height - layoutMeasurement.height - y;
        const isNearBottom = distanceFromBottom < CONTENT_OFFSET_THRESHOLD;

        // 不在底部时显示"回到底部"按钮
        if (!isNearBottom !== showScrollToEndBtn) {
            setShowScrollToEndBtn(!isNearBottom);
        }

        // 到达底部时更新已见最新帖子 ID
        if (isNearBottom && lastPostId !== newestPostId) {
            setLastPostId(newestPostId);
        }
    }, [lastPostId, newestPostId, showScrollToEndBtn]);

    const onScrollToIndexFailed = useCallback((info: ScrollIndexFailed) => {
        const index = Math.min(info.highestMeasuredFrameIndex, info.index);

        if (!effectiveHighlightedId) {
            if (onScrollEndIndexListener.current) {
                onScrollEndIndexListener.current(index);
            }
            scrollToIndex(index);
        }
    }, [effectiveHighlightedId, scrollToIndex]);

    const onViewableItemsChanged = useCallback(({viewableItems}: ViewableItemsChanged) => {
        if (!viewableItems.length) {
            return;
        }

        const list = orderedPostsRef.current;
        const viewableItemsMap: Record<string, boolean> = {};

        const markPost = (entry: PostListItem | PostListOtherItem | undefined) => {
            if (entry?.type === 'post') {
                viewableItemsMap[`${location}-${entry.value.currentPost.id}`] = true;
            }
        };

        for (const {item, isViewable, index} of viewableItems) {
            if (!isViewable || item.type !== 'post') {
                continue;
            }
            markPost(item);
            if (typeof index === 'number' && !Number.isNaN(index)) {
                for (let d = -POST_MEDIA_NEAR_VIEWPORT_RANGE; d <= POST_MEDIA_NEAR_VIEWPORT_RANGE; d++) {
                    const j = index + d;
                    if (j >= 0 && j < list.length) {
                        markPost(list[j]);
                    }
                }
            }
        }

        DeviceEventEmitter.emit(Events.ITEM_IN_VIEWPORT, viewableItemsMap);

        if (onViewableItemsChangedListener.current) {
            onViewableItemsChangedListener.current(viewableItems);
        }
    }, [location]);

    const registerScrollEndIndexListener = useCallback((listener: onScrollEndIndexListenerEvent) => {
        onScrollEndIndexListener.current = listener;
        const removeListener = () => {
            onScrollEndIndexListener.current = undefined;
        };

        return removeListener;
    }, []);

    const registerViewableItemsListener = useCallback((listener: ViewableItemsChangedListenerEvent) => {
        onViewableItemsChangedListener.current = listener;
        const removeListener = () => {
            onViewableItemsChangedListener.current = undefined;
        };

        return removeListener;
    }, []);

    const renderItem = useCallback(({item}: ListRenderItemInfo<PostListItem | PostListOtherItem>) => {
        switch (item.type) {
            case 'start-of-new-messages':
                return (
                    <NewMessagesLine
                        key={item.value}
                        theme={theme}
                        testID={`${testID}.new_messages_line`}
                    />
                );
            case 'date':
                return (
                    <DateSeparator
                        key={item.value}
                        compact={location === Screens.CHANNEL || location === Screens.PERMALINK}
                        date={getDateForDateLine(item.value)}
                        timezone={currentTimezone}
                    />
                );
            case 'time-separator':
                return (
                    <MessageTimeSeparator
                        key={item.value}
                        createAt={getTimeForTimeLine(item.value)}
                        timezone={currentTimezone}
                        isMilitaryTime={isMilitaryTime}
                    />
                );
            case 'thread-overview':
                return (
                    <ThreadOverview
                        key={item.value}
                        rootId={rootId!}
                        testID={`${testID}.thread_overview`}
                    />
                );
            case 'user-activity': {
                const postProps = {
                    currentUsername,
                    postId: item.value,
                    location,
                    style: styles.container,
                    testID: `${testID}.combined_user_activity`,
                    showJoinLeave: shouldShowJoinLeaveMessages,
                    theme,
                };

                return (
                    <CombinedUserActivity
                        {...postProps}
                        key={item.value}
                    />);
            }
            default: {
                const post = item.value.currentPost;
                const {isSaved, nextPost, previousPost} = item.value;
                const skipSaveddHeader = false;
                const postProps = {
                    appsEnabled,
                    customEmojiNames,
                    isCRTEnabled,
                    isPostAcknowledgementEnabled,
                    highlight: effectiveHighlightedId === post.id,
                    highlightPinnedOrSaved,
                    isSaved,
                    location,
                    nextPost,
                    post,
                    previousPost,
                    rootId,
                    shouldRenderReplyButton,
                    skipSaveddHeader,
                    testID: `${testID}.post`,
                };

                return (
                    <Post
                        {...postProps}
                        key={post.id}
                    />
                );
            }
        }
    }, [appsEnabled, currentTimezone, currentUsername, customEmojiNames, highlightPinnedOrSaved, effectiveHighlightedId, isCRTEnabled, isPostAcknowledgementEnabled, location, rootId, shouldRenderReplyButton, shouldShowJoinLeaveMessages, testID, theme]);

    useEffect(() => {
        const t = setTimeout(() => {
            if (effectiveHighlightedId && orderedPosts && !scrolledToHighlighted.current) {
                scrolledToHighlighted.current = true;
                // eslint-disable-next-line max-nested-callbacks
                const index = orderedPosts.findIndex((p) => p.type === 'post' && p.value.currentPost.id === effectiveHighlightedId);
                if (index >= 0 && listRef.current) {
                    listRef.current?.scrollToIndex({
                        animated: true,
                        index,
                        viewOffset: 0,
                        viewPosition: 0.5, // 0 is at bottom
                    });
                }
            }
        }, 500);

        return () => clearTimeout(t);
    }, [orderedPosts, effectiveHighlightedId]);

    return (
        <View style={styles.container}>
            <Animated.FlatList
                contentContainerStyle={[listContentStyle, contentContainerStyle]}
                data={orderedPosts}
                keyboardDismissMode='interactive'
                keyboardShouldPersistTaps='handled'
                keyExtractor={keyExtractor}
                initialNumToRender={INITIAL_BATCH_TO_RENDER + 5}
                ListHeaderComponent={header}
                ListFooterComponent={footer}
                maintainVisibleContentPosition={SCROLL_POSITION_CONFIG}
                maxToRenderPerBatch={10}
                nativeID={nativeID}
                onEndReached={onEndReached}
                onEndReachedThreshold={0.9}
                onScroll={onScroll}
                onScrollToIndexFailed={onScrollToIndexFailed}
                onViewableItemsChanged={onViewableItemsChanged}
                ref={listRef}
                removeClippedSubviews={true}
                renderItem={renderItem}
                scrollEventThrottle={SCROLL_EVENT_THROTTLE}
                style={styles.flex}
                viewabilityConfig={VIEWABILITY_CONFIG}
                testID={`${testID}.flat_list`}
                inverted={false}
                refreshing={refreshing}
                onRefresh={onRefresh}
            />
            {location !== Screens.PERMALINK &&
            <ScrollToEndView
                onPress={() => scrollToEnd(true)}
                isNewMessage={isNewMessage}
                showScrollToEndBtn={showScrollToEndBtn}
                location={location}
                isThreadReply={Boolean(rootId)}
                testID={'scroll-to-end-view'}
            />
            }
            {showMoreMessages &&
            <MoreMessages
                channelId={channelId}
                isCRTEnabled={isCRTEnabled}
                newMessageLineIndex={initialIndex}
                posts={orderedPosts}
                registerScrollEndIndexListener={registerScrollEndIndexListener}
                registerViewableItemsListener={registerViewableItemsListener}
                rootId={rootId}
                scrollToIndex={scrollToIndex}
                theme={theme}
                testID={`${testID}.more_messages_button`}
                unreadCount={unreadCount}
                isManualUnread={isManualUnread}
            />
            }
        </View>
    );
};

export default PostList;
