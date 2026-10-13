// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {Image, ScrollView, StyleSheet, Text, View} from 'react-native';

import CompassIcon from '@components/compass_icon';
import {getFormattedFileSize} from '@utils/file';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';

import type {SharedItem} from '@mattermost/rnshare';

type Props = {
    files: SharedItem[];
    theme: Theme;
};

const getStyles = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        maxHeight: 90,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.16),
    },
    scrollContent: {
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    fileItem: {
        alignItems: 'center',
        marginRight: 10,
        width: 64,
    },
    imageThumb: {
        width: 56,
        height: 56,
        borderRadius: 6,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    fileIconContainer: {
        width: 56,
        height: 56,
        borderRadius: 6,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
        alignItems: 'center',
        justifyContent: 'center',
    },
    fileName: {
        fontSize: 10,
        color: changeOpacity(theme.centerChannelColor, 0.72),
        marginTop: 4,
        textAlign: 'center',
    },
}));

const isImageType = (type?: string) => {
    return type?.startsWith('image/');
};

const FilePreview = ({files, theme}: Props) => {
    const styles = getStyles(theme);

    if (!files || files.length === 0) {
        return null;
    }

    return (
        <View style={styles.container}>
            <ScrollView
                horizontal={true}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                {files.map((file, index) => {
                    const isImage = isImageType(file.type);
                    const name = file.filename || file.value || `file_${index}`;

                    return (
                        <View key={`${name}_${index}`} style={styles.fileItem}>
                            {isImage && file.value ? (
                                <Image
                                    source={{uri: `file://${file.value}`}}
                                    style={styles.imageThumb}
                                    resizeMode='cover'
                                />
                            ) : (
                                <View style={styles.fileIconContainer}>
                                    <CompassIcon
                                        name='file-document-outline'
                                        size={28}
                                        color={changeOpacity(theme.centerChannelColor, 0.56)}
                                    />
                                </View>
                            )}
                            <Text
                                style={styles.fileName}
                                numberOfLines={1}
                            >
                                {name}
                            </Text>
                        </View>
                    );
                })}
            </ScrollView>
        </View>
    );
};

export default FilePreview;
