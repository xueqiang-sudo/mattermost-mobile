// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useMemo} from 'react';
import {useIntl} from 'react-intl';
import {Platform, Text, View} from 'react-native';

import {removePost} from '@actions/local/post';
import CompassIcon from '@components/compass_icon';
import FormattedText from '@components/formatted_text';
import FormattedTime from '@components/formatted_time';
import ExpiryTimer from '@components/post_list/post/header/expiry_timer';
import PostPriorityLabel from '@components/post_priority/post_priority_label';
import General from '@constants/general';
import {CHANNEL, PERMALINK, THREAD} from '@constants/screens';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {DEFAULT_LOCALE} from '@i18n';
import {isOwnBoRPost, isUnrevealedBoRPost} from '@utils/bor';
import {postUserDisplayName} from '@utils/post';
import {makeStyleSheetFromTheme} from '@utils/theme';
import {ensureString} from '@utils/types';
import {typography} from '@utils/typography';
import {getUserCustomStatus, getUserTimezone, isCustomStatusExpired, username2Nickname} from '@utils/user';
import {formatWeChatPostHeaderTime} from '@utils/wechat_message_time';

import HeaderCommentedOn from './commented_on';
import HeaderDisplayName from './display_name';
import HeaderReply from './reply';
import HeaderTag from './tag';

import type ChannelModel from '@typings/database/models/servers/channel';
import type PostModel from '@typings/database/models/servers/post';
import type UserModel from '@typings/database/models/servers/user';
import type {AvailableScreens} from '@typings/screens/navigation';

type HeaderProps = {

    /** 微信风格：名字与头像顶部对齐 */
    alignWithAvatar?: boolean;

    /** 微信风格：本人消息仅显示时间 */
    timeOnly?: boolean;

    /** 微信风格：本人消息昵称+时间行右对齐（与头像、气泡一致） */
    weChatAlignHeaderEnd?: boolean;
    author?: UserModel;
    commentCount: number;
    currentUser?: UserModel;
    enablePostUsernameOverride: boolean;
    isAutoResponse: boolean;
    isCRTEnabled?: boolean;
    isCustomStatusEnabled: boolean;
    isEphemeral: boolean;
    isMilitaryTime: boolean;
    isPendingOrFailed: boolean;
    isSystemPost: boolean;
    isWebHook: boolean;
    location: AvailableScreens;
    post: PostModel;
    rootPostAuthor?: UserModel;
    showPostPriority: boolean;
    shouldRenderReplyButton?: boolean;
    teammateNameDisplay: string;
    hideGuestTags: boolean;
    channel?: ChannelModel;
}

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => {
    return {
        container: {
            flex: 1,
            marginTop: 10,
        },

        /** 微信风格：覆盖 container 的 flex:1；与下方气泡略留间距（他人消息） */
        containerAlignAvatar: {
            marginTop: 0,
            marginBottom: 4,
            flex: 0,
            alignSelf: 'stretch',
        },
        pendingPost: {
            opacity: 0.5,
        },
        wrapper: {
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
        },
        timeOnlyWrapper: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
        },

        /** 微信风格：昵称、标签、时间与头像顶部齐平（横轴为顶对齐） */
        wrapperWeChat: {
            alignItems: 'center',
            flex: 0,
            flexShrink: 1,
            alignSelf: 'stretch',
        },

        /** 微信本人行：覆盖 containerAlignAvatar 的 stretch，与右栏对齐 */
        containerWeChatHeaderEnd: {
            alignSelf: 'flex-end',
        },

        /** 微信本人行：昵称与时间靠右排列 */
        wrapperWeChatHeaderEnd: {
            justifyContent: 'flex-end',
        },

        /** 微信风格：本人消息仅显示时间；与气泡间距略紧 */
        containerTimeOnly: {
            marginTop: 0,
            alignSelf: 'flex-end',
            minHeight: 20,
            flex: 0,
        },

        /** 私聊中对方消息：仅时间，左对齐；与他人昵称行一致略留空 */
        containerOthersDmTime: {
            marginTop: 0,
            marginBottom: 6,
            alignSelf: 'flex-start',
            flex: 0,
        },
        time: {
            color: theme.centerChannelColor,
            opacity: 0.5,
            ...typography('Body', 75, 'Regular'),
            ...Platform.select({
                android: {
                    includeFontPadding: false,
                },
                default: {},
            }),
        },

        /**
         * 微信相对时间：Body/75 默认 lineHeight 16，行框偏高易显得比头像低；
         * 略收紧行高（仍略大于字号，避免中文/英文裁切）。
         */
        timeWeChat: {
            lineHeight: 14,
            paddingTop: 0,
            paddingBottom: 0,
        },
        visibleToYou: {
            color: theme.centerChannelColor,
            opacity: 0.5,
            ...typography('Body', 75, 'Regular'),
        },
    };
});

const WECHAT_TIME_LOCATIONS = new Set<AvailableScreens>([CHANNEL, PERMALINK, THREAD]);

const Header = (props: HeaderProps) => {
    const {
        alignWithAvatar,
        author, channel, commentCount = 0, currentUser, enablePostUsernameOverride, isAutoResponse, isCRTEnabled, isCustomStatusEnabled,
        isEphemeral, isMilitaryTime, isPendingOrFailed, isSystemPost, isWebHook,
        location, post, rootPostAuthor, showPostPriority, shouldRenderReplyButton, teammateNameDisplay, hideGuestTags,
        timeOnly,
        weChatAlignHeaderEnd,
    } = props;
    const intl = useIntl();
    const theme = useTheme();
    const style = getStyleSheet(theme);
    const pendingPostStyle = isPendingOrFailed ? style.pendingPost : undefined;
    const isReplyPost = Boolean(post.rootId && !isEphemeral);
    const showReply = !isReplyPost && (location !== THREAD) && (shouldRenderReplyButton && (!rootPostAuthor && commentCount > 0));
    const displayName = postUserDisplayName(post, author, teammateNameDisplay, enablePostUsernameOverride);
    const rootAuthorDisplayName = rootPostAuthor ? username2Nickname(rootPostAuthor, {locale: currentUser?.locale}) : undefined;
    const customStatus = getUserCustomStatus(author);
    const showCustomStatusEmoji = Boolean(
        isCustomStatusEnabled && displayName && customStatus &&
        !(isSystemPost || author?.isBot || isAutoResponse || isWebHook),
    ) && !isCustomStatusExpired(author) && Boolean(customStatus?.emoji);
    const userIconOverride = ensureString(post.props?.override_icon_url);
    const usernameOverride = ensureString(post.props?.override_username);

    const isUnrevealedPost = useMemo(() => isUnrevealedBoRPost(post), [post, post.metadata?.expire_at]);
    const ownBoRPost = useMemo(() => isOwnBoRPost(post, currentUser), [currentUser, post]);
    const showBoRIcon = isUnrevealedPost || ownBoRPost;
    const borExpireAt = post.metadata?.expire_at;
    const serverUrl = useServerUrl();

    const onBoRPostExpiry = useCallback(async () => {
        await removePost(serverUrl, post);
    }, [post, serverUrl]);

    const useWeChatRelativeTime = WECHAT_TIME_LOCATIONS.has(location);
    const hideOthersNameInDm = Boolean(
        useWeChatRelativeTime &&
        alignWithAvatar &&
        channel?.type === General.DM_CHANNEL &&
        currentUser &&
        post.userId !== currentUser.id,
    );

    const timeEl = useWeChatRelativeTime ? (
        <Text
            style={[style.time, style.timeWeChat]}
            testID='post_header.date_time'
        >
            {formatWeChatPostHeaderTime(intl, post.createAt, getUserTimezone(currentUser), isMilitaryTime)}
        </Text>
    ) : (
        <FormattedTime
            timezone={getUserTimezone(currentUser)}
            isMilitaryTime={isMilitaryTime}
            value={post.createAt}
            style={style.time}
            testID='post_header.date_time'
        />
    );

    if (timeOnly) {
        return (
            <View style={[style.container, style.containerTimeOnly, pendingPostStyle]}>
                <View style={style.timeOnlyWrapper}>
                    {showPostPriority && post.metadata?.priority?.priority && (
                        <PostPriorityLabel
                            label={post.metadata.priority.priority}
                        />
                    )}
                    {timeEl}
                </View>
            </View>
        );
    }

    if (hideOthersNameInDm) {
        return (
            <View style={[style.container, style.containerOthersDmTime, pendingPostStyle]}>
                {timeEl}
            </View>
        );
    }

    return (
        <>
            <View
                style={[
                    style.container,
                    alignWithAvatar && style.containerAlignAvatar,
                    alignWithAvatar && weChatAlignHeaderEnd && style.containerWeChatHeaderEnd,
                    pendingPostStyle,
                ]}
            >
                <View
                    style={[
                        style.wrapper,
                        alignWithAvatar && style.wrapperWeChat,
                        alignWithAvatar && weChatAlignHeaderEnd && style.wrapperWeChatHeaderEnd,
                    ]}
                >
                    <HeaderDisplayName
                        channelId={post.channelId}
                        commentCount={commentCount}
                        displayName={displayName}
                        location={location}
                        wideDisplayName={Boolean(alignWithAvatar && useWeChatRelativeTime)}
                        rootPostAuthor={rootAuthorDisplayName}
                        shouldRenderReplyButton={shouldRenderReplyButton}
                        theme={theme}
                        userIconOverride={userIconOverride}
                        userId={post.userId}
                        usernameOverride={usernameOverride}
                        showCustomStatusEmoji={showCustomStatusEmoji}
                        customStatus={customStatus!}
                    />
                    {(!isSystemPost || isAutoResponse) &&
                    <HeaderTag
                        isAutoResponder={isAutoResponse}
                        isAutomation={isWebHook || author?.isBot}
                        showGuestTag={author?.isGuest && !hideGuestTags}
                    />
                    }
                    {showPostPriority && post.metadata?.priority?.priority && (
                        <PostPriorityLabel
                            label={post.metadata.priority.priority}
                        />
                    )}
                    {timeEl}
                    {isEphemeral && (
                        <FormattedText
                            id='post_header.visible_message'
                            defaultMessage='(Only visible to you)'
                            style={style.visibleToYou}
                            testID='post_header.visible_message'
                        />
                    )}
                    {showBoRIcon &&
                        <CompassIcon
                            name='fire'
                            size={16}
                            color={theme.dndIndicator}
                        />
                    }
                    {
                        !showBoRIcon && Boolean(borExpireAt) &&
                        <ExpiryTimer
                            expiryTime={borExpireAt as number}
                            onExpiry={onBoRPostExpiry}
                        />
                    }
                    {!isCRTEnabled && showReply && commentCount > 0 &&
                        <HeaderReply
                            commentCount={commentCount}
                            location={location}
                            post={post}
                            theme={theme}
                        />
                    }
                </View>
            </View>
            {Boolean(rootAuthorDisplayName) && location === CHANNEL &&
            <HeaderCommentedOn
                locale={currentUser?.locale || DEFAULT_LOCALE}
                name={rootAuthorDisplayName!}
                theme={theme}
            />
            }
        </>
    );
};

export default Header;
