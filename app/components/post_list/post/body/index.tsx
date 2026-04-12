// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {type ReactNode, useCallback, useMemo, useState} from 'react';
import {Dimensions, type GestureResponderEvent, type LayoutChangeEvent, Pressable, type StyleProp, StyleSheet, Text, View, type ViewStyle} from 'react-native';
import tinyColor from 'tinycolor2';
import {DeviceEventEmitter} from 'react-native';

import {updateDraftMessage} from '@actions/local/draft';
import Files from '@components/files';
import FormattedText from '@components/formatted_text';
import JumboEmoji from '@components/jumbo_emoji';
import {Screens} from '@constants';
import {Events} from '@constants';
import {PostTypes} from '@constants/post';
import {THREAD} from '@constants/screens';
import StatusUpdatePost from '@playbooks/components/status_update_post';
import {PLAYBOOKS_UPDATE_STATUS_POST_TYPE} from '@playbooks/constants/plugin';
import {isEdited as postEdited, isPostFailed} from '@utils/post';
import {blendColors, makeStyleSheetFromTheme} from '@utils/theme';
import {useServerUrl} from '@context/server';

import Acknowledgements from './acknowledgements';
import AddMembers from './add_members';
import Content from './content';
import Failed from './failed';
import Message from './message';
import QuotedPostPreview from './quoted_post_preview';
import Reactions from './reactions';

import type PostModel from '@typings/database/models/servers/post';
import type UserModel from '@typings/database/models/servers/user';
import type {SearchPattern} from '@typings/global/markdown';
import type {AvailableScreens} from '@typings/screens/navigation';

/** 三角与气泡上沿留白，避免负 margin 参与异常拉伸；略对齐头像侧 */
const WECHAT_BUBBLE_TAIL_MARGIN_TOP = 6;

const POST_RECALL_TIME_LIMIT_MS = 2 * 60 * 1000;

type BodyProps = {
    appsEnabled: boolean;
    hasFiles: boolean;
    hasReactions: boolean;
    highlight: boolean;
    highlightReplyBar: boolean;
    isCRTEnabled?: boolean;
    isEphemeral: boolean;
    isFirstReply?: boolean;
    isJumboEmoji: boolean;
    isLastReply?: boolean;
    isOwnPost?: boolean;
    author?: UserModel;
    isPendingOrFailed: boolean;
    isPostAcknowledgementEnabled?: boolean;
    isPostAddChannelMember: boolean;
    location: AvailableScreens;
    post: PostModel;
    searchPatterns?: SearchPattern[];
    showAddReaction?: boolean;
    theme: Theme;
    onLongPress?: (event?: GestureResponderEvent) => void;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => {
    return {
        ackAndReactionsContainer: {
            flex: 1,
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignContent: 'flex-start',
            marginTop: 12,
        },
        ackAndReactionsOwnWeChat: {
            flex: 0,
            alignSelf: 'flex-end',
            justifyContent: 'flex-end',
        },
        bubble: {
            borderRadius: 12,
            maxWidth: '85%',
            overflow: 'hidden',
            paddingHorizontal: 12,
            paddingVertical: 8,
        },

        /** 微信风格：小圆角 5px；visible 避免与主文测量舍入叠加后裁切最后一行（配合 messageBodyWeChat 底边距） */
        bubbleWeChat: {
            borderRadius: 5,
            overflow: 'visible',
        },

        /** 微信风格：气泡+尾巴容器；alignItems 避免子项在交叉轴被 stretch 拉高 */
        bubbleWithTailWrapper: {
            flexDirection: 'row',
            alignSelf: 'flex-start',
            alignItems: 'flex-start',
        },
        bubbleWithTailWrapperOwn: {
            alignSelf: 'flex-end',
            alignItems: 'flex-start',
        },

        // 纯附件（自己发送）：与右侧时间、头像列对齐，避免与头像之间留出大块空白。
        bubbleWithTailWrapperOwnMediaOnly: {
            alignSelf: 'flex-end',
            marginLeft: 0,
            marginRight: 0,
            maxWidth: '100%',
        },

        /** 气泡三角尾巴：向左指（他人消息） */
        bubbleTailLeft: {
            width: 0,
            height: 0,
            borderTopWidth: 5,
            borderBottomWidth: 5,
            borderRightWidth: 6,
            borderTopColor: 'transparent',
            borderBottomColor: 'transparent',
            marginRight: -1,
            marginTop: WECHAT_BUBBLE_TAIL_MARGIN_TOP,
        },

        /** 气泡三角尾巴：向右指（本人消息），borderLeftColor 需动态传入 */
        bubbleTailRight: {
            width: 0,
            height: 0,
            borderLeftWidth: 6,
            borderTopWidth: 5,
            borderBottomWidth: 5,
            borderTopColor: 'transparent',
            borderBottomColor: 'transparent',
            marginLeft: -1,
            marginTop: WECHAT_BUBBLE_TAIL_MARGIN_TOP,
        },

        /** Own messages: width capped by bubbleWithTailWrapper maxWidth — WeChat-style. Right alignment uses bubbleWithTailWrapperOwn only. */
        bubbleOwnWeChat: {
            maxWidth: '100%',
        },

        /** Others' messages: inner bubble fills wrapper (wrapper limits screen width). */
        bubbleOthersWeChat: {
            maxWidth: '100%',
        },
        messageBody: {
            paddingVertical: 2,
            flex: 1,
        },

        /** WeChat: same body wrapper for own and others (others path was the stable baseline). */
        messageBodyWeChat: {
            flex: 0,
            alignSelf: 'stretch',
            paddingBottom: 4,
        },

        // 纯媒体消息（仅图片/视频）不需要气泡内边距，避免出现微信里没有的大面积填充色。
        messageBodyMediaOnlyWeChat: {
            paddingVertical: 0,
            paddingBottom: 0,
        },
        messageContainer: {width: '100%'},
        replyBar: {
            backgroundColor: theme.centerChannelColor,
            opacity: 0.1,
            marginLeft: 1,
            marginRight: 7,
            width: 3,
            flexBasis: 3,
        },
        replyBarFirst: {paddingTop: 10},
        replyBarLast: {paddingBottom: 10},
        replyMention: {
            backgroundColor: theme.mentionHighlightBg,
            opacity: 1,
        },
        message: {
            color: theme.centerChannelColor,
            fontSize: 15,
            lineHeight: 20,
        },
        messageContainerWithReplyBar: {
            flexDirection: 'row',
        },
        messageContainerFullWidth: {
            width: '100%',
        },
        messageRowOwnWeChat: {
            alignSelf: 'flex-end',
            maxWidth: '100%',
        },
        messageRowOwnWeChatMediaOnly: {
            alignSelf: 'flex-end',
            maxWidth: '100%',
        },
    };
});

const useWeChatStyle = (location: AvailableScreens) =>
    location === Screens.CHANNEL || location === Screens.PERMALINK;

const Body = ({
    appsEnabled, hasFiles, hasReactions, highlight, highlightReplyBar,
    isCRTEnabled, isEphemeral, isFirstReply, isJumboEmoji, isLastReply, isOwnPost, author, isPendingOrFailed, isPostAcknowledgementEnabled, isPostAddChannelMember,
    location, post, searchPatterns, showAddReaction, theme, onLongPress,
}: BodyProps) => {
    const style = getStyleSheet(theme);
    const isEdited = postEdited(post);
    const isFailed = isPostFailed(post);
    const [layoutWidth, setLayoutWidth] = useState(0);
    const hasBeenDeleted = Boolean(post.deleteAt);
    const serverUrl = useServerUrl();
    let body;
    let message;

    /**
     * 处理重新编辑按钮点击
     * 将撤回的消息内容重新填充到输入框
     */
    const handleReedit = useCallback(async () => {
        const draftRootId = post.rootId || '';
        const textMessage = post.messageSource || post.message;

        if (draftRootId) {
            DeviceEventEmitter.emit(Events.POST_DRAFT_SET_REPLY_ROOT, {channelId: post.channelId, rootId: draftRootId});
        } else {
            DeviceEventEmitter.emit(Events.POST_DRAFT_CLEAR_REPLY_ROOT);
        }

        await updateDraftMessage(serverUrl, post.channelId, draftRootId, textMessage);

        DeviceEventEmitter.emit(Events.POST_DRAFT_FOCUS, {location: Screens.CHANNEL, channelId: post.channelId});
    }, [post.channelId, post.messageSource, post.rootId, post, serverUrl]);

    const nBindings = Array.isArray(post.props?.app_bindings) ? post.props?.app_bindings.length : 0;
    const nAttachments = Array.isArray(post.props?.attachments) ? post.props?.attachments.length : 0;

    const isReplyPost = Boolean(post.rootId && (!isEphemeral || !hasBeenDeleted) && location !== THREAD);
    const hasContent = Boolean((post.metadata?.embeds?.length || (appsEnabled && nBindings)) || nAttachments);

    const replyBarStyle = useMemo<StyleProp<ViewStyle>|undefined>(() => {
        if (!isReplyPost || (isCRTEnabled && location === Screens.PERMALINK)) {
            return undefined;
        }

        const barStyle: StyleProp<ViewStyle> = [style.replyBar];

        if (isFirstReply) {
            barStyle.push(style.replyBarFirst);
        }

        if (isLastReply) {
            barStyle.push(style.replyBarLast);
        }

        if (highlightReplyBar) {
            barStyle.push(style.replyMention);
        }

        return barStyle;
    }, [highlightReplyBar, isCRTEnabled, isFirstReply, isLastReply, isReplyPost, location, style]);

    const onLayout = useCallback((e: LayoutChangeEvent) => {
        setLayoutWidth(e.nativeEvent.layout.width);
    }, []);

    const weChatStyleActive = useWeChatStyle(location);
    const weChatBubbleMaxWidth = useMemo(() => Dimensions.get('window').width * 0.86, []);
    const weChatContentMaxWidth = useMemo(() => {
        return Math.floor(weChatBubbleMaxWidth - 24);
    }, [weChatBubbleMaxWidth]);
    const chatBubbleSurface = useMemo(() => {
        if (!weChatStyleActive) {
            return null;
        }
        const isLightTheme = tinyColor(theme.centerChannelBg).isLight();

        // 主题自适应：弱化高饱和块状色，让气泡与主界面更融合（深色主题尤为明显）。
        const ownBg = isLightTheme ?
            blendColors(theme.centerChannelBg, theme.buttonBg, 0.38, true) :
            blendColors(theme.centerChannelBg, theme.buttonBg, 0.3, true);
        const othersBg = isLightTheme ?
            blendColors(theme.centerChannelBg, '#FFFFFF', 0.72, true) :
            blendColors(theme.centerChannelBg, '#FFFFFF', 0.1, true);
        const border = isLightTheme ?
            blendColors(othersBg, theme.centerChannelColor, 0.16, true) :
            blendColors(othersBg, '#FFFFFF', 0.14, true);
        const ownText = tinyColor(ownBg).isDark() ? '#FFFFFF' : theme.centerChannelColor;

        return {
            ownBg,
            othersBg,
            border,
            ownText,
        };
    }, [theme, weChatStyleActive]);

    const displayMessage = post.message || post.messageSource;
    const quotedPostId = post.props?.quoted_post_id;
    const hasTextMessage = Boolean(displayMessage.length || isEdited);
    const isMediaOnlyWeChat = weChatStyleActive && !hasBeenDeleted && hasFiles && !hasTextMessage && !hasContent;
    const showBubble = weChatStyleActive && !hasBeenDeleted;

    /** WeChat 本人消息：附件区宽度与右对齐气泡一致（左右 padding + 头像列约 50）。 */
    const filesLayoutWidth = useMemo(() => {
        const w = Dimensions.get('window').width;
        if (weChatStyleActive && hasFiles) {
            return Math.max(200, Math.floor(w - 32 - 50));
        }
        if (weChatStyleActive) {
            return weChatContentMaxWidth;
        }
        return layoutWidth;
    }, [weChatStyleActive, hasFiles, weChatContentMaxWidth, layoutWidth]);
    const bubbleStyle = useMemo(() => {
        if (!showBubble || !chatBubbleSurface) {
            return undefined;
        }
        if (isMediaOnlyWeChat) {
            return [style.bubble, style.bubbleWeChat, {
                backgroundColor: 'transparent',
                borderWidth: 0,
                paddingHorizontal: 0,
                paddingVertical: 0,
            }];
        }
        const base = [style.bubble, style.bubbleWeChat];
        if (isOwnPost) {
            return [...base, style.bubbleOwnWeChat, {backgroundColor: chatBubbleSurface.ownBg, borderTopRightRadius: 0}];
        }
        return [...base, style.bubbleOthersWeChat, {
            backgroundColor: chatBubbleSurface.othersBg,
            borderWidth: StyleSheet.hairlineWidth * 2,
            borderColor: chatBubbleSurface.border,
            borderTopLeftRadius: 0,
        }];
    }, [showBubble, chatBubbleSurface, isMediaOnlyWeChat, isOwnPost, style.bubble, style.bubbleOwnWeChat, style.bubbleOthersWeChat, style.bubbleWeChat]);

    if (hasBeenDeleted) {
        const isRecallInferred = post.deleteAt >= post.createAt && (post.deleteAt - post.createAt) <= POST_RECALL_TIME_LIMIT_MS;
        const within2MinFromCreateAt = (post.createAt + POST_RECALL_TIME_LIMIT_MS) > Date.now();
        const textMessage = post.messageSource || post.message;
        const canRecallEditPost = isOwnPost && isRecallInferred && within2MinFromCreateAt && Boolean(textMessage);
        
        if (isRecallInferred) {
            if (isOwnPost) {
                body = (
                    <View style={{flexDirection: 'row', alignItems: 'center'}}>
                        <FormattedText
                            style={style.message}
                            id='mobile.post_body.recalled_self'
                            defaultMessage='你撤回了一条消息'
                        />
                        {canRecallEditPost && (
                            <Pressable onPress={handleReedit}>
                                <Text style={[style.message, {color: theme.buttonBg, marginLeft: 8}]}>
                                    重新编辑
                                </Text>
                            </Pressable>
                        )}
                    </View>
                );
            } else {
                const rawUsername = author?.username || '';
                let username = '';
                if (rawUsername) {
                    username = rawUsername.startsWith('@') ? rawUsername : `@${rawUsername}`;
                }
                body = (
                    <FormattedText
                        style={style.message}
                        id='mobile.post_body.recalled_other'
                        defaultMessage='{username}撤回了一条消息'
                        values={{username}}
                    />
                );
            }
        } else {
            body = (
                <FormattedText
                    style={style.message}
                    id='post_body.deleted'
                    defaultMessage='(message deleted)'
                />
            );
        }
    } else if (post.type === PLAYBOOKS_UPDATE_STATUS_POST_TYPE && post.props != null) {
        message = (
            <StatusUpdatePost
                location={location}
                post={post}
                theme={theme}
            />
        );
    } else if (isPostAddChannelMember) {
        message = (
            <AddMembers
                location={location}
                post={post}
                theme={theme}
            />
        );
    } else if (isJumboEmoji) {
        const weChatOwnBubble = weChatStyleActive && isOwnPost;
        message = (
            <JumboEmoji
                baseTextStyle={weChatOwnBubble && chatBubbleSurface ? [style.message, {color: chatBubbleSurface.ownText}] : style.message}
                compactWeChat={weChatStyleActive}
                isEdited={isEdited}
                value={post.message}
            />
        );
    } else if (displayMessage.length || isEdited) { // isEdited is added to handle the case where the post is edited and the message is empty
        const weChatOwnBubble = weChatStyleActive && isOwnPost;
        message = (
            <Message
                baseTextStyle={weChatOwnBubble && chatBubbleSurface ? [style.message, {color: chatBubbleSurface.ownText}] : undefined}
                highlight={highlight}
                isEdited={isEdited}
                isPendingOrFailed={isPendingOrFailed}
                isReplyPost={isReplyPost}
                layoutWidth={layoutWidth}
                location={location}
                post={post}
                searchPatterns={searchPatterns}
                theme={theme}
                unboundedMarkdownHeight={weChatStyleActive}
                value={displayMessage}
            />
        );
    }

    const acknowledgementsVisible = isPostAcknowledgementEnabled && post.metadata?.priority?.requested_ack;
    const reactionsVisible = hasReactions && showAddReaction;
    if (!hasBeenDeleted) {
        body = (
            <View
                style={[
                    style.messageBody,
                    weChatStyleActive && style.messageBodyWeChat,
                    isMediaOnlyWeChat && style.messageBodyMediaOnlyWeChat,
                ]}
            >
                {Boolean(quotedPostId) && (
                    <QuotedPostPreview
                        quotedPostId={quotedPostId}
                        channelId={post.channelId}
                        location={location}
                        isOwnPost={isOwnPost}
                    />
                )}
                {message}
                {hasContent &&
                <Content
                    isReplyPost={isReplyPost}
                    layoutWidth={weChatStyleActive ? weChatContentMaxWidth : layoutWidth}
                    location={location}
                    onLongPress={onLongPress}
                    post={post}
                    theme={theme}
                />
                }
                {hasFiles && post.type !== PostTypes.CUSTOM_VOICE_ASR &&
                <Files
                    failed={isFailed}
                    layoutWidth={filesLayoutWidth > 0 ? filesLayoutWidth : undefined}
                    location={location}
                    post={post}
                    isReplyPost={isReplyPost}
                    isMediaOnlyMessage={isMediaOnlyWeChat}
                    shrinkWrapNonImage={weChatStyleActive}
                />
                }
                {(acknowledgementsVisible || reactionsVisible) && (
                    <View style={[style.ackAndReactionsContainer, weChatStyleActive && isOwnPost && style.ackAndReactionsOwnWeChat]}>
                        {acknowledgementsVisible && (
                            <Acknowledgements
                                hasReactions={hasReactions}
                                location={location}
                                post={post}
                                theme={theme}
                            />
                        )}
                        {reactionsVisible && (
                            <Reactions
                                location={location}
                                post={post}
                                theme={theme}
                            />
                        )}
                    </View>
                )}
            </View>
        );
    }

    let bubbleSection: ReactNode;
    if (!bubbleStyle) {
        bubbleSection = body;
    } else if (weChatStyleActive && chatBubbleSurface) {
        bubbleSection = (
            <View
                style={[
                    style.bubbleWithTailWrapper,
                    isOwnPost && !isMediaOnlyWeChat && style.bubbleWithTailWrapperOwn,
                    isOwnPost && isMediaOnlyWeChat && style.bubbleWithTailWrapperOwnMediaOnly,
                    {maxWidth: weChatBubbleMaxWidth},
                ]}
            >
                {!isOwnPost && !isMediaOnlyWeChat && (
                    <View
                        style={[
                            style.bubbleTailLeft,
                            {borderRightColor: chatBubbleSurface.othersBg},
                        ]}
                    />
                )}
                <View style={bubbleStyle}>
                    {body}
                </View>
                {isOwnPost && !isMediaOnlyWeChat && (
                    <View
                        style={[
                            style.bubbleTailRight,
                            {borderLeftColor: chatBubbleSurface.ownBg},
                        ]}
                    />
                )}
            </View>
        );
    } else {
        bubbleSection = (
            <View style={bubbleStyle}>
                {body}
            </View>
        );
    }

    const bubbleContent = (
        <Pressable
            onLongPress={onLongPress}
            delayLongPress={200}
        >
            {bubbleSection}
        </Pressable>
    );

    const content = (
        <>
            <View style={replyBarStyle}/>
            {bubbleContent}
            {isFailed &&
            <Failed
                post={post}
                theme={theme}
            />
            }
        </>
    );

    return (
        <View
                style={[
                    style.messageContainerWithReplyBar,
                    weChatStyleActive && isOwnPost ?
                        (isMediaOnlyWeChat ? style.messageRowOwnWeChatMediaOnly : style.messageRowOwnWeChat) :
                        style.messageContainerFullWidth,
                ]}
            onLayout={onLayout}
        >
            {content}
        </View>
    );
};

export default Body;
