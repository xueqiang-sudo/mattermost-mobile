// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useMemo} from 'react';
import {Platform, StyleSheet, Text, View} from 'react-native';
import Animated, {useAnimatedStyle, withTiming} from 'react-native-reanimated';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import TouchableWithFeedback from '@components/touchable_with_feedback';
import ViewConstants from '@constants/view';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

export type HeaderRightButton = {
    borderless?: boolean;
    buttonType?: 'native' | 'opacity' | 'highlight';
    color?: string;
    iconName: string;
    count?: number | string;
    onPress: () => void;
    rippleRadius?: number;
    testID?: string;
}

type Props = {
    defaultHeight: number;
    hasSearch: boolean;
    isLargeTitle: boolean;
    heightOffset: number;
    leftComponent?: React.ReactElement;
    onBackPress?: () => void;
    onTitlePress?: () => void;
    rightButtons?: HeaderRightButton[];
    scrollValue?: Animated.SharedValue<number>;
    showBackButton?: boolean;
    subtitle?: string;
    subtitleCompanion?: React.ReactElement;
    theme: Theme;
    title?: string;

    /** 标题后缀（如群聊人数），始终可见不被截断 */
    titleSuffix?: string;

    /** 聊天顶栏：频道类型标签（置于标题前） */
    titleTag?: string;

    /** 覆盖 header 背景色，用于聊天界面等 */
    backgroundColor?: string;
}

const hitSlop = {top: 20, bottom: 20, left: 20, right: 20};
const rightButtonHitSlop = {top: 20, bottom: 5, left: 5, right: 5};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    centered: {
        alignItems: Platform.select({android: 'flex-start', ios: 'center'}),
    },
    container: {
        alignItems: 'center',
        backgroundColor: theme.sidebarBg,
        flexDirection: 'row',
        justifyContent: 'flex-start',
        paddingHorizontal: 16,
        zIndex: 10,
    },

    /** 微信风格：与聊天区层次分隔的底部分割线（随主题） */
    containerChatBottomBorder: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    subtitleContainer: {
        flexDirection: 'row',
        justifyContent: Platform.select({android: 'flex-start', ios: 'center'}),
        left: Platform.select({ios: undefined, default: 3}),
    },
    subtitle: {
        color: changeOpacity(theme.sidebarHeaderTextColor, 0.72),
        ...typography('Body', 75),
        lineHeight: 12,
        marginBottom: 8,
        marginTop: 2,
        height: 13,
    },
    subtitleChatStyle: {
        color: changeOpacity(theme.centerChannelColor, 0.72),
    },
    titleContainer: {
        alignItems: Platform.select({android: 'flex-start', ios: 'center'}),
        justifyContent: 'center',
        flex: 3,
        height: '100%',
        ...Platform.select({
            ios: {
                flex: undefined,
                width: '100%',
                position: 'absolute',
                left: 16,
                bottom: 0,
                zIndex: 1,
            },
        }),
    },
    leftAction: {
        alignItems: 'center',
        flexDirection: 'row',
    },
    leftContainer: {
        height: '100%',
        justifyContent: 'center',
        ...Platform.select({
            ios: {
                paddingLeft: 16,
                zIndex: 5,
                position: 'absolute',
                bottom: 0,
            },
        }),
    },
    rightContainer: {
        alignItems: 'center',
        flexDirection: 'row',
        height: '100%',
        justifyContent: 'flex-end',
        ...Platform.select({
            ios: {
                right: 16,
                bottom: 0,
                position: 'absolute',
                zIndex: 2,
            },
        }),
    },
    rightButtonContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    rightIcon: {
        padding: 5,
    },
    title: {
        color: theme.sidebarHeaderTextColor,
        ...typography('Heading', 300),
    },
    titleChatStyle: {
        color: theme.centerChannelColor,
    },
    titleRow: {
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'center',
        maxWidth: '100%',
    },
    /** 聊天顶栏：标题行与状态栏下缘留出呼吸，避免胶囊/字体贴顶裁切 */
    titleRowChat: {
        paddingTop: 2,
    },
    /** 非聊天顶栏（极少使用） */
    titleTagBadge: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.1),
        borderRadius: 8,
        marginRight: 8,
        paddingHorizontal: 8,
        paddingVertical: 2,
    },
    titleTagText: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
        ...typography('Body', 75),
    },
    /**
     * 聊天顶栏：胶囊标签 — 浅底 + 细描边 + 链接色字，层次比纯灰底更清晰
     */
    titleTagBadgeChat: {
        alignItems: 'center',
        alignSelf: 'center',
        backgroundColor: changeOpacity(theme.linkColor, 0.12),
        borderColor: changeOpacity(theme.linkColor, 0.3),
        borderRadius: 100,
        borderWidth: StyleSheet.hairlineWidth,
        justifyContent: 'center',
        marginRight: 8,
        minHeight: 22,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    titleTagTextChat: {
        color: theme.linkColor,
        ...typography('Body', 75, 'SemiBold'),
    },
    titleTextFlex: {
        flexShrink: 1,
    },
}));

const Header = ({
    defaultHeight,
    hasSearch,
    isLargeTitle,
    heightOffset,
    leftComponent,
    onBackPress,
    onTitlePress,
    rightButtons,
    scrollValue,
    showBackButton = true,
    subtitle,
    subtitleCompanion,
    theme,
    title,
    titleSuffix,
    titleTag,
    backgroundColor,
}: Props) => {
    const styles = getStyleSheet(theme);
    const insets = useSafeAreaInsets();

    const opacity = useAnimatedStyle(() => {
        if (!isLargeTitle) {
            return {opacity: 1};
        }

        if (hasSearch) {
            return {opacity: 0};
        }

        const barHeight = heightOffset - ViewConstants.LARGE_HEADER_TITLE_HEIGHT;
        const val = (scrollValue?.value || 0);
        const showDuration = 200;
        const hideDuration = 50;
        const duration = val >= barHeight ? showDuration : hideDuration;
        const opacityValue = val >= barHeight ? 1 : 0;
        return {
            opacity: withTiming(opacityValue, {duration}),
        };
    }, [heightOffset, isLargeTitle, hasSearch]);

    const containerAnimatedStyle = useAnimatedStyle(() => ({
        height: defaultHeight,
        paddingTop: insets.top,
    }), [defaultHeight]);

    const containerStyle = useMemo(() => (
        [
            styles.container,
            containerAnimatedStyle,
            backgroundColor ? {backgroundColor} : undefined,
            backgroundColor ? styles.containerChatBottomBorder : undefined,
        ]), [styles, containerAnimatedStyle, backgroundColor]);

    const additionalTitleStyle = useMemo(() => {
        const isChatHeader = Boolean(backgroundColor);
        return {
            marginLeft: Platform.select({
                android: showBackButton && !leftComponent ? (isChatHeader ? 8 : 20) : 0,
            }),
            ...Platform.select({
                ios: isChatHeader
                    ? {
                        paddingLeft: rightButtons?.length === 2 ? 44 : 28,
                        paddingRight: rightButtons?.length === 2 ? 80 : 52,
                    }
                    : {
                        paddingHorizontal: rightButtons?.length === 2 ? 90 : 60,
                    },
                default: {
                    paddingHorizontal: isChatHeader ? 4 : 8,
                },
            }),
        };
    }, [leftComponent, showBackButton, rightButtons, backgroundColor]);

    return (
        <Animated.View style={containerStyle}>
            {showBackButton &&
            <Animated.View style={styles.leftContainer}>
                <TouchableWithFeedback
                    borderlessRipple={true}
                    onPress={onBackPress}
                    rippleRadius={20}
                    type={Platform.select({android: 'native', default: 'opacity'})}
                    testID='navigation.header.back'
                    hitSlop={hitSlop}
                >
                    <Animated.View style={styles.leftAction}>
                        <CompassIcon
                            size={24}
                            name={Platform.select({android: 'arrow-left', ios: 'arrow-back-ios'})!}
                            color={backgroundColor ? theme.centerChannelColor : theme.sidebarHeaderTextColor}
                        />
                        {leftComponent}
                    </Animated.View>
                </TouchableWithFeedback>
            </Animated.View>
            }
            <Animated.View style={[styles.titleContainer, additionalTitleStyle]}>
                <TouchableWithFeedback
                    disabled={!onTitlePress}
                    onPress={onTitlePress}
                    type='opacity'
                >
                    <View style={styles.centered}>
                        {!hasSearch &&
                        <View style={[styles.titleRow, Boolean(backgroundColor) && styles.titleRowChat]}>
                            {Boolean(titleTag) &&
                            <View
                                style={[
                                    styles.titleTagBadge,
                                    Boolean(backgroundColor) && styles.titleTagBadgeChat,
                                ]}
                            >
                                <Text
                                    numberOfLines={1}
                                    style={[
                                        styles.titleTagText,
                                        Boolean(backgroundColor) && styles.titleTagTextChat,
                                    ]}
                                    testID='navigation.header.title_tag'
                                >
                                    {titleTag}
                                </Text>
                            </View>
                            }
                            <Animated.Text
                                ellipsizeMode='tail'
                                numberOfLines={1}
                                style={[styles.title, styles.titleTextFlex, backgroundColor && styles.titleChatStyle, opacity]}
                                testID='navigation.header.title'
                            >
                                {title}
                            </Animated.Text>
                            {Boolean(titleSuffix) &&
                            <Text
                                style={[styles.title, backgroundColor && styles.titleChatStyle, {flexShrink: 0}]}
                                testID='navigation.header.title_suffix'
                            >
                                {' '}{titleSuffix}
                            </Text>
                            }
                        </View>
                        }
                        {!isLargeTitle && Boolean(subtitle || subtitleCompanion) &&
                        <View style={styles.subtitleContainer}>
                            <Text
                                ellipsizeMode='tail'
                                numberOfLines={1}
                                style={[styles.subtitle, backgroundColor && styles.subtitleChatStyle]}
                                testID='navigation.header.subtitle'
                            >
                                {subtitle}
                            </Text>
                            {subtitleCompanion}
                        </View>
                        }
                    </View>
                </TouchableWithFeedback>
            </Animated.View>
            <Animated.View style={styles.rightContainer}>
                {Boolean(rightButtons?.length) &&
                rightButtons?.map((r) => (
                    <TouchableWithFeedback
                        key={r.iconName}
                        borderlessRipple={r.borderless === undefined ? true : r.borderless}
                        hitSlop={rightButtonHitSlop}
                        onPress={r.onPress}
                        rippleRadius={r.rippleRadius || 20}
                        type={r.buttonType || Platform.select({android: 'native', default: 'opacity'})}
                        style={styles.rightIcon}
                        testID={r.testID}
                    >
                        <View style={styles.rightButtonContainer}>
                            <CompassIcon
                                size={24}
                                name={r.iconName}
                                color={r.color || (backgroundColor ? theme.centerChannelColor : theme.sidebarHeaderTextColor)}
                            />
                            {Boolean(r.count) && (
                                <Text style={styles.title}>{r.count}</Text>
                            )}
                        </View>
                    </TouchableWithFeedback>
                ))
                }
            </Animated.View>
        </Animated.View>
    );
};

export default React.memo(Header);

