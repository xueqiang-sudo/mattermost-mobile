// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useMemo} from 'react';
import {useIntl} from 'react-intl';
import {Platform, StyleSheet, Text, View} from 'react-native';

import CompassIcon from '@components/compass_icon';
import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

type Props = {
    channelId?: string;
    displayName: string;
    /** 企业默认公开群（town-square）等主群视觉标识 */
    isEnterpriseMainGroup?: boolean;
    isMuted?: boolean;
    isUnread?: boolean;
    size?: number;
    testID?: string;
};

const getStyleSheet = makeStyleSheetFromTheme(() => ({
    label: {
        ...typography('Body', 200, 'SemiBold'),
        fontSize: 16,
        lineHeight: 20,
    },
}));

function twoCharFromDisplayName(source: string): string {
    const t = source.trim();
    if (!t) {
        return '?';
    }
    const chars = Array.from(t);
    if (chars.length === 1) {
        return chars[0] ?? '?';
    }
    return `${chars[0] ?? '?'}${chars[1] ?? ''}`;
}

function variantFromSeed(seed: string): number {
    let h = 0;
    for (let i = 0; i < seed.length; i++) {
        h = ((h << 5) - h) + seed.charCodeAt(i);
        h |= 0;
    }
    return Math.abs(h) % 6;
}

function labelHasHan(label: string): boolean {
    return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(label);
}

/** 仅用主题语义色做底，白字 / 浅底字保证对比度 */
function swatchFromTheme(theme: Theme, v: number): {backgroundColor: string; color: string} {
    const swatches: {backgroundColor: string; color: string}[] = [
        {backgroundColor: theme.linkColor, color: theme.buttonColor},
        {backgroundColor: theme.buttonBg, color: theme.buttonColor},
        {backgroundColor: theme.sidebarTextActiveBorder, color: theme.buttonColor},
        {backgroundColor: theme.onlineIndicator, color: theme.buttonColor},
        {backgroundColor: theme.mentionHighlightLink, color: theme.buttonColor},
        {backgroundColor: theme.dndIndicator, color: theme.buttonColor},
    ];
    return swatches[v % swatches.length] ?? swatches[0]!;
}

/**
 * 查找频道 / 已加入列表：非私聊前两字标识（圆角矩形 + 语义色底 + 高对比字色）。
 */
const ListInitialsAvatar = ({
    channelId,
    displayName,
    isEnterpriseMainGroup = false,
    isMuted = false,
    isUnread = false,
    size = 40,
    testID,
}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const label = twoCharFromDisplayName(displayName);
    const v = variantFromSeed(channelId || displayName);
    const {backgroundColor, color} = useMemo(() => swatchFromTheme(theme, v), [theme, v]);

    const corner = Math.min(12, Math.round(size * 0.25));
    const letterSpacing = labelHasHan(label) ? 1 : 0.5;

    const shadowStyle = useMemo(
        () =>
            Platform.select({
                ios: {
                    shadowColor: theme.centerChannelColor,
                    shadowOffset: {width: 0, height: 1},
                    shadowOpacity: isUnread && !isMuted ? 0.18 : 0.12,
                    shadowRadius: isUnread && !isMuted ? 4 : 3,
                },
                android: {elevation: isUnread && !isMuted ? 3 : 2},
                default: {},
            }),
        [isMuted, isUnread, theme.centerChannelColor],
    );

    const enterpriseA11y = intl.formatMessage({
        id: 'channel_list.enterprise_main_group_a11y',
        defaultMessage: 'Organization main group',
    });
    const accessibilityLabel = isEnterpriseMainGroup ? `${displayName}, ${enterpriseA11y}` : displayName;

    const avatarInner = (
        <View
            style={[
                {
                    width: size,
                    height: size,
                    borderRadius: corner,
                    backgroundColor,
                    alignItems: 'center',
                    justifyContent: 'center',
                },
                shadowStyle,
                isEnterpriseMainGroup && {
                    borderWidth: 2,
                    borderColor: changeOpacity(theme.linkColor, 0.55),
                },
                isMuted && {opacity: 0.45},
            ]}
        >
            <Text
                numberOfLines={1}
                style={[styles.label, {color, letterSpacing}]}
            >
                {label}
            </Text>
        </View>
    );

    return (
        <View
            accessibilityLabel={accessibilityLabel}
            accessibilityRole='image'
            accessible={true}
            style={{width: size, height: size}}
            testID={testID}
        >
            {avatarInner}
            {isEnterpriseMainGroup && (
                <View
                    pointerEvents='none'
                    style={{
                        position: 'absolute',
                        right: -2,
                        bottom: -2,
                        width: 18,
                        height: 18,
                        borderRadius: 9,
                        backgroundColor: theme.linkColor,
                        borderWidth: 2,
                        borderColor: theme.centerChannelBg,
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <CompassIcon
                        name='home-variant-outline'
                        size={10}
                        color={theme.buttonColor}
                    />
                </View>
            )}
        </View>
    );
};

export default React.memo(ListInitialsAvatar);
