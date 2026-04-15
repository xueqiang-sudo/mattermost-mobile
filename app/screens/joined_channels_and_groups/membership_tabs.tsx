// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';
import {Pressable, ScrollView, View} from 'react-native';

import FormattedText from '@components/formatted_text';
import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

export type JoinedMembershipTab = 'channels' | 'group_messages';

const TAB_IDS: JoinedMembershipTab[] = ['channels', 'group_messages'];

const TAB_MESSAGES = {
    channels: {id: 'joined_channels.tab.channels', defaultMessage: 'Groups'},
    group_messages: {id: 'joined_channels.tab.group_messages', defaultMessage: 'Discussion groups'},
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
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
    activeTab: JoinedMembershipTab;
    onTabChange: (tab: JoinedMembershipTab) => void;
};

const MembershipTabs = ({activeTab, onTabChange}: Props) => {
    const theme = useTheme();
    const styles = getStyleSheet(theme);

    const renderTab = useCallback((id: JoinedMembershipTab) => {
        const isActive = activeTab === id;
        const msg = TAB_MESSAGES[id];
        return (
            <Pressable
                key={id}
                onPress={() => onTabChange(id)}
                style={[styles.tab, isActive && styles.tabActive]}
                testID={`joined_channels.membership_tabs.${id}.button`}
                accessibilityState={{selected: isActive}}
            >
                <FormattedText
                    id={msg.id}
                    defaultMessage={msg.defaultMessage}
                    style={[styles.tabText, isActive && styles.tabTextActive]}
                />
            </Pressable>
        );
    }, [activeTab, onTabChange, styles]);

    return (
        <View style={styles.container}>
            <ScrollView
                horizontal={true}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scroll}
                testID='joined_channels.membership_tabs'
            >
                <View style={styles.tabRow}>
                    {TAB_IDS.map(renderTab)}
                </View>
            </ScrollView>
        </View>
    );
};

export default MembershipTabs;
