// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useMemo} from 'react';
import {Platform, StyleSheet, useWindowDimensions, View} from 'react-native';
import tinyColor from 'tinycolor2';

import Markdown from '@components/markdown';
import {useTheme} from '@context/theme';
import {blendColors, changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {ensureString} from '@utils/types';

import type PostModel from '@typings/database/models/servers/post';
import type {AvailableScreens} from '@typings/screens/navigation';

type Props = {
    location: AvailableScreens;
    post: PostModel;

    /** 与微信本人行一致：右侧对齐、圆角提示条 */
    weChatOwnRightAlign?: boolean;
};

const getStyleSheet = makeStyleSheetFromTheme(() => ({
    wrapCard: {
        alignSelf: 'center',
        borderRadius: 8,
        paddingHorizontal: 14,
        paddingVertical: 12,
    },
    /**
     * 微信本人行：与右栏 column 同宽时，默认 alignItems:stretch 会把正文拉成「仅时间行」的宽度；
     * alignItems:flex-end；正文仍用 Markdown，段落走 paragraphShrinkWrapAlign 避免 row/wrap 错误折行。
     */
    wrapOwnRight: {
        alignSelf: 'flex-end',
        alignItems: 'flex-end',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    bodyText: {
        fontSize: 15,
        lineHeight: 20,
        ...Platform.select({
            android: {
                includeFontPadding: false,
            },
            default: {},
        }),
    },
}));

const InvalidEphemeralTip = ({location, post, weChatOwnRightAlign = false}: Props) => {
    const theme = useTheme();
    const {width: windowWidth} = useWindowDimensions();
    const sheet = getStyleSheet(theme);

    /** 像素上限避免百分比相对链路过窄；预留左右 padding、头像与间距 */
    const maxWidthPx = useMemo(
        () => Math.min(windowWidth * 0.88, windowWidth - 88),
        [windowWidth],
    );

    /** 转换失败类提示：与频道白气泡区分，用 error 色系弱填充 */
    const {tipBg, tipBorder} = useMemo(() => {
        const isLightTheme = tinyColor(theme.centerChannelBg).isLight();
        const err = theme.errorTextColor;
        const bg = isLightTheme ?
            blendColors(theme.centerChannelBg, err, 0.18, true) :
            blendColors(theme.centerChannelBg, err, 0.32, true);
        const border = isLightTheme ?
            blendColors(bg, err, 0.5, true) :
            blendColors(bg, err, 0.55, true);
        return {tipBg: bg, tipBorder: border};
    }, [theme.centerChannelBg, theme.errorTextColor]);

    const cardStyle = useMemo(() => {
        const bubble = {
            backgroundColor: tipBg,
            borderWidth: StyleSheet.hairlineWidth * 2,
            borderColor: tipBorder,
            maxWidth: maxWidthPx,
        };
        if (weChatOwnRightAlign) {
            return [sheet.wrapOwnRight, bubble];
        }
        return [sheet.wrapCard, bubble];
    }, [maxWidthPx, sheet.wrapCard, sheet.wrapOwnRight, tipBg, tipBorder, weChatOwnRightAlign]);

    const messageText = (post.message || post.messageSource || '').trim();
    const reason = ensureString(post.props?.invalid_reason).trim();
    const value = messageText || reason;

    const baseTextStyle = useMemo(() => {
        if (weChatOwnRightAlign) {
            return {
                ...sheet.bodyText,
                color: theme.centerChannelColor,
                textAlign: 'right' as const,
            };
        }
        return {
            ...sheet.bodyText,
            color: changeOpacity(theme.centerChannelColor, 0.85),
            textAlign: 'center' as const,
        };
    }, [sheet.bodyText, theme.centerChannelColor, weChatOwnRightAlign]);

    const baseParagraphStyle = useMemo(() => StyleSheet.flatten(baseTextStyle), [baseTextStyle]);

    return (
        <View
            style={cardStyle}
            testID='post.invalid_ephemeral_tip'
        >
            <Markdown
                baseParagraphStyle={baseParagraphStyle}
                baseTextStyle={baseTextStyle}
                channelId={post.channelId}
                disableGallery={true}
                location={location}
                paragraphShrinkWrapAlign={weChatOwnRightAlign ? 'end' : 'center'}
                theme={theme}
                value={value}
            />
        </View>
    );
};

export default InvalidEphemeralTip;
