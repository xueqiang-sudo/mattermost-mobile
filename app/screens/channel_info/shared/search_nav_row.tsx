// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {StyleSheet, TouchableOpacity} from 'react-native';

import CompassIcon from '@components/compass_icon';
import FormattedText from '@components/formatted_text';
import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

type Props = {
    onPress: () => void;
    testID?: string;
}

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    icon: {
        marginRight: 12,
        color: changeOpacity(theme.centerChannelColor, 0.56),
    },
    label: {
        flex: 1,
        color: theme.centerChannelColor,
        ...typography('Body', 200),
    },
    arrow: {
        color: changeOpacity(theme.centerChannelColor, 0.32),
    },
}));

const SearchNavRow = ({onPress, testID}: Props) => {
    const theme = useTheme();
    const styles = getStyleSheet(theme);

    return (
        <TouchableOpacity
            onPress={onPress}
            style={styles.container}
            testID={testID || 'channel_info.shared.search_nav_row'}
        >
            <FormattedText
                id='gm_settings.search_chat_history'
                defaultMessage='Search Chat History'
                style={styles.label}
            />
            <CompassIcon name='chevron-right' size={20} style={styles.arrow}/>
        </TouchableOpacity>
    );
};

export default SearchNavRow;
