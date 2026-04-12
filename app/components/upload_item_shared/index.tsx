// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useMemo} from 'react';
import {useIntl} from 'react-intl';
import {Platform, StyleSheet, Text, TouchableWithoutFeedback, View, type ViewStyle} from 'react-native';
import Animated from 'react-native-reanimated';

import CompassIcon from '@components/compass_icon';
import ExpoImage from '@components/expo_image';
import FileIcon from '@components/files/file_icon';
import ImageFile from '@components/files/image_file';
import UploadRetry from '@components/post_draft/uploads/upload_item/upload_retry';
import ProgressBar from '@components/progress_bar';
import {useTheme} from '@context/theme';
import type {DraftVideoLocalPostProps} from '@utils/file/draft_video_local_processing';
import {getFormattedFileSize, isImage, isVideo} from '@utils/file';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import {SHARED_UPLOAD_STYLES} from './constants';

/** padL + icon + gap + padR; padR clears inset close control (~24px) from text. */
const DRAFT_DOC_FILE_H_RESERVE = 8 + SHARED_UPLOAD_STYLES.ICON_SIZE + 8 + 36;

export interface UploadItemFile {
    id?: string;
    clientId?: string;
    name?: string;
    extension?: string;
    size?: number;
    uri?: string;
    failed?: boolean;
    width?: number;
    height?: number;
    mime_type?: string;
    draftVideoLocal?: DraftVideoLocalPostProps;
}

export interface UploadItemProps {
    file: UploadItemFile;
    onPress?: () => void;
    onRetry?: () => void;
    loading?: boolean;
    progress?: number;
    showRetryButton?: boolean;
    galleryStyles?: Animated.AnimateStyle<ViewStyle>;
    testID?: string;
    fullWidth?: boolean;
    isShareExtension?: boolean;
    forwardRef?: React.RefObject<unknown>;
    inViewPort?: boolean;
    hasError?: boolean;
    /** When set, image/video draft tiles use this square size (draft grid). */
    mediaTileSize?: number;
    /** When set, non-media draft row caps width here and shrink-wraps shorter names. */
    draftDocWidth?: number;
    /** When set, non-media files render as a square tile (same footprint as `mediaTileSize` in the draft strip). */
    draftDocTileSize?: number;
}

const getStyleSheet = makeStyleSheetFromTheme((theme) => {
    return {
        previewContainer: {
            borderRadius: 4,
            borderWidth: 1,
            borderColor: changeOpacity(theme.centerChannelColor, 0.16),
            backgroundColor: theme.centerChannelBg,
            alignItems: 'center',
            position: 'relative',
        },
        imageOnlyContainer: {
            width: SHARED_UPLOAD_STYLES.THUMBNAIL_SIZE,
            height: SHARED_UPLOAD_STYLES.THUMBNAIL_SIZE,
            padding: 0,
        },
        fileWithInfoContainer: {
            width: SHARED_UPLOAD_STYLES.FILE_CONTAINER_WIDTH,
            height: SHARED_UPLOAD_STYLES.FILE_CONTAINER_HEIGHT,
            flexDirection: 'row',
            alignItems: 'center',
            flexShrink: 0,
            gap: 8,
            paddingVertical: 12,
            paddingLeft: 8,
            paddingRight: 16,
        },
        /** Draft strip: no fixed width — grows with filename up to `draftDocWidth` (max). */
        fileWithInfoContainerAuto: {
            height: SHARED_UPLOAD_STYLES.FILE_CONTAINER_HEIGHT,
            flexDirection: 'row',
            alignItems: 'center',
            flexShrink: 0,
            alignSelf: 'flex-start',
            gap: 8,
            paddingVertical: 12,
            paddingLeft: 8,
            paddingRight: 36,
        },
        fullWidthContainer: {
            width: '100%',
            height: SHARED_UPLOAD_STYLES.FILE_CONTAINER_HEIGHT,
            flexDirection: 'row',
            alignItems: 'center',
            flexShrink: 0,
            gap: 8,
            paddingVertical: 12,
            paddingLeft: 20,
            paddingRight: 20,
        },
        iconContainer: {
            width: SHARED_UPLOAD_STYLES.ICON_SIZE,
            height: SHARED_UPLOAD_STYLES.ICON_SIZE,
            borderRadius: 4,
            justifyContent: 'center',
            alignItems: 'center',
        },
        imageContainer: {
            width: SHARED_UPLOAD_STYLES.THUMBNAIL_SIZE,
            height: SHARED_UPLOAD_STYLES.THUMBNAIL_SIZE,
            borderRadius: 4,
            marginRight: 8,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: changeOpacity(theme.centerChannelColor, 0.16),
            shadowColor: '#000000',
            shadowOffset: {
                width: 0,
                height: 2,
            },
            shadowOpacity: 0.08,
            shadowRadius: 3,
            elevation: 1,
        },
        imageOnlyThumbnail: {
            width: SHARED_UPLOAD_STYLES.THUMBNAIL_SIZE,
            height: SHARED_UPLOAD_STYLES.THUMBNAIL_SIZE,
            borderRadius: 4,
            overflow: 'hidden',
            position: 'relative',
            shadowColor: '#000000',
            shadowOffset: {
                width: 0,
                height: 2,
            },
            shadowOpacity: 0.08,
            shadowRadius: 3,
            elevation: 1,
        },
        imageOnlyImage: {
            width: SHARED_UPLOAD_STYLES.THUMBNAIL_SIZE,
            height: SHARED_UPLOAD_STYLES.THUMBNAIL_SIZE,
            borderRadius: 4,
        },
        /** Video frame fills the thumb so the play overlay centers to the tile, not the image layout box. */
        videoThumbImageFill: {
            ...StyleSheet.absoluteFillObject,
            borderRadius: 4,
        },
        fileInfo: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'flex-start',
            minWidth: 0,
        },
        /** Non-media draft file: do not stretch to fill a fixed row width. */
        fileInfoDraft: {
            flexGrow: 0,
            flexShrink: 1,
            justifyContent: 'center',
            alignItems: 'flex-start',
            minWidth: 0,
        },
        fileName: {
            color: theme.centerChannelColor,
            ...typography('Body', 200, 'SemiBold'),
            marginBottom: 2,
            width: '100%',
        },
        fileSize: {
            color: changeOpacity(theme.centerChannelColor, 0.64),
            ...typography('Body', 75, 'Regular'),
            width: '100%',
        },
        progress: {
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.1)',
            borderRadius: 4,
            justifyContent: 'flex-end',
        },
        progressContainer: {
            paddingVertical: undefined,
            position: undefined,
            justifyContent: undefined,
        },
        errorBorder: {
            borderColor: theme.errorTextColor,
            borderWidth: 2,
        },
        videoPlayOverlay: {
            ...StyleSheet.absoluteFillObject,
            justifyContent: 'center',
            alignItems: 'center',
            pointerEvents: 'none',
        },
        videoPlayBadge: {
            backgroundColor: 'rgba(0,0,0,0.35)',
            borderRadius: 18,
            padding: 6,
            justifyContent: 'center',
            alignItems: 'center',
        },
        /** Draft strip: document tile matches media thumb footprint. */
        draftDocTileContainer: {
            flexDirection: 'column',
            justifyContent: 'flex-start',
            alignItems: 'stretch',
            flexShrink: 0,
            padding: 6,
            overflow: 'hidden',
        },
        draftDocSquareBody: {
            flex: 1,
            width: '100%',
            minHeight: 0,
        },
        draftDocSquareIconWrap: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: 0,
        },
        draftDocSquareFooter: {
            flexShrink: 0,
            width: '100%',
            paddingTop: 2,
        },
        draftDocSquareName: {
            color: theme.centerChannelColor,
            ...typography('Body', 100, 'SemiBold'),
            marginBottom: 2,
        },
        draftDocSquareMeta: {
            color: changeOpacity(theme.centerChannelColor, 0.64),
            ...typography('Body', 75, 'Regular'),
        },
        androidUploadProgressTrack: {
            height: 4,
            borderRadius: 2,
            overflow: 'hidden',
            width: '100%',
            backgroundColor: 'rgba(255, 255, 255, 0.16)',
        },
        androidUploadProgressFill: {
            height: 4,
            borderRadius: 2,
        },
        /** Compress/upload in progress: dim preview; progress bar stays on top at full opacity. */
        uploadContentDisabled: {
            opacity: 0.5,
        },
    };
});

export default function UploadItemShared({
    file,
    onPress,
    onRetry,
    loading = false,
    progress = 0,
    showRetryButton = false,
    galleryStyles,
    testID,
    fullWidth = false,
    isShareExtension = false,
    forwardRef,
    inViewPort = false,
    hasError = false,
    mediaTileSize,
    draftDocWidth,
    draftDocTileSize,
}: UploadItemProps) {
    const theme = useTheme();
    const intl = useIntl();
    const style = getStyleSheet(theme);

    const tileDimStyle = useMemo((): ViewStyle | undefined => {
        if (mediaTileSize == null || mediaTileSize <= 0) {
            return undefined;
        }
        return {
            width: mediaTileSize,
            height: mediaTileSize,
        };
    }, [mediaTileSize]);

    const docTileDimStyle = useMemo((): ViewStyle | undefined => {
        if (draftDocTileSize == null || draftDocTileSize <= 0) {
            return undefined;
        }
        return {
            width: draftDocTileSize,
            height: draftDocTileSize,
        };
    }, [draftDocTileSize]);

    const playIconSize = useMemo(() => {
        if (mediaTileSize == null) {
            return 22;
        }
        return Math.max(18, Math.round(mediaTileSize * 0.24));
    }, [mediaTileSize]);

    const fileForCheck = useMemo(() => ({
        name: file.name,
        extension: file.extension,
        mime_type: file.mime_type,
    } as FileInfo), [file.name, file.extension, file.mime_type]);

    const isImageFile = useMemo(() => isImage(fileForCheck), [fileForCheck]);
    const isVideoFile = useMemo(() => isVideo(fileForCheck), [fileForCheck]);
    const isMediaTile = isImageFile || isVideoFile;
    const isDraftSquareDoc = !isMediaTile && docTileDimStyle != null;

    const docTileIconSize = useMemo(() => {
        if (draftDocTileSize == null || draftDocTileSize <= 0) {
            return 48;
        }
        return Math.min(48, Math.max(28, Math.round(draftDocTileSize * 0.36)));
    }, [draftDocTileSize]);

    const fileExtension = file.extension?.toUpperCase() || file.name?.split('.').pop()?.toUpperCase() || '';
    const formattedSize = getFormattedFileSize(file.size || 0);
    const unknownFileLabel = intl.formatMessage({id: 'upload_item.unknown_file', defaultMessage: 'Unknown file'});
    const preparingShort = intl.formatMessage({
        id: 'mobile.media_export.preparing_short',
        defaultMessage: 'Preparing…',
    });
    const exportingShort = intl.formatMessage({
        id: 'mobile.media_export.exporting_short',
        defaultMessage: 'Exporting…',
    });
    const localMeta = file.draftVideoLocal;
    const statusSubline = localMeta ?
        (localMeta.stage === 'resolving' ?
            preparingShort :
            `${exportingShort} ${Math.round(Math.min(1, Math.max(0, localMeta.progress)) * 100)}%`) :
        `${fileExtension && `${fileExtension} `}${formattedSize}`;

    const imageFileData = useMemo(() => ({
        ...fileForCheck,
        id: file.id,
        clientId: file.clientId,
        size: file.size,
        uri: file.uri,
        localPath: file.uri,
        width: file.width,
        height: file.height,
        failed: file.failed,
    } as FileInfo), [fileForCheck, file.id, file.clientId, file.size, file.uri, file.width, file.height, file.failed]);

    const thumbStyle = useMemo(() => (
        tileDimStyle ? [style.imageOnlyThumbnail, tileDimStyle] : style.imageOnlyThumbnail
    ), [style.imageOnlyThumbnail, tileDimStyle]);

    const imageStyle = useMemo(() => (
        tileDimStyle ? [style.imageOnlyImage, tileDimStyle] : style.imageOnlyImage
    ), [style.imageOnlyImage, tileDimStyle]);

    const contentBusy = loading && !file.failed;

    const fileDisplay = useMemo(() => {
        if (isImageFile) {
            if (isShareExtension) {
                return (
                    <View style={thumbStyle}>
                        <ExpoImage
                            source={{uri: file.uri}}
                            style={imageStyle}
                            contentFit='cover'
                            cachePolicy='memory'
                        />
                    </View>
                );
            }
            return (
                <View style={thumbStyle}>
                    <ImageFile
                        file={imageFileData}
                        forwardRef={forwardRef}
                        inViewPort={inViewPort}
                        contentFit='cover'
                    />
                </View>
            );
        }
        if (isVideoFile) {
            const showPlayBadge = !contentBusy;
            return (
                <View style={thumbStyle}>
                    {Boolean(file.uri) && (
                        <ExpoImage
                            source={{uri: file.uri}}
                            style={style.videoThumbImageFill}
                            contentFit='cover'
                            cachePolicy='memory'
                        />
                    )}
                    {showPlayBadge && (
                        <View style={style.videoPlayOverlay}>
                            <View style={style.videoPlayBadge}>
                                <CompassIcon
                                    name='play'
                                    size={playIconSize}
                                    color='rgba(255,255,255,0.95)'
                                />
                            </View>
                        </View>
                    )}
                </View>
            );
        }
        if (isDraftSquareDoc) {
            return (
                <View style={style.draftDocSquareBody}>
                    <View style={style.draftDocSquareIconWrap}>
                        <FileIcon
                            iconSize={docTileIconSize}
                            file={fileForCheck}
                        />
                    </View>
                    <View style={style.draftDocSquareFooter}>
                        <Text
                            style={style.draftDocSquareName}
                            numberOfLines={2}
                            ellipsizeMode='tail'
                        >
                            {file.name || unknownFileLabel}
                        </Text>
                        <Text
                            style={style.draftDocSquareMeta}
                            numberOfLines={1}
                            ellipsizeMode='tail'
                        >
                            {statusSubline}
                        </Text>
                    </View>
                </View>
            );
        }
        return (
            <View style={style.iconContainer}>
                <FileIcon
                    iconSize={48}
                    file={fileForCheck}
                />
            </View>
        );
    }, [isImageFile, isVideoFile, isDraftSquareDoc, contentBusy, docTileIconSize, statusSubline, unknownFileLabel, style.iconContainer, style.draftDocSquareBody, style.draftDocSquareFooter, style.draftDocSquareIconWrap, style.draftDocSquareMeta, style.draftDocSquareName, style.videoThumbImageFill, thumbStyle, imageStyle, style.videoPlayBadge, style.videoPlayOverlay, playIconSize, fileForCheck, isShareExtension, imageFileData, forwardRef, inViewPort, file.uri, file.name]);

    const loadingProgressValue = useMemo(
        () =>
            localMeta?.stage === 'resolving' ? 0.04 :
                localMeta?.stage === 'compressing' ? (localMeta.progress || 0) :
                    (progress || 0),
        [localMeta?.stage, localMeta?.progress, progress],
    );

    /** Fixed-size tiles need stretch so inner flex (draft doc / play overlay) fills the square. */
    const tileNeedsFill = Boolean((isMediaTile && tileDimStyle) || isDraftSquareDoc);

    const containerStyle = useMemo(() => {
        let containerStyleType;
        if (fullWidth && !isMediaTile) {
            containerStyleType = style.fullWidthContainer;
        } else if (isMediaTile) {
            containerStyleType = style.imageOnlyContainer;
        } else if (isDraftSquareDoc) {
            containerStyleType = style.draftDocTileContainer;
        } else if (draftDocWidth != null && draftDocWidth > 0) {
            containerStyleType = style.fileWithInfoContainerAuto;
        } else {
            containerStyleType = style.fileWithInfoContainer;
        }

        const baseStyles = [style.previewContainer, containerStyleType];

        let withTile = baseStyles;
        if (isMediaTile && tileDimStyle) {
            withTile = [...baseStyles, tileDimStyle];
        } else if (isDraftSquareDoc && docTileDimStyle) {
            withTile = [...baseStyles, docTileDimStyle];
        }

        if (tileNeedsFill) {
            withTile = [...withTile, {alignItems: 'stretch' as const}];
        }

        if (hasError) {
            return [
                ...withTile,
                style.errorBorder,
            ];
        }

        if (!isMediaTile && !isDraftSquareDoc && draftDocWidth != null && draftDocWidth > 0) {
            return [...withTile, {maxWidth: draftDocWidth}];
        }

        return withTile;
    }, [fullWidth, isMediaTile, isDraftSquareDoc, hasError, tileDimStyle, docTileDimStyle, draftDocWidth, tileNeedsFill, style.fileWithInfoContainer, style.fileWithInfoContainerAuto, style.imageOnlyContainer, style.fullWidthContainer, style.previewContainer, style.errorBorder, style.draftDocTileContainer]);

    /** Horizontal space taken by icon, gaps, and right inset (matches `fileWithInfoContainerAuto` padding). */
    const draftDocTextMaxWidth = useMemo(() => {
        if (draftDocWidth == null || draftDocWidth <= 0) {
            return undefined;
        }
        return Math.max(48, draftDocWidth - DRAFT_DOC_FILE_H_RESERVE);
    }, [draftDocWidth]);

    const fileInfoStyle = useMemo(() => {
        if (!isMediaTile && draftDocTextMaxWidth != null) {
            return [style.fileInfoDraft, {maxWidth: draftDocTextMaxWidth}];
        }
        return [style.fileInfo];
    }, [isMediaTile, draftDocTextMaxWidth, style.fileInfo, style.fileInfoDraft]);

    const tileInnerFill: ViewStyle | undefined = tileNeedsFill ?
        {flex: 1, width: '100%', minHeight: 0, alignSelf: 'stretch'} :
        undefined;

    const previewBody = (
        <Animated.View style={[galleryStyles, tileInnerFill]}>
            <View style={[contentBusy ? style.uploadContentDisabled : undefined, tileInnerFill]}>
                {fileDisplay}
            </View>
        </Animated.View>
    );

    return (
        <View
            style={containerStyle}
            testID={testID}
            accessibilityState={{disabled: contentBusy}}
        >
            {loading || !onPress ? (
                <View pointerEvents='none' style={tileInnerFill}>
                    {previewBody}
                </View>
            ) : (
                <TouchableWithoutFeedback onPress={onPress}>
                    <View style={tileInnerFill}>
                        {previewBody}
                    </View>
                </TouchableWithoutFeedback>
            )}

            {!isMediaTile && !isDraftSquareDoc && (
                <View style={fileInfoStyle}>
                    <Text
                        style={style.fileName}
                        numberOfLines={1}
                        ellipsizeMode='tail'
                    >
                        {file.name || unknownFileLabel}
                    </Text>
                    <Text style={style.fileSize}>
                        {statusSubline}
                    </Text>
                </View>
            )}

            {file.failed && showRetryButton && onRetry && (
                <UploadRetry
                    onPress={onRetry}
                />
            )}

            {loading && !file.failed && (
                <View
                    style={style.progress}
                    pointerEvents='none'
                >
                    {Platform.OS === 'android' ? (
                        <View style={style.progressContainer}>
                            <View style={style.androidUploadProgressTrack}>
                                <View
                                    style={[
                                        style.androidUploadProgressFill,
                                        {
                                            width: `${Math.min(100, Math.max(0, Math.round(loadingProgressValue * 100)))}%`,
                                            backgroundColor: theme.buttonBg,
                                        },
                                    ]}
                                />
                            </View>
                        </View>
                    ) : (
                        <ProgressBar
                            progress={loadingProgressValue}
                            color={theme.buttonBg}
                            containerStyle={style.progressContainer}
                        />
                    )}
                </View>
            )}
        </View>
    );
}
