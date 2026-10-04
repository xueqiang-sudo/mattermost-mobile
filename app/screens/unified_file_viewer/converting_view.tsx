// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {useIntl} from 'react-intl';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';

import FileIcon from '@components/files/file_icon';
import {useTheme} from '@context/theme';
import {makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

type ConvertingViewProps = {
    fileInfo: FileInfo;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
    },
    icon: {
        marginBottom: 16,
    },
    fileName: {
        ...typography('Heading', 400, 'SemiBold'),
        color: theme.centerChannelColor,
        textAlign: 'center',
        marginBottom: 24,
    },
    activityIndicator: {
        marginBottom: 16,
    },
    text: {
        ...typography('Body', 200, 'Regular'),
        color: theme.centerChannelColor,
        textAlign: 'center',
        marginBottom: 8,
    },
    subtext: {
        ...typography('Body', 100, 'Regular'),
        color: theme.centerChannelColor,
        opacity: 0.64,
        textAlign: 'center',
    },
}));

const ConvertingView = ({fileInfo}: ConvertingViewProps) => {
    const theme = useTheme();
    const intl = useIntl();
    const styles = getStyleSheet(theme);

    return (
        <View style={styles.container}>
            <View style={styles.icon}>
                <FileIcon
                    file={fileInfo}
                    iconSize={80}
                />
            </View>
            <Text style={styles.fileName} numberOfLines={2}>
                {fileInfo.name}
            </Text>
            <ActivityIndicator
                size='small'
                color={theme.buttonBg}
                style={styles.activityIndicator}
            />
            <Text style={styles.text}>
                {intl.formatMessage({
                    id: 'file_viewer.converting',
                    defaultMessage: 'Converting document...',
                })}
            </Text>
            <Text style={styles.subtext}>
                {intl.formatMessage({
                    id: 'file_viewer.converting_subtitle',
                    defaultMessage: 'Please wait, preview will be available soon',
                })}
            </Text>
        </View>
    );
};

export default ConvertingView;
