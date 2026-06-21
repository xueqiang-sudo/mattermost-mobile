// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';
import {useIntl} from 'react-intl';
import {ScrollView, Text, TouchableOpacity, View} from 'react-native';

import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

export type SearchTab = 'text' | 'files' | 'media' | 'members' | 'date';

type TabDef = {
    key: SearchTab;
    labelId: string;
    defaultLabel: string;
};

const TABS: TabDef[] = [
    {key: 'text', labelId: 'gm_settings.search_tab_text', defaultLabel: 'Messages'},
    {key: 'files', labelId: 'gm_settings.search_tab_files', defaultLabel: 'Files'},
    {key: 'media', labelId: 'gm_settings.search_tab_media', defaultLabel: 'Photos & Videos'},
    {key: 'members', labelId: 'gm_settings.search_tab_members', defaultLabel: 'Members'},
    {key: 'date', labelId: 'gm_settings.search_tab_date', defaultLabel: 'Date'},
];

type Props = {
    activeTab: SearchTab;
    onTabPress: (tab: SearchTab) => void;
}

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    scrollContent: {
        flexDirection: 'row',
        paddingHorizontal: 8,
    },
    tab: {
        paddingHorizontal: 12,
        paddingVertical: 10,
        alignItems: 'center',
    },
    tabActive: {
        borderBottomWidth: 2,
        borderBottomColor: theme.buttonBg,
    },
    tabLabel: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
        ...typography('Body', 100, 'SemiBold'),
    },
    tabLabelActive: {
        color: theme.buttonBg,
    },
}));

const TabBar = ({activeTab, onTabPress}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const styles = getStyleSheet(theme);

    return (
        <View style={styles.container}>
            <ScrollView
                horizontal={true}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                {TABS.map((tab) => {
                    const isActive = tab.key === activeTab;
                    return (
                        <TouchableOpacity
                            key={tab.key}
                            style={[styles.tab, isActive && styles.tabActive]}
                            onPress={() => onTabPress(tab.key)}
                        >
                            <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                                {intl.formatMessage({id: tab.labelId, defaultMessage: tab.defaultLabel})}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
        </View>
    );
};

export default TabBar;
