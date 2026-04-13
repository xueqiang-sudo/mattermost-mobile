// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useState, useMemo} from 'react';
import {useIntl} from 'react-intl';
import {View, TextInput, type LayoutChangeEvent} from 'react-native';

import FormattedText from '@components/formatted_text';
import {useTheme} from '@context/theme';
import {makeStyleSheetFromTheme, changeOpacity, getKeyboardAppearanceFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

const SEARCH_BAR_TITLE_MARGIN_TOP = 12;
const SEARCH_BAR_MARGIN_TOP = 16;

/**
 * 生成主题相关的样式表
 * @param theme - 当前应用的主题
 * @returns 样式表对象
 */
const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => {
    return {
        container: {
            display: 'flex',
        },
        searchBarTitleText: {
            marginTop: SEARCH_BAR_TITLE_MARGIN_TOP,
            color: theme.centerChannelColor,
            ...typography('Heading', 700, 'SemiBold'),
            letterSpacing: 0.4,
        },
        searchBar: {
            marginTop: SEARCH_BAR_MARGIN_TOP,
        },
        searchInput: {
            height: 56,
            backgroundColor: changeOpacity(theme.centerChannelColor, 0.05),
            ...typography('Body', 200, 'Regular'),
            lineHeight: 22,
            color: theme.centerChannelColor,
            borderRadius: 16,
            paddingHorizontal: 20,
            transitionProperty: 'all',
            transitionDuration: 200,
        },
        searchInputPlaceholder: {
            color: changeOpacity(theme.centerChannelColor, 0.35),
        },
    };
});

type SelectionSearchBarProps = {
    term: string;
    onSearchChange: (text: string) => void;
    onLayoutContainer: (e: LayoutChangeEvent) => void;
}

/**
 * 邀请界面的搜索栏组件
 * 提供搜索功能，允许用户输入姓名或邮箱地址来搜索要邀请的人
 */
export default function SelectionSearchBar({
    term,
    onSearchChange,
    onLayoutContainer,
}: SelectionSearchBarProps) {
    const {formatMessage} = useIntl();
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const [isFocused, setIsFocused] = useState(false);

    /**
     * 处理搜索栏布局变化
     * @param e - 布局变化事件
     */
    const onLayoutSearchBar = useCallback((e: LayoutChangeEvent) => {
        onLayoutContainer(e);
    }, [onLayoutContainer]);

    /**
     * 处理搜索框获得焦点
     */
    const onTextInputFocus = useCallback(() => {
        setIsFocused(true);
    }, []);

    /**
     * 处理搜索框失去焦点
     */
    const onTextInputBlur = useCallback(() => {
        setIsFocused(false);
    }, []);

    /**
     * 处理搜索文本变化
     * @param text - 新的搜索文本
     */
    const handleSearchChange = useCallback((text: string) => {
        onSearchChange(text);
    }, [onSearchChange]);

    /**
     * 根据焦点状态动态计算搜索框样式
     */
    const searchInputStyle = useMemo(() => {
        const style = [];

        style.push(styles.searchInput);

        if (isFocused) {
            style.push({
                backgroundColor: theme.centerChannelBg,
                borderWidth: 2,
                borderColor: theme.buttonBg,
                shadowColor: theme.buttonBg,
                shadowOpacity: 0.15,
                shadowRadius: 12,
                shadowOffset: {
                    width: 0,
                    height: 3,
                },
                elevation: 4,
            });
        }

        return style;
    }, [isFocused, styles.searchInput, theme.buttonBg, theme.centerChannelBg, theme.centerChannelColor]);

    return (
        <View
            style={styles.container}
            onLayout={onLayoutSearchBar}
            testID='invite.search_bar'
        >
            <FormattedText
                id='invite.sendInvitationsTo'
                defaultMessage='Send invitations to…'
                style={styles.searchBarTitleText}
                testID='invite.search_bar_title'
            />
            <View style={styles.searchBar}>
                <TextInput
                    autoCorrect={false}
                    autoCapitalize={'none'}
                    autoFocus={true}
                    blurOnSubmit={false}
                    disableFullscreenUI={true}
                    enablesReturnKeyAutomatically={true}
                    returnKeyType='search'
                    style={searchInputStyle}
                    placeholder={formatMessage({id: 'invite.searchPlaceholder', defaultMessage: 'Type a name or email address…'})}
                    placeholderTextColor={styles.searchInputPlaceholder.color}
                    onChangeText={handleSearchChange}
                    onFocus={onTextInputFocus}
                    onBlur={onTextInputBlur}
                    keyboardAppearance={getKeyboardAppearanceFromTheme(theme)}
                    value={term}
                    pointerEvents='auto'
                    underlineColorAndroid='transparent'
                    testID='invite.search_bar_input'
                />
            </View>
        </View>
    );
}
