// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {useIntl} from 'react-intl';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';

import ProgressBar from '@components/progress_bar';
import {useTheme} from '@context/theme';
import {makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

type LoadingViewProps = {
    progress: number;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
    },
    text: {
        ...typography('Body', 200, 'Regular'),
        color: theme.centerChannelColor,
        marginTop: 16,
        textAlign: 'center',
    },
    progress: {
        width: '80%',
        height: 4,
        marginTop: 16,
    },
}));

const LoadingView = ({progress}: LoadingViewProps) => {
    const theme = useTheme();
    const intl = useIntl();
    const styles = getStyleSheet(theme);

    return (
        <View style={styles.container}>
            <ActivityIndicator size='large' color={theme.buttonBg}/>
            <Text style={styles.text}>
                {intl.formatMessage({
                    id: 'file_viewer.loading',
                    defaultMessage: 'Loading file...',
                })}
            </Text>
            {progress > 0 && progress < 1 && (
                <View style={styles.progress}>
                    <ProgressBar
                        progress={progress}
                        color={theme.buttonBg}
                    />
                </View>
            )}
        </View>
    );
};

export default LoadingView;
