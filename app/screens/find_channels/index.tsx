// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useMemo, useRef, useState} from 'react';
import {Keyboard, type LayoutChangeEvent, View, SafeAreaView} from 'react-native';

import SearchBar from '@components/search';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import {useKeyboardOverlap} from '@hooks/device';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import SecurityManager from '@managers/security_manager';
import {dismissModal} from '@screens/navigation';
import {changeOpacity, getKeyboardAppearanceFromTheme, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import CategoryTabs, {type FindChannelsCategory} from './category_tabs';
import FilteredList from './filtered_list';
import QuickOptions from './quick_options';
import UnfilteredList from './unfiltered_list';

import type {AvailableScreens} from '@typings/screens/navigation';

type Props = {
    closeButtonId: string;
    componentId: AvailableScreens;
}

/**
 * 获取搜索界面的样式
 */
const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    contentContainer: {
        flex: 1,
        paddingHorizontal: 16,
        paddingTop: 16,
    },
    searchBarContainer: {
        marginBottom: 16,
    },
    inputContainerStyle: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
        borderRadius: 12,
        height: 48,
    },
    inputStyle: {
        color: theme.centerChannelColor,
        fontSize: 16,
    },
    listContainer: {
        flex: 1,
        marginTop: 8,
    },
}));

/**
 * 搜索界面组件
 */
const FindChannels = ({closeButtonId, componentId}: Props) => {
    const theme = useTheme();
    const [term, setTerm] = useState('');
    const [loading, setLoading] = useState(false);
    const [category, setCategory] = useState<FindChannelsCategory>('all');
    const styles = getStyleSheet(theme);
    const color = useMemo(() => changeOpacity(theme.centerChannelColor, 0.72), [theme]);
    const listView = useRef<View>(null);

    const [containerHeight, setContainerHeight] = useState(0);
    const overlap = useKeyboardOverlap(listView, containerHeight);

    const cancelButtonProps = useMemo(() => ({
        color: theme.buttonBg,
        buttonTextStyle: {
            ...typography('Body', 200, 'SemiBold'),
        },
    }), [theme.buttonBg]);

    /**
     * 处理布局变化
     */
    const onLayout = useCallback((e: LayoutChangeEvent) => {
        setContainerHeight(e.nativeEvent.layout.height);
    }, []);

    /**
     * 关闭界面
     */
    const close = useCallback(() => {
        Keyboard.dismiss();
        return dismissModal({componentId});
    }, []);

    /**
     * 取消搜索
     */
    const onCancel = useCallback(() => {
        dismissModal({componentId});
    }, []);

    /**
     * 处理搜索文本变化
     */
    const onChangeText = useCallback((text: string) => {
        setTerm(text);
        if (!text) {
            setLoading(false);
        }
    }, []);

    useNavButtonPressed(closeButtonId, componentId, close, []);
    useAndroidHardwareBackHandler(componentId, close);

    return (
        <SafeAreaView
            style={styles.container}
            testID='find_channels.screen'
            nativeID={SecurityManager.getShieldScreenId(componentId)}
        >
            <View style={styles.contentContainer}>
                <View style={styles.searchBarContainer}>
                    <SearchBar
                        autoCapitalize='none'
                        autoFocus={true}
                        cancelButtonProps={cancelButtonProps}
                        clearIconColor={color}
                        inputContainerStyle={styles.inputContainerStyle}
                        inputStyle={styles.inputStyle}
                        keyboardAppearance={getKeyboardAppearanceFromTheme(theme)}
                        onCancel={onCancel}
                        onChangeText={onChangeText}
                        placeholderTextColor={color}
                        searchIconColor={color}
                        selectionColor={theme.buttonBg}
                        showLoading={loading}
                        value={term}
                        testID='find_channels.search_bar'
                    />
                </View>
                {term === '' && <QuickOptions close={close}/>}
                <CategoryTabs
                    activeCategory={category}
                    onCategoryChange={setCategory}
                />
                <View
                    style={styles.listContainer}
                    onLayout={onLayout}
                    ref={listView}
                >
                    {term === '' &&
                    <UnfilteredList
                        category={category}
                        close={close}
                        keyboardOverlap={overlap}
                        testID='find_channels.unfiltered_list'
                    />
                    }
                    {Boolean(term) &&
                    <FilteredList
                        category={category}
                        close={close}
                        keyboardOverlap={overlap}
                        loading={loading}
                        onLoading={setLoading}
                        term={term}
                        testID='find_channels.filtered_list'
                    />
                    }
                </View>
            </View>
        </SafeAreaView>
    );
};

export default FindChannels;
