// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';
import {useIntl} from 'react-intl';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import FileIcon from '@components/files/file_icon';
import {useTheme} from '@context/theme';
import {getFormattedFileSize} from '@utils/file';
import {makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

type UnsupportedViewProps = {
    fileInfo: FileInfo;
    onDownload: () => void;
    onOpenWith: () => void;
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
        marginBottom: 8,
    },
    fileSize: {
        ...typography('Body', 100, 'Regular'),
        color: theme.centerChannelColor,
        opacity: 0.64,
        textAlign: 'center',
        marginBottom: 32,
    },
    message: {
        ...typography('Body', 200, 'Regular'),
        color: theme.centerChannelColor,
        textAlign: 'center',
        marginBottom: 8,
    },
    submessage: {
        ...typography('Body', 100, 'Regular'),
        color: theme.centerChannelColor,
        opacity: 0.64,
        textAlign: 'center',
        marginBottom: 32,
    },
    buttons: {
        flexDirection: 'row',
        justifyContent: 'center',
        width: '100%',
    },
    button: {
        flex: 1,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 4,
        marginHorizontal: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    primaryButton: {
        backgroundColor: theme.buttonBg,
    },
    secondaryButton: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: theme.buttonBg,
    },
    primaryButtonText: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.buttonColor,
    },
    secondaryButtonText: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.buttonBg,
    },
}));

const UnsupportedView = ({fileInfo, onDownload, onOpenWith}: UnsupportedViewProps) => {
    const theme = useTheme();
    const intl = useIntl();
    const styles = getStyleSheet(theme);

    const handleDownload = useCallback(() => {
        onDownload();
    }, [onDownload]);

    const handleOpenWith = useCallback(() => {
        onOpenWith();
    }, [onOpenWith]);

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
            <Text style={styles.fileSize}>
                {getFormattedFileSize(fileInfo.size)}
            </Text>
            <Text style={styles.message}>
                {intl.formatMessage({
                    id: 'file_viewer.unsupported',
                    defaultMessage: 'This file type cannot be previewed',
                })}
            </Text>
            <Text style={styles.submessage}>
                {intl.formatMessage({
                    id: 'file_viewer.unsupported_subtitle',
                    defaultMessage: 'You can download it and open with another app',
                })}
            </Text>
            <View style={styles.buttons}>
                <Pressable
                    style={[styles.button, styles.secondaryButton]}
                    onPress={handleDownload}
                >
                    <Text style={styles.secondaryButtonText}>
                        {intl.formatMessage({
                            id: 'file_viewer.download',
                            defaultMessage: 'Download',
                        })}
                    </Text>
                </Pressable>
                <Pressable
                    style={[styles.button, styles.primaryButton]}
                    onPress={handleOpenWith}
                >
                    <Text style={styles.primaryButtonText}>
                        {intl.formatMessage({
                            id: 'file_viewer.open_with',
                            defaultMessage: 'Open with',
                        })}
                    </Text>
                </Pressable>
            </View>
        </View>
    );
};

export default UnsupportedView;
