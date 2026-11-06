// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * 智能笔记本语音流实时转录文本插入逻辑
 *
 * 独立于聊天窗口的语音消息功能，专用于智能笔记本编辑区。
 * 将 useVoiceStream Hook 的结果实时插入到编辑区光标位置。
 */

import {useEffect, useRef} from 'react';

import type {SmartNoteBlock} from './smart_notebook_api';

type CreateBlockFn = (type: string, content: string) => SmartNoteBlock;

interface UseVoiceStreamTranscriptionProps {
    voiceStreamState: 'idle' | 'connecting' | 'recording' | 'error';
    voiceStreamResult: {
        partialText: string;
        finalText: string;
        error: string | null;
    };
    focusedBlockIndex: number;
    setBlocks: React.Dispatch<React.SetStateAction<SmartNoteBlock[]>>;
    createBlock: CreateBlockFn;
}

/**
 * Hook：监听实时语音转录结果，自动插入到编辑区当前聚焦块的末尾
 *
 * 工作原理：
 * 1. 录音中：实时更新当前段落（partialText）- 替换上次插入的部分文本
 * 2. 录音结束：在聚焦块末尾插入最终文本（finalText）
 * 3. 始终在当前聚焦块的末尾插入
 */
export function useVoiceStreamTranscription({
    voiceStreamState,
    voiceStreamResult,
    focusedBlockIndex,
    setBlocks,
    createBlock,
}: UseVoiceStreamTranscriptionProps) {
    // 跟踪上一次插入的部分文本，用于替换更新
    const lastPartialTextRef = useRef<string>('');

    // 监听部分转录结果（实时更新）
    useEffect(() => {
        if (voiceStreamState !== 'recording') {
            return;
        }

        const partialText = voiceStreamResult.partialText.trim();

        setBlocks(prev => {
            if (focusedBlockIndex < 0 || focusedBlockIndex >= prev.length) {
                return prev;
            }

            const updated = [...prev];
            const currentBlock = updated[focusedBlockIndex];
            const currentContent = currentBlock.content || '';

            // 移除之前的部分文本（如果有的话）
            let cleanContent = currentContent;
            const lastPartial = lastPartialTextRef.current;
            if (lastPartial && currentContent.endsWith(lastPartial)) {
                cleanContent = currentContent.slice(0, -lastPartial.length);
            }

            // 在末尾追加新的部分文本
            const newContent = cleanContent + partialText;

            updated[focusedBlockIndex] = {
                ...currentBlock,
                content: newContent,
            };

            return updated;
        });

        // 更新上一次的部分文本
        lastPartialTextRef.current = partialText;
    }, [voiceStreamResult.partialText, voiceStreamState, focusedBlockIndex, setBlocks]);

    // 监听最终结果（录音结束时）
    useEffect(() => {
        if (voiceStreamState !== 'idle') {
            return;
        }

        const finalText = voiceStreamResult.finalText.trim();
        if (!finalText) {
            // 重置状态
            lastPartialTextRef.current = '';
            return;
        }

        setBlocks(prev => {
            if (focusedBlockIndex < 0 || focusedBlockIndex >= prev.length) {
                return prev;
            }

            const updated = [...prev];
            const currentBlock = updated[focusedBlockIndex];
            const currentContent = currentBlock.content || '';

            // 移除之前的部分文本（如果有的话）
            const lastPartial = lastPartialTextRef.current;
            let cleanContent = currentContent;
            if (lastPartial && currentContent.endsWith(lastPartial)) {
                cleanContent = currentContent.slice(0, -lastPartial.length);
            }

            // 在末尾插入最终文本
            const newContent = cleanContent + finalText;

            updated[focusedBlockIndex] = {
                ...currentBlock,
                content: newContent,
            };

            return updated;
        });

        // 重置状态
        lastPartialTextRef.current = '';
    }, [voiceStreamResult.finalText, voiceStreamState, focusedBlockIndex, setBlocks]);

    // 录音开始时重置跟踪
    useEffect(() => {
        if (voiceStreamState === 'recording') {
            lastPartialTextRef.current = '';
        }
    }, [voiceStreamState]);
}
