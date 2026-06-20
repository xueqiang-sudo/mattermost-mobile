// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';

import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

type DangerButton = {
    label: string;
    onPress: () => void;
    testID?: string;
}

type Props = {
    buttons: DangerButton[];
    testID?: string;
}

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    section: {
        marginTop: 8,
        paddingTop: 12,
        paddingHorizontal: 16,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.12),
        gap: 10,
    },
    button: {
        width: '100%',
        paddingVertical: 12,
        borderRadius: 4,
        backgroundColor: 'rgba(210, 75, 78, 0.08)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonText: {
        color: '#d24b4e',
        ...typography('Body', 200, 'SemiBold'),
    },
}));

const DangerSection = ({buttons, testID}: Props) => {
    const theme = useTheme();
    const styles = getStyleSheet(theme);

    if (!buttons.length) {
        return null;
    }

    return (
        <View style={styles.section} testID={testID || 'channel_info.shared.danger_section'}>
            {buttons.map((btn) => (
                <TouchableOpacity
                    key={btn.label}
                    onPress={btn.onPress}
                    style={styles.button}
                    testID={btn.testID}
                >
                    <Text style={styles.buttonText}>{btn.label}</Text>
                </TouchableOpacity>
            ))}
        </View>
    );
};

export default DangerSection;
