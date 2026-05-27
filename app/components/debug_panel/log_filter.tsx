// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';
import {Platform, StyleSheet, Text, TouchableOpacity, View} from 'react-native';

import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';

export type LogType = 'console' | 'network' | 'logcat';

type Tab = {
    key: LogType;
    label: string;
};

const TABS: Tab[] = [
    {key: 'console', label: 'Console'},
    {key: 'network', label: 'Network'},
    ...(Platform.OS === 'android' ? [{key: 'logcat' as LogType, label: 'Logcat'}] : []),
];

type Props = {
    activeTab: LogType;
    onTabChange: (tab: LogType) => void;
    theme: Theme;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flexDirection: 'row',
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.12),
        backgroundColor: theme.centerChannelBg,
    },
    tab: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 4,
    },
    tabText: {
        fontSize: 13,
        lineHeight: 18,
        fontWeight: '500',
        color: changeOpacity(theme.centerChannelColor, 0.56),
    },
    tabTextActive: {
        color: theme.buttonBg,
        fontWeight: '600',
    },
    activeIndicator: {
        position: 'absolute',
        bottom: 0,
        left: 8,
        right: 8,
        height: 2,
        borderRadius: 1,
        backgroundColor: theme.buttonBg,
    },
}));

const LogFilter = ({activeTab, onTabChange, theme}: Props) => {
    const styles = getStyleSheet(theme);

    const handleTabPress = useCallback((key: LogType) => {
        onTabChange(key);
    }, [onTabChange]);

    return (
        <View style={styles.container}>
            {TABS.map((tab) => {
                const isActive = tab.key === activeTab;
                return (
                    <TouchableOpacity
                        key={tab.key}
                        style={styles.tab}
                        onPress={() => handleTabPress(tab.key)}
                        activeOpacity={0.7}
                    >
                        <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                            {tab.label}
                        </Text>
                        {isActive && <View style={styles.activeIndicator}/>}
                    </TouchableOpacity>
                );
            })}
        </View>
    );
};

export default LogFilter;
