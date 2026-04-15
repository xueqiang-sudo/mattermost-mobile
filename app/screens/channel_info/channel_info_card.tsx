// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {View, type StyleProp, type ViewStyle} from 'react-native';

import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';

import {CHANNEL_INFO_CARD_RADIUS} from './channel_info_constants';

type Props = {
    children: React.ReactNode;
    contentStyle?: StyleProp<ViewStyle>;
    style?: StyleProp<ViewStyle>;
    testID?: string;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    card: {
        borderRadius: CHANNEL_INFO_CARD_RADIUS,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.1),
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        overflow: 'hidden',
    },
}));

const ChannelInfoCard = ({children, contentStyle, style, testID}: Props) => {
    const theme = useTheme();
    const styles = getStyleSheet(theme);

    return (
        <View
            style={[styles.card, style]}
            testID={testID}
        >
            <View style={contentStyle}>
                {children}
            </View>
        </View>
    );
};

export default ChannelInfoCard;
