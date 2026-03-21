// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';
import {Pressable, ScrollView, View} from 'react-native';

import FormattedText from '@components/formatted_text';
import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

export type FindChannelsCategory = 'all' | 'contacts' | 'channels';

const TAB_IDS: FindChannelsCategory[] = ['all', 'contacts', 'channels'];

const TAB_MESSAGES = {
    all: {id: 'find_channels.category.all', defaultMessage: 'All'},
    contacts: {id: 'find_channels.category.contacts', defaultMessage: 'Contacts'},
    channels: {id: 'find_channels.category.channels', defaultMessage: 'Group chats'},
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        marginTop: 12,
        marginBottom: 8,
    },
    scroll: {
        flexGrow: 0,
    },
    tabRow: {
        flexDirection: 'row',
        paddingHorizontal: 4,
    },
    tab: {
        paddingVertical: 10,
        paddingHorizontal: 14,
        marginRight: 4,
        position: 'relative' as const,
    },
    tabText: {
        ...typography('Body', 200, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.72),
    },
    tabTextActive: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.buttonBg,
    },
    underline: {
        position: 'absolute',
        bottom: 0,
        left: 14,
        right: 14,
        height: 2,
        borderRadius: 1,
        backgroundColor: theme.buttonBg,
    },
}));

type Props = {
    activeCategory: FindChannelsCategory;
    onCategoryChange: (category: FindChannelsCategory) => void;
};

const CategoryTabs = ({activeCategory, onCategoryChange}: Props) => {
    const theme = useTheme();
    const styles = getStyleSheet(theme);

    const renderTab = useCallback((id: FindChannelsCategory) => {
        const isActive = activeCategory === id;
        const msg = TAB_MESSAGES[id];
        return (
            <Pressable
                key={id}
                onPress={() => onCategoryChange(id)}
                style={styles.tab}
                testID={`find_channels.category_tabs.${id}.button`}
                accessibilityState={{selected: isActive}}
            >
                <FormattedText
                    id={msg.id}
                    defaultMessage={msg.defaultMessage}
                    style={[styles.tabText, isActive && styles.tabTextActive]}
                />
                {isActive && <View style={styles.underline}/>}
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
