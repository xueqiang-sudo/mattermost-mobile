// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {Keyboard, type LayoutChangeEvent, View, SafeAreaView} from 'react-native';

import CompassIcon from '@components/compass_icon';
import SearchBar from '@components/search';
import {Screens} from '@constants';
import {ENABLE_INTERNAL_GROUPS} from '@constants/channel';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import {useKeyboardOverlap} from '@hooks/device';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import SecurityManager from '@managers/security_manager';
import {buildNavigationButton, dismissModal, goToScreen, setButtons} from '@screens/navigation';
import {changeOpacity, getKeyboardAppearanceFromTheme, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import CategoryTabs, {type FindChannelsCategory} from './category_tabs';
import FilteredList from './filtered_list';
import UnfilteredList from './unfiltered_list';

import type {AvailableScreens} from '@typings/screens/navigation';

const FIND_CHANNELS_VIEW_ALL_BUTTON_ID = 'find-channels-view-all';

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
    const intl = useIntl();
    const theme = useTheme();
    const [term, setTerm] = useState('');
    const [loading, setLoading] = useState(false);
    const [category, setCategory] = useState<FindChannelsCategory>('all');
    const styles = getStyleSheet(theme);
    const color = useMemo(() => changeOpacity(theme.centerChannelColor, 0.72), [theme]);
    const listView = useRef<View>(null);

    const [containerHeight, setContainerHeight] = useState(0);
    const overlap = useKeyboardOverlap(listView, containerHeight);

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
    }, [componentId]);

    /**
     * 处理搜索文本变化
     */
    const onChangeText = useCallback((text: string) => {
        setTerm(text);
        if (!text) {
            setLoading(false);
        }
    }, []);

    /**
     * 创建右上角按钮配置
     */
    const rightButton = useMemo(() => {
        const iconColor = theme.sidebarHeaderTextColor;
        const joinedIcon = CompassIcon.getImageSourceSync('forum-outline', 20, iconColor);
        const joinedNavShort = intl.formatMessage({
            id: 'find_channels.joined_nav_action',
            defaultMessage: 'Joined',
        });
        return {
            ...buildNavigationButton(
                FIND_CHANNELS_VIEW_ALL_BUTTON_ID,
                'find_channels.view_all.button',
                joinedIcon,
                joinedNavShort,
            ),
            color: iconColor,
        };
    }, [intl, theme.sidebarHeaderTextColor]);

    /**
     * 更新导航栏按钮
     */
    useEffect(() => {
        setButtons(componentId, {
            rightButtons: [rightButton],
        });
    }, [componentId, rightButton]);

    const openJoinedChannelsAndGroups = useCallback(() => {
        const titleId = ENABLE_INTERNAL_GROUPS ? 'joined_channels.title' : 'joined_channels.title_no_internal';
        goToScreen(
            Screens.JOINED_CHANNELS_AND_GROUPS,
            intl.formatMessage({
                id: titleId,
                defaultMessage: 'Joined groups & discussion groups',
            }),
            {},
        );
    }, [intl]);

    useNavButtonPressed(FIND_CHANNELS_VIEW_ALL_BUTTON_ID, componentId, openJoinedChannelsAndGroups, [openJoinedChannelsAndGroups]);
    useNavButtonPressed(closeButtonId, componentId, close, [close]);
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
                        autoFocus={false}
                        clearIconColor={color}
                        inputContainerStyle={styles.inputContainerStyle}
                        inputStyle={styles.inputStyle}
                        keyboardAppearance={getKeyboardAppearanceFromTheme(theme)}
                        onChangeText={onChangeText}
                        placeholder={intl.formatMessage({id: 'find_channels.search_placeholder', defaultMessage: '搜索群聊、联系人'})}
                        placeholderTextColor={color}
                        searchIconColor={color}
                        selectionColor={theme.buttonBg}
                        showCancel={false}
                        showLoading={loading}
                        value={term}
                        testID='find_channels.search_bar'
                    />
                </View>
                <CategoryTabs
                    activeCategory={category}
                    onCategoryChange={setCategory}
                    enableInternalGroups={ENABLE_INTERNAL_GROUPS}
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
                        enableInternalGroups={ENABLE_INTERNAL_GROUPS}
                        keyboardOverlap={overlap}
                        testID='find_channels.unfiltered_list'
                    />
                    }
                    {Boolean(term) &&
                    <FilteredList
                        category={category}
                        close={close}
                        enableInternalGroups={ENABLE_INTERNAL_GROUPS}
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
