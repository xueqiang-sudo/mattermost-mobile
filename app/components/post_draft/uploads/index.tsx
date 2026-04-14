// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
    Text,
    View,
    Platform,
    ScrollView,
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
const DRAFT_MEDIA_GRID_GAP = 6;
const DRAFT_MEDIA_ROW_H_PAD = 12;

/** Horizontal strip: fixed-ish thumb size (does not use full-width 3-column math). */
const DRAFT_STRIP_MEDIA_MIN = 84;
const DRAFT_STRIP_MEDIA_MAX = 102;

/** Bottom padding on the animated file container when attachments exist (must match height math below). */
const FILE_CONTAINER_PAD_BOTTOM = 5;

/** `draftAttachmentsScrollContent` paddingTop/Bottom + `fileContainerStyle` paddingBottom when files exist */
const DRAFT_STRIP_VERTICAL_CHROME = 14 + 2 + FILE_CONTAINER_PAD_BOTTOM;
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
            overflow: 'hidden',
            alignSelf: 'stretch',
        },
        innerColumn: {
            flexDirection: 'column',
            width: '100%',
        },
        draftAttachmentsScroll: {
            width: '100%',
            flexGrow: 0,
        },
        draftAttachmentsScrollContent: {
            flexDirection: 'row',

            /** flex-start：外层高度略小于内容时优先保留顶部（含关闭按钮），避免 flex-end 从上方裁切 */
            alignItems: 'flex-start',
            paddingHorizontal: DRAFT_MEDIA_ROW_H_PAD,
            paddingTop: 14,
            paddingBottom: 2,
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

    const draftStripMediaSize = useMemo(() => {
        return Math.min(
            DRAFT_STRIP_MEDIA_MAX,
            Math.max(DRAFT_STRIP_MEDIA_MIN, Math.round(windowWidth * 0.24)),
        );
    }, [windowWidth]);

    /** onLayout 前用于首帧高度，须包含 scroll 内边距 + 外层 paddingBottom，否则动画高度会小于真实内容并从顶部裁切 */
    const estimatedStripHeight = useMemo(() => {
        if (!files.length) {
            return PREVIEW_HEIGHT_MIN_EMPTY;
        }
        return DRAFT_STRIP_VERTICAL_CHROME + draftStripMediaSize;
    }, [files.length, draftStripMediaSize]);

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
        paddingBottom: files.length ? FILE_CONTAINER_PAD_BOTTOM : 0,
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

        /**
         * `onLayout` 量到的是内层高度，不含本层 `paddingBottom`；若动画高度不加 padding，总框会少一截，
         * 底部缩略图/关闭钮会被裁切或被下方 `actionsContainer` 盖住。
         */
        const paddingB = FILE_CONTAINER_PAD_BOTTOM;
        const measuredCore =
            innerLayoutHeight > 0 ? innerLayoutHeight + paddingB : estimatedStripHeight;
        const fromLayout = Math.max(measuredCore, estimatedStripHeight);
        const h = Math.min(
            Math.max(fromLayout, PREVIEW_HEIGHT_MIN),
            PREVIEW_HEIGHT_CAP,
        );
        containerHeight.value = h;
    }, [containerHeight, estimatedStripHeight, hasFiles, innerLayoutHeight]);

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
                        {Boolean(files.length) && (
                            <ScrollView
                                horizontal={true}
                                showsHorizontalScrollIndicator={true}
                                style={style.draftAttachmentsScroll}
                                contentContainerStyle={style.draftAttachmentsScrollContent}
                                keyboardShouldPersistTaps='handled'
                                testID='uploads-draft-attachments'
                            >
                                {files.map((file, index) => (
                                    <View
                                        key={file.clientId || file.id}
                                        style={{
                                            flexShrink: 0,
                                            marginRight: index < files.length - 1 ? DRAFT_MEDIA_GRID_GAP : 0,
                                        }}
                                    >
                                        <UploadItem
                                            channelId={channelId}
                                            galleryIdentifier={galleryIdentifier}
                                            index={index}
                                            file={file}
                                            mediaTileSize={draftStripMediaSize}
                                            openGallery={openGallery}
                                            rootId={rootId}
                                            variant={isDraftMediaFile(file) ? 'mediaGrid' : 'docTile'}
                                        />
                                    </View>
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
