// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {FlatList, Image, StyleSheet, Text, View, PermissionsAndroid, Platform} from 'react-native';
import {CameraRoll} from '@react-native-camera-roll/camera-roll';
import {getInfoAsync, copyAsync, cacheDirectory} from 'expo-file-system';
import {compressChatImageAsset} from '@utils/file/compress_chat_image';
import CompassIcon from '@components/compass_icon';
import TouchableWithFeedback from '@components/touchable_with_feedback';
import {debugLog} from '@store/debug_log';
import {changeOpacity} from '@utils/theme';

import {useFilePicker, type SelectedFile} from '../context/file_picker_context';

import type {Asset} from 'react-native-image-picker';

const NUM_COLUMNS = 4;
const PAGE_SIZE = 50;

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 40,
    },
    emptyText: {
        fontSize: 16,
        color: '#999',
        marginTop: 16,
    },
    list: {
        padding: 2,
    },
    imageContainer: {
        flex: 1,
        margin: 2,
        aspectRatio: 1,
        borderRadius: 4,
        overflow: 'hidden',
        position: 'relative',
    },
    image: {
        width: '100%',
        height: '100%',
        borderRadius: 4,
    },
    circleEmpty: {
        position: 'absolute',
        top: 4,
        right: 4,
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.8)',
        backgroundColor: 'rgba(0,0,0,0.15)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    circleSelected: {
        position: 'absolute',
        top: 4,
        right: 4,
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
        borderRadius: 4,
    },
});

type PhotoAsset = {
    node: {
        image: {
            uri: string;
            filename: string;
            width: number;
            height: number;
        };
        timestamp: number;
    };
};

export default function PhotoAlbumTab() {
    const intl = useIntl();
    const {dispatch, isFileSelected, canSelectMore, state} = useFilePicker();
    const [photos, setPhotos] = useState<PhotoAsset[]>([]);
    const [hasPermission, setHasPermission] = useState<boolean>(false);
    const [pageInfo, setPageInfo] = useState({has_next_page: false, end_cursor: ''});

    useEffect(() => {
        const requestPermission = async () => {
            if (Platform.OS === 'android') {
                const granted = await PermissionsAndroid.request(
                    PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
                    {
                        title: intl.formatMessage({
                            id: 'file_picker.photo.permission.title',
                            defaultMessage: 'Photo Access Permission',
                        }),
                        message: intl.formatMessage({
                            id: 'file_picker.photo.permission.message',
                            defaultMessage: 'This app needs access to your photos to let you share them.',
                        }),
                        buttonNeutral: intl.formatMessage({
                            id: 'file_picker.photo.permission.neutral',
                            defaultMessage: 'Ask Me Later',
                        }),
                        buttonNegative: intl.formatMessage({
                            id: 'file_picker.photo.permission.negative',
                            defaultMessage: 'Cancel',
                        }),
                        buttonPositive: intl.formatMessage({
                            id: 'file_picker.photo.permission.positive',
                            defaultMessage: 'OK',
                        }),
                    },
                );
                setHasPermission(granted === PermissionsAndroid.RESULTS.GRANTED);
            } else {
                // iOS permission is handled by the system
                setHasPermission(true);
            }
        };

        requestPermission();
    }, [intl]);

    useEffect(() => {
        const loadPhotos = async () => {
            if (!hasPermission) {
                return;
            }

            try {
                const result = await CameraRoll.getPhotos({
                    first: PAGE_SIZE,
                    assetType: 'Photos',
                    include: ['filename', 'imageSize'],
                });

                setPhotos(result.edges);
                setPageInfo(result.page_info);
            } catch (error) {
                console.error('Failed to load photos:', error);
            }
        };

        loadPhotos();
    }, [hasPermission]);

    const handlePhotoPress = useCallback((photo: PhotoAsset) => {
        debugLog('PhotoAlbumTab', 'handlePhotoPress called');
        const photoUri = photo.node.image.uri;
        const isSelected = isFileSelected(photoUri);
        debugLog('PhotoAlbumTab', `Photo is selected: ${isSelected}`);

        if (isSelected) {
            debugLog('PhotoAlbumTab', `Removing photo: ${photoUri}`);
            dispatch({type: 'REMOVE_FILE', fileId: photoUri});
            return;
        }

        if (!canSelectMore()) {
            debugLog('PhotoAlbumTab', 'Cannot select more files: max selection reached');
            return;
        }

        // 【关键改进】文件 I/O 操作异步执行，不阻塞 UI
        // setImmediate 会在当前帧渲染完成后执行，保证 UI 立刻响应
        setImmediate(async () => {
            try {
                const filename = photo.node.image.filename || photoUri.split('/').pop() || 'photo.jpg';
                const extension = filename.includes('.') ? filename.split('.').pop()?.toLowerCase() || 'jpg' : 'jpg';

                let fileUri = photoUri;
                let fileSize = 0;

                // Copy photo to cache directory
                if (cacheDirectory) {
                    try {
                        const cacheFileName = `photo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${extension}`;
                        const cacheUri = cacheDirectory + cacheFileName;

                        debugLog('PhotoAlbumTab', `Copying photo to cache: ${cacheUri}`);
                        const sourceInfo = await getInfoAsync(photoUri);
                        if (!sourceInfo.exists) {
                            throw new Error(`Source photo not found`);
                        }

                        await copyAsync({from: photoUri, to: cacheUri});
                        const copiedInfo = await getInfoAsync(cacheUri, {size: true});
                        if (copiedInfo.exists && 'size' in copiedInfo) {
                            fileUri = cacheUri;
                            fileSize = copiedInfo.size || 0;
                        }
                    } catch (e) {
                        debugLog('PhotoAlbumTab', `Cache copy failed: ${e instanceof Error ? e.message : String(e)}, using original`);
                        try {
                            const fileInfo = await getInfoAsync(photoUri, {size: true});
                            if (fileInfo.exists && 'size' in fileInfo) {
                                fileSize = fileInfo.size || 0;
                            }
                        } catch {}
                    }
                }

                const selectedFile: SelectedFile = {
                    id: fileUri,
                    clientId: fileUri,
                    name: filename,
                    uri: fileUri,
                    mime_type: `image/${extension === 'jpg' || extension === 'jpeg' ? 'jpeg' : extension}`,
                    size: fileSize,
                    source: 'album',
                    originalUri: photoUri,
                    extension,
                    width: photo.node.image.width,
                    height: photo.node.image.height,
                };

                debugLog('PhotoAlbumTab', 'Adding photo to selection:', {name: selectedFile.name, uri: selectedFile.uri});
                dispatch({type: 'ADD_FILE', file: selectedFile});
            } catch (error) {
                debugLog('PhotoAlbumTab', `Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
            }
        });
    }, [dispatch, isFileSelected, canSelectMore]);

    const renderPhoto = useCallback(({item}: {item: PhotoAsset}) => {
        const photoUri = item.node.image.uri;
        const isSelected = isFileSelected(photoUri);
        const canSelect = canSelectMore() || isSelected;

        return (
            <TouchableWithFeedback
                onPress={() => handlePhotoPress(item)}
                style={styles.imageContainer}
                type='opacity'
            >
                <>
                    <Image
                        source={{uri: item.node.image.uri}}
                        style={styles.image}
                        resizeMode='cover'
                    />

                    {isSelected ? (
                        <View style={styles.circleSelected}>
                            <CompassIcon
                                name='check'
                                size={16}
                                color='#fff'
                            />
                        </View>
                    ) : (
                        <View style={styles.circleEmpty}/>
                    )}

                    {!canSelect && !isSelected && (
                        <View style={styles.disabledOverlay}/>
                    )}
                </>
            </TouchableWithFeedback>
        );
    }, [handlePhotoPress, isFileSelected, canSelectMore]);

    const renderEmpty = useCallback(() => (
        <View style={styles.emptyContainer}>
            <CompassIcon
                name='image-outline'
                size={64}
                color={changeOpacity('#000', 0.3)}
            />
            <Text style={styles.emptyText}>
                {hasPermission
                    ? intl.formatMessage({
                        id: 'file_picker.photo.empty',
                        defaultMessage: 'No photos found',
                    })
                    : intl.formatMessage({
                        id: 'file_picker.photo.no_permission',
                        defaultMessage: 'Permission denied',
                    })}
            </Text>
        </View>
    ), [intl, hasPermission]);

    if (!hasPermission || photos.length === 0) {
        return renderEmpty();
    }

    return (
        <View style={styles.container}>
            <FlatList
                data={photos}
                renderItem={renderPhoto}
                keyExtractor={(item) => item.node.image.uri}
                numColumns={NUM_COLUMNS}
                contentContainerStyle={styles.list}
                showsVerticalScrollIndicator={false}
            />
        </View>
    );
}
