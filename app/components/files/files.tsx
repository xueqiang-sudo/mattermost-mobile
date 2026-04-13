// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {DeviceEventEmitter, Dimensions, type StyleProp, StyleSheet, View, type ViewStyle} from 'react-native';
import Animated from 'react-native-reanimated';

import {Events} from '@constants';
import {GalleryInit} from '@context/gallery';
import {useIsTablet} from '@hooks/device';
import {useImageAttachments} from '@hooks/files';
import {usePreventDoubleTap} from '@hooks/utils';
import {isImage, isVideo} from '@utils/file';
import {fileToGalleryItem, openGalleryAtIndex} from '@utils/gallery';
import {getViewPortWidth} from '@utils/images';

import File from './file';

type FilesProps = {
    canDownloadFiles: boolean;
    enableSecureFilePreview: boolean;
    failed?: boolean;
    filesInfo: FileInfo[];
    layoutWidth?: number;

    /** 上限宽度（如本人带正文+附件时的 weChatContentMaxWidth），与 layoutWidth 缺省时的 fallback 取 min */
    maxPortraitWidth?: number;
    location: string;
    isReplyPost: boolean;
    postId?: string;
    postProps?: Record<string, unknown>;
    isPermalinkPreview?: boolean;
    isMediaOnlyMessage?: boolean;

    /** WeChat-style: document rows follow content width instead of stretching to portrait width. */
    shrinkWrapNonImage?: boolean;

    /** 本人微信：附件整体靠右，避免图片行 alignSelf:flex-start 在父级 flex-end 下仍留右侧大缝 */
    alignAttachmentsEnd?: boolean;
}

const MAX_VISIBLE_ROW_IMAGES = 99;

/** 多图/多视频时每行最多列数，列宽均分避免挤出气泡或遮挡头像 */
const MEDIA_GRID_MAX_COLS = 3;
const MEDIA_GRID_GAP = 6;

/** 多图网格总宽不超过屏宽比例，与气泡/时间戳区对齐，避免贴头像侧溢出 */
const FILES_GRID_MAX_WIDTH_FRAC = 0.92;

/** 单格最大边长，避免 2×2 缩略图过大 */
const MEDIA_GRID_CELL_MAX_EDGE = 114;

function pickMediaGridColumns(n: number): number {
    if (n <= 1) {
        return 1;
    }
    if (n === 2) {
        return 2;
    }
    if (n === 3 || n >= 6) {
        return 3;
    }
    return 2;
}

/** 与 renderImageRow 中多图网格一致的行宽，用于「图+文件」时文件区与上图对齐 */
function getMediaGridRowWidth(portraitW: number, imageCount: number): number {
    if (imageCount <= 1) {
        return portraitW;
    }
    const cols = Math.min(pickMediaGridColumns(imageCount), MEDIA_GRID_MAX_COLS);
    const rawCellW = Math.floor((portraitW - (MEDIA_GRID_GAP * (cols - 1))) / cols);
    const cellW = Math.min(rawCellW, MEDIA_GRID_CELL_MAX_EDGE);
    return (cols * cellW) + (MEDIA_GRID_GAP * Math.max(0, cols - 1));
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        marginTop: 5,
        flexShrink: 0,

        // 仅媒体消息时不要横向拉满，按内容自然宽度展示（对齐微信效果）。
        alignSelf: 'flex-start',
    },
    rowWrap: {
        flexWrap: 'wrap',
    },
    rowItemContainer: {
        flex: 1,
    },
    gridCell: {
        marginBottom: MEDIA_GRID_GAP,
    },
    gutter: {
        marginLeft: 8,
    },
    failed: {
        opacity: 0.5,
    },
    marginTop: {
        marginTop: 10,
    },
    rowPermalinkPreview: {
        marginTop: 0,
    },
});

const Files = ({
    canDownloadFiles,
    enableSecureFilePreview,
    failed,
    filesInfo,
    isReplyPost,
    layoutWidth,
    maxPortraitWidth,
    location,
    postId,
    postProps,
    isPermalinkPreview = false,
    isMediaOnlyMessage = false,
    shrinkWrapNonImage = false,
    alignAttachmentsEnd = false,
}: FilesProps) => {
    const galleryIdentifier = `${postId}-fileAttachments-${location}`;
    const [inViewPort, setInViewPort] = useState(false);
    const isTablet = useIsTablet();

    const portraitWidth = useMemo(() => {
        const windowW = Dimensions.get('window').width;
        const maxW = Math.floor(windowW * FILES_GRID_MAX_WIDTH_FRAC);
        const fallback = getViewPortWidth(isReplyPost, isTablet) - 6;
        const base = layoutWidth != null && layoutWidth > 0 ? layoutWidth : fallback;
        const cap = maxPortraitWidth != null && maxPortraitWidth > 0 ? maxPortraitWidth : Number.POSITIVE_INFINITY;
        return Math.min(base, maxW, cap);
    }, [isReplyPost, isTablet, layoutWidth, maxPortraitWidth]);

    const {images: imageAttachments, nonImages: nonImageAttachments} = useImageAttachments(filesInfo);
    const [filesForGallery, setFilesForGallery] = useState(() => [...imageAttachments, ...nonImageAttachments]);

    const mediaBlockWidth = useMemo(
        () => getMediaGridRowWidth(portraitWidth, imageAttachments.length),
        [imageAttachments.length, portraitWidth],
    );

    const attachmentIndex = (fileId: string) => {
        const index = filesForGallery.findIndex((file) => file.id === fileId);

        // 找不到时回退到 0，避免把 -1 传给 Gallery 导致初始页错误（视频不会自动播放）。
        return index >= 0 ? index : 0;
    };

    const handlePreviewPress = usePreventDoubleTap(useCallback((idx: number) => {
        const items = filesForGallery.map((f) => fileToGalleryItem(f, f.user_id, postProps, 0, f.id));
        openGalleryAtIndex(galleryIdentifier, idx, items);
    }, [filesForGallery, galleryIdentifier, postProps]));

    const updateFileForGallery = useCallback((idx: number, file: FileInfo) => {
        const newFilesForGallery = [...filesForGallery];
        newFilesForGallery[idx] = file;
        setFilesForGallery(newFilesForGallery);
    }, [filesForGallery]);

    const isSingleImage = useMemo(() => filesInfo.filter((f) => isImage(f) || isVideo(f)).length === 1, [filesInfo]);

    // 纯媒体消息不需要额外上边距，避免与时间行之间出现过大的空隙。
    const compactTopSpacing = isMediaOnlyMessage && !isPermalinkPreview;

    const rowAlignEndStyle = alignAttachmentsEnd ? {alignSelf: 'flex-end' as const} : undefined;

    // 微信样式下非图附件按内容收缩宽度（本人/他人一致）；非微信仍铺满可用宽度。
    const shrinkNonImageToContent = Boolean(shrinkWrapNonImage);

    // 仅「多图/多视频网格」下文件行与网格同宽；单条视频/单图 + 文件仍按内容收缩，避免短文件名却拉满一行。
    const expandCardToParentWidth = !shrinkNonImageToContent || imageAttachments.length >= 2;

    const renderItems = (
        items: FileInfo[],
        moreImagesCount = 0,
        includeGutter = false,
        isImageRow = false,
        suppressItemMarginTop = false,
    ) => {
        let nonVisibleImagesCount: number;

        // Flex:1 only for horizontal rows that use gutter spacing (multi-image strip).
        // Stacked non-media attachments must not flex or they stretch oddly inside the bubble.
        const shouldApplyFlex =
            includeGutter &&
            items.length > 1 &&
            !(isPermalinkPreview && !includeGutter);
        let container: StyleProp<ViewStyle> = shouldApplyFlex ? styles.rowItemContainer : undefined;
        const containerWithGutter = [container, styles.gutter];
        const wrapperWidth = portraitWidth;

        return items.map((file, idx) => {
            if (moreImagesCount && idx === MAX_VISIBLE_ROW_IMAGES - 1) {
                nonVisibleImagesCount = moreImagesCount;
            }

            if (idx !== 0 && includeGutter) {
                container = containerWithGutter;
            }
            const shouldRemoveMarginTop = isPermalinkPreview && (
                (isImageRow) || // Remove marginTop for all images in image row
                (!isImageRow && idx === 0 && imageAttachments.length === 0) // Remove marginTop for first non-image only if no images present
            );
            return (
                <View
                    style={[
                        container,
                        !suppressItemMarginTop && styles.marginTop,
                        compactTopSpacing && {marginTop: 0},
                        shouldRemoveMarginTop && {marginTop: 0},
                        suppressItemMarginTop && {
                            alignSelf: expandCardToParentWidth
                                ? 'stretch'
                                : (shrinkNonImageToContent
                                    ? (alignAttachmentsEnd ? 'flex-end' : 'flex-start')
                                    : 'stretch'),
                        },
                    ]}
                    testID={`${file.id}-file-container`}
                    key={file.id}
                >
                    <File
                        galleryIdentifier={galleryIdentifier}
                        key={file.id}
                        canDownloadFiles={canDownloadFiles}
                        enableSecureFilePreview={enableSecureFilePreview}
                        expandCardToParentWidth={expandCardToParentWidth}
                        file={file}
                        index={attachmentIndex(file.id!)}
                        onPress={handlePreviewPress}
                        isSingleImage={isSingleImage}
                        nonVisibleImagesCount={nonVisibleImagesCount}
                        updateFileForGallery={updateFileForGallery}
                        wrapperWidth={wrapperWidth}
                        inViewPort={inViewPort}
                    />
                </View>
            );
        });
    };

    /**
     * 渲染图片/视频网格行
     * @returns 图片/视频网格组件
     */
    const renderImageRow = () => {
        if (imageAttachments.length === 0) {
            return null;
        }

        const visibleImages = imageAttachments;
        const portraitPostWidth = portraitWidth;
        const isSingleAttachmentImageRow = visibleImages.length === 1;

        const nonVisibleImagesCount = 0;

        if (isSingleAttachmentImageRow) {
            return (
                <View
                    style={[
                        styles.row,
                        rowAlignEndStyle,
                        compactTopSpacing && {marginTop: 0},
                        isPermalinkPreview && {marginTop: 0},
                    ]}
                    testID='image-row'
                >
                    {renderItems(visibleImages, nonVisibleImagesCount, false, true)}
                </View>
            );
        }

        const cols = Math.min(pickMediaGridColumns(visibleImages.length), MEDIA_GRID_MAX_COLS);
        const rawCellW = Math.floor((portraitPostWidth - (MEDIA_GRID_GAP * (cols - 1))) / cols);

        // 本人与他人同一格宽上限，仅整行 alignSelf 区分左右
        const cellW = Math.min(rawCellW, MEDIA_GRID_CELL_MAX_EDGE);
        const gridRowWidth = (cols * cellW) + (MEDIA_GRID_GAP * Math.max(0, cols - 1));

        return (
            <View
                style={[
                    styles.row,
                    styles.rowWrap,
                    {width: gridRowWidth},
                    rowAlignEndStyle,
                    compactTopSpacing && {marginTop: 0},
                    isPermalinkPreview && {marginTop: 0},
                ]}
                testID='image-row'
            >
                {visibleImages.map((file, idx) => {
                    const col = idx % cols;
                    const marginRight = col < cols - 1 ? MEDIA_GRID_GAP : 0;
                    return (
                        <View
                            key={file.id}
                            style={[
                                styles.gridCell,
                                {
                                    width: cellW,
                                    marginRight,
                                    minWidth: 0,
                                },
                            ]}
                            testID={`${file.id}-file-container`}
                        >
                            <File
                                galleryIdentifier={galleryIdentifier}
                                canDownloadFiles={canDownloadFiles}
                                enableSecureFilePreview={enableSecureFilePreview}
                                expandCardToParentWidth={expandCardToParentWidth}
                                file={file}
                                index={attachmentIndex(file.id!)}
                                isSingleImage={isSingleImage}
                                nonVisibleImagesCount={0}
                                onPress={handlePreviewPress}
                                updateFileForGallery={updateFileForGallery}
                                wrapperWidth={cellW}
                                inViewPort={inViewPort}
                            />
                        </View>
                    );
                })}
            </View>
        );
    };

    useEffect(() => {
        const onScrollEnd = DeviceEventEmitter.addListener(Events.ITEM_IN_VIEWPORT, (viewableItems) => {
            if (`${location}-${postId}` in viewableItems) {
                setInViewPort(true);
            }
        });

        return () => onScrollEnd.remove();
    }, [location, postId]);

    useEffect(() => {
        setFilesForGallery([...imageAttachments, ...nonImageAttachments]);
    }, [imageAttachments, nonImageAttachments]);

    const contentWidth = portraitWidth;

    const nonImageAlignSelf = alignAttachmentsEnd ? 'flex-end' : 'flex-start';

    const nonImageStyleResolved: ViewStyle = shrinkNonImageToContent ? {
        maxWidth: contentWidth,
        ...(imageAttachments.length >= 2 && nonImageAttachments.length > 0
            ? {width: mediaBlockWidth}
            : {}),
        alignSelf: nonImageAlignSelf,
        gap: MEDIA_GRID_GAP,
        marginTop: imageAttachments.length > 0 ? MEDIA_GRID_GAP : 0,
    } : {
        width: contentWidth,
        maxWidth: '100%',
        alignSelf: nonImageAlignSelf,
        gap: MEDIA_GRID_GAP,
        marginTop: imageAttachments.length > 0 ? MEDIA_GRID_GAP : 0,
    };

    return (
        <GalleryInit galleryIdentifier={galleryIdentifier}>
            <Animated.View
                testID='files-container'
                style={[
                    failed ? styles.failed : undefined,
                    isPermalinkPreview && {marginTop: 0},
                    rowAlignEndStyle,
                ]}
            >
                {renderImageRow()}
                {Boolean(nonImageAttachments.length) && (
                    <View
                        style={nonImageStyleResolved}
                        testID='non-image-attachments'
                    >
                        {renderItems(nonImageAttachments, 0, false, false, true)}
                    </View>
                )}
            </Animated.View>
        </GalleryInit>
    );
};

export default React.memo(Files);
