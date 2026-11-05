// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useRef, useState, useEffect} from 'react';
import {useIntl} from 'react-intl';
import {
    Alert,
    FlatList,
    Image,
    Modal,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
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
    onFocusedIndexChange?: (index: number) => void;
    pendingFocusIndex?: number | null;
    onFocusApplied?: () => void;
};

type BlockItemProps = {
    block: SmartNoteBlock;
    index: number;
    onChange: (index: number, block: SmartNoteBlock) => void;
    onDelete: (index: number) => void;
    onAddAfter: (index: number, type?: SmartNoteBlock['type'], meta?: any) => void;
    onAddAfterWithFocus: (index: number, type?: SmartNoteBlock['type'], meta?: any) => void;
    onMoveUp: (index: number) => void;
    onMoveDown: (index: number) => void;
    onFocus: (index: number) => void;
    onPlayMedia?: (uri: string, type: 'video' | 'audio') => void;
    theme: Theme;
    editable: boolean;
    isFirst: boolean;
    isLast: boolean;
    isSelected: boolean; // 当前是否被选中
    autoFocus?: boolean; // 是否自动聚焦 TextInput
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
    onPlayMedia,
    theme,
    editable,
    isFirst,
    isLast,
    isSelected,
    autoFocus,
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
            }, 100);
        }
    }, [autoFocus, shouldAutoFocus]);

    const handleContentChange = useCallback((text: string) => {
        onChange(index, {...block, content: text});
    }, [index, block, onChange]);

    const handleFocus = useCallback(() => {
        onFocus(index);
    }, [index, onFocus]);

    // 点击块容器时聚焦
    const handlePress = useCallback(() => {
        onFocus(index);
    }, [index, onFocus]);

    // 处理回车键：列表项自动续行
    const handleKeyPress = useCallback((e: any) => {
        // 检查是否是回车键
        if (e.nativeEvent.key === 'Enter') {
            // 检查是否是列表类型
            if (block.type === 'bulleted-list' || block.type === 'numbered-list' || block.type === 'checklist') {
                // 如果是空列表项，转换为普通段落
                if (!block.content.trim()) {
                    onChange(index, {...block, type: 'paragraph', content: '', meta: undefined});
                    return;
                }

                // 否则创建新的列表项
                let newMeta: any = {};
                if (block.type === 'numbered-list') {
                    // 有序列表：序号加1
                    const currentNumber = block.meta?.number || 1;
                    newMeta = {number: currentNumber + 1};
                } else if (block.type === 'checklist') {
                    // 待办列表：默认未选中
                    newMeta = {checked: false};
                }

                // 创建新块并设置焦点
                onAddAfterWithFocus(index, block.type, newMeta);
            }
        }
    }, [index, block, onChange, onAddAfterWithFocus]);

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

    // Get prefix for list items
    const getPrefix = () => {
        if (block.type === 'bulleted-list') {
            return '• ';
        }
        if (block.type === 'numbered-list') {
            const num = block.meta?.number || 1;
            return `${num}. `;
        }
        if (block.type === 'checklist') {
            const checked = block.meta?.checked || false;
            return checked ? '☑ ' : '☐ ';
        }
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
            const displayName = mediaMatch[3] || block.meta?.fileName || (mediaType === 'VIDEO' ? '视频' : '音频');
            const isLocalMedia = mediaUrl && !mediaUrl.startsWith('http://') && !mediaUrl.startsWith('https://');
            const playableUrl = isLocalMedia && !mediaUrl.startsWith('file://') ? `file://${mediaUrl}` : mediaUrl;

            if (mediaType === 'VIDEO') {
                return (
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
                        {editable && isSelected && (
                            <BlockActions
                                onDelete={() => onDelete(index)}
                                onAddAfter={() => onAddAfter(index)}
                                onMoveUp={() => onMoveUp(index)}
                                onMoveDown={() => onMoveDown(index)}
                                isFirst={isFirst}
                                isLast={isLast}
                                theme={theme}
                            />
                        )}
                    </TouchableOpacity>
                );
            }

            // AUDIO
            return (
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
                    {editable && isSelected && (
                        <BlockActions
                            onDelete={() => onDelete(index)}
                            onAddAfter={() => onAddAfter(index)}
                            onMoveUp={() => onMoveUp(index)}
                            onMoveDown={() => onMoveDown(index)}
                            isFirst={isFirst}
                            isLast={isLast}
                            theme={theme}
                        />
                    )}
                </TouchableOpacity>
            );
        }

        // ── 普通图片块 ──
        if (!block.content) return null;
        const isLocalPath = !block.content.startsWith('http://') && !block.content.startsWith('https://');
        const imageUri = isLocalPath && !block.content.startsWith('file://') ? `file://${block.content}` : block.content;

        return (
            <TouchableOpacity onPress={handlePress} style={style.blockContainer}>
                <View style={style.mediaBlock}>
                    <Image
                        source={{uri: imageUri}}
                        style={style.imagePreview}
                        resizeMode='cover'
                        onError={() => {}}
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
                {editable && isSelected && (
                    <BlockActions
                        onDelete={() => onDelete(index)}
                        onAddAfter={() => onAddAfter(index)}
                        onMoveUp={() => onMoveUp(index)}
                        onMoveDown={() => onMoveDown(index)}
                        isFirst={isFirst}
                        isLast={isLast}
                        theme={theme}
                    />
                )}
            </TouchableOpacity>
        );
    }

    if (block.type === 'divider' || block.type === 'horizontal-rule') {
        return (
            <TouchableOpacity onPress={handlePress} style={style.blockContainer}>
                <View style={style.divider}/>
                {editable && isSelected && (
                    <BlockActions
                        onDelete={() => onDelete(index)}
                        onAddAfter={() => onAddAfter(index)}
                        onMoveUp={() => onMoveUp(index)}
                        onMoveDown={() => onMoveDown(index)}
                        isFirst={isFirst}
                        isLast={isLast}
                        theme={theme}
                    />
                )}
            </TouchableOpacity>
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

        return (
            <TouchableOpacity onPress={handlePress} style={style.blockContainer}>
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
                {editable && isSelected && (
                    <BlockActions
                        onDelete={() => onDelete(index)}
                        onAddAfter={() => onAddAfter(index)}
                        onMoveUp={() => onMoveUp(index)}
                        onMoveDown={() => onMoveDown(index)}
                        isFirst={isFirst}
                        isLast={isLast}
                        theme={theme}
                    />
                )}
            </TouchableOpacity>
        );
    }

    // Render text-based blocks
    const prefix = getPrefix();
    const blockStyle = getBlockTextStyle();

    return (
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
                    onKeyPress={handleKeyPress}
                    placeholder={getPlaceholder()}
                    placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.3)}
                    multiline
                    editable={editable}
                    textAlignVertical='top'
                />
            </View>
            {editable && isSelected && (
                <BlockActions
                    onDelete={() => onDelete(index)}
                    onAddAfter={() => onAddAfter(index)}
                    onMoveUp={() => onMoveUp(index)}
                    onMoveDown={() => onMoveDown(index)}
                    isFirst={isFirst}
                    isLast={isLast}
                    theme={theme}
                />
            )}
        </TouchableOpacity>
    );
};

// ---- Block Actions (move/delete/add) ----
type BlockActionsProps = {
    onDelete: () => void;
    onAddAfter: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
    isFirst: boolean;
    isLast: boolean;
    theme: Theme;
};

const BlockActions = ({onDelete, onAddAfter, onMoveUp, onMoveDown, isFirst, isLast, theme}: BlockActionsProps) => {
    const style = getBlockStyle(theme);

    return (
        <View style={style.actionsContainer}>
            <TouchableOpacity onPress={onMoveUp} disabled={isFirst} style={style.actionBtn}>
                <CompassIcon name='arrow-up' size={16} color={isFirst ? changeOpacity(theme.centerChannelColor, 0.2) : theme.centerChannelColor}/>
            </TouchableOpacity>
            <TouchableOpacity onPress={onMoveDown} disabled={isLast} style={style.actionBtn}>
                <CompassIcon name='arrow-down' size={16} color={isLast ? changeOpacity(theme.centerChannelColor, 0.2) : theme.centerChannelColor}/>
            </TouchableOpacity>
            <TouchableOpacity onPress={onAddAfter} style={style.actionBtn}>
                <CompassIcon name='plus' size={16} color={theme.centerChannelColor}/>
            </TouchableOpacity>
            <TouchableOpacity onPress={onDelete} style={style.actionBtn}>
                <CompassIcon name='trash-can-outline' size={16} color={theme.errorTextColor}/>
            </TouchableOpacity>
        </View>
    );
};

// ---- Main Block Editor Component ----
const BlockEditor = ({blocks, onChange, theme, editable, onFocusedIndexChange, pendingFocusIndex, onFocusApplied}: BlockEditorProps) => {
    const style = getBlockStyle(theme);
    const [focusedIndex, setFocusedIndex] = useState<number>(-1);
    const [nextFocusIndex, setNextFocusIndex] = useState<number | null>(null);

    // FlatList 引用，用于控制滚动
    const flatListRef = useRef<FlatList>(null);

    // 同步光标位置给父组件
    useEffect(() => {
        onFocusedIndexChange?.(focusedIndex);
    }, [focusedIndex, onFocusedIndexChange]);

    // 处理外部请求的焦点定位
    useEffect(() => {
        if (pendingFocusIndex != null && pendingFocusIndex >= 0 && pendingFocusIndex < blocks.length) {
            setFocusedIndex(pendingFocusIndex);
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
        if (index === 0) return;
        const newBlocks = [...blocks];
        [newBlocks[index - 1], newBlocks[index]] = [newBlocks[index], newBlocks[index - 1]];
        // Update order
        newBlocks.forEach((b, i) => {
            b.order = i;
        });
        onChange(newBlocks);
    }, [blocks, onChange]);

    const handleMoveDown = useCallback((index: number) => {
        if (index === blocks.length - 1) return;
        const newBlocks = [...blocks];
        [newBlocks[index], newBlocks[index + 1]] = [newBlocks[index + 1], newBlocks[index]];
        // Update order
        newBlocks.forEach((b, i) => {
            b.order = i;
        });
        onChange(newBlocks);
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
                onPlayMedia={handlePlayMedia}
                theme={theme}
                editable={editable}
                isFirst={index === 0}
                isLast={index === blocks.length - 1}
                isSelected={focusedIndex === index}
                autoFocus={pendingFocusIndex === index || nextFocusIndex === index}
            />
        );
    }, [handleChange, handleDelete, handleAddAfter, handleAddAfterWithFocus, handleMoveUp, handleMoveDown, handleFocus, handlePlayMedia, theme, editable, blocks.length, focusedIndex, pendingFocusIndex, nextFocusIndex]);

    const keyExtractor = useCallback((item: SmartNoteBlock) => item.id, []);

    return (
        <>
            <FlatList
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
                            source={{uri: playingMedia.uri}}
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
                                source={{uri: playingMedia.uri}}
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
        marginBottom: 8,
    },
    textBlock: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'flex-start',
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
    listPrefix: {
        ...typography('Body', 200, 'Regular'),
        color: theme.centerChannelColor,
        width: 20,
        textAlign: 'right',
        marginRight: 4,
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
    actionsContainer: {
        flexDirection: 'row',
        marginLeft: 4,
    },
    actionBtn: {
        padding: 4,
        marginHorizontal: 2,
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
