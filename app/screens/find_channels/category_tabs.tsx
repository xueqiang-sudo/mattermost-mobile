// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useMemo} from 'react';
import {Pressable, ScrollView, View} from 'react-native';

import FormattedText from '@components/formatted_text';
import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

export type FindChannelsCategory = 'all' | 'contacts' | 'channels' | 'discussion_groups' | 'channels_and_discussion';

const TAB_IDS: FindChannelsCategory[] = ['all', 'contacts', 'channels_and_discussion', 'channels', 'discussion_groups'];

const TAB_MESSAGES = {
    all: {id: 'find_channels.category.all', defaultMessage: 'All'},
    contacts: {id: 'find_channels.category.contacts', defaultMessage: 'Contacts'},
    channels: {id: 'find_channels.category.channels', defaultMessage: 'Groups'},
    discussion_groups: {id: 'find_channels.category.discussion_groups', defaultMessage: 'Discussion groups'},
    channels_and_discussion: {id: 'find_channels.category.channels_and_discussion', defaultMessage: 'Groups & discussions'},
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
    enableInternalGroups: boolean;
};

/**
 * 分类标签组件
 */
const CategoryTabs = ({activeCategory, onCategoryChange, enableInternalGroups}: Props) => {
    const theme = useTheme();
    const styles = getStyleSheet(theme);

    const tabIds: FindChannelsCategory[] = useMemo(() => {
        if (!enableInternalGroups) {
            return ['all', 'contacts', 'channels_and_discussion'];
        }
        return ['all', 'contacts', 'channels', 'discussion_groups'];
    }, [enableInternalGroups]);

    const renderTab = useCallback((id: FindChannelsCategory) => {
        const isActive = activeCategory === id ||
            (!enableInternalGroups && id === 'channels_and_discussion' && (activeCategory === 'channels' || activeCategory === 'discussion_groups'));
        const msgKey = (!enableInternalGroups && id === 'channels_and_discussion') ? 'channels_and_discussion' : (id === 'discussion_groups' ? 'discussion_groups' : id as keyof typeof TAB_MESSAGES);
        const msg = TAB_MESSAGES[msgKey];
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
    }, [activeCategory, onCategoryChange, styles, enableInternalGroups]);

    return (
        <View style={styles.container}>
            <ScrollView
                horizontal={true}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scroll}
                testID='find_channels.category_tabs'
            >
                <View style={styles.tabRow}>
                    {tabIds.map(renderTab)}
                </View>
            </ScrollView>
        </View>
    );
};

export default CategoryTabs;
