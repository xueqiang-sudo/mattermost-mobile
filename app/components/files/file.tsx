// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useRef, useState} from 'react';
import {View, TouchableWithoutFeedback, type GestureResponderEvent} from 'react-native';
import Animated from 'react-native-reanimated';

import TouchableWithFeedback from '@components/touchable_with_feedback';
import {useTheme} from '@context/theme';
import {useGalleryItem} from '@hooks/gallery';
import {useDownloadFileAndPreview} from '@hooks/files';
import {debugLog} from '@store/debug_log';
import {hasPdfPreview, isAudio, isDocument, isImage, isPdf, isTextFile, isVideo} from '@utils/file';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';

import AudioFile from './audio_file';
import DocumentFile from './document_file';
import FileActionDialog from './file_action_dialog';
import FileIcon from './file_icon';
import FileInfo from './file_info';
import FileOptionsIcon from './file_options_icon';
import ImageFile from './image_file';
import ImageFileOverlay from './image_file_overlay';
import VideoFile from './video_file';

import type {DocumentRef} from '@components/document';

type FileProps = {
    canDownloadFiles: boolean;
    enableSecureFilePreview: boolean;
    file: FileInfo;
    galleryIdentifier: string;
    index: number;
    inViewPort: boolean;
    isSingleImage?: boolean;
    nonVisibleImagesCount: number;
    onPress: (index: number) => void;
    onLongPress?: (event?: GestureResponderEvent) => void;
    channelName?: string;
    onOptionsPress?: (fileInfo: FileInfo) => void;
    optionSelected?: boolean;
    wrapperWidth?: number;
    showDate?: boolean;
    updateFileForGallery: (idx: number, file: FileInfo) => void;
    asCard?: boolean;
    isPressDisabled?: boolean;

    /** false：卡片宽度随内容收缩（微信样式非图附件）；true：铺满父级宽度 */
    expandCardToParentWidth?: boolean;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => {
    return {
        fileWrapper: {
            flexDirection: 'row',
            alignItems: 'center',
            minWidth: 0,
            borderWidth: 1,
            borderColor: changeOpacity(theme.centerChannelColor, 0.24),
            borderRadius: 5,
            paddingHorizontal: 12,
            paddingVertical: 8,
        },
        fileWrapperFillWidth: {
            width: '100%',
        },
        fileWrapperShrinkToContent: {
            alignSelf: 'flex-start',
        },
        fileWrapperFixedWidth: {
            width: '100%',
            maxWidth: 320,
        },
        iconWrapper: {
            marginTop: 8,
            marginRight: 8,
            marginBottom: 8,
            marginLeft: 8,
        },
        iconWrapperRight: {
            marginLeft: 'auto',
            paddingLeft: 8,
        },
        imageVideo: {
            height: 40,
            width: 40,
            margin: 4,
        },
        audioFile: {
            flexDirection: 'row',
            alignItems: 'center',
        },
    };
});

const File = ({
    asCard = false,
    canDownloadFiles,
    channelName,
    enableSecureFilePreview,
    file,
    galleryIdentifier,
    inViewPort = false,
    index,
    isSingleImage = false,
    nonVisibleImagesCount = 0,
    onLongPress,
    onOptionsPress,
    onPress,
    optionSelected,
    showDate = false,
    updateFileForGallery,
    wrapperWidth = 300,
    isPressDisabled = false,
    expandCardToParentWidth = true,
}: FileProps) => {
    const document = useRef<DocumentRef>(null);
    const theme = useTheme();
    const style = getStyleSheet(theme);
    const [showActionDialog, setShowActionDialog] = useState(false);
    const {downloadAndPreviewFile} = useDownloadFileAndPreview(enableSecureFilePreview);

    const handlePreviewPress = useCallback(() => {
        debugLog('FILE_CLICK', `handlePreviewPress called, document.current: ${document.current ? 'exists' : 'null'}`);
        if (document.current) {
            debugLog('FILE_CLICK', 'calling document.current.handlePreviewPress()');
            document.current.handlePreviewPress();
        } else {
            debugLog('FILE_CLICK', 'document.current is null, calling onPress(index)');
            onPress(index);
        }
    }, [index, onPress]);

    const {styles, onGestureEvent, ref} = useGalleryItem(galleryIdentifier, index, handlePreviewPress);

    const handleOnOptionsPress = useCallback(() => {
        onOptionsPress?.(file);
    }, [file, onOptionsPress]);

    // 智能文件路由：根据文件类型决定是直接打开还是显示对话框
    const handleShowFileActions = useCallback(() => {
        debugLog('FILE_CLICK', `clicked: ${file.name} mime:${file.mime_type} ext:${file.extension}`);
        console.log('[File] handleShowFileActions called:', {
            name: file.name,
            mime: file.mime_type,
            ext: file.extension,
            isPdf: isPdf(file),
            hasPdfPreview: hasPdfPreview(file),
            isTextFile: isTextFile(file),
            isDocument: isDocument(file),
            pdf_preview_id: file.pdf_preview_id,
        });

        // PDF 文件：直接打开
        if (isPdf(file)) {
            debugLog('FILE_CLICK', 'is PDF, opening preview');
            handlePreviewPress();
            return;
        }

        // Office 文件已转换为 PDF：直接打开
        if (hasPdfPreview(file)) {
            debugLog('FILE_CLICK', `has PDF preview (pdf_preview_id:${file.pdf_preview_id}), opening preview`);
            handlePreviewPress();
            return;
        }

        // 文本文件（.md, .json, .txt, .csv 等）：直接打开
        if (isTextFile(file)) {
            debugLog('FILE_CLICK', 'is text file, opening preview');
            handlePreviewPress();
            return;
        }

        // Office 文件未转换：显示对话框（带轮询）
        if (isDocument(file) && !isPdf(file)) {
            debugLog('FILE_CLICK', 'is document (not PDF), showing action dialog');
            console.log('[File] Setting showActionDialog to true');
            setShowActionDialog(true);
            return;
        }

        // 不可识别的文件：显示对话框（用其他应用打开）
        debugLog('FILE_CLICK', 'unrecognized file type, showing action dialog');
        console.log('[File] Unrecognized file type, setting showActionDialog to true');
        setShowActionDialog(true);
    }, [file, handlePreviewPress]);

    const handleCloseActionDialog = useCallback(() => {
        setShowActionDialog(false);
    }, []);

    const handleFilePreview = useCallback((fileInfo: FileInfo) => {
        // 轮询转换完成后，使用更新后的文件信息直接打开预览
        // 不使用 document.current.handlePreviewPress()，因为它使用的是原始的 file prop
        downloadAndPreviewFile(fileInfo);
    }, [downloadAndPreviewFile]);

    const handleFileOpenWithOtherApp = useCallback(async (fileInfo: FileInfo) => {
        // 下载文件并用其他应用打开
        downloadAndPreviewFile(fileInfo);
    }, [downloadAndPreviewFile]);

    const renderCardWithImage = (fileIcon: JSX.Element) => {
        const fileInfo = (
            <FileInfo
                channelName={channelName}
                disabled={isPressDisabled}
                file={file}
                fillRemainingRow={expandCardToParentWidth}
                onPress={handlePreviewPress}
                showDate={false}
            />
        );

        const cardRowStyle = [
            style.fileWrapper,
            style.fileWrapperFixedWidth,
        ];

        return (
            <View style={cardRowStyle}>
                {fileInfo}
                <View style={style.iconWrapperRight}>
                    {fileIcon}
                </View>
                {onOptionsPress &&
                <FileOptionsIcon
                    onPress={handleOnOptionsPress}
                    selected={optionSelected}
                />
                }
            </View>
        );
    };

    const touchableWithPreview = (
        <TouchableWithFeedback
            onPress={handlePreviewPress}
            onLongPress={onLongPress}
            delayLongPress={200}
            disabled={isPressDisabled}
            type={'opacity'}
        >
            <FileIcon
                file={file}
            />
        </TouchableWithFeedback>
    );

    let fileComponent;
    if (isVideo(file)) {
        const renderVideoFile = (
            <TouchableWithoutFeedback
                disabled={isPressDisabled}
                onPress={onGestureEvent}
                onLongPress={onLongPress}
                delayLongPress={200}
            >
                <Animated.View style={[styles, asCard ? style.imageVideo : null]}>
                    <VideoFile
                        file={file}
                        forwardRef={ref}
                        inViewPort={inViewPort}
                        isSingleImage={isSingleImage}
                        contentFit={'cover'}
                        wrapperWidth={wrapperWidth}
                        updateFileForGallery={updateFileForGallery}
                        index={index}
                    />
                    {Boolean(nonVisibleImagesCount) &&
                    <ImageFileOverlay
                        value={nonVisibleImagesCount}
                    />
                    }
                </Animated.View>
            </TouchableWithoutFeedback>
        );

        fileComponent = asCard ? renderCardWithImage(renderVideoFile) : renderVideoFile;
    } else if (isImage(file)) {
        const renderImageFile = (
            <TouchableWithoutFeedback
                onPress={onGestureEvent}
                onLongPress={onLongPress}
                delayLongPress={200}
                disabled={isPressDisabled}
            >
                <Animated.View style={[styles, asCard ? style.imageVideo : null]}>
                    <ImageFile
                        file={file}
                        forwardRef={ref}
                        inViewPort={inViewPort}
                        isSingleImage={isSingleImage}
                        contentFit={'cover'}
                        wrapperWidth={wrapperWidth}
                    />
                    {Boolean(nonVisibleImagesCount) &&
                    <ImageFileOverlay
                        value={nonVisibleImagesCount}
                    />
                    }
                </Animated.View>
            </TouchableWithoutFeedback>
        );

        fileComponent = asCard ? renderCardWithImage(renderImageFile) : renderImageFile;
    } else if (isDocument(file)) {
        // 所有文件都可以点击显示操作对话框
        const renderDocumentFile = (
            <View style={style.iconWrapper}>
                <TouchableWithFeedback
                    onPress={() => {
                        debugLog('FILE_CLICK', `TouchableWithFeedback pressed for document: ${file.name}`);
                        handleShowFileActions();
                    }}
                    onLongPress={onLongPress}
                    delayLongPress={200}
                    disabled={isPressDisabled}
                    type={'opacity'}
                >
                    <DocumentFile
                        ref={document}
                        canDownloadFiles={canDownloadFiles}
                        disabled={isPressDisabled}
                        enableSecureFilePreview={enableSecureFilePreview}
                        file={file}
                    />
                </TouchableWithFeedback>
            </View>
        );

        const fileInfo = (
            <FileInfo
                channelName={channelName}
                disabled={isPressDisabled}
                file={file}
                fillRemainingRow={expandCardToParentWidth}
                onPress={handleShowFileActions}
                showDate={showDate}
            />
        );

        fileComponent = (
            <>
                <View
                    style={[
                        style.fileWrapper,
                        expandCardToParentWidth ? style.fileWrapperFillWidth : style.fileWrapperShrinkToContent,
                    ]}
                >
                    {renderDocumentFile}
                    {fileInfo}
                    {onOptionsPress &&
                    <FileOptionsIcon
                        onPress={handleOnOptionsPress}
                        selected={optionSelected}
                    />
                    }
                </View>
                <FileActionDialog
                    visible={showActionDialog}
                    file={file}
                    onClose={handleCloseActionDialog}
                    onPreview={handleFilePreview}
                    onOpenWithOtherApp={handleFileOpenWithOtherApp}
                />
            </>
        );
    } else if (isAudio(file)) {
        const renderAudioFile = (
            <Animated.View style={[styles, asCard ? style.imageVideo : style.audioFile]}>
                <AudioFile
                    file={file}
                    canDownloadFiles={canDownloadFiles}
                    enableSecureFilePreview={enableSecureFilePreview}
                />
            </Animated.View>
        );

        fileComponent = asCard ? renderCardWithImage(touchableWithPreview) : renderAudioFile;
    } else {
        fileComponent = renderCardWithImage(touchableWithPreview);
    }
    return fileComponent;
};

export default File;
