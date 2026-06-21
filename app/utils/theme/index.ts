// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import deepEqual from 'deep-equal';
import merge from 'deepmerge';
import {StatusBar, StyleSheet} from 'react-native';
import tinyColor from 'tinycolor2';

import {Preferences} from '@constants';
import {MODAL_SCREENS_WITHOUT_BACK, SCREENS_AS_BOTTOM_SHEET, SCREENS_WITH_TRANSPARENT_BACKGROUND} from '@constants/screens';
import EphemeralStore from '@store/ephemeral_store';
import NavigationStore from '@store/navigation_store';
import {appearanceControlledScreens, mergeNavigationOptions} from '@utils/navigation';

import type {NamedStyles} from '@typings/global/styles';
import type {Options} from 'react-native-navigation';

const rgbPattern = /^rgba?\((\d+),(\d+),(\d+)(?:,([\d.]+))?\)$/;

export function getComponents(inColor: string): {red: number; green: number; blue: number; alpha: number} {
    let color = inColor;

    // RGB color
    const match = rgbPattern.exec(color);
    if (match) {
        return {
            red: parseInt(match[1], 10),
            green: parseInt(match[2], 10),
            blue: parseInt(match[3], 10),
            alpha: match[4] ? parseFloat(match[4]) : 1,
        };
    }

    // Hex color
    if (color[0] === '#') {
        color = color.slice(1);
    }

    if (color.length === 3) {
        const tempColor = color;
        color = '';

        color += tempColor[0] + tempColor[0];
        color += tempColor[1] + tempColor[1];
        color += tempColor[2] + tempColor[2];
    }

    return {
        red: parseInt(color.substring(0, 2), 16),
        green: parseInt(color.substring(2, 4), 16),
        blue: parseInt(color.substring(4, 6), 16),
        alpha: 1,
    };
}

export function makeStyleSheetFromTheme<T extends NamedStyles<T>>(getStyleFromTheme: (a: Theme) => T): (a: Theme) => T {
    let lastTheme: Theme;
    let style: T;
    return (theme: Theme) => {
        if (!style || theme !== lastTheme) {
            style = StyleSheet.create(getStyleFromTheme(theme));
            lastTheme = theme;
        }

        return style;
    };
}

export function changeOpacity(oldColor: string, opacity: number): string {
    const {
        red,
        green,
        blue,
        alpha,
    } = getComponents(oldColor);

    return `rgba(${red},${green},${blue},${alpha * opacity})`;
}

export function setNavigatorStyles(componentId: string, theme: Theme, additionalOptions: Options = {}, statusBarColor?: string) {
    const isDark = tinyColor(statusBarColor || theme.sidebarBg).isDark();
    const options: Options = {
        topBar: {
            title: {
                color: theme.sidebarHeaderTextColor,
            },
            background: {
                color: theme.sidebarBg,
            },
            leftButtonColor: theme.sidebarHeaderTextColor,
            rightButtonColor: theme.sidebarHeaderTextColor,
        },
        statusBar: {
            backgroundColor: theme.sidebarBg,
            style: isDark ? 'light' : 'dark',
        },
    };

    if (SCREENS_AS_BOTTOM_SHEET.has(componentId)) {
        options.topBar = {
            leftButtonColor: changeOpacity(theme.centerChannelColor, 0.56),
            background: {
                color: theme.centerChannelBg,
            },
            title: {
                color: theme.centerChannelColor,
            },
        };
    }

    if (!SCREENS_WITH_TRANSPARENT_BACKGROUND.has(componentId) && !SCREENS_AS_BOTTOM_SHEET.has(componentId)) {
        options.layout = {
            componentBackgroundColor: theme.centerChannelBg,
        };
    }

    if (!MODAL_SCREENS_WITHOUT_BACK.has(componentId) && !SCREENS_AS_BOTTOM_SHEET.has(componentId) && options.topBar) {
        options.topBar.backButton = {
            color: theme.sidebarHeaderTextColor,
        };
    }
    StatusBar.setBarStyle(isDark ? 'light-content' : 'dark-content');

    const mergeOptions = merge(options, additionalOptions);

    mergeNavigationOptions(componentId, mergeOptions);
}

export function setNavigationStackStyles(theme: Theme) {
    NavigationStore.getScreensInStack().forEach((componentId) => {
        if (!appearanceControlledScreens.has(componentId)) {
            setNavigatorStyles(componentId, theme);
        }
    });
}

export function getKeyboardAppearanceFromTheme(theme: Theme) {
    return tinyColor(theme.centerChannelBg).isLight() ? 'light' : 'dark';
}

export function hexToHue(hexColor: string) {
    let {red, green, blue} = getComponents(hexColor);
    red /= 255;
    green /= 255;
    blue /= 255;

    const channelMax = Math.max(red, green, blue);
    const channelMin = Math.min(red, green, blue);
    const delta = channelMax - channelMin;
    let hue = 0;

    if (delta === 0) {
        hue = 0;
    } else if (channelMax === red) {
        hue = ((green - blue) / delta) % 6;
    } else if (channelMax === green) {
        hue = ((blue - red) / delta) + 2;
    } else {
        hue = ((red - green) / delta) + 4;
    }

    hue = Math.round(hue * 60);

    if (hue < 0) {
        hue += 360;
    }

    return hue;
}

function blendComponent(background: number, foreground: number, opacity: number): number {
    return ((1 - opacity) * background) + (opacity * foreground);
}

export function blendColors(background: string, foreground: string, opacity: number, hex = false): string {
    const backgroundComponents = getComponents(background);
    const foregroundComponents = getComponents(foreground);

    const red = Math.floor(blendComponent(
        backgroundComponents.red,
        foregroundComponents.red,
        opacity,
    ));
    const green = Math.floor(blendComponent(
        backgroundComponents.green,
        foregroundComponents.green,
        opacity,
    ));
    const blue = Math.floor(blendComponent(
        backgroundComponents.blue,
        foregroundComponents.blue,
        opacity,
    ));
    const alpha = blendComponent(
        backgroundComponents.alpha,
        foregroundComponents.alpha,
        opacity,
    );

    if (hex) {
        let r = red.toString(16);
        let g = green.toString(16);
        let b = blue.toString(16);

        if (r.length === 1) {
            r = '0' + r;
        }
        if (g.length === 1) {
            g = '0' + g;
        }
        if (b.length === 1) {
            b = '0' + b;
        }

        return `#${r + g + b}`;
    }

    return `rgba(${red},${green},${blue},${alpha})`;
}

const WECHAT_STYLE_OWN_GREEN_LIGHT = '#95ec69';

/** 微信风格聊天列表背景：浅灰 #F3F3F3 营造层次感 */
const WECHAT_BACKDROP_LIGHT = '#F3F3F3';

/**
 * Chat list strip behind messages (WeChat / WeCom style). Theme-aware for light and dark.
 */
export function getChatListBackdropColor(theme: Theme): string {
    const base = tinyColor(theme.centerChannelBg);
    if (base.isLight()) {
        return blendColors(theme.centerChannelBg, WECHAT_BACKDROP_LIGHT, 0.85, true);
    }
    return base.lighten(5).toHexString();
}

export type ChatBubbleSurfaceRole = 'own' | 'others';

/**
 * Message bubble fill for chat-style screens. Others: card on gray strip; own: green (light) or button (dark).
 */
export function getChatBubbleBackground(theme: Theme, role: ChatBubbleSurfaceRole): string {
    const channelBg = tinyColor(theme.centerChannelBg);
    const backdrop = tinyColor(getChatListBackdropColor(theme));

    if (role === 'others') {
        if (backdrop.isLight()) {
            return '#ffffff';
        }
        return channelBg.lighten(8).toHexString();
    }

    if (channelBg.isLight()) {
        return tinyColor.mix(theme.onlineIndicator, WECHAT_STYLE_OWN_GREEN_LIGHT, 75).toHexString();
    }
    return theme.buttonBg;
}

/** Border for others' bubbles on the chat backdrop (enterprise-style card edge). */
export function getChatBubbleBorderColor(theme: Theme): string {
    return changeOpacity(theme.centerChannelColor, 0.12);
}

/**
 * WeChat-style compact send button: classic green on light chat strip; theme button color on dark
 * so the footer/input row stays consistent after theme switches.
 */
export function getWeChatCompactSendButtonBackground(theme: Theme): string {
    const base = tinyColor(theme.buttonBg);
    if (tinyColor(getChatListBackdropColor(theme)).isLight()) {
        // 主流配色：浅色主题使用主色本身，确保与全局按钮体系一致。
        return base.toHexString();
    }

    // 深色主题下轻微提亮主色，维持对比度与可点击感。
    return base.lighten(8).toHexString();
}

/** Text on own bubble: dark on light green, theme button color on dark bubble. */
export function getChatBubbleOwnTextColor(theme: Theme): string {
    const bubble = tinyColor(getChatBubbleBackground(theme, 'own'));
    return bubble.isLight() ? '#111111' : theme.buttonColor;
}

const themeTypeMap: ThemeTypeMap = {
    Mattermost: 'denim',
    Organization: 'sapphire',
    'Dedalix Dark': 'indigo',
    'Windows Dark': 'onyx',
    Denim: 'denim',
    Sapphire: 'sapphire',
    Quartz: 'quartz',
    Indigo: 'indigo',
    Onyx: 'onyx',
    custom: 'custom',
};

// setThemeDefaults will set defaults on the theme for any unset properties.
export function setThemeDefaults(theme: ExtendedTheme): Theme {
    const themes = Preferences.THEMES as Record<ThemeKey, ExtendedTheme>;
    const defaultTheme = themes.denim;

    const processedTheme = {...theme};

    // If this is a system theme, return the source theme object matching the theme preference type
    if (theme.type && theme.type !== 'custom' && Object.keys(themeTypeMap).includes(theme.type)) {
        return Preferences.THEMES[themeTypeMap[theme.type]];
    }

    for (const key of Object.keys(defaultTheme)) {
        if (theme[key]) {
            // Fix a case where upper case theme colours are rendered as black
            processedTheme[key] = theme[key]?.toLowerCase();
        }
    }

    for (const property in defaultTheme) {
        if (property === 'type' || (property === 'sidebarTeamBarBg' && theme.sidebarHeaderBg)) {
            continue;
        }
        if (theme[property] == null) {
            processedTheme[property] = defaultTheme[property];
        }

        // Backwards compatability with old name
        if (!theme.mentionBg && theme.mentionBj) {
            processedTheme.mentionBg = theme.mentionBj;
        }
    }

    if (!theme.sidebarTeamBarBg && theme.sidebarHeaderBg) {
        processedTheme.sidebarTeamBarBg = blendColors(theme.sidebarHeaderBg, '#000000', 0.2, true);
    }

    return processedTheme;
}

export {
    WECHAT_HOME_AVATAR_GAP,
    WECHAT_HOME_AVATAR_SIZE,
    WECHAT_HOME_DIVIDER_INSET,
    WECHAT_HOME_DIVIDER_OPACITY,
    WECHAT_HOME_PADDING_H,
    WECHAT_HOME_SECONDARY_TEXT_OPACITY,
} from './wechat_home';

export const updateThemeIfNeeded = (theme: Theme, force = false) => {
    const storedTheme = EphemeralStore.theme;
    if (!deepEqual(theme, storedTheme) || force) {
        EphemeralStore.theme = theme;
        requestAnimationFrame(() => {
            setNavigationStackStyles(theme);
        });
    }
};
