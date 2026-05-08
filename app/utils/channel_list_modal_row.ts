// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Platform, StyleSheet, type ViewStyle} from 'react-native';

import {changeOpacity} from '@utils/theme';

function channelListModalRowBase(theme: Theme): ViewStyle {
    return {
        marginBottom: 8,
        borderRadius: 12,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.1),
        ...Platform.select({
            ios: {
                shadowColor: theme.centerChannelColor,
                shadowOffset: {width: 0, height: 1},
                shadowOpacity: 0.05,
                shadowRadius: 2,
            },
            android: {
                elevation: 1,
            },
            default: {},
        }),
    };
}

/**
 * 查找频道 / 已加入列表：单行外表面（卡片化列表行）。
 */
export function getChannelListModalRowSurfaceStyle(theme: Theme): ViewStyle {
    return {
        ...channelListModalRowBase(theme),
        paddingVertical: 10,
        paddingHorizontal: 12,
        backgroundColor: theme.centerChannelBg,
    };
}

/**
 * 联系人多选：分组列表内的行样式（无外边框、无阴影），选中态左侧强调条。
 */
export function getContactPickerGroupedRowStyle(theme: Theme, listRowIndex: number, selected: boolean): ViewStyle {
    const selectedBg = changeOpacity(theme.buttonBg, 0.1);
    const zebraBg = listRowIndex % 2 === 0 ? 'transparent' : changeOpacity(theme.centerChannelColor, 0.025);

    return {
        backgroundColor: selected ? selectedBg : zebraBg,
        borderLeftWidth: selected ? 3 : 0,
        borderLeftColor: selected ? theme.buttonBg : 'transparent',
    };
}
