// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useRef, useState, useEffect} from 'react';
import {useIntl} from 'react-intl';
import {
    Alert,
    Dimensions,
    FlatList,
    Modal,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import {Image} from 'expo-image';
import Video, {type VideoRef} from 'react-native-video';

import CompassIcon from '@components/compass_icon';
import {debugLog} from '@store/debug_log';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {SmartNoteBlock} from './smart_notebook_api';

// ---- Types ----

type BlockEditorProps = {
    blocks: SmartNoteBlock[];
    onChange: (blocks: SmartNoteBlock[]) => void;
    theme: Theme;
    editable: boolean;
    serverUrl?: string; // 【关键修复】用于构建完整的图片 URL
    bearerToken?: string; // 用于图片请求的鉴权头
    onFocusedIndexChange?: (index: number) => void;
    pendingFocusIndex?: number | null;
    onFocusApplied?: () => void;
    onScrollToBlock?: (index: number) => void; // 请求滚动到指定 block
    onPreviewFile?: (fileInfo: FileInfo) => void; // 预览文件
    onPreviewImage?: (fileInfo: FileInfo) => void; // 【关键改造】预览图片（全屏）
};

type BlockItemProps = {
    block: SmartNoteBlock;
    index: number;
    onChange: (index: number, block: SmartNoteBlock) => void;
    onDelete: (index: number) => void;
    onAddAfter: (index: number, type?: SmartNoteBlock['type'], meta?: any) => void;
    onAddAfterWithFocus: (index: number, type?: SmartNoteBlock['type'], meta?: any) => void;
    onMoveUp?: (index: number) => void;
    onMoveDown?: (index: number) => void;
    onFocus: (index: number) => void;
    serverUrl?: string; // 【关键修复】用于构建完整的图片 URL
    bearerToken?: string; // 用于图片请求的鉴权头
    onPlayMedia?: (uri: string, type: 'video' | 'audio') => void;
    onPreviewFile?: (fileInfo: FileInfo) => void; // 预览文件
    onPreviewImage?: (fileInfo: FileInfo) => void; // 【关键改造】预览图片（全屏）
    onScrollToBlock?: (index: number) => void; // 请求滚动到指定 block
    theme: Theme;
    editable: boolean;
    isSelected: boolean; // 当前是否被选中
    autoFocus?: boolean; // 是否自动聚焦 TextInput
    isFirst?: boolean;
    isLast?: boolean;
};

// ---- Helper to generate unique ID ----
const generateId = () => `blk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// ---- Format file size ----
function formatFileSize(bytes: number): string {
    if (!bytes || bytes <= 0) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let idx = 0;
    let size = bytes;
    while (size >= 1024 && idx < units.length - 1) {
        size /= 1024;
        idx++;
    }
    return `${size.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

// ---- Format duration (milliseconds to mm:ss) ----
function formatDuration(ms: number): string {
    if (!ms || ms <= 0) return '';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// ---- Get file icon based on file type ----
function getFileIcon(fileName: string, mimeType?: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';

    // Office 文档
    if (['doc', 'docx'].includes(ext) || mimeType?.includes('wordprocessingml')) {
        return 'file-word-outline';
    }
    if (['xls', 'xlsx'].includes(ext) || mimeType?.includes('spreadsheetml')) {
        return 'file-excel-outline';
    }
    if (['ppt', 'pptx'].includes(ext) || mimeType?.includes('presentationml')) {
        return 'file-powerpoint-outline';
    }

    // Apple iWork 文档
    if (ext === 'pages') {
        return 'file-word-outline';
    }
    if (ext === 'numbers') {
        return 'file-excel-outline';
    }
    if (ext === 'keynote') {
        return 'file-powerpoint-outline';
    }

    // PDF
    if (ext === 'pdf' || mimeType === 'application/pdf') {
        return 'file-pdf-outline';
    }

    // 压缩包
    if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext)) {
        return 'folder-zip-outline';
    }

    // 文本文件
    if (['txt', 'md', 'log', 'csv', 'json', 'xml', 'html', 'css', 'js', 'ts'].includes(ext)) {
        return 'file-document-outline';
    }

    // 代码文件
    if (['py', 'java', 'cpp', 'c', 'h', 'php', 'rb', 'go', 'rs', 'swift'].includes(ext)) {
        return 'file-code-outline';
    }

    // 默认文件图标
    return 'file-outline';
}

// ---- Create new block ----
const createBlock = (type: SmartNoteBlock['type'] = 'paragraph', content = ''): SmartNoteBlock => ({
    id: generateId(),
    type,
    content,
    order: 0,
});

// ---- Responsive Image Component ----
// 动态获取图片尺寸，按原始宽高比等比缩放
const ResponsiveImage = ({uri, style, bearerToken}: {uri: string; style: any; bearerToken?: string}) => {
    const [aspectRatio, setAspectRatio] = useState(1);

    const screenWidth = Dimensions.get('window').width;
    const imageWidth = screenWidth - 40; // 留出边距
    const imageHeight = imageWidth / aspectRatio;

    const source: any = {uri};
    if (bearerToken && uri.startsWith('http')) {
        source.headers = {Authorization: `Bearer ${bearerToken}`};
    }

    return (
        <Image
            source={source}
            style={[style, {width: imageWidth, height: Math.min(imageHeight, 400)}]}
            contentFit='contain'
            onLoad={(evt) => {
                const {width, height} = evt.source;
                if (width > 0 && height > 0) {
                    setAspectRatio(width / height);
                }
            }}
            onError={() => {}}
        />
    );
};

// ---- Block Wrapper with toolbar ----
type BlockWrapperProps = {
    children: React.ReactNode;
    editable: boolean;
    onDelete: () => void;
    onMoveUp?: () => void;
    onMoveDown?: () => void;
    onAddAfter?: () => void;
    isFirst?: boolean;
    isLast?: boolean;
    theme: Theme;
};

const BlockWrapper = ({children, editable, onDelete, onMoveUp, onMoveDown, onAddAfter, isFirst, isLast, theme}: BlockWrapperProps) => {
    const style = getBlockStyle(theme);
    return (
        <View style={style.blockRow}>
            <View style={style.blockContent}>
                {children}
            </View>
            {editable && (
                <View style={style.blockToolbar}>
                    <TouchableOpacity
                        onPress={onMoveUp}
                        disabled={isFirst}
                        style={style.toolbarButton}
                        hitSlop={{top: 4, bottom: 4, left: 4, right: 4}}
                    >
                        <CompassIcon
                            name='arrow-up'
                            size={16}
                            color={isFirst ? changeOpacity(theme.centerChannelColor, 0.2) : changeOpacity(theme.centerChannelColor, 0.6)}
                        />
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={onMoveDown}
                        disabled={isLast}
                        style={style.toolbarButton}
                        hitSlop={{top: 4, bottom: 4, left: 4, right: 4}}
                    >
                        <CompassIcon
                            name='arrow-down'
                            size={16}
                            color={isLast ? changeOpacity(theme.centerChannelColor, 0.2) : changeOpacity(theme.centerChannelColor, 0.6)}
                        />
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={onAddAfter}
                        style={style.toolbarButton}
                        hitSlop={{top: 4, bottom: 4, left: 4, right: 4}}
                    >
                        <CompassIcon
                            name='plus'
                            size={16}
                            color={changeOpacity(theme.centerChannelColor, 0.6)}
                        />
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={onDelete}
                        style={style.toolbarButton}
                        hitSlop={{top: 4, bottom: 4, left: 4, right: 4}}
                    >
                        <CompassIcon
                            name='trash-can-outline'
                            size={16}
                            color={changeOpacity(theme.errorTextColor || '#d24b4e', 0.7)}
                        />
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
};

// ---- Block Item Component ----
const BlockItem = ({
    block,
    index,
    onChange,
    onDelete,
    onAddAfter,
    onAddAfterWithFocus,
    onMoveUp,
    onMoveDown,
    onFocus,
    serverUrl,
    bearerToken,
    onPlayMedia,
    onPreviewFile,
    onPreviewImage,
    onScrollToBlock,
    theme,
    editable,
    isSelected,
    autoFocus,
    isFirst,
    isLast,
}: BlockItemProps) => {
    const intl = useIntl();
    const style = getBlockStyle(theme);
    const textInputRef = useRef<TextInput>(null);
    const [shouldAutoFocus, setShouldAutoFocus] = useState(false);

    // 自动聚焦 TextInput（用于插入块后光标移动到新位置）
    useEffect(() => {
        if ((autoFocus || shouldAutoFocus) && textInputRef.current) {
            setTimeout(() => {
                textInputRef.current?.focus();
                setShouldAutoFocus(false);
                // 请求滚动到新 block
                if (onScrollToBlock) {
                    setTimeout(() => {
                        onScrollToBlock(index);
                    }, 150); // 等待焦点和布局完成
                }
            }, 100);
        }
    }, [autoFocus, shouldAutoFocus, index, onScrollToBlock]);

    const handleContentChange = useCallback((text: string) => {
        onChange(index, {...block, content: text});
    }, [index, block, onChange]);

    const handleFocus = useCallback(() => {
        onFocus(index);
        // 请求滚动到当前 block
        if (onScrollToBlock) {
            setTimeout(() => {
                onScrollToBlock(index);
            }, 100); // 等待布局更新
        }
    }, [index, onFocus, onScrollToBlock]);

    // 点击块容器时聚焦
    const handlePress = useCallback(() => {
        onFocus(index);
    }, [index, onFocus]);

    // 处理回车键 - 对于列表块，在 items 数组中添加新项
    const handleKeyPress = useCallback((e: any, itemIndex?: number) => {
        const key = e?.nativeEvent?.key;
        if (key !== 'Enter') {
            return;
        }

        // 列表块：在 items 数组中添加新项
        const isListBlock = block.type === 'bulleted-list' || block.type === 'numbered-list' || block.type === 'checklist';

        if (isListBlock && itemIndex !== undefined) {
            e.preventDefault?.();

            const items = [...(block.meta?.items || [])];
            const newItem = block.type === 'checklist'
                ? {text: '', checked: false}
                : '';

            // 在当前项后面插入新项
            items.splice(itemIndex + 1, 0, newItem);

            onChange(index, {
                ...block,
                content: items.map((item: any) => typeof item === 'string' ? item : item.text).join('\n'),
                meta: {
                    ...block.meta,
                    items,
                },
            });
        }
        // 其他块类型让系统默认处理（块内换行）
    }, [block, index, onChange]);

    // Get appropriate style for block type
    const getBlockTextStyle = () => {
        switch (block.type) {
            case 'heading': {
                const level = block.meta?.level || 1;
                if (level === 1) return style.heading1;
                if (level === 2) return style.heading2;
                return style.heading3;
            }
            case 'blockquote':
                return style.blockquote;
            case 'code-block':
                return style.codeBlock;
            case 'bulleted-list':
            case 'numbered-list':
            case 'checklist':
                return style.listItem;
            default:
                return style.paragraph;
        }
    };

    // Get prefix for list items (only used for non-list blocks now)
    const getPrefix = () => {
        // 列表块（bulleted-list/numbered-list/checklist）使用特殊渲染路径
        // 这里只处理其他类型的块
        return '';
    };


    // Get placeholder
    const getPlaceholder = () => {
        switch (block.type) {
            case 'heading':
                return intl.formatMessage({id: 'smart_notebook.heading_placeholder', defaultMessage: '标题'});
            case 'blockquote':
                return intl.formatMessage({id: 'smart_notebook.quote_placeholder', defaultMessage: '引用'});
            case 'code-block':
                return intl.formatMessage({id: 'smart_notebook.code_placeholder', defaultMessage: '代码'});
            case 'checklist':
                return intl.formatMessage({id: 'smart_notebook.checklist_placeholder', defaultMessage: '待办事项'});
            default:
                return intl.formatMessage({id: 'smart_notebook.paragraph_placeholder', defaultMessage: '输入内容...'});
        }
    };

    // Render media blocks
    // 对齐 webapp：视频/音频存储为 image 类型，通过 caption 中的 [VIDEO:url] / [AUDIO:url] 标记区分
    if (block.type === 'image') {
        const caption = block.meta?.caption || '';
        const mediaMatch = caption.match(/^\[(VIDEO|AUDIO):([^\]]*)\](.*)$/);

        // ── 视频/音频块（webapp 兼容格式）──
        if (mediaMatch) {
            const mediaType = mediaMatch[1]; // 'VIDEO' or 'AUDIO'
            const mediaUrl = mediaMatch[2];
            // 【关键修复】去除 HTML 标签（如<span>）
            const rawDisplayName = mediaMatch[3] || block.meta?.fileName || (mediaType === 'VIDEO' ? '视频' : '音频');
            const displayName = rawDisplayName.replace(/<[^>]*>/g, '').trim();

            // 【关键修复】构建完整的媒体 URL
            let playableUrl = mediaUrl;
            const isRelativePath = mediaUrl && mediaUrl.startsWith('/') && !mediaUrl.startsWith('//');
            const isLocalMedia = mediaUrl && !mediaUrl.startsWith('http://') && !mediaUrl.startsWith('https://') && !isRelativePath;

            if (isRelativePath && serverUrl) {
                // 服务器相对路径（如 /api/v4/files/xxx），需要拼接 serverUrl
                playableUrl = `${serverUrl}${mediaUrl}`;
            } else if (isLocalMedia && !mediaUrl.startsWith('file://')) {
                // 本地文件路径
                playableUrl = `file://${mediaUrl}`;
            }
            // 否则已经是完整 URL（http:// 或 https://），直接使用

            if (mediaType === 'VIDEO') {
                return (
                    <BlockWrapper
                editable={editable}
                onDelete={() => onDelete(index)}
                onMoveUp={() => onMoveUp?.(index)}
                onMoveDown={() => onMoveDown?.(index)}
                onAddAfter={() => onAddAfterWithFocus(index)}
                isFirst={isFirst}
                isLast={isLast}
                theme={theme}
            >
                        <TouchableOpacity onPress={handlePress} style={style.blockContainer}>
                            <View style={style.mediaBlock}>
                                <View style={style.videoPreviewContainer}>
                                    <View style={style.videoPlaceholder}>
                                        <CompassIcon name='video-outline' size={48} color={theme.buttonBg}/>
                                    </View>
                                    {playableUrl ? (
                                        <TouchableOpacity
                                            style={style.playButtonOverlay}
                                            onPress={() => onPlayMedia?.(playableUrl, 'video')}
                                        >
                                            <View style={style.playButton}>
                                                <CompassIcon name='play' size={32} color='#FFFFFF'/>
                                            </View>
                                        </TouchableOpacity>
                                    ) : null}
                                </View>
                                <View style={style.mediaInfo}>
                                    <CompassIcon name='video-outline' size={20} color={theme.buttonBg}/>
                                    <View style={style.mediaTextInfo}>
                                        <Text style={style.mediaLabel} numberOfLines={1}>{displayName}</Text>
                                        {block.meta?.size ? (
                                            <Text style={style.mediaMeta}>{formatFileSize(block.meta.size)}</Text>
                                        ) : null}
                                    </View>
                                </View>
                            </View>
                        </TouchableOpacity>
                    </BlockWrapper>
                );
            }

            // AUDIO
            return (
                <BlockWrapper
                editable={editable}
                onDelete={() => onDelete(index)}
                onMoveUp={() => onMoveUp?.(index)}
                onMoveDown={() => onMoveDown?.(index)}
                onAddAfter={() => onAddAfterWithFocus(index)}
                isFirst={isFirst}
                isLast={isLast}
                theme={theme}
            >
                    <TouchableOpacity onPress={handlePress} style={style.blockContainer}>
                        <View style={style.mediaBlock}>
                            <View style={style.audioCard}>
                                <View style={style.mediaIconContainer}>
                                    <CompassIcon name='microphone-outline' size={32} color={theme.buttonBg}/>
                                </View>
                                <View style={style.mediaTextInfo}>
                                    <Text style={style.mediaLabel} numberOfLines={1}>{displayName}</Text>
                                    {block.meta?.size ? (
                                        <Text style={style.mediaMeta}>{formatFileSize(block.meta.size)}</Text>
                                    ) : null}
                                    {block.meta?.duration ? (
                                        <Text style={style.mediaMeta}>{formatDuration(block.meta.duration)}</Text>
                                    ) : null}
                                </View>
                                {playableUrl ? (
                                    <TouchableOpacity
                                        style={style.audioPlayButton}
                                        onPress={() => onPlayMedia?.(playableUrl, 'audio')}
                                    >
                                        <CompassIcon name='play-circle-outline' size={36} color={theme.buttonBg}/>
                                    </TouchableOpacity>
                                ) : null}
                            </View>
                        </View>
                    </TouchableOpacity>
                </BlockWrapper>
            );
        }

        // ── 普通图片块 ──
        if (!block.content) return null;

        // 【关键修复】构建完整的图片 URL
        let imageUri = block.content;
        const isRelativePath = block.content.startsWith('/') && !block.content.startsWith('//');
        const isLocalPath = !block.content.startsWith('http://') && !block.content.startsWith('https://') && !isRelativePath;

        if (isRelativePath && serverUrl) {
            // 服务器相对路径（如 /api/v4/files/xxx），需要拼接 serverUrl
            imageUri = `${serverUrl}${block.content}`;
        } else if (isLocalPath && !block.content.startsWith('file://')) {
            // 本地文件路径
            imageUri = `file://${block.content}`;
        }
        // 否则已经是完整 URL（http:// 或 https://），直接使用

        // 【关键改造】构建 FileInfo 对象用于图片预览
        const imageInfo: FileInfo = {
            id: block.meta?.fileId || block.id || '',
            name: block.meta?.fileName || caption || '图片',
            extension: block.meta?.extension || imageUri.split('.').pop()?.toLowerCase() || '',
            mime_type: block.meta?.mimeType || 'image/jpeg',
            size: block.meta?.size || 0,
            user_id: '',
            create_at: 0,
            update_at: 0,
            delete_at: 0,
            post_id: '',
            channel_id: '',
            has_preview_image: true,
            height: 0,
            width: 0,
            localPath: imageUri,
        };

        return (
            <BlockWrapper
                editable={editable}
                onDelete={() => onDelete(index)}
                onMoveUp={() => onMoveUp?.(index)}
                onMoveDown={() => onMoveDown?.(index)}
                onAddAfter={() => onAddAfterWithFocus(index)}
                isFirst={isFirst}
                isLast={isLast}
                theme={theme}
            >
                <TouchableOpacity
                    onPress={() => onPreviewImage?.(imageInfo)} // 【关键改造】单击打开全屏预览
                    onLongPress={() => onFocus(index)} // 【关键改造】长按显示工具栏
                    style={style.blockContainer}
                >
                    <View style={style.mediaBlock}>
                        <ResponsiveImage
                            uri={imageUri}
                            style={style.imageThumbnail}
                            bearerToken={bearerToken}
                        />
                        <View style={style.mediaInfo}>
                            <CompassIcon name='image-outline' size={20} color={theme.centerChannelColor}/>
                            <Text style={style.mediaLabel} numberOfLines={1}>
                                {block.meta?.fileName || caption || '图片'}
                            </Text>
                            {block.meta?.size ? (
                                <Text style={style.mediaMeta}>{formatFileSize(block.meta.size)}</Text>
                            ) : null}
                        </View>
                    </View>
                </TouchableOpacity>
            </BlockWrapper>
        );
    }

    if (block.type === 'divider' || block.type === 'horizontal-rule') {
        return (
            <BlockWrapper
                editable={editable}
                onDelete={() => onDelete(index)}
                onMoveUp={() => onMoveUp?.(index)}
                onMoveDown={() => onMoveDown?.(index)}
                onAddAfter={() => onAddAfterWithFocus(index)}
                isFirst={isFirst}
                isLast={isLast}
                theme={theme}
            >
                <TouchableOpacity onPress={handlePress} style={style.blockContainer}>
                    <View style={style.divider}/>
                </TouchableOpacity>
            </BlockWrapper>
        );
    }

    // 渲染文件块（非媒体文件）
    if (block.type === 'file') {
        if (!block.content) {
            return null;
        }

        const fileName = block.meta?.fileName || block.meta?.caption || '文件';
        const extension = block.meta?.extension || fileName.split('.').pop()?.toLowerCase() || '';
        const fileIcon = getFileIcon(fileName, block.meta?.mimeType);

        // 【关键修复】构建 FileInfo 对象用于预览
        const fileInfo: FileInfo = {
            id: block.meta?.fileId || block.id || '',
            name: fileName,
            extension,
            mime_type: block.meta?.mimeType || '',
            size: block.meta?.size || 0,
            user_id: '',
            create_at: 0,
            update_at: 0,
            delete_at: 0,
            post_id: '',
            channel_id: '',
            has_preview_image: false,
            height: 0,
            width: 0,
            localPath: block.content,
            mm_file_id: block.meta?.mmFileId || '',
        };

        return (
            <BlockWrapper
                editable={editable}
                onDelete={() => onDelete(index)}
                onMoveUp={() => onMoveUp?.(index)}
                onMoveDown={() => onMoveDown?.(index)}
                onAddAfter={() => onAddAfterWithFocus(index)}
                isFirst={isFirst}
                isLast={isLast}
                theme={theme}
            >
                <TouchableOpacity
                    onPress={() => onPreviewFile?.(fileInfo)} // 单击预览文件
                    onLongPress={() => onFocus(index)} // 【关键改造】长按显示工具栏
                    style={style.blockContainer}
                >
                    <View style={style.mediaBlock}>
                        <View style={style.fileCard}>
                            <View style={style.mediaIconContainer}>
                                <CompassIcon name={fileIcon} size={32} color={theme.buttonBg}/>
                            </View>
                            <View style={style.mediaTextInfo}>
                                <Text style={style.mediaLabel} numberOfLines={1}>
                                    {fileName}
                                </Text>
                                {block.meta?.size ? (
                                    <Text style={style.mediaMeta}>
                                        {formatFileSize(block.meta.size)}
                                    </Text>
                                ) : null}
                            </View>
                        </View>
                    </View>
                </TouchableOpacity>
            </BlockWrapper>
        );
    }

    // 【关键修复】特殊渲染列表块（bulleted-list/numbered-list/checklist）
    // 这些块使用 webapp 格式：单个 block 包含 items 数组
    const isListBlock = block.type === 'bulleted-list' || block.type === 'numbered-list' || block.type === 'checklist';

    if (isListBlock) {
        const items = block.meta?.items || [];
        const blockStyle = getBlockTextStyle();

        return (
            <BlockWrapper
                editable={editable}
                onDelete={() => onDelete(index)}
                onMoveUp={() => onMoveUp?.(index)}
                onMoveDown={() => onMoveDown?.(index)}
                onAddAfter={() => onAddAfterWithFocus(index)}
                isFirst={isFirst}
                isLast={isLast}
                theme={theme}
            >
                <TouchableOpacity onPress={handlePress} style={style.blockContainer}>
                    <View style={style.listContainer}>
                        {items.map((item: any, itemIndex: number) => {
                            // 获取项目文本
                            const itemText = typeof item === 'string' ? item : (item.text || '');
                            const itemChecked = typeof item === 'object' ? (item.checked || false) : false;

                            // 获取前缀
                            let prefix = '';
                            if (block.type === 'bulleted-list') {
                                prefix = '• ';
                            } else if (block.type === 'numbered-list') {
                                prefix = `${itemIndex + 1}. `;
                            }
                            // checklist 没有文本前缀，使用复选框

                            // 处理项目内容变化
                            const handleItemChange = (newText: string) => {
                                const newItems = [...items];
                                if (typeof item === 'string') {
                                    newItems[itemIndex] = newText;
                                } else {
                                    newItems[itemIndex] = {...item, text: newText};
                                }
                                onChange(index, {
                                    ...block,
                                    content: newItems.map((i: any) => typeof i === 'string' ? i : i.text).join('\n'),
                                    meta: {
                                        ...block.meta,
                                        items: newItems,
                                    },
                                });
                            };

                            // 处理 checklist 切换
                            const handleToggleCheck = () => {
                                if (block.type !== 'checklist') return;
                                const newItems = [...items];
                                newItems[itemIndex] = {
                                    ...item,
                                    checked: !itemChecked,
                                };
                                onChange(index, {
                                    ...block,
                                    content: newItems.map((i: any) => typeof i === 'string' ? i : i.text).join('\n'),
                                    meta: {
                                        ...block.meta,
                                        items: newItems,
                                    },
                                });
                            };

                            return (
                                <View key={itemIndex} style={style.listItemRow}>
                                    {block.type === 'checklist' && (
                                        <TouchableOpacity
                                            onPress={handleToggleCheck}
                                            style={style.checkbox}
                                            activeOpacity={0.7}
                                        >
                                            {itemChecked ? (
                                                <CompassIcon name='check' size={20} color={theme.buttonBg}/>
                                            ) : (
                                                <View style={style.checkboxEmpty}/>
                                            )}
                                        </TouchableOpacity>
                                    )}
                                    {prefix ? <Text style={style.listPrefix}>{prefix}</Text> : null}
                                    <TextInput
                                        style={[style.textInput, blockStyle, {flex: 1}]}
                                        value={itemText}
                                        onChangeText={handleItemChange}
                                        onFocus={handleFocus}
                                        onKeyPress={(e) => handleKeyPress(e, itemIndex)}
                                        placeholder={itemIndex === 0 ? getPlaceholder() : ''}
                                        placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.3)}
                                        multiline
                                        editable={editable}
                                        textAlignVertical='top'
                                    />
                                </View>
                            );
                        })}
                    </View>
                </TouchableOpacity>
            </BlockWrapper>
        );
    }

    // Render text-based blocks (paragraph, heading, blockquote, code-block)
    const prefix = getPrefix();
    const blockStyle = getBlockTextStyle();

    return (
        <BlockWrapper
                editable={editable}
                onDelete={() => onDelete(index)}
                onMoveUp={() => onMoveUp?.(index)}
                onMoveDown={() => onMoveDown?.(index)}
                onAddAfter={() => onAddAfterWithFocus(index)}
                isFirst={isFirst}
                isLast={isLast}
                theme={theme}
            >
            <TouchableOpacity onPress={handlePress} style={style.blockContainer}>
                {block.type === 'blockquote' && <View style={style.blockquoteBorder}/>}
                <View style={[style.textBlock, block.type === 'blockquote' && style.blockquoteContainer]}>
                    {prefix ? <Text style={style.listPrefix}>{prefix}</Text> : null}
                    <TextInput
                        ref={textInputRef}
                        style={[style.textInput, blockStyle]}
                        value={block.content}
                        onChangeText={handleContentChange}
                        onFocus={handleFocus}
                        onKeyPress={(e) => handleKeyPress(e)}
                        placeholder={getPlaceholder()}
                        placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.3)}
                        multiline
                        editable={editable}
                        textAlignVertical='top'
                    />
                </View>
            </TouchableOpacity>
        </BlockWrapper>
    );
};


// ---- Main Block Editor Component ----
const BlockEditor = ({blocks, onChange, theme, editable, serverUrl, bearerToken, onFocusedIndexChange, pendingFocusIndex, onFocusApplied, onScrollToBlock, onPreviewFile, onPreviewImage}: BlockEditorProps) => {
    const style = getBlockStyle(theme);
    const [focusedIndex, setFocusedIndex] = useState<number>(-1);
    const [nextFocusIndex, setNextFocusIndex] = useState<number | null>(null);

    // FlatList 引用，用于控制滚动
    const flatListRef = useRef<any>(null);

    // 同步光标位置给父组件
    useEffect(() => {
        onFocusedIndexChange?.(focusedIndex);
    }, [focusedIndex, onFocusedIndexChange]);

    // 处理外部请求的焦点定位
    useEffect(() => {
        if (pendingFocusIndex != null && pendingFocusIndex >= 0 && pendingFocusIndex < blocks.length) {
            setFocusedIndex(pendingFocusIndex);

            // 【关键修复】添加滚动逻辑，让新块显示在编辑区域中间
            setTimeout(() => {
                flatListRef.current?.scrollToIndex({
                    index: pendingFocusIndex,
                    animated: true,
                    viewPosition: 0.5,  // 滚动到中间位置
                });
            }, 150);  // 等待 DOM 更新

            onFocusApplied?.();
        }
    }, [pendingFocusIndex, blocks.length, onFocusApplied]);

    // 处理列表项回车后的焦点定位和智能滚动
    useEffect(() => {
        if (nextFocusIndex != null && nextFocusIndex >= 0 && nextFocusIndex < blocks.length) {
            // 设置焦点
            setFocusedIndex(nextFocusIndex);

            // 延迟滚动，确保新块已渲染并且焦点已设置
            setTimeout(() => {
                flatListRef.current?.scrollToIndex({
                    index: nextFocusIndex,
                    animated: true,
                    viewPosition: 0.5,  // 滚动到中间位置
                });
            }, 150);  // 等待 DOM 更新

            // 清除状态
            setNextFocusIndex(null);
        }
    }, [nextFocusIndex, blocks.length]);

    // 媒体播放状态
    const [playingMedia, setPlayingMedia] = useState<{
        uri: string;
        type: 'video' | 'audio';
    } | null>(null);
    const videoRef = useRef<VideoRef>(null);

    // 处理媒体播放
    const handlePlayMedia = useCallback((uri: string, type: 'video' | 'audio') => {
        setPlayingMedia({uri, type});
    }, []);

    // 关闭媒体播放器
    const handleClosePlayer = useCallback(() => {
        setPlayingMedia(null);
    }, []);

    const handleChange = useCallback((index: number, updatedBlock: SmartNoteBlock) => {
        const newBlocks = [...blocks];
        newBlocks[index] = updatedBlock;
        // Update order
        newBlocks.forEach((b, i) => {
            b.order = i;
        });
        onChange(newBlocks);
    }, [blocks, onChange]);

    const handleDelete = useCallback((index: number) => {
        if (blocks.length <= 1) {
            // Don't delete the last block, just clear it
            const newBlocks = [createBlock('paragraph', '')];
            onChange(newBlocks);
            return;
        }
        const newBlocks = blocks.filter((_, i) => i !== index);
        // Update order
        newBlocks.forEach((b, i) => {
            b.order = i;
        });
        onChange(newBlocks);
    }, [blocks, onChange]);

    const handleAddAfter = useCallback((index: number, type?: SmartNoteBlock['type'], meta?: any) => {
        const newBlock = createBlock(type || 'paragraph', '');
        if (meta) {
            newBlock.meta = meta;
        }
        const newBlocks = [...blocks];
        newBlocks.splice(index + 1, 0, newBlock);
        // Update order
        newBlocks.forEach((b, i) => {
            b.order = i;
        });
        onChange(newBlocks);
        // 设置下一个焦点（让"+"按钮也支持自动聚焦和滚动）
        setNextFocusIndex(index + 1);
    }, [blocks, onChange]);

    // 添加新块并设置焦点（用于列表项回车）
    const handleAddAfterWithFocus = useCallback((index: number, type?: SmartNoteBlock['type'], meta?: any) => {
        const newBlock = createBlock(type || 'paragraph', '');
        if (meta) {
            newBlock.meta = meta;
        }
        const newBlocks = [...blocks];
        newBlocks.splice(index + 1, 0, newBlock);
        // Update order
        newBlocks.forEach((b, i) => {
            b.order = i;
        });
        onChange(newBlocks);
        // 设置下一个焦点
        setNextFocusIndex(index + 1);
    }, [blocks, onChange]);

    const handleMoveUp = useCallback((index: number) => {
        if (index <= 0) return;
        const newBlocks = [...blocks];
        [newBlocks[index - 1], newBlocks[index]] = [newBlocks[index], newBlocks[index - 1]];
        newBlocks.forEach((b, i) => { b.order = i; });
        onChange(newBlocks);
        setFocusedIndex(index - 1);
    }, [blocks, onChange]);

    const handleMoveDown = useCallback((index: number) => {
        if (index >= blocks.length - 1) return;
        const newBlocks = [...blocks];
        [newBlocks[index], newBlocks[index + 1]] = [newBlocks[index + 1], newBlocks[index]];
        newBlocks.forEach((b, i) => { b.order = i; });
        onChange(newBlocks);
        setFocusedIndex(index + 1);
    }, [blocks, onChange]);

    const handleFocus = useCallback((index: number) => {
        setFocusedIndex(index);
    }, []);

    const renderItem = useCallback(({item, index}: {item: SmartNoteBlock; index: number}) => {
        debugLog('smartNotebook', `[BlockEditor.renderItem] index=${index}, id=${item.id}, type=${item.type}, content_len=${item.content?.length || 0}, hasContent=${Boolean(item.content)}`);
        if (item.type === 'file' || item.type === 'image') {
            debugLog('smartNotebook', `[BlockEditor.renderItem] Media block details: caption=${item.meta?.caption}, size=${item.meta?.size}, mimeType=${item.meta?.mimeType}, isLocal=${item.meta?.isLocal}`);
        }
        return (
            <BlockItem
                block={item}
                index={index}
                onChange={handleChange}
                onDelete={handleDelete}
                onAddAfter={handleAddAfter}
                onAddAfterWithFocus={handleAddAfterWithFocus}
                onMoveUp={handleMoveUp}
                onMoveDown={handleMoveDown}
                onFocus={handleFocus}
                serverUrl={serverUrl}
                bearerToken={bearerToken}
                onPlayMedia={handlePlayMedia}
                onPreviewFile={onPreviewFile}
                onPreviewImage={onPreviewImage}
                onScrollToBlock={onScrollToBlock}
                theme={theme}
                editable={editable}
                isSelected={focusedIndex === index}
                autoFocus={pendingFocusIndex === index || nextFocusIndex === index}
                isFirst={index === 0}
                isLast={index === blocks.length - 1}
            />
        );
    }, [handleChange, handleDelete, handleAddAfter, handleAddAfterWithFocus, handleMoveUp, handleMoveDown, handleFocus, handlePlayMedia, onPreviewFile, onPreviewImage, onScrollToBlock, theme, editable, bearerToken, blocks.length, focusedIndex, pendingFocusIndex, nextFocusIndex]);

    const keyExtractor = useCallback((item: SmartNoteBlock) => item.id, []);

    return (
        <>
            <FlatList
                ref={flatListRef}
                data={blocks}
                renderItem={renderItem}
                keyExtractor={keyExtractor}
                contentContainerStyle={style.listContent}
                keyboardShouldPersistTaps='handled'
                scrollEnabled={false}
            />

            {/* 媒体播放器 Modal */}
            <Modal
                visible={!!playingMedia}
                transparent={true}
                animationType='fade'
                onRequestClose={handleClosePlayer}
            >
                <View style={style.mediaPlayerOverlay}>
                    <TouchableOpacity
                        style={style.mediaPlayerClose}
                        onPress={handleClosePlayer}
                        activeOpacity={0.9}
                    >
                        <CompassIcon name='close' size={32} color='#FFFFFF'/>
                    </TouchableOpacity>

                    {playingMedia?.type === 'video' ? (
                        <Video
                            ref={videoRef}
                            source={{
                                uri: playingMedia.uri,
                                ...(bearerToken && playingMedia.uri.startsWith('http')
                                    ? {headers: {Authorization: `Bearer ${bearerToken}`}}
                                    : {}),
                            }}
                            style={style.videoPlayer}
                            controls={true}
                            paused={false}
                            resizeMode='contain'
                            onEnd={handleClosePlayer}
                            onError={(e) => {
                                console.error('视频播放错误:', e);
                                Alert.alert('视频播放失败', e.error?.errorString || '未知错误');
                                handleClosePlayer();
                            }}
                        />
                    ) : playingMedia?.type === 'audio' ? (
                        <View style={style.audioPlayerContainer}>
                            <View style={style.audioPlayerIcon}>
                                <CompassIcon name='microphone-outline' size={64} color='#FFFFFF'/>
                            </View>
                            <Video
                                ref={videoRef}
                                source={{
                                    uri: playingMedia.uri,
                                    ...(bearerToken && playingMedia.uri.startsWith('http')
                                        ? {headers: {Authorization: `Bearer ${bearerToken}`}}
                                        : {}),
                                }}
                                style={style.audioPlayer}
                                controls={false}
                                paused={false}
                                audioOnly={true}
                                onEnd={handleClosePlayer}
                                onError={(e) => {
                                    console.error('音频播放错误:', e);
                                    Alert.alert('音频播放失败', e.error?.errorString || '未知错误');
                                    handleClosePlayer();
                                }}
                            />
                            <Text style={style.audioPlayerText}>正在播放音频...</Text>
                        </View>
                    ) : null}
                </View>
            </Modal>
        </>
    );
};

// ---- Styles ----
const getBlockStyle = makeStyleSheetFromTheme((theme: Theme) => ({
    listContent: {
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    blockContainer: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 2,
    },
    textBlock: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
    },
    listContainer: {
        flex: 1,
        flexDirection: 'column',
    },
    textInput: {
        flex: 1,
        padding: 8,
        minHeight: 36,
    },
    paragraph: {
        ...typography('Body', 200, 'Regular'),
        color: theme.centerChannelColor,
    },
    heading1: {
        ...typography('Heading', 700, 'SemiBold'),
        color: theme.centerChannelColor,
        marginTop: 8,
    },
    heading2: {
        ...typography('Heading', 500, 'SemiBold'),
        color: theme.centerChannelColor,
        marginTop: 6,
    },
    heading3: {
        ...typography('Heading', 300, 'SemiBold'),
        color: theme.centerChannelColor,
        marginTop: 4,
    },
    blockquoteContainer: {
        flex: 1,
    },
    blockquoteBorder: {
        width: 3,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.3),
        marginRight: 8,
        borderRadius: 2,
    },
    blockquote: {
        ...typography('Body', 200, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.7),
        fontStyle: 'italic',
    },
    codeBlock: {
        ...typography('Body', 100, 'Regular'),
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.05),
        borderRadius: 4,
        padding: 8,
        color: theme.centerChannelColor,
    },
    listItem: {
        ...typography('Body', 200, 'Regular'),
        color: theme.centerChannelColor,
        flex: 1,
    },
    listItemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
    },
    listPrefix: {
        ...typography('Body', 200, 'Regular'),
        color: theme.centerChannelColor,
        width: 20,
        textAlign: 'center',
        marginRight: 4,
        lineHeight: 20,
    },
    checkbox: {
        width: 24,
        height: 24,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 8,
    },
    checkboxEmpty: {
        width: 20,
        height: 20,
        borderRadius: 4,
        borderWidth: 2,
        borderColor: changeOpacity(theme.centerChannelColor, 0.4),
    },
    mediaBlock: {
        flex: 1,
        flexDirection: 'column',
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.05),
        borderRadius: 8,
        overflow: 'hidden',
    },
    imagePreview: {
        width: '100%',
        height: 200,
        borderRadius: 8,
    },
    imageThumbnail: {
        borderRadius: 8,
        backgroundColor: '#f5f5f5',
    },
    videoPreviewContainer: {
        width: '100%',
        height: 200,
        position: 'relative',
        backgroundColor: '#000',
    },
    videoThumbnail: {
        width: '100%',
        height: '100%',
    },
    videoPlaceholder: {
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    playButtonOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
    },
    playButton: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    durationBadge: {
        position: 'absolute',
        bottom: 8,
        right: 8,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
    },
    durationText: {
        ...typography('Body', 75, 'SemiBold'),
        color: '#FFFFFF',
    },
    audioCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
    },
    audioPlayButton: {
        padding: 8,
    },
    fileCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
    },
    mediaInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
    },
    mediaTextInfo: {
        flex: 1,
    },
    mediaIconContainer: {
        width: 48,
        height: 48,
        borderRadius: 8,
        backgroundColor: changeOpacity(theme.buttonBg, 0.1),
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    mediaLabel: {
        ...typography('Body', 200, 'Medium'),
        color: theme.centerChannelColor,
    },
    mediaMeta: {
        ...typography('Body', 75, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.6),
        marginTop: 2,
    },
    localBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        backgroundColor: changeOpacity(theme.buttonBg, 0.15),
        borderRadius: 4,
        marginLeft: 8,
    },
    localBadgeText: {
        ...typography('Body', 50, 'SemiBold'),
        color: theme.buttonBg,
    },
    divider: {
        flex: 1,
        height: 1,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.2),
        marginVertical: 12,
    },
    // 拖拽相关样式
    blockRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 2,
    },
    blockContent: {
        flex: 1,
    },
    blockToolbar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: 4,
    },
    toolbarButton: {
        width: 28,
        height: 28,
        alignItems: 'center',
        justifyContent: 'center',
    },
    mediaPlayerOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    mediaPlayerClose: {
        position: 'absolute',
        top: 50,
        right: 20,
        zIndex: 1000,
        padding: 8,
    },
    videoPlayer: {
        width: '100%',
        height: '100%',
    },
    audioPlayerContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
    },
    audioPlayerIcon: {
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 32,
    },
    audioPlayer: {
        width: 1,
        height: 1,
        opacity: 0,
    },
    audioPlayerText: {
        ...typography('Body', 200, 'Medium'),
        color: '#FFFFFF',
        textAlign: 'center',
    },
}));

// ---- Export helper functions ----
export {createBlock, generateId};
export default BlockEditor;
