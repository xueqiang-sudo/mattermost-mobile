// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';
import {useIntl} from 'react-intl';
import {Alert, Text, TouchableOpacity, View} from 'react-native';
import {getInfoAsync} from 'expo-file-system';

import CompassIcon from '@components/compass_icon';
import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {SmartNoteBlock} from './smart_notebook_api';

type SmartNotebookFilePickerProps = {
    userId: string;
    onFilesSelected: (blocks: SmartNoteBlock[]) => void;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: 8,
        paddingVertical: 12,
    },
    optionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        marginHorizontal: 8,
        marginBottom: 8,
        backgroundColor: theme.centerChannelBg,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.1),
        minWidth: '45%',
    },
    optionIcon: {
        marginRight: 12,
    },
    optionText: {
        ...typography('Body', 200, 'Medium'),
        color: theme.centerChannelColor,
    },
}));

// 生成唯一ID
const generateId = () => `blk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// 根据文件扩展名识别类型（对齐 webapp：视频/音频存为 image，通过 caption 编码区分）
function getFileType(fileName: string, mimeType: string): 'image' | 'file' {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';

    if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tiff'].includes(ext)) {
        return 'image';
    }
    if (['mp4', 'avi', 'mov', 'mkv', 'webm', 'flv', 'wmv', 'm4v'].includes(ext)) {
        return 'image';
    }
    if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'wma'].includes(ext)) {
        return 'image';
    }

    if (mimeType.startsWith('image/') || mimeType.startsWith('video/') || mimeType.startsWith('audio/')) {
        return 'image';
    }

    return 'file';
}

function isVideo(fileName: string, mimeType: string): boolean {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    return ['mp4', 'avi', 'mov', 'mkv', 'webm', 'flv', 'wmv', 'm4v'].includes(ext) || mimeType.startsWith('video/');
}

function isAudio(fileName: string, mimeType: string): boolean {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    return ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'wma'].includes(ext) || mimeType.startsWith('audio/');
}

const SmartNotebookFilePicker = ({userId, onFilesSelected}: SmartNotebookFilePickerProps) => {
    const intl = useIntl();
    const theme = useTheme();
    const style = getStyleSheet(theme);

    // 选择群组文件（从云盘）
    const handleGroupFiles = useCallback(() => {
        // TODO: 实现群组文件选择
        Alert.alert(
            intl.formatMessage({id: 'smart_notebook.group_files', defaultMessage: '群组文件'}),
            intl.formatMessage({id: 'smart_notebook.coming_soon', defaultMessage: '功能开发中...'}),
        );
    }, [intl]);

    // 选择相册图片（支持多选）- 使用本地路径，不上传
    const handlePhotoAlbum = useCallback(async () => {
        try {
            const {launchImageLibrary} = await import('react-native-image-picker');
            launchImageLibrary(
                {
                    mediaType: 'mixed', // 支持图片和视频
                    quality: 1.0, // 保持原始质量
                    selectionLimit: 0, // 0 = 无限制，支持多选
                },
                async (response) => {
                    if (response.didCancel || response.errorCode || !response.assets?.length) {
                        return;
                    }

                    const blocks: SmartNoteBlock[] = [];
                    for (const asset of response.assets) {
                        if (!asset.uri || !asset.fileName) continue;

                        const blockType = asset.type?.startsWith('video') ? 'video' : 'image';

                        const block: SmartNoteBlock = {
                            id: generateId(),
                            type: blockType,
                            content: asset.uri, // 使用本地路径
                            order: 0,
                            meta: {
                                caption: asset.fileName,
                                width: asset.width,
                                height: asset.height,
                                size: asset.fileSize || 0,
                                mimeType: asset.type || (blockType === 'video' ? 'video/mp4' : 'image/jpeg'),
                                isLocal: true, // 标记为本地文件
                                duration: asset.duration, // 视频时长（毫秒）
                            },
                        };
                        blocks.push(block);
                    }

                    if (blocks.length > 0) {
                        onFilesSelected(blocks);
                    }
                },
            );
        } catch (e) {
            Alert.alert(
                intl.formatMessage({id: 'smart_notebook.selection_failed', defaultMessage: '选择失败'}),
                String(e),
            );
        }
    }, [intl, onFilesSelected]);

    // 选择手机文件 - 使用本地路径，不上传
    const handleLocalFiles = useCallback(async () => {
        try {
            const DocumentPicker = (await import('react-native-document-picker')).default;
            const fileType = Platform.select({ios: 'public.item', default: '*/*'});

            const result = await DocumentPicker.pick({
                type: [fileType],
                copyTo: 'cachesDirectory', // 复制到缓存目录
                allowMultiSelection: true,
            });

            if (!result || result.length === 0) return;

            const blocks: SmartNoteBlock[] = [];
            for (const file of result) {
                const fileName = file.name || 'file';
                const mimeType = file.type || 'application/octet-stream';
                const fileUri = file.fileCopyUri || file.uri;

                // 获取文件大小
                let fileSize = file.size || 0;
                if (!fileSize && fileUri) {
                    try {
                        const info = await getInfoAsync(fileUri);
                        if (info.exists) {
                            fileSize = info.size || 0;
                        }
                    } catch (e) {
                        // 忽略错误，使用 0
                    }
                }

                const blockType = getFileType(fileName, mimeType);

                // 对齐 webapp：视频/音频存为 image + caption 编码
                let content = fileUri;
                let caption = fileName;
                if (isVideo(fileName, mimeType)) {
                    content = fileUri;
                    caption = `[VIDEO:${fileUri}]${fileName}`;
                } else if (isAudio(fileName, mimeType)) {
                    content = '';
                    caption = `[AUDIO:${fileUri}]${fileName}`;
                }

                const block: SmartNoteBlock = {
                    id: generateId(),
                    type: blockType,
                    content,
                    order: 0,
                    meta: {
                        url: content,
                        fileName,
                        extension: fileName.split('.').pop() || '',
                        mmFileId: '',
                        caption,
                        size: fileSize,
                        mimeType,
                        isLocal: true,
                    },
                };
                blocks.push(block);
            }

            if (blocks.length > 0) {
                onFilesSelected(blocks);
            }
        } catch (e: any) {
            if (e?.code === 'DOCUMENT_PICKER_CANCELED') {
                return;
            }
            Alert.alert(
                intl.formatMessage({id: 'smart_notebook.selection_failed', defaultMessage: '选择失败'}),
                e?.message || String(e),
            );
        }
    }, [intl, onFilesSelected]);

    return (
        <View style={style.container}>
            <TouchableOpacity style={style.optionButton} onPress={handleGroupFiles}>
                <CompassIcon
                    name='folder-multiple-outline'
                    size={24}
                    color={theme.buttonBg}
                    style={style.optionIcon}
                />
                <Text style={style.optionText}>
                    {intl.formatMessage({id: 'smart_notebook.group_files', defaultMessage: '群组文件'})}
                </Text>
            </TouchableOpacity>

            <TouchableOpacity style={style.optionButton} onPress={handlePhotoAlbum}>
                <CompassIcon
                    name='image-multiple'
                    size={24}
                    color={theme.buttonBg}
                    style={style.optionIcon}
                />
                <Text style={style.optionText}>
                    {intl.formatMessage({id: 'smart_notebook.photo_album', defaultMessage: '相册'})}
                </Text>
            </TouchableOpacity>

            <TouchableOpacity style={style.optionButton} onPress={handleLocalFiles}>
                <CompassIcon
                    name='cellphone'
                    size={24}
                    color={theme.buttonBg}
                    style={style.optionIcon}
                />
                <Text style={style.optionText}>
                    {intl.formatMessage({id: 'smart_notebook.local_files', defaultMessage: '手机文件'})}
                </Text>
            </TouchableOpacity>
        </View>
    );
};

export default SmartNotebookFilePicker;
