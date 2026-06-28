// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import AgentPost from '@agents/components/agent_post';
import {isAgentPost} from '@agents/utils';
import Clipboard from '@react-native-clipboard/clipboard';
import React, {type ReactNode, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {Alert, DeviceEventEmitter, Platform, type GestureResponderEvent, type StyleProp, TouchableOpacity, View, type ViewStyle} from 'react-native';

import {updateDraftMessage} from '@actions/local/draft';
import {removePost} from '@actions/local/post';
import {showPermalink} from '@actions/remote/permalink';
import {deletePost} from '@actions/remote/post';
import {fetchAndSwitchToThread} from '@actions/remote/thread';
import CallsCustomMessage from '@calls/components/calls_custom_message';
import {isCallsCustomMessage} from '@calls/utils';
import UnrevealedBurnOnReadPost from '@components/post_list/post/burn_on_read/unrevealed';
import SystemAvatar from '@components/system_avatar';
import SystemHeader from '@components/system_header';
import {Events, General} from '@constants';
import {POST_TIME_TO_FAIL, PostPriorityType} from '@constants/post';
import * as Screens from '@constants/screens';
import {useHideExtraKeyboardIfNeeded} from '@context/extra_keyboard';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import PerformanceMetricsManager from '@managers/performance_metrics_manager';
import {dismissOverlay, showModal, showOverlay} from '@screens/navigation';
import {isBoRPost, isUnrevealedBoRPost} from '@utils/bor';
import {hasJumboEmojiOnly} from '@utils/emoji/helpers';
import {fromAutoResponder, isFromWebhook, isInvalidEphemeralTipPost, isPostFailed, isPostPendingOrFailed, isSystemMessage} from '@utils/post';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';

import Avatar from './avatar';
import Body from './body';
import Footer from './footer';
import Header from './header';
import InvalidEphemeralTip from './invalid_ephemeral_tip';
import PostOptionsPopover from './post_options_popover';
import PreHeader from './pre_header';
import SystemMessage from './system_message';
import UnreadDot from './unread_dot';

import type ChannelModel from '@typings/database/models/servers/channel';
import type PostModel from '@typings/database/models/servers/post';
import type ThreadModel from '@typings/database/models/servers/thread';
import type UserModel from '@typings/database/models/servers/user';
import type {SearchPattern} from '@typings/global/markdown';
import type {AvailableScreens} from '@typings/screens/navigation';

type PostProps = {
    appsEnabled: boolean;
    canDelete: boolean;
    canEdit: boolean;
    currentUser?: UserModel;
    author?: UserModel;
    channel?: ChannelModel;
    customEmojiNames: string[];
    differentThreadSequence: boolean;
    hasFiles: boolean;
    hasReplies: boolean;
    highlight?: boolean;
    highlightPinnedOrSaved?: boolean;
    highlightReplyBar: boolean;
    isConsecutivePost?: boolean;
    isCRTEnabled?: boolean;
    isEphemeral: boolean;
    isFirstReply?: boolean;
    isPostAcknowledgementEnabled?: boolean;
    isSaved?: boolean;
    isLastReply?: boolean;
    isPostAddChannelMember: boolean;
    isPostPriorityEnabled: boolean;
    location: AvailableScreens;
    post: PostModel;
    rootId?: string;
    previousPost?: PostModel;
    isLastPost: boolean;
    hasReactions: boolean;
    searchPatterns?: SearchPattern[];
    shouldRenderReplyButton?: boolean;
    showAddReaction?: boolean;
    skipSavedHeader?: boolean;
    skipPinnedHeader?: boolean;
    style?: StyleProp<ViewStyle>;
    testID?: string;
    thread?: ThreadModel;
};

const POST_RECALL_TIME_LIMIT_MS = 2 * 60 * 1000;

const useWeChatStyle = (location: AvailableScreens) =>
    location === Screens.CHANNEL || location === Screens.PERMALINK;

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => {
    return {
        consecutive: {marginTop: 0},
        consecutivePostContainer: {
            marginBottom: 10,
            marginRight: 10,
            marginLeft: Platform.select({ios: 34, android: 33}),
            marginTop: 10,
        },
        container: {flexDirection: 'row'},

        /** 微信风格：头像与名字顶部对齐 */
        containerWeChatAlign: {
            alignItems: 'flex-start',
        },
        containerOwn: {
            flexDirection: 'row',
            justifyContent: 'flex-end',
        },
        containerSystem: {
            flexDirection: 'row',
            justifyContent: 'center',
        },
        highlight: {backgroundColor: changeOpacity(theme.mentionHighlightBg, 0.5)},
        highlightBar: {
            backgroundColor: theme.mentionHighlightBg,
            opacity: 1,
        },
        highlightPinnedOrSaved: {
            backgroundColor: changeOpacity(theme.mentionHighlightBg, 0.2),
        },
        pendingPost: {opacity: 0.5},
        postContent: {paddingHorizontal: 16},

        /** 微信居中系统消息：触摸区占满行宽以便子级居中 */
        postContentSystemCentered: {
            alignSelf: 'stretch',
        },

        /** 微信风格：触摸区域仅限气泡+头像，空白处不触发 */
        postContentOwnWeChat: {alignSelf: 'flex-end'},
        postContentOthersWeChat: {alignSelf: 'flex-start'},
        postStyle: {
            overflow: 'hidden',
            flex: 1,
        },

        /**
         * 微信消息行高度必须随内容收缩。根样式 flex:1 会让每条 Cell 在父级中纵向撑满，
         * 出现绿气泡占半屏、左侧白条等异常。
         */
        postStyleWeChatNoFlex: {
            flex: 0,
            flexGrow: 0,
            flexShrink: 1,
        },

        /** 微信：避免根容器 overflow:hidden 二次裁切气泡内已测量的正文高度 */
        postStyleWeChatOverflow: {
            overflow: 'visible',
        },

        /** 微信风格：每条消息间距略大，便于扫读 */
        postStyleWeChatSpacing: {
            marginBottom: 20,
        },

        /** 微信居中系统消息：间距略紧，避免与日期分隔条重复留白 */
        postStyleWeChatSystemSpacing: {
            marginBottom: 8,
        },
        profilePictureContainer: {
            marginBottom: 4,
            marginRight: 10,
            marginTop: 6,
        },

        /** 微信风格：相对昵称/时间行略下移；头像与右侧昵称/气泡略收紧，减少「悬空」缝 */
        profilePictureContainerWeChat: {
            marginTop: 4,
            alignSelf: 'flex-start',
            marginRight: 6,
        },
        profilePictureContainerOwn: {
            marginBottom: 4,
            marginLeft: 4,
            marginRight: 0,
            marginTop: 6,
        },

        /** 微信本人：气泡三角与头像之间留出空隙，避免尾巴贴头像 */
        profilePictureContainerOwnWeChat: {
            marginTop: 4,
            marginLeft: 12,
        },

        /** 仅头像行（私聊等）：气泡与头像顶对齐，去掉昵称行预留的 marginTop */
        profilePictureContainerWeChatAvatarOnly: {
            marginTop: 0,
        },
        rightColumn: {
            flex: 1,
            flexDirection: 'column',
        },

        /** Own WeChat row: do not flex-grow — only as wide as the bubble, packed to the right with the avatar. */
        rightColumnOwnSizing: {
            flexGrow: 0,
            flexShrink: 0,
            maxWidth: '90%',
            flexDirection: 'column',
        },

        /** 微信他人消息：右栏随内容收缩，避免整行空白可点 */
        rightColumnOthersWeChat: {
            flexGrow: 0,
            flexShrink: 1,
            maxWidth: '90%',
            flexDirection: 'column',
        },
        rightColumnOwn: {
            alignItems: 'flex-end',
        },
        /**
         * 微信居中系统消息：右栏必须占满行宽，否则子级 flex:1 的文案区宽度为 0，
         * 公告卡片会塌成「竖线 + 喇叭」。
         */
        rightColumnSystem: {
            flex: 1,
            alignSelf: 'stretch',
            minWidth: 0,
            maxWidth: '100%',
        },
        rightColumnPadding: {paddingBottom: 3},
    };
});

const Post = ({
    appsEnabled,
    canDelete,
    canEdit,
    author,
    channel,
    currentUser,
    customEmojiNames,
    differentThreadSequence,
    hasFiles,
    hasReplies,
    highlight,
    highlightPinnedOrSaved = true,
    highlightReplyBar,
    isCRTEnabled,
    isConsecutivePost,
    isEphemeral,
    isFirstReply,
    isSaved,
    isLastReply,
    isPostAcknowledgementEnabled,
    isPostAddChannelMember,
    location,
    post,
    rootId,
    hasReactions,
    searchPatterns,
    shouldRenderReplyButton,
    skipSavedHeader,
    skipPinnedHeader,
    showAddReaction = true,
    style,
    testID,
    thread,
    previousPost,
    isLastPost,
}: PostProps) => {
    const pressDetected = useRef(false);
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const isAutoResponder = fromAutoResponder(post);
    const isPendingOrFailed = isPostPendingOrFailed(post);
    const isFailed = isPostFailed(post);
    const isSystemPost = isSystemMessage(post);
    const isCallsPost = isCallsCustomMessage(post);
    const borPost = isBoRPost(post);
    const isUnrevealedPost = isUnrevealedBoRPost(post);
    const isOwnPost = Boolean(currentUser && post.userId === currentUser.id);
    const isAgentPostType = isAgentPost(post);
    const hasBeenDeleted = (post.deleteAt !== 0);
    const isWebHook = isFromWebhook(post);
    const hasSameRoot = useMemo(() => {
        if (isFirstReply) {
            return false;
        } else if (!post.rootId && !previousPost?.rootId && isConsecutivePost) {
            return true;
        } else if (post.rootId) {
            return true;
        }

        return false;
    }, [isConsecutivePost, post, previousPost, isFirstReply]);
    const isJumboEmoji = useMemo(() => {
        if (post.message.length && !(/^\s{4}/).test(post.message)) {
            return hasJumboEmojiOnly(post.message, customEmojiNames);
        }
        return false;
    }, [customEmojiNames, post.message]);

    const handlePostPress = useCallback(() => {
        if (location === Screens.PINNED_MESSAGES) {
            showPermalink(serverUrl, '', post.id);
            return;
        }

        const isValidSystemMessage = isAutoResponder || !isSystemPost;
        if (isEphemeral || hasBeenDeleted) {
            removePost(serverUrl, post);
        }

        setTimeout(() => {
            pressDetected.current = false;
        }, 300);
    }, [location, isAutoResponder, isSystemPost, isEphemeral, hasBeenDeleted, serverUrl, post]);

    const handlePress = useHideExtraKeyboardIfNeeded(() => {
        pressDetected.current = true;

        if (post) {
            setTimeout(handlePostPress, 300);
        }
    }, [handlePostPress, post]);

    const showPostOptions = useCallback((event?: GestureResponderEvent) => {
        if (!post) {
            return;
        }

        if (isSystemPost && (!canDelete || hasBeenDeleted)) {
            return;
        }

        if (isPendingOrFailed || isEphemeral) {
            return;
        }

        const overlayId = `post-options-popover-${post.id}-${Date.now()}`;
        const textMessage = post.messageSource || post.message;
        const within2MinFromCreateAt = (post.createAt + POST_RECALL_TIME_LIMIT_MS) > Date.now();
        const isRecallInferred = post.deleteAt >= post.createAt && (post.deleteAt - post.createAt) <= POST_RECALL_TIME_LIMIT_MS;
        const x = event?.nativeEvent.pageX ?? 0;
        const y = event?.nativeEvent.pageY ?? 0;
        const canQuote = !isSystemPost && !hasBeenDeleted;
        const canWithdrawPost = isOwnPost && !hasBeenDeleted && canDelete && within2MinFromCreateAt;
        const canRecallEditPost = isOwnPost && isRecallInferred && within2MinFromCreateAt && Boolean(textMessage) && !isSystemPost;
        const canCopyText = Boolean(textMessage) && !borPost;

        const closePopover = () => dismissOverlay(overlayId);
        const closeAndRun = (action: () => void | Promise<void>) => {
            return () => {
                closePopover().finally(() => {
                    void action();
                });
            };
        };

        const items: Array<{key: string; label: string; iconName: string; destructive?: boolean; onPress: () => void}> = [];
        if (canQuote) {
            items.push({
                key: 'quote',
                label: intl.formatMessage({id: 'mobile.post_info.quote', defaultMessage: 'Quote'}),
                iconName: 'format-quote-open',
                onPress: closeAndRun(async () => {
                    DeviceEventEmitter.emit(Events.POST_DRAFT_CLEAR_REPLY_ROOT);
                    DeviceEventEmitter.emit(Events.POST_DRAFT_SET_QUOTED_POST, {channelId: post.channelId, postId: post.id});
                    DeviceEventEmitter.emit(Events.POST_DRAFT_FOCUS, {location: Screens.CHANNEL, channelId: post.channelId});
                }),
            });
        }
        if (canRecallEditPost) {
            items.push({
                key: 'reedit',
                label: intl.formatMessage({id: 'mobile.post_info.reedit', defaultMessage: 'Re-edit'}),
                iconName: 'pencil',
                onPress: closeAndRun(async () => {
                    const draftRootId = post.rootId || '';
                    const message = textMessage;

                    if (draftRootId) {
                        DeviceEventEmitter.emit(Events.POST_DRAFT_SET_REPLY_ROOT, {channelId: post.channelId, rootId: draftRootId});
                    } else {
                        DeviceEventEmitter.emit(Events.POST_DRAFT_CLEAR_REPLY_ROOT);
                    }

                    await updateDraftMessage(serverUrl, post.channelId, draftRootId, message);

                    DeviceEventEmitter.emit(Events.POST_DRAFT_FOCUS, {location: Screens.CHANNEL, channelId: post.channelId});
                }),
            });
        }
        if (canCopyText) {
            items.push({
                key: 'copy_text',
                label: intl.formatMessage({id: 'mobile.post_info.copy_text', defaultMessage: 'Copy Text'}),
                iconName: 'content-copy',
                onPress: closeAndRun(() => Clipboard.setString(textMessage)),
            });
        }
        if (canWithdrawPost) {
            const withdrawText = intl.locale.startsWith('zh') ? '撤回' : 'Withdraw';
            items.push({
                key: 'withdraw',
                label: withdrawText,
                iconName: 'trash-can-outline',
                destructive: true,
                onPress: () => {
                    closePopover().finally(() => {
                        Alert.alert(
                            intl.formatMessage({id: 'mobile.post.delete_title', defaultMessage: 'Delete Post'}),
                            intl.formatMessage({id: 'mobile.post.delete_question', defaultMessage: 'Are you sure you want to delete this post?'}),
                            [{
                                text: intl.formatMessage({id: 'common.cancel', defaultMessage: 'Cancel'}),
                                style: 'cancel',
                            }, {
                                text: withdrawText,
                                style: 'destructive',
                                onPress: () => deletePost(serverUrl, post),
                            }],
                        );
                    });
                },
            });
        }

        if (!items.length) {
            return;
        }

        showOverlay(Screens.GENERIC_OVERLAY, {
            children: (
                <PostOptionsPopover
                    x={x}
                    y={y}
                    onClose={closePopover}
                    items={items}
                />
            ),
        }, {overlay: {interceptTouchOutside: false}}, overlayId);
    }, [
        borPost, canDelete, canEdit, hasBeenDeleted, intl, isEphemeral, isPendingOrFailed,
        isOwnPost, isSaved, isSystemPost, post, serverUrl,
    ]);

    const [, rerender] = useState(false);
    useEffect(() => {
        let t: NodeJS.Timeout|undefined;
        if (post.pendingPostId === post.id && !isFailed) {
            t = setTimeout(() => rerender(true), POST_TIME_TO_FAIL - (Date.now() - post.updateAt));
        }

        return () => {
            if (t) {
                clearTimeout(t);
            }
        };

    // eslint-disable-next-line react-hooks/exhaustive-deps -- Timer only needs to reset when post.id changes, not on other prop updates
    }, [post.id]);

    useEffect(() => {
        if (!isLastPost) {
            return;
        }

        if (location !== 'Channel' && location !== 'Thread') {
            return;
        }

        PerformanceMetricsManager.finishLoad(location === 'Thread' ? 'THREAD' : 'CHANNEL', serverUrl);
        PerformanceMetricsManager.endMetric('mobile_channel_switch', serverUrl);

    // eslint-disable-next-line react-hooks/exhaustive-deps -- Performance metrics should only run once on mount
    }, []);

    const highlightSaved = isSaved && !skipSavedHeader;
    const hightlightPinned = post.isPinned && !skipPinnedHeader;
    const itemTestID = `${testID}.${post.id}`;

    const weChatStyle = useWeChatStyle(location);
    const showInvalidTip = isInvalidEphemeralTipPost(post);
    const showSystemCentered = weChatStyle && isSystemPost && !isAutoResponder;
    const isDmChannel = channel?.type === General.DM_CHANNEL;

    /**
     * 语音转文字失败等 invalid ephemeral 仅推给操作者，但 post.userId 可能与 currentUser 不一致，
     * 不能依赖 isOwnPost。微信频道下一律按本人右侧行展示（与「你撤回了一条消息」一致）。
     */
    const invalidTipWeChatOwnRow = showInvalidTip && weChatStyle;

    /**
     * 自己发的消息：头像在右 + 隐藏名字（仅显示时间）
     */
    const showOwnLayout = (weChatStyle && isOwnPost && !isSystemPost) || invalidTipWeChatOwnRow;

    /**
     * 私聊对方消息：头像在左 + 隐藏名字（仅显示时间）
     */
    const hideNameInDm = weChatStyle && isDmChannel && !isOwnPost && !isSystemPost && !invalidTipWeChatOwnRow;

    /**
     * 系统消息居中：无头像、无系统名
     */
    // const useCenteredNoAvatarLayout = showSystemCentered;
    const useCenteredNoAvatarLayout = !invalidTipWeChatOwnRow && (showSystemCentered || (showInvalidTip && !weChatStyle));

    /**
     * 微信仅头像行：无昵称/时间头，气泡顶与头像顶对齐，箭头对准头像垂直中心
     */
    const weChatAvatarOnlyRow = weChatStyle && !isSystemPost && !invalidTipWeChatOwnRow && (hideNameInDm || showOwnLayout);

    const effectiveConsecutivePost = weChatStyle ? false : isConsecutivePost;

    const rightColumnStyle: StyleProp<ViewStyle> = [
        showOwnLayout ? styles.rightColumnOwnSizing : (
            weChatStyle && !useCenteredNoAvatarLayout ? styles.rightColumnOthersWeChat : styles.rightColumn
        ),
        (Boolean(post.rootId) && isLastReply && styles.rightColumnPadding),
        showOwnLayout && styles.rightColumnOwn,
        useCenteredNoAvatarLayout && styles.rightColumnSystem,
    ];
    const pendingPostStyle: StyleProp<ViewStyle> | undefined = isPendingOrFailed ? styles.pendingPost : undefined;

    let highlightedStyle: StyleProp<ViewStyle>;
    if (highlight) {
        highlightedStyle = styles.highlight;
    } else if ((highlightSaved || hightlightPinned) && highlightPinnedOrSaved) {
        highlightedStyle = styles.highlightPinnedOrSaved;
    }

    let header: ReactNode;
    let postAvatar: ReactNode;
    let consecutiveStyle: StyleProp<ViewStyle>;

    // If the post is a priority post:
    // 1. Show the priority label in channel screen
    // 2. Show the priority label in thread screen for the root post
    const showPostPriority = Boolean(
        post.metadata?.priority?.priority &&
        post.metadata.priority.priority !== PostPriorityType.STANDARD,
    );

    const sameSequence = hasReplies ? (hasReplies && post.rootId) : !post.rootId;
    if (!showPostPriority && hasSameRoot && effectiveConsecutivePost && sameSequence && !showOwnLayout && !useCenteredNoAvatarLayout) {
        consecutiveStyle = styles.consecutive;
        postAvatar = <View style={styles.consecutivePostContainer}/>;
    } else if (useCenteredNoAvatarLayout) {
        postAvatar = null;
    } else {
        const avatarContainerStyle = [
            showOwnLayout ? styles.profilePictureContainerOwn : styles.profilePictureContainer,
            weChatStyle && (showOwnLayout ? styles.profilePictureContainerOwnWeChat : styles.profilePictureContainerWeChat),
            weChatAvatarOnlyRow && styles.profilePictureContainerWeChatAvatarOnly,
        ];
        postAvatar = (
            <View style={[avatarContainerStyle, pendingPostStyle]}>
                {(isAutoResponder || isSystemPost) && !showOwnLayout ? (
                    <SystemAvatar theme={theme}/>
                ) : (
                    <Avatar
                        forcedAuthor={invalidTipWeChatOwnRow && currentUser ? currentUser : undefined}
                        isAutoReponse={isAutoResponder}
                        location={location}
                        post={post}
                        useRoundedSquare={weChatStyle}
                    />
                )}
            </View>
        );

        if (showOwnLayout) {
            header = (
                <Header
                    currentUser={currentUser}
                    differentThreadSequence={differentThreadSequence}
                    isAutoResponse={isAutoResponder}
                    isCRTEnabled={isCRTEnabled}
                    isEphemeral={isEphemeral}
                    isPendingOrFailed={isPendingOrFailed}
                    isSystemPost={isSystemPost}
                    isWebHook={isWebHook}
                    location={location}
                    post={post}
                    showPostPriority={showPostPriority}
                    shouldRenderReplyButton={shouldRenderReplyButton}
                    timeOnly={true}
                />
            );
        } else if (hideNameInDm) {
            header = null;
        } else if (isSystemPost && !isAutoResponder && !useCenteredNoAvatarLayout) {
            header = (
                <SystemHeader
                    createAt={post.createAt}
                    theme={theme}
                    isEphemeral={isEphemeral}
                />
            );
        } else if (showSystemCentered) {
            // 系统消息居中：不显示 header（系统名/头像）
            header = null;
        } else {
            header = (
                <Header
                    alignWithAvatar={weChatStyle}
                    currentUser={currentUser}
                    differentThreadSequence={differentThreadSequence}
                    isAutoResponse={isAutoResponder}
                    isCRTEnabled={isCRTEnabled}
                    isEphemeral={isEphemeral}
                    isPendingOrFailed={isPendingOrFailed}
                    isSystemPost={isSystemPost}
                    isWebHook={isWebHook}
                    location={location}
                    post={post}
                    showPostPriority={showPostPriority}
                    shouldRenderReplyButton={shouldRenderReplyButton}
                />
            );
        }
    }

    let body;
    if (showInvalidTip) {
        body = (
            <InvalidEphemeralTip
                location={location}
                post={post}
                weChatOwnRightAlign={invalidTipWeChatOwnRow}
            />
        );
    } else if (isSystemPost && !isEphemeral && !isAutoResponder) {
        body = (
            <SystemMessage
                compact={showSystemCentered}
                location={location}
                post={post}
            />
        );
    } else if (isCallsPost && !hasBeenDeleted) {
        body = (
            <CallsCustomMessage
                serverUrl={serverUrl}
                post={post}

                // Note: the below are provided by the index, but typescript seems to be having problems.
                otherParticipants={false}
                isAdmin={false}
                isHost={false}
                joiningChannelId={null}
            />
        );
    } else if (isUnrevealedPost && !isOwnPost) {
        body = (
            <UnrevealedBurnOnReadPost post={post}/>
        );
    } else if (isAgentPostType && !hasBeenDeleted) {
        body = (
            <AgentPost
                post={post}
                currentUserId={currentUser?.id}
                location={location}
            />
        );
    } else {
        body = (
            <Body
                appsEnabled={appsEnabled}
                author={author}
                hasFiles={hasFiles}
                hasReactions={hasReactions}
                highlight={Boolean(highlightedStyle)}
                highlightReplyBar={highlightReplyBar}
                isCRTEnabled={isCRTEnabled}
                isEphemeral={isEphemeral}
                isFirstReply={isFirstReply}
                isJumboEmoji={isJumboEmoji}
                isLastReply={isLastReply}
                isOwnPost={isOwnPost}
                isPendingOrFailed={isPendingOrFailed}
                isPostAcknowledgementEnabled={isPostAcknowledgementEnabled}
                isPostAddChannelMember={isPostAddChannelMember}
                location={location}
                post={post}
                searchPatterns={searchPatterns}
                showAddReaction={showAddReaction}
                theme={theme}
                weChatAvatarOnlyRow={weChatAvatarOnlyRow}
                onLongPress={showPostOptions}
            />
        );
    }

    let unreadDot;
    let footer;
    if (isCRTEnabled && thread && !(rootId && location === Screens.PERMALINK)) {
        if (thread.replyCount > 0 || thread.isFollowing) {
            footer = (
                <Footer
                    channelId={post.channelId}
                    location={location}
                    thread={thread}
                />
            );
        }
        if (thread.unreadMentions || thread.unreadReplies) {
            unreadDot = (
                <UnreadDot/>
            );
        }
    }

    const touchableStyle = [
        styles.postContent,
        useCenteredNoAvatarLayout && styles.postContentSystemCentered,
        weChatStyle && showOwnLayout && styles.postContentOwnWeChat,
        weChatStyle && !showOwnLayout && !useCenteredNoAvatarLayout && styles.postContentOthersWeChat,
        weChatStyle && !useCenteredNoAvatarLayout && {alignSelf: showOwnLayout ? 'flex-end' : 'flex-start'},
    ];

    return (
        <View
            testID={testID}
            style={[
                styles.postStyle,
                weChatStyle && styles.postStyleWeChatNoFlex,
                weChatStyle && styles.postStyleWeChatOverflow,
                weChatStyle && (useCenteredNoAvatarLayout ? styles.postStyleWeChatSystemSpacing : styles.postStyleWeChatSpacing),
                style,
                highlightedStyle,
            ]}
        >
            <PreHeader
                isConsecutivePost={effectiveConsecutivePost}
                isSaved={isSaved}
                isPinned={post.isPinned}
                skipSavedHeader={skipSavedHeader}
                skipPinnedHeader={skipPinnedHeader}
            />
            <TouchableOpacity
                testID={itemTestID}
                onPress={handlePress}
                onLongPress={showPostOptions}
                delayLongPress={200}
                activeOpacity={1}
                style={touchableStyle}
            >
                <View
                    style={[
                        styles.container,
                        consecutiveStyle,
                        showOwnLayout && styles.containerOwn,
                        showSystemCentered && styles.containerSystem,
                        weChatStyle && !useCenteredNoAvatarLayout && styles.containerWeChatAlign,
                    ]}
                >
                    {showOwnLayout ? (
                        <>
                            <View style={rightColumnStyle}>
                                {header}
                                {body}
                                {footer}
                            </View>
                            {postAvatar}
                            {unreadDot}
                        </>
                    ) : useCenteredNoAvatarLayout ? (
                        <View style={rightColumnStyle}>
                            {body}
                        </View>
                    ) : (
                        <>
                            {postAvatar}
                            <View style={rightColumnStyle}>
                                {header}
                                {body}
                                {footer}
                            </View>
                            {unreadDot}
                        </>
                    )}
                </View>
            </TouchableOpacity>
        </View>
    );
};

export default Post;
