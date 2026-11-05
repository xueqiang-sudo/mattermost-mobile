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
 * Hook：监听实时语音转录结果，自动插入到编辑区
 *
 * 工作原理：
 * 1. 录音中：实时更新当前段落（partialText）
 * 2. 录音结束：创建最终段落（finalText）
 * 3. 始终在光标位置后面插入
 */
export function useVoiceStreamTranscription({
    voiceStreamState,
    voiceStreamResult,
    focusedBlockIndex,
    setBlocks,
    createBlock,
}: UseVoiceStreamTranscriptionProps) {
    // 跟踪当前正在编辑的语音块 ID
    const currentVoiceBlockIdRef = useRef<string | null>(null);

    // 监听部分转录结果（实时更新）
    useEffect(() => {
        if (voiceStreamState !== 'recording') {
            return;
        }

        const partialText = voiceStreamResult.partialText.trim();
        if (!partialText) {
            return;
        }

        setBlocks(prev => {
            const insertAt = focusedBlockIndex >= 0 ? focusedBlockIndex + 1 : prev.length;

            // 如果已有当前语音块，更新它
            if (currentVoiceBlockIdRef.current) {
                const existingIndex = prev.findIndex(b => b.id === currentVoiceBlockIdRef.current);
                if (existingIndex !== -1) {
                    const updated = [...prev];
                    updated[existingIndex] = {
                        ...updated[existingIndex],
                        content: partialText,
                    };
                    return updated;
                }
            }

            // 否则创建新的语音块
            const newBlock = createBlock('paragraph', partialText);
            currentVoiceBlockIdRef.current = newBlock.id;

            const updated = [...prev];
            updated.splice(insertAt, 0, newBlock);

            // 更新 order
            updated.forEach((b, i) => {
                b.order = i;
            });

            return updated;
        });
    }, [voiceStreamResult.partialText, voiceStreamState, focusedBlockIndex, setBlocks, createBlock]);

    // 监听最终结果（录音结束时）
    useEffect(() => {
        if (voiceStreamState !== 'idle') {
            return;
        }

        const finalText = voiceStreamResult.finalText.trim();
        if (!finalText) {
            // 重置语音块跟踪
            currentVoiceBlockIdRef.current = null;
            return;
        }

        setBlocks(prev => {
            // 如果有当前语音块，用最终文本替换
            if (currentVoiceBlockIdRef.current) {
                const existingIndex = prev.findIndex(b => b.id === currentVoiceBlockIdRef.current);
                if (existingIndex !== -1) {
                    const updated = [...prev];
                    updated[existingIndex] = {
                        ...updated[existingIndex],
                        content: finalText,
                    };

                    // 在语音块下方添加空段落，方便继续输入
                    const emptyBlock = createBlock('paragraph', '');
                    updated.splice(existingIndex + 1, 0, emptyBlock);

                    // 更新 order
                    updated.forEach((b, i) => {
                        b.order = i;
                    });

                    currentVoiceBlockIdRef.current = null;
                    return updated;
                }
            }

            // 否则创建新的最终块
            const insertAt = focusedBlockIndex >= 0 ? focusedBlockIndex + 1 : prev.length;
            const finalBlock = createBlock('paragraph', finalText);
            const emptyBlock = createBlock('paragraph', '');

            const updated = [...prev];
            updated.splice(insertAt, 0, finalBlock, emptyBlock);

            // 更新 order
            updated.forEach((b, i) => {
                b.order = i;
            });

            currentVoiceBlockIdRef.current = null;
            return updated;
        });
    }, [voiceStreamResult.finalText, voiceStreamState, focusedBlockIndex, setBlocks, createBlock]);

    // 录音开始时重置跟踪
    useEffect(() => {
        if (voiceStreamState === 'recording') {
            currentVoiceBlockIdRef.current = null;
        }
    }, [voiceStreamState]);
}
