// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useState, useMemo} from 'react';
import {useIntl} from 'react-intl';
import {View, TextInput, type LayoutChangeEvent} from 'react-native';

import {useTheme} from '@context/theme';
import {makeStyleSheetFromTheme, changeOpacity, getKeyboardAppearanceFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

const SEARCH_BAR_MARGIN_TOP = 8;
const INPUT_RADIUS = 12;

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => {
    return {
        container: {
            display: 'flex',
        },
        searchBar: {
            marginTop: SEARCH_BAR_MARGIN_TOP,
        },
        searchInput: {
            minHeight: 48,
            backgroundColor: changeOpacity(theme.centerChannelColor, 0.06),
            ...typography('Body', 100, 'Regular'),
            lineHeight: 22,
            color: theme.centerChannelColor,
            borderRadius: INPUT_RADIUS,
            paddingHorizontal: 16,
            paddingVertical: 12,
        },
        searchInputPlaceholder: {
            color: changeOpacity(theme.centerChannelColor, 0.4),
        },
    };
});

type SelectionSearchBarProps = {
    term: string;
    onSearchChange: (text: string) => void;
    onLayoutContainer: (e: LayoutChangeEvent) => void;
}

export default function SelectionSearchBar({
    term,
    onSearchChange,
    onLayoutContainer,
}: SelectionSearchBarProps) {
    const {formatMessage} = useIntl();
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const [isFocused, setIsFocused] = useState(false);

    const onLayoutSearchBar = useCallback((e: LayoutChangeEvent) => {
        onLayoutContainer(e);
    }, [onLayoutContainer]);

    const onTextInputFocus = useCallback(() => {
        setIsFocused(true);
    }, []);

    const onTextInputBlur = useCallback(() => {
        setIsFocused(false);
    }, []);

    const handleSearchChange = useCallback((text: string) => {
        onSearchChange(text);
    }, [onSearchChange]);

    const searchInputStyle = useMemo(() => {
        const style = [];

        style.push(styles.searchInput);

        if (isFocused) {
            style.push({
                backgroundColor: theme.centerChannelBg,
                borderWidth: 1,
                borderColor: theme.buttonBg,
            });
        } else {
            style.push({
                borderWidth: 1,
                borderColor: changeOpacity(theme.centerChannelColor, 0.08),
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
                    placeholder={formatMessage({id: 'invite.searchPlaceholder', defaultMessage: 'Search by name, phone, or username'})}
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
