// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {StyleSheet, View} from 'react-native';

import FormattedText from '@components/formatted_text';
import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
        backgroundColor: theme.centerChannelBg,
    },
    text: {
        ...typography('Body', 200, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.72),
        textAlign: 'center',
    },
}));

type Props = {
    pageName: string;
}

const UnderDevelopment = ({pageName}: Props) => {
    const theme = useTheme();
    const styles = getStyleSheet(theme);

    return (
        <View style={styles.container}>
            <FormattedText
                id='tab_bar.under_development'
                defaultMessage='{pageName} page is under development'
                values={{pageName}}
                style={styles.text}
            />
        </View>
    );
};

export default UnderDevelopment;
