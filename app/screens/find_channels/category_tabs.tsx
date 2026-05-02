// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';
import {Pressable, ScrollView, View} from 'react-native';

import FormattedText from '@components/formatted_text';
import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

export type FindChannelsCategory = 'all' | 'contacts' | 'channels' | 'discussion_groups';

const TAB_IDS: FindChannelsCategory[] = ['all', 'contacts', 'channels', 'discussion_groups'];

const TAB_MESSAGES = {
    all: {id: 'find_channels.category.all', defaultMessage: 'All'},
    contacts: {id: 'find_channels.category.contacts', defaultMessage: 'Contacts'},
    channels: {id: 'find_channels.category.channels', defaultMessage: 'Groups'},
    discussion_groups: {id: 'find_channels.category.discussion_groups', defaultMessage: 'Discussion groups'},
};

/**
 * 获取分类标签的样式
 */
const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        marginTop: 16,
        marginBottom: 12,
    },
    scroll: {
        flexGrow: 0,
    },
    tabRow: {
        flexDirection: 'row',
        paddingHorizontal: 0,
    },
    tab: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        marginRight: 8,
        borderRadius: 20,
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.15),
    },
    tabActive: {
        backgroundColor: theme.buttonBg,
        borderColor: theme.buttonBg,
    },
    tabText: {
        ...typography('Body', 200, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.7),
    },
    tabTextActive: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.buttonColor,
    },
}));

type Props = {
    activeCategory: FindChannelsCategory;
    onCategoryChange: (category: FindChannelsCategory) => void;
};

/**
 * 分类标签组件
 */
const CategoryTabs = ({activeCategory, onCategoryChange}: Props) => {
    const theme = useTheme();
    const styles = getStyleSheet(theme);

    /**
     * 渲染单个标签
     */
    const renderTab = useCallback((id: FindChannelsCategory) => {
        const isActive = activeCategory === id;
        const msg = TAB_MESSAGES[id];
        return (
            <Pressable
                key={id}
                onPress={() => onCategoryChange(id)}
                style={[styles.tab, isActive && styles.tabActive]}
                testID={`find_channels.category_tabs.${id}.button`}
                accessibilityState={{selected: isActive}}
            >
                <FormattedText
                    id={msg.id}
                    defaultMessage={msg.defaultMessage}
                    style={[styles.tabText, isActive && styles.tabTextActive]}
                />
            </Pressable>
        );
    }, [activeCategory, onCategoryChange, styles]);

    return (
        <View style={styles.container}>
            <ScrollView
                horizontal={true}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scroll}
                testID='find_channels.category_tabs'
            >
                <View style={styles.tabRow}>
                    {TAB_IDS.map(renderTab)}
                </View>
            </ScrollView>
        </View>
    );
};

export default CategoryTabs;
