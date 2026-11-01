// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    FlatList,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

import CompassIcon from '@components/compass_icon';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {SmartNoteBlock} from './smart_notebook_api';

// ---- Types ----

type BlockEditorProps = {
    blocks: SmartNoteBlock[];
    onChange: (blocks: SmartNoteBlock[]) => void;
    theme: Theme;
    editable: boolean;
};

type BlockItemProps = {
    block: SmartNoteBlock;
    index: number;
    onChange: (index: number, block: SmartNoteBlock) => void;
    onDelete: (index: number) => void;
    onAddAfter: (index: number) => void;
    onMoveUp: (index: number) => void;
    onMoveDown: (index: number) => void;
    onFocus: (index: number) => void;
    theme: Theme;
    editable: boolean;
    isFirst: boolean;
    isLast: boolean;
};

// ---- Helper to generate unique ID ----
const generateId = () => `blk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

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
    onMoveUp,
    onMoveDown,
    onFocus,
    theme,
    editable,
    isFirst,
    isLast,
}: BlockItemProps) => {
    const intl = useIntl();
    const style = getBlockStyle(theme);
    const textInputRef = useRef<TextInput>(null);
    const [showActions, setShowActions] = useState(false);

    const handleContentChange = useCallback((text: string) => {
        onChange(index, {...block, content: text});
    }, [index, block, onChange]);

    const handleFocus = useCallback(() => {
        onFocus(index);
    }, [index, onFocus]);

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
            default:
                return intl.formatMessage({id: 'smart_notebook.paragraph_placeholder', defaultMessage: '输入内容...'});
        }
    };

    // Render media blocks
    if (block.type === 'image' && block.content) {
        return (
            <View style={style.blockContainer}>
                <View style={style.mediaBlock}>
                    <CompassIcon name='image-outline' size={24} color={theme.centerChannelColor}/>
                    <Text style={style.mediaLabel} numberOfLines={1}>{block.meta?.caption || block.content}</Text>
                </View>
                {editable && (
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
            </View>
        );
    }

    if (block.type === 'video' && block.content) {
        return (
            <View style={style.blockContainer}>
                <View style={style.mediaBlock}>
                    <CompassIcon name='video-outline' size={24} color={theme.centerChannelColor}/>
                    <Text style={style.mediaLabel} numberOfLines={1}>{block.meta?.caption || block.content}</Text>
                </View>
                {editable && (
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
            </View>
        );
    }

    if (block.type === 'audio' && block.content) {
        return (
            <View style={style.blockContainer}>
                <View style={style.mediaBlock}>
                    <CompassIcon name='microphone-outline' size={24} color={theme.centerChannelColor}/>
                    <Text style={style.mediaLabel} numberOfLines={1}>{block.meta?.caption || block.content}</Text>
                </View>
                {editable && (
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
            </View>
        );
    }

    if (block.type === 'divider' || block.type === 'horizontal-rule') {
        return (
            <View style={style.blockContainer}>
                <View style={style.divider}/>
                {editable && (
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
            </View>
        );
    }

    // Render text-based blocks
    const prefix = getPrefix();
    const blockStyle = getBlockTextStyle();

    return (
        <View style={style.blockContainer}>
            {block.type === 'blockquote' && <View style={style.blockquoteBorder}/>}
            <View style={[style.textBlock, block.type === 'blockquote' && style.blockquoteContainer]}>
                {prefix ? <Text style={style.listPrefix}>{prefix}</Text> : null}
                <TextInput
                    ref={textInputRef}
                    style={[style.textInput, blockStyle]}
                    value={block.content}
                    onChangeText={handleContentChange}
                    onFocus={handleFocus}
                    placeholder={getPlaceholder()}
                    placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.3)}
                    multiline
                    editable={editable}
                    textAlignVertical='top'
                />
            </View>
            {editable && (
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
        </View>
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
const BlockEditor = ({blocks, onChange, theme, editable}: BlockEditorProps) => {
    const style = getBlockStyle(theme);
    const [focusedIndex, setFocusedIndex] = useState<number>(-1);

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

    const handleAddAfter = useCallback((index: number) => {
        const newBlock = createBlock('paragraph', '');
        const newBlocks = [...blocks];
        newBlocks.splice(index + 1, 0, newBlock);
        // Update order
        newBlocks.forEach((b, i) => {
            b.order = i;
        });
        onChange(newBlocks);
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

    const renderItem = useCallback(({item, index}: {item: SmartNoteBlock; index: number}) => (
        <BlockItem
            block={item}
            index={index}
            onChange={handleChange}
            onDelete={handleDelete}
            onAddAfter={handleAddAfter}
            onMoveUp={handleMoveUp}
            onMoveDown={handleMoveDown}
            onFocus={handleFocus}
            theme={theme}
            editable={editable}
            isFirst={index === 0}
            isLast={index === blocks.length - 1}
        />
    ), [handleChange, handleDelete, handleAddAfter, handleMoveUp, handleMoveDown, handleFocus, theme, editable, blocks.length]);

    const keyExtractor = useCallback((item: SmartNoteBlock) => item.id, []);

    return (
        <FlatList
            data={blocks}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={style.listContent}
            keyboardShouldPersistTaps='handled'
            scrollEnabled={false}
        />
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
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.05),
        borderRadius: 8,
        padding: 12,
    },
    mediaLabel: {
        ...typography('Body', 100, 'Regular'),
        color: theme.centerChannelColor,
        marginLeft: 8,
        flex: 1,
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
}));

// ---- Export helper functions ----
export {createBlock, generateId};
export default BlockEditor;
