// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {type ReactNode, useCallback, useMemo, useState} from 'react';
import {Dimensions, type LayoutChangeEvent, type StyleProp, StyleSheet, View, type ViewStyle} from 'react-native';
import tinyColor from 'tinycolor2';

import Files from '@components/files';
import FormattedText from '@components/formatted_text';
import JumboEmoji from '@components/jumbo_emoji';
import {Screens} from '@constants';
import {PostTypes} from '@constants/post';
import {THREAD} from '@constants/screens';
import StatusUpdatePost from '@playbooks/components/status_update_post';
import {PLAYBOOKS_UPDATE_STATUS_POST_TYPE} from '@playbooks/constants/plugin';
import {isEdited as postEdited, isPostFailed} from '@utils/post';
import {blendColors, makeStyleSheetFromTheme} from '@utils/theme';

import Acknowledgements from './acknowledgements';
import AddMembers from './add_members';
import Content from './content';
import Failed from './failed';
import Message from './message';
import Reactions from './reactions';

import type PostModel from '@typings/database/models/servers/post';
import type {SearchPattern} from '@typings/global/markdown';
import type {AvailableScreens} from '@typings/screens/navigation';

/** 三角与气泡上沿留白，避免负 margin 参与异常拉伸；略对齐头像侧 */
const WECHAT_BUBBLE_TAIL_MARGIN_TOP = 6;

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
    isPendingOrFailed: boolean;
    isPostAcknowledgementEnabled?: boolean;
    isPostAddChannelMember: boolean;
    location: AvailableScreens;
    post: PostModel;
    searchPatterns?: SearchPattern[];
    showAddReaction?: boolean;
    theme: Theme;
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
        // 纯媒体（自己发送）不画尾巴时，补一个与头像的安全间距，避免内容跑到头像下方。
        bubbleWithTailWrapperOwnMediaOnly: {
            marginRight: 52,
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
    };
});

const useWeChatStyle = (location: AvailableScreens) =>
    location === Screens.CHANNEL || location === Screens.PERMALINK || location === Screens.THREAD;

const Body = ({
    appsEnabled, hasFiles, hasReactions, highlight, highlightReplyBar,
    isCRTEnabled, isEphemeral, isFirstReply, isJumboEmoji, isLastReply, isOwnPost, isPendingOrFailed, isPostAcknowledgementEnabled, isPostAddChannelMember,
    location, post, searchPatterns, showAddReaction, theme,
}: BodyProps) => {
    const style = getStyleSheet(theme);
    const isEdited = postEdited(post);
    const isFailed = isPostFailed(post);
    const [layoutWidth, setLayoutWidth] = useState(0);
    const hasBeenDeleted = Boolean(post.deleteAt);
    let body;
    let message;

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
        if (location === Screens.SAVED_MESSAGES) {
            setLayoutWidth(e.nativeEvent.layout.width);
        }
    }, [location]);

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
    const hasTextMessage = Boolean(displayMessage.length || isEdited);
    const isMediaOnlyWeChat = weChatStyleActive && !hasBeenDeleted && hasFiles && !hasTextMessage && !hasContent;
    const showBubble = weChatStyleActive && !hasBeenDeleted;
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
        body = (
            <FormattedText
                style={style.message}
                id='post_body.deleted'
                defaultMessage='(message deleted)'
            />
        );
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
                {message}
                {hasContent &&
                <Content
                    isReplyPost={isReplyPost}
                    layoutWidth={weChatStyleActive ? weChatContentMaxWidth : layoutWidth}
                    location={location}
                    post={post}
                    theme={theme}
                />
                }
                {hasFiles && post.type !== PostTypes.CUSTOM_VOICE_ASR &&
                <Files
                    failed={isFailed}
                    layoutWidth={weChatStyleActive ? weChatContentMaxWidth : layoutWidth}
                    location={location}
                    post={post}
                    isReplyPost={isReplyPost}
                    isMediaOnlyMessage={isMediaOnlyWeChat}
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
                    isOwnPost && style.bubbleWithTailWrapperOwn,
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

    const content = (
        <>
            <View style={replyBarStyle}/>
            {bubbleSection}
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
                weChatStyleActive && isOwnPost ? style.messageRowOwnWeChat : style.messageContainerFullWidth,
            ]}
            onLayout={onLayout}
        >
            {content}
        </View>
    );
};

export default Body;
