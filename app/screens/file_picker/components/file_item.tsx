// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {Image, StyleSheet, Text, View} from 'react-native';
import CompassIcon from '@components/compass_icon';
import TouchableWithFeedback from '@components/touchable_with_feedback';
import {changeOpacity} from '@utils/theme';
import {getFileExtension} from '@utils/file';

import type FileModel from '@typings/database/models/servers/file';

const ITEM_MARGIN = 4;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        margin: ITEM_MARGIN,
        aspectRatio: 1,
        borderRadius: 8,
        overflow: 'hidden',
        position: 'relative',
    },
    image: {
        width: '100%',
        height: '100%',
        borderRadius: 8,
    },
    placeholder: {
        width: '100%',
        height: '100%',
        borderRadius: 8,
        backgroundColor: changeOpacity('#000', 0.06),
        alignItems: 'center',
        justifyContent: 'center',
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.3)',
        borderRadius: 8,
    },
    checkmark: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#07C160',
        alignItems: 'center',
        justifyContent: 'center',
    },
    disabledOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(255,255,255,0.5)',
        borderRadius: 8,
    },
    fileName: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 6,
        backgroundColor: 'rgba(0,0,0,0.6)',
    },
    fileNameText: {
        color: '#fff',
        fontSize: 11,
        textAlign: 'center',
        numberOfLines: 2,
    },
});

type Props = {
    file: FileModel;
    isSelected: boolean;
    canSelect: boolean;
    onPress: (file: FileModel) => void;
};

export default function FileItem({file, isSelected, canSelect, onPress}: Props) {
    const isImage = file.mime_type?.startsWith('image/');
    const extension = getFileExtension(file.extension || file.name);

    const handlePress = () => {
        if (canSelect) {
            onPress(file);
        }
    };

    return (
        <TouchableWithFeedback
            onPress={handlePress}
            style={styles.container}
            type='opacity'
        >
            <>
                {isImage && file.local_path ? (
                    <Image
                        source={{uri: file.local_path}}
                        style={styles.image}
                        resizeMode='cover'
                    />
                ) : (
                    <View style={styles.placeholder}>
                        <CompassIcon
                            name='file-document-outline'
                            size={40}
                            color={changeOpacity('#000', 0.4)}
                        />
                    </View>
                )}

                {!isImage && (
                    <View style={styles.fileName}>
                        <Text style={styles.fileNameText} numberOfLines={2}>
                            {file.name}
                        </Text>
                    </View>
                )}

                {isSelected && (
                    <View style={styles.checkmark}>
                        <CompassIcon
                            name='check'
                            size={16}
                            color='#fff'
                        />
                    </View>
                )}

                {!canSelect && !isSelected && (
                    <View style={styles.disabledOverlay}/>
                )}
            </>
        </TouchableWithFeedback>
    );
}
