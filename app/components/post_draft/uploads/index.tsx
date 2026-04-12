// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
    ScrollView,
    Text,
    View,
    Platform,
    useWindowDimensions,
    type LayoutChangeEvent,
} from 'react-native';
import Animated, {useAnimatedStyle, useSharedValue, withTiming} from 'react-native-reanimated';

import {GalleryInit} from '@context/gallery';
import {useTheme} from '@context/theme';
import DraftEditPostUploadManager from '@managers/draft_upload_manager';
import {isImage, isVideo} from '@utils/file';
import {fileToGalleryItem, openGalleryAtIndex} from '@utils/gallery';
import {makeStyleSheetFromTheme} from '@utils/theme';

import UploadItem from './upload_item/upload_item_wrapper';

/** Min / max height for the attachment preview block (media wraps; cap avoids eating the screen). */
const PREVIEW_HEIGHT_MIN = 76;
const PREVIEW_HEIGHT_CAP = 380;
/** Draft media grid: column count and gaps (matches WeChat-style input preview). */
const DRAFT_MEDIA_GRID_COLUMNS = 3;
const DRAFT_MEDIA_GRID_GAP = 6;
const DRAFT_MEDIA_ROW_H_PAD = 12;
const PREVIEW_HEIGHT_MIN_EMPTY = 0;
const ERROR_HEIGHT_MAX = 20;
const ERROR_HEIGHT_MIN = 0;

function isDraftMediaFile(file: FileInfo): boolean {
    return isImage(file) || isVideo(file);
}

type Props = {
    currentUserId: string;
    files: FileInfo[];
    uploadFileError: React.ReactNode;
    channelId: string;
    rootId: string;
}

const getStyleSheet = makeStyleSheetFromTheme((theme) => {
    return {
        previewContainer: {
            display: 'flex',
            flexDirection: 'column',
            alignSelf: 'stretch',
            width: '100%',
        },
        fileContainer: {
            display: 'flex',
            flexDirection: 'column',
            height: 0,
            overflow: 'visible',
        },
        innerColumn: {
            flexDirection: 'column',
            width: '100%',
        },
        mediaRow: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'flex-start',
            alignItems: 'flex-start',
            width: '100%',
            maxWidth: '100%',
            paddingHorizontal: DRAFT_MEDIA_ROW_H_PAD,
            // Remove 按钮向上偏移，需留出空间避免被父级裁切或与上行重叠感
            paddingTop: 14,
            paddingBottom: 2,
        },
        filesScroll: {
            maxHeight: 80,
        },
        scrollView: {
            flexGrow: 0,
        },
        scrollViewContent: {
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'flex-start',
            paddingLeft: DRAFT_MEDIA_ROW_H_PAD,
            paddingRight: DRAFT_MEDIA_ROW_H_PAD,
            paddingBottom: 4,
        },
        errorContainer: {
            height: 0,
        },
        errorTextContainer: {
            marginTop: Platform.select({
                ios: 4,
                android: 2,
            }),
            marginHorizontal: 12,
            flex: 1,
        },
        warning: {
            color: theme.errorTextColor,
            flex: 1,
            flexWrap: 'wrap',
        },
    };
});

function Uploads({
    currentUserId,
    files,
    uploadFileError,
    channelId,
    rootId,
}: Props) {
    const galleryIdentifier = `${channelId}-uploadedItems-${rootId}`;
    const theme = useTheme();
    const style = getStyleSheet(theme);
    const {width: windowWidth} = useWindowDimensions();

    const errorHeight = useSharedValue(ERROR_HEIGHT_MIN);
    const containerHeight = useSharedValue(PREVIEW_HEIGHT_MIN_EMPTY);
    const filesForGallery = useRef(files.filter((f) => !f.failed && !DraftEditPostUploadManager.isUploading(f.clientId!)));
    const hasFiles = files.length > 0;

    const [innerLayoutHeight, setInnerLayoutHeight] = useState(0);

    const {mediaItems, docItems} = useMemo(() => {
        const media: Array<{file: FileInfo; index: number}> = [];
        const docs: Array<{file: FileInfo; index: number}> = [];
        files.forEach((f, i) => {
            if (isDraftMediaFile(f)) {
                media.push({file: f, index: i});
            } else {
                docs.push({file: f, index: i});
            }
        });
        return {mediaItems: media, docItems: docs};
    }, [files]);

    const mediaTileSize = useMemo(() => {
        const usable =
            windowWidth -
            DRAFT_MEDIA_ROW_H_PAD * 2 -
            DRAFT_MEDIA_GRID_GAP * (DRAFT_MEDIA_GRID_COLUMNS - 1);
        const raw = Math.floor(usable / DRAFT_MEDIA_GRID_COLUMNS);
        return Math.min(Math.max(raw, 72), 120);
    }, [windowWidth]);

    const previewHeightCap = useMemo(() => {
        const docStripAllowance = docItems.length > 0 ? 88 : 0;
        if (mediaItems.length === 0) {
            return Math.min(
                PREVIEW_HEIGHT_CAP,
                Math.max(PREVIEW_HEIGHT_MIN, docStripAllowance),
            );
        }
        const rows = Math.ceil(mediaItems.length / DRAFT_MEDIA_GRID_COLUMNS);
        const estimated =
            rows * (mediaTileSize + DRAFT_MEDIA_GRID_GAP) +
            DRAFT_MEDIA_ROW_H_PAD +
            docStripAllowance;
        return Math.min(PREVIEW_HEIGHT_CAP, Math.max(PREVIEW_HEIGHT_MIN, estimated));
    }, [mediaItems.length, docItems.length, mediaTileSize]);

    const errorAnimatedStyle = useAnimatedStyle(() => {
        return {
            height: withTiming(errorHeight.value),
        };
    });

    const containerAnimatedStyle = useAnimatedStyle(() => ({
        height: withTiming(containerHeight.value),
    }));

    const onInnerLayout = useCallback((e: LayoutChangeEvent) => {
        const h = Math.ceil(e.nativeEvent.layout.height);
        setInnerLayoutHeight((prev) => (prev === h ? prev : h));
    }, []);

    const fileContainerStyle = useMemo(() => ({
        paddingBottom: files.length ? 5 : 0,
    }), [files.length]);

    useEffect(() => {
        filesForGallery.current = files.filter((f) => !f.failed && !DraftEditPostUploadManager.isUploading(f.clientId!));
    }, [files]);

    useEffect(() => {
        if (uploadFileError) {
            errorHeight.value = ERROR_HEIGHT_MAX;
        } else {
            errorHeight.value = ERROR_HEIGHT_MIN;
        }
    }, [errorHeight, uploadFileError]);

    useEffect(() => {
        if (!hasFiles) {
            containerHeight.value = PREVIEW_HEIGHT_MIN_EMPTY;
            setInnerLayoutHeight(0);
            return;
        }
        const h = Math.min(
            Math.max(innerLayoutHeight || PREVIEW_HEIGHT_MIN, PREVIEW_HEIGHT_MIN),
            previewHeightCap,
        );
        containerHeight.value = h;
    }, [containerHeight, hasFiles, innerLayoutHeight, previewHeightCap]);

    const openGallery = useCallback((file: FileInfo) => {
        const items = filesForGallery.current.map((f) => fileToGalleryItem(f, currentUserId, undefined, 0, f.id || f.clientId));
        const index = filesForGallery.current.findIndex((f) => f.clientId === file.clientId);
        openGalleryAtIndex(galleryIdentifier, index, items, true);
    }, [currentUserId, galleryIdentifier]);

    return (
        <GalleryInit galleryIdentifier={galleryIdentifier}>
            <View
                style={style.previewContainer}
                testID='uploads'
            >
                <Animated.View
                    style={[style.fileContainer, fileContainerStyle, containerAnimatedStyle]}
                >
                    <View
                        style={style.innerColumn}
                        onLayout={onInnerLayout}
                    >
                        {Boolean(mediaItems.length) && (
                            <View
                                style={style.mediaRow}
                                testID='uploads-media-row'
                            >
                                {mediaItems.map(({file, index}, mediaOrdinal) => (
                                    <UploadItem
                                        channelId={channelId}
                                        galleryIdentifier={galleryIdentifier}
                                        index={index}
                                        file={file}
                                        key={file.clientId || file.id}
                                        mediaGridMarginRight={
                                            (mediaOrdinal + 1) % DRAFT_MEDIA_GRID_COLUMNS === 0 ?
                                                0 :
                                                DRAFT_MEDIA_GRID_GAP
                                        }
                                        mediaTileSize={mediaTileSize}
                                        openGallery={openGallery}
                                        rootId={rootId}
                                        variant='mediaGrid'
                                    />
                                ))}
                            </View>
                        )}
                        {Boolean(docItems.length) && (
                            <ScrollView
                                horizontal={true}
                                style={[style.scrollView, style.filesScroll]}
                                contentContainerStyle={style.scrollViewContent}
                                keyboardShouldPersistTaps={'handled'}
                                testID='uploads-files-row'
                            >
                                {docItems.map(({file, index}) => (
                                    <UploadItem
                                        channelId={channelId}
                                        galleryIdentifier={galleryIdentifier}
                                        index={index}
                                        file={file}
                                        key={file.clientId || file.id}
                                        openGallery={openGallery}
                                        rootId={rootId}
                                        variant='strip'
                                    />
                                ))}
                            </ScrollView>
                        )}
                    </View>
                </Animated.View>

                <Animated.View
                    style={[style.errorContainer, errorAnimatedStyle]}
                >
                    {Boolean(uploadFileError) &&
                    <View style={style.errorTextContainer}>

                        <Text style={style.warning}>
                            {uploadFileError}
                        </Text>

                    </View>
                    }
                </Animated.View>
            </View>
        </GalleryInit>
    );
}

export default React.memo(Uploads);
