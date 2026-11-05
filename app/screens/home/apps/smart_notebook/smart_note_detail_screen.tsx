// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    ActivityIndicator,
    Alert,
    Clipboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

import {SafeAreaView} from 'react-native-safe-area-context';

import {useNavigation, useRoute, type RouteProp} from '@react-navigation/native';
import CompassIcon from '@components/compass_icon';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import DatabaseManager from '@database/manager';
import {useVoiceRecorder, type VoiceRecorderErrorCode} from '@hooks/use_voice_recorder';
import {useVoiceStream} from '@hooks/use_voice_stream';
import {getServerCredentials} from '@init/credentials';
import {getCurrentUserId} from '@queries/servers/system';
import {showSmartNotebookFilePicker} from '@screens/file_picker/show_modal';
import {debugLog} from '@store/debug_log';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {FileInfo} from '@mattermost/types/files';

import BlockEditor, {createBlock} from './block_editor';
import {
    getNote,
    createNote,
    updateNote,
    uploadMedia,
    transcribeAudio,
    type SmartNote,
    type SmartNoteBlock,
} from './smart_notebook_api';
import {useVoiceStreamTranscription} from './voice_stream_transcription';

// ---- Utility Functions ----

// 生成唯一ID
const generateId = () => `blk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// 根据文件扩展名识别类型
/**
 * 获取文件的媒体类型（对齐 webapp：视频/音频存为 image，通过 caption 编码区分）
 * 返回值：'image' 表示图片或视频或音频（media block），'file' 表示普通文件
 */
function getMediaType(fileName: string, mimeType: string): 'image' | 'file' {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';

    // 图片
    if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tiff'].includes(ext)) {
        return 'image';
    }
    // 视频/音频也返回 image（存为 image 块，通过 caption 编码区分）
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

/** 检测文件是否为视频 */
function isVideo(fileName: string, mimeType: string): boolean {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    return ['mp4', 'avi', 'mov', 'mkv', 'webm', 'flv', 'wmv', 'm4v'].includes(ext) || mimeType.startsWith('video/');
}

/** 检测文件是否为音频 */
function isAudio(fileName: string, mimeType: string): boolean {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    return ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'wma'].includes(ext) || mimeType.startsWith('audio/');
}

// ---- Types ----

type SmartNoteDetailParams = {
    noteId: string;
    noteTitle?: string;
};

// ---- Component ----

const SmartNoteDetailScreen = () => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const navigation = useNavigation();
    const route = useRoute<RouteProp<{params: SmartNoteDetailParams}, 'params'>>();
    const style = getStyleSheet(theme);

    const {noteId, noteTitle} = route.params;
    const isNew = noteId === 'new';

    // Mode: 'new' = creating new note, 'viewing' = read-only, 'editing' = edit mode
    type NoteMode = 'new' | 'viewing' | 'editing';
    const [mode, setMode] = useState<NoteMode>(isNew ? 'new' : 'viewing');

    const textInputRef = useRef<TextInput>(null);
    const [userId, setUserId] = useState('');
    const [bearerToken, setBearerToken] = useState('');
    const [title, setTitle] = useState(noteTitle || '');
    const [blocks, setBlocks] = useState<SmartNoteBlock[]>([createBlock('paragraph', '')]);
    const [originalBlocks, setOriginalBlocks] = useState<SmartNoteBlock[]>([]); // For cancel comparison
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(!isNew);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [voiceProcessing, setVoiceProcessing] = useState(false);
    const [saveProgress, setSaveProgress] = useState<{
        visible: boolean;
        current: number;
        total: number;
        message: string;
    }>({visible: false, current: 0, total: 0, message: ''});

    // 光标位置跟踪（用于在光标处插入文件）
    const [focusedBlockIndex, setFocusedBlockIndex] = useState<number>(-1);
    const [pendingFocusIndex, setPendingFocusIndex] = useState<number | null>(null);

    // Real-time voice stream hook (for smart notebook live transcription)
    // This is independent from useVoiceRecorder and does not affect chat window voice messages
    const {
        state: voiceStreamState,
        result: voiceStreamResult,
        startStreaming,
        stopStreaming,
        cancelStreaming,
    } = useVoiceStream(serverUrl, bearerToken);

    const handleFocusedIndexChange = useCallback((index: number) => {
        setFocusedBlockIndex(index);
    }, []);

    const handleFocusApplied = useCallback(() => {
        setPendingFocusIndex(null);
    }, []);

    // Check if content has changed
    const hasChanges = JSON.stringify(blocks) !== JSON.stringify(originalBlocks) || title !== noteTitle;

    // ---- Init ----
    useEffect(() => {
        const init = async () => {
            try {
                const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
                const uid = await getCurrentUserId(database);
                setUserId(uid);

                // Get bearer token for WebSocket connection (real-time voice)
                const credentials = await getServerCredentials(serverUrl);
                if (credentials?.token) {
                    setBearerToken(credentials.token);
                }

                if (!isNew) {
                    const note = await getNote(serverUrl, uid, noteId);
                    if (note) {
                        setTitle(note.title);
                        const noteBlocks = note.blocks && note.blocks.length > 0
                            ? note.blocks
                            : [createBlock('paragraph', '')];
                        setBlocks(noteBlocks);
                        setOriginalBlocks(JSON.parse(JSON.stringify(noteBlocks)));
                    }
                }
            } catch (e) {
                console.error('[SmartNoteDetail] init error:', e);
            } finally {
                setLoading(false);
            }
        };
        init();
    }, [serverUrl, noteId, isNew]);

    // ---- Voice recording (direct transcription API) ----
    const handleVoiceRecorded = useCallback(async (files: FileInfo[]) => {
        if (!files.length) return;
        setVoiceProcessing(true);

        try {
            const file = files[0];

            // Call direct transcription API (no channel needed)
            const result = await transcribeAudio(serverUrl, {
                uri: file.localPath!,
                name: file.name,
                type: file.mime_type || 'audio/mp4',
            });

            if (result.success && result.text) {
                // Add transcription as a new paragraph block
                const newBlock = createBlock('paragraph', result.text);
                setBlocks(prev => [...prev, newBlock]);
            } else {
                // 针对 400 错误提供更具体的信息
                const errorMsg = result.statusCode === 400
                    ? `请求参数错误(400): ${result.error || '请检查音频文件格式'}\n\n调试信息:\n- 文件名: ${file.name}\n- MIME: ${file.mime_type}\n- 路径: ${file.localPath}`
                    : (result.error || intl.formatMessage({id: 'smart_notebook.voice_empty', defaultMessage: '语音识别结果为空'}));

                Alert.alert(
                    intl.formatMessage({id: 'smart_notebook.voice_error', defaultMessage: '语音转文字失败'}),
                    errorMsg,
                    [{text: intl.formatMessage({id: 'common.ok', defaultMessage: '确定'})}],
                );
            }
        } catch (e) {
            Alert.alert(
                intl.formatMessage({id: 'smart_notebook.voice_error', defaultMessage: '语音转文字失败'}),
                String(e),
                [{text: intl.formatMessage({id: 'common.ok', defaultMessage: '确定'})}],
            );
        } finally {
            setVoiceProcessing(false);
        }
    }, [serverUrl, intl]);

    const handleVoiceError = useCallback((code: VoiceRecorderErrorCode) => {
        const messages: Record<VoiceRecorderErrorCode, string> = {
            permission_denied: intl.formatMessage({id: 'smart_notebook.voice_permission_denied', defaultMessage: '麦克风权限被拒绝'}),
            record_failed: intl.formatMessage({id: 'smart_notebook.voice_record_failed', defaultMessage: '录音失败'}),
            process_failed: intl.formatMessage({id: 'smart_notebook.voice_process_failed', defaultMessage: '处理录音失败'}),
            too_short: intl.formatMessage({id: 'smart_notebook.voice_too_short', defaultMessage: '录音时间太短'}),
            upload_failed: intl.formatMessage({id: 'smart_notebook.voice_upload_failed', defaultMessage: '上传语音失败'}),
        };
        Alert.alert(intl.formatMessage({id: 'smart_notebook.voice_error', defaultMessage: '语音转文字失败'}), messages[code]);
    }, [intl]);

    const {
        state: voiceState,
        startRecording,
        stopRecordingAndSend,
        cancelRecording,
    } = useVoiceRecorder(handleVoiceRecorded, handleVoiceError);

    // ---- Real-time voice stream transcription ----
    // This automatically inserts transcribed text into the editor at cursor position
    // Independent from chat window voice messages
    useVoiceStreamTranscription({
        voiceStreamState,
        voiceStreamResult,
        focusedBlockIndex,
        setBlocks,
        createBlock,
    });

    // ---- Blocks change handler ----
    const handleBlocksChange = useCallback((newBlocks: SmartNoteBlock[]) => {
        setBlocks(newBlocks);
    }, []);

    // ---- File picker handler ----
    // 处理文件选择器返回的文件
    const handleFilesSelected = useCallback((files: FileInfo[]) => {
        debugLog('smartNotebook', `[handleFilesSelected] called with ${files.length} files`);
        files.forEach((file, i) => {
            debugLog('smartNotebook', `[handleFilesSelected] File ${i + 1}: name=${file.name}, uri=${file.uri}, id=${file.id}, mime=${file.mime_type}, size=${file.size}, source=${(file as any).source || 'unknown'}`);
        });

        if (files.length === 0) {
            return;
        }

        // 对齐 webapp 格式
        const newBlocks: SmartNoteBlock[] = files.map((file, index) => {
            const fileName = file.name || '';
            const mimeType = file.mime_type || '';
            const blockType = getMediaType(fileName, mimeType);
            const blockId = generateId();
            const extension = fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : '';

            // 解析文件 URL（本地路径或服务器 URL）
            const hasLocalUri = Boolean(file.uri);
            let fileUrl = '';
            if (hasLocalUri) {
                fileUrl = file.uri!;
            } else if (file.id) {
                fileUrl = `${serverUrl}/api/v4/files/${file.id}`;
            }

            // 对齐 webapp：视频/音频存为 image 类型，caption 编码实际 URL
            let content = fileUrl;
            let caption = fileName;

            if (isVideo(fileName, mimeType)) {
                content = fileUrl;
                caption = `[VIDEO:${fileUrl}]${fileName}`;
            } else if (isAudio(fileName, mimeType)) {
                content = '';
                caption = `[AUDIO:${fileUrl}]${fileName}`;
            }

            debugLog('smartNotebook', `[handleFilesSelected] Creating block: id=${blockId}, blockType=${blockType}, caption=${caption}`);

            return {
                id: blockId,
                type: blockType,
                content,
                order: blocks.length + index,
                meta: {
                    // webapp 兼容字段
                    url: content,
                    fileName,
                    extension,
                    mmFileId: file.id || '',
                    caption,
                    // mobile 额外字段
                    size: file.size || 0,
                    mimeType: file.mime_type || '',
                    isLocal: hasLocalUri,
                },
            };
        });

        debugLog('smartNotebook', `[handleFilesSelected] Created ${newBlocks.length} blocks, inserting at cursor=${focusedBlockIndex}`);

        // 在光标位置后面插入，而不是追加到末尾
        setBlocks(prev => {
            const insertAt = focusedBlockIndex >= 0 ? focusedBlockIndex + 1 : prev.length;
            const updated = [...prev];

            // 插入文件块
            updated.splice(insertAt, 0, ...newBlocks);

            // 在文件块下方添加一个空段落，方便用户继续输入
            const emptyParagraph = createBlock('paragraph', '');
            updated.splice(insertAt + newBlocks.length, 0, emptyParagraph);

            // 更新 order
            updated.forEach((b, i) => { b.order = i; });

            // 插入后光标定位到新段落
            const newCursorIndex = insertAt + newBlocks.length;
            setTimeout(() => setPendingFocusIndex(newCursorIndex), 50);

            return updated;
        });
    }, [focusedBlockIndex, serverUrl]);

    // Debug: Monitor blocks state changes
    useEffect(() => {
        debugLog('smartNotebook', `[smart_note_detail] blocks: ${blocks.length}, cursor=${focusedBlockIndex}`);
    }, [blocks.length, focusedBlockIndex]);

    // ---- Add block of specific type ----
    const addBlock = useCallback((type: SmartNoteBlock['type'], meta?: Record<string, any>) => {
        const newBlock = createBlock(type, '');
        if (meta) {
            newBlock.meta = meta;
        }
        setBlocks(prev => [...prev, newBlock]);
    }, []);

    // ---- Toolbar actions ----
    const insertHeading = useCallback(() => {
        addBlock('heading', {level: 1});
    }, [addBlock]);

    const insertBulletList = useCallback(() => {
        addBlock('bulleted-list');
    }, [addBlock]);

    const insertNumberedList = useCallback(() => {
        addBlock('numbered-list', {number: 1});
    }, [addBlock]);

    const insertQuote = useCallback(() => {
        addBlock('blockquote');
    }, [addBlock]);

    const insertCode = useCallback(() => {
        addBlock('code-block');
    }, [addBlock]);

    // ---- Upload image ----
    const uploadImage = useCallback(async () => {
        if (!userId) return;

        try {
            const {launchImageLibrary} = await import('react-native-image-picker');
            launchImageLibrary({mediaType: 'photo', quality: 0.8}, async (response) => {
                if (response.didCancel || response.errorCode || !response.assets?.[0]) return;

                const asset = response.assets[0];
                const uploadResult = await uploadMedia(serverUrl, userId, {
                    uri: asset.uri!,
                    name: asset.fileName || 'image.jpg',
                    type: asset.type || 'image/jpeg',
                });

                if (uploadResult?.url) {
                    const newBlock = createBlock('image', uploadResult.url);
                    newBlock.meta = {caption: asset.fileName || '图片'};
                    setBlocks(prev => [...prev, newBlock]);
                }
            });
        } catch (e) {
            Alert.alert(
                intl.formatMessage({id: 'smart_notebook.upload_failed', defaultMessage: '上传失败'}),
            );
        }
    }, [serverUrl, userId, intl]);

    // ---- Upload video ----
    const uploadVideo = useCallback(async () => {
        if (!userId) return;

        try {
            const {launchImageLibrary} = await import('react-native-image-picker');
            launchImageLibrary({mediaType: 'video', quality: 0.8}, async (response) => {
                if (response.didCancel || response.errorCode || !response.assets?.[0]) return;

                const asset = response.assets[0];
                const uploadResult = await uploadMedia(serverUrl, userId, {
                    uri: asset.uri!,
                    name: asset.fileName || 'video.mp4',
                    type: asset.type || 'video/mp4',
                });

                if (uploadResult?.url) {
                    const newBlock = createBlock('video', uploadResult.url);
                    newBlock.meta = {caption: asset.fileName || '视频'};
                    setBlocks(prev => [...prev, newBlock]);
                }
            });
        } catch (e) {
            Alert.alert(
                intl.formatMessage({id: 'smart_notebook.upload_failed', defaultMessage: '上传失败'}),
            );
        }
    }, [serverUrl, userId, intl]);

    // ---- Upload file ----
    const uploadFile = useCallback(() => {
        // 调用全屏文件选择器（和聊天窗口一样）
        showSmartNotebookFilePicker(
            handleFilesSelected,
            intl.formatMessage({id: 'smart_notebook.select_file', defaultMessage: '选择文件'}),
        );
    }, [handleFilesSelected, intl]);

    // ---- Save ----
    // Extract title from blocks:
    // Priority: H1 heading block > first non-empty paragraph
    const extractTitleFromBlocks = useCallback((blocksList: SmartNoteBlock[]): string => {
        if (!blocksList || blocksList.length === 0) {
            return intl.formatMessage({id: 'smart_notebook.untitled', defaultMessage: '无标题'});
        }

        // First pass: look for H1 heading
        for (const block of blocksList) {
            if (block.type === 'heading' && block.meta?.level === 1 && block.content?.trim()) {
                const h1Title = block.content.trim();
                return h1Title.length > 50 ? h1Title.substring(0, 50) + '...' : h1Title;
            }
        }

        // Second pass: use first non-empty paragraph
        for (const block of blocksList) {
            if (block.content?.trim()) {
                const text = block.content.trim();
                return text.length > 50 ? text.substring(0, 50) + '...' : text;
            }
        }

        return intl.formatMessage({id: 'smart_notebook.untitled', defaultMessage: '无标题'});
    }, [intl]);

    const handleSave = useCallback(async () => {
        if (!userId || saving) return;

        setSaving(true);

        // 检查是否有本地文件需要上传
        const {isLocalBlock} = await import('./smart_notebook_upload');
        const localBlocks = blocks.filter(isLocalBlock);
        const hasLocalFiles = localBlocks.length > 0;

        try {
            let blocksToSave = blocks;

            // 如果有本地文件，显示上传进度
            if (hasLocalFiles) {
                // 显示上传进度对话框
                setSaveProgress({
                    visible: true,
                    current: 0,
                    total: localBlocks.length,
                    message: intl.formatMessage({
                        id: 'smart_notebook.uploading_files',
                        defaultMessage: '正在上传文件...',
                    }),
                });

                // 上传所有本地文件
                const {uploadAllLocalBlocks} = await import('./smart_notebook_upload');
                debugLog('[SmartNotebook] handleSave: 开始上传本地文件', {
                    localBlocksCount: localBlocks.length,
                    totalBlocksCount: blocks.length,
                });
                const uploadResult = await uploadAllLocalBlocks(
                    serverUrl,
                    userId,
                    blocks,
                    (current, total) => {
                        // 更新进度
                        debugLog('[SmartNotebook] handleSave: 上传进度', {current, total});
                        setSaveProgress({
                            visible: true,
                            current,
                            total,
                            message: intl.formatMessage(
                                {
                                    id: 'smart_notebook.uploading_progress',
                                    defaultMessage: '正在上传文件 ({current}/{total})...',
                                },
                                {current, total},
                            ),
                        });
                    },
                );

                debugLog('[SmartNotebook] handleSave: 上传完成', {
                    success: uploadResult.success,
                    errorsCount: uploadResult.errors.length,
                    blocksCount: uploadResult.blocks.length,
                });

                // 隐藏上传进度
                setSaveProgress({visible: false, current: 0, total: 0, message: ''});

                // 如果有上传失败的文件，提示用户
                if (uploadResult.errors.length > 0) {
                    const failedNames = uploadResult.errors
                        .map((e) => {
                            // 提取 VIDEO/AUDIO caption 中的文件名
                            const cap = e.block.meta?.caption || '';
                            const m = cap.match(/^\[(?:VIDEO|AUDIO):[^\]]*\](.*)$/);
                            return m ? m[1] : (e.block.meta?.fileName || cap || '未知文件');
                        })
                        .join(', ');

                    const result = await new Promise<boolean>((resolve) => {
                        Alert.alert(
                            intl.formatMessage({
                                id: 'smart_notebook.upload_warning',
                                defaultMessage: '部分文件上传失败',
                            }),
                            intl.formatMessage(
                                {
                                    id: 'smart_notebook.upload_warning_message',
                                    defaultMessage: '{count} 个文件上传失败：{names}\n\n是否仍然保存笔记？',
                                },
                                {
                                    count: uploadResult.errors.length,
                                    names: failedNames,
                                },
                            ),
                            [
                                {
                                    text: intl.formatMessage({id: 'common.cancel', defaultMessage: '取消'}),
                                    style: 'cancel',
                                    onPress: () => resolve(false),
                                },
                                {
                                    text: intl.formatMessage({id: 'smart_notebook.save_anyway', defaultMessage: '仍然保存'}),
                                    style: 'default',
                                    onPress: () => resolve(true),
                                },
                            ],
                        );
                    });

                    if (!result) {
                        // 用户选择取消
                        setSaving(false);
                        return;
                    }
                }

                blocksToSave = uploadResult.blocks;
            }

            // 显示保存进度
            setSaveProgress({
                visible: true,
                current: 0,
                total: 1,
                message: intl.formatMessage({
                    id: 'smart_notebook.saving_note',
                    defaultMessage: '正在保存笔记...',
                }),
            });

            // 保存笔记
            const noteTitle = title.trim() || extractTitleFromBlocks(blocksToSave);

            debugLog('[SmartNotebook] handleSave: 开始保存', {
                isNew,
                noteId,
                userId,
                title: noteTitle,
                blocksCount: blocksToSave.length,
            });

            try {
                if (isNew) {
                    debugLog('[SmartNotebook] handleSave: 创建新笔记');
                    const createdNote = await createNote(serverUrl, userId, noteTitle, 'private');
                    debugLog('[SmartNotebook] handleSave: 创建笔记结果', {createdNote});
                    if (createdNote?.id) {
                        debugLog('[SmartNotebook] handleSave: 更新新笔记内容', {noteId: createdNote.id});
                        await updateNote(serverUrl, userId, createdNote.id, {
                            title: noteTitle,
                            blocks: blocksToSave,
                        });
                        debugLog('[SmartNotebook] handleSave: 更新新笔记成功');
                    } else {
                        debugLog('[SmartNotebook] handleSave: 创建笔记失败', {createdNote});
                        throw new Error('创建笔记失败');
                    }
                } else {
                    debugLog('[SmartNotebook] handleSave: 更新现有笔记', {noteId});
                    await updateNote(serverUrl, userId, noteId, {
                        title: noteTitle,
                        blocks: blocksToSave,
                    });
                    debugLog('[SmartNotebook] handleSave: 更新笔记成功');
                }
            } catch (saveError) {
                debugLog('[SmartNotebook] handleSave: 保存失败', {
                    isNew,
                    noteId,
                    error: saveError instanceof Error ? saveError.message : String(saveError),
                    stack: saveError instanceof Error ? saveError.stack : undefined,
                });
                throw saveError;
            }

            // 隐藏保存进度
            setSaveProgress({visible: false, current: 0, total: 0, message: ''});

            setSaveSuccess(true);
            setBlocks(blocksToSave); // 更新块为已上传版本
            setOriginalBlocks(JSON.parse(JSON.stringify(blocksToSave)));
            setTimeout(() => setSaveSuccess(false), 2000);

            // After saving, go back to viewing mode (for editing existing notes)
            if (mode === 'editing') {
                setMode('viewing');
            }
        } catch (e) {
            // 隐藏进度对话框
            setSaveProgress({visible: false, current: 0, total: 0, message: ''});

            debugLog('[SmartNotebook] handleSave: catch block', {
                error: e instanceof Error ? e.message : String(e),
                stack: e instanceof Error ? e.stack : undefined,
            });

            Alert.alert(
                intl.formatMessage({id: 'smart_notebook.save_failed', defaultMessage: '保存失败'}),
                intl.formatMessage(
                    {id: 'smart_notebook.save_failed_message', defaultMessage: '保存笔记时出错：{error}'},
                    {error: e instanceof Error ? e.message : String(e)},
                ),
            );
        } finally {
            setSaving(false);
        }
    }, [userId, saving, title, blocks, isNew, serverUrl, noteId, intl, extractTitleFromBlocks, mode]);

    // ---- Enter edit mode ----
    const handleEdit = useCallback(() => {
        setMode('editing');
        setOriginalBlocks(JSON.parse(JSON.stringify(blocks))); // Store current blocks for cancel comparison
    }, [blocks]);

    // ---- Cancel editing ----
    const handleCancel = useCallback(() => {
        if (hasChanges) {
            Alert.alert(
                intl.formatMessage({id: 'smart_notebook.unsaved_changes', defaultMessage: '未保存的更改'}),
                intl.formatMessage({id: 'smart_notebook.discard_changes', defaultMessage: '是否放弃更改？'}),
                [
                    {
                        text: intl.formatMessage({id: 'common.cancel', defaultMessage: '取消'}),
                        style: 'cancel',
                    },
                    {
                        text: intl.formatMessage({id: 'smart_notebook.discard', defaultMessage: '放弃'}),
                        style: 'destructive',
                        onPress: () => {
                            setBlocks(JSON.parse(JSON.stringify(originalBlocks)));
                            setMode('viewing');
                        },
                    },
                ],
            );
        } else {
            setMode('viewing');
        }
    }, [hasChanges, originalBlocks, intl]);

    // ---- Copy content (plain text, aligned with webapp) ----
    const handleCopy = useCallback(() => {
        // Convert blocks to plain text (like webapp)
        const lines: string[] = [];
        for (const block of blocks) {
            switch (block.type) {
                case 'heading':
                case 'paragraph':
                case 'blockquote':
                    // Strip any HTML tags to get plain text
                    lines.push((block.content || '').replace(/<[^>]*>/g, ''));
                    break;
                case 'code-block':
                    lines.push(block.content || '');
                    break;
                case 'bulleted-list': {
                    const items = block.meta?.items || (block.content ? [block.content] : []);
                    items.forEach((item: string) => {
                        const text = typeof item === 'string' ? item.replace(/<[^>]*>/g, '') : '';
                        lines.push(`• ${text}`);
                    });
                    break;
                }
                case 'numbered-list': {
                    const items = block.meta?.items || (block.content ? [block.content] : []);
                    items.forEach((item: string, i: number) => {
                        const text = typeof item === 'string' ? item.replace(/<[^>]*>/g, '') : '';
                        lines.push(`${i + 1}. ${text}`);
                    });
                    break;
                }
                case 'divider':
                case 'horizontal-rule':
                    lines.push('---');
                    break;
                case 'image':
                    lines.push(`[图片: ${block.meta?.caption || 'image'}]`);
                    break;
                case 'video':
                    lines.push(`[视频: ${block.meta?.caption || 'video'}]`);
                    break;
                case 'audio':
                    lines.push(`[音频: ${block.meta?.caption || 'audio'}]`);
                    break;
                default:
                    if (block.content) {
                        lines.push(block.content.replace(/<[^>]*>/g, ''));
                    }
                    break;
            }
        }
        const plainText = lines.join('\n');

        if (!plainText.trim()) {
            Alert.alert(
                intl.formatMessage({id: 'smart_notebook.copy_empty', defaultMessage: '没有可复制的内容'}),
            );
            return;
        }
        Clipboard.setString(plainText);
        Alert.alert(
            intl.formatMessage({id: 'smart_notebook.copy_success', defaultMessage: '已复制到剪贴板'}),
        );
    }, [blocks, intl]);

    // ---- Go back with confirmation ----
    const handleGoBack = useCallback(() => {
        if (hasChanges) {
            Alert.alert(
                intl.formatMessage({id: 'smart_notebook.unsaved_changes', defaultMessage: '未保存的更改'}),
                intl.formatMessage({id: 'smart_notebook.unsaved_changes_message', defaultMessage: '是否保存更改？'}),
                [
                    {
                        text: intl.formatMessage({id: 'common.cancel', defaultMessage: '取消'}),
                        style: 'cancel',
                        onPress: () => navigation.goBack(),
                    },
                    {
                        text: intl.formatMessage({id: 'smart_notebook.dont_save', defaultMessage: '不保存'}),
                        style: 'destructive',
                        onPress: () => navigation.goBack(),
                    },
                    {
                        text: intl.formatMessage({id: 'smart_notebook.save', defaultMessage: '保存'}),
                        onPress: async () => {
                            await handleSave();
                        },
                    },
                ],
            );
        } else {
            navigation.goBack();
        }
    }, [hasChanges, handleSave, navigation, intl]);

    // ---- Render ----
    if (loading) {
        return (
            <SafeAreaView style={style.container}>
                <View style={style.header}>
                    <View style={style.headerBtn}/>
                    <Text style={style.headerTitle}>加载中...</Text>
                    <View style={style.headerBtn}/>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={style.container}>
            <KeyboardAvoidingView
                style={style.container}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                {/* Header */}
                <View style={style.header}>
                    <TouchableOpacity onPress={mode === 'editing' ? handleCancel : handleGoBack} style={style.headerBtn}>
                        <CompassIcon
                            name={mode === 'editing' ? 'close' : 'arrow-left'}
                            size={20}
                            color={theme.sidebarText}
                        />
                    </TouchableOpacity>
                    <View style={style.headerTitleContainer}>
                        <Text style={style.headerLabel} numberOfLines={1}>
                            {mode === 'new'
                                ? intl.formatMessage({id: 'smart_notebook.new_note', defaultMessage: '新建笔记'})
                                : mode === 'editing'
                                    ? intl.formatMessage({id: 'smart_notebook.edit_note', defaultMessage: '编辑笔记'})
                                    : title || intl.formatMessage({id: 'smart_notebook.untitled', defaultMessage: '无标题'})}
                        </Text>
                    </View>
                    {mode === 'viewing' ? (
                        <View style={style.headerActions}>
                            <TouchableOpacity onPress={handleCopy} style={style.headerActionBtn}>
                                <Text style={style.headerActionText}>
                                    {intl.formatMessage({id: 'smart_notebook.copy', defaultMessage: '复制'})}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleEdit} style={style.saveBtn}>
                                <Text style={style.saveBtnText}>
                                    {intl.formatMessage({id: 'smart_notebook.edit', defaultMessage: '编辑'})}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    ) : saveSuccess ? (
                        <View style={style.saveSuccessContainer}>
                            <Text style={style.saveSuccessText}>
                                {intl.formatMessage({id: 'smart_notebook.saved', defaultMessage: '已保存'})}
                            </Text>
                        </View>
                    ) : (
                        <TouchableOpacity onPress={handleSave} style={style.saveBtn} disabled={saving}>
                            <Text style={[style.saveBtnText, saving && style.saveBtnTextDisabled]}>
                                {intl.formatMessage({id: 'smart_notebook.save', defaultMessage: '保存'})}
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Content Area */}
                <ScrollView style={style.editorContainer} keyboardShouldPersistTaps='handled'>
                    {mode === 'viewing' ? (
                        // Read-only view with Block Editor (non-editable)
                        <TouchableOpacity
                            style={style.readOnlyContainer}
                            onPress={handleEdit}
                            activeOpacity={0.8}
                        >
                            {blocks.length > 0 && blocks.some(b => b.content?.trim()) ? (
                                <BlockEditor
                                    blocks={blocks}
                                    onChange={() => {}} // No-op for read-only
                                    theme={theme}
                                    editable={false}
                                />
                            ) : (
                                <Text style={style.readOnlyContent}>
                                    {intl.formatMessage({id: 'smart_notebook.empty_content', defaultMessage: '暂无内容，点击编辑'})}
                                </Text>
                            )}
                        </TouchableOpacity>
                    ) : (
                        // Editable view with Block Editor
                        <BlockEditor
                            blocks={blocks}
                            onChange={handleBlocksChange}
                            theme={theme}
                            editable={true}
                            onFocusedIndexChange={handleFocusedIndexChange}
                            pendingFocusIndex={pendingFocusIndex}
                            onFocusApplied={handleFocusApplied}
                        />
                    )}
                </ScrollView>

                {/* Recording indicator */}
                {voiceState === 'recording' && (
                    <View style={style.recordingBanner}>
                        <CompassIcon name='microphone' size={16} color={theme.dndIndicator}/>
                        <Text style={style.recordingText}>
                            {intl.formatMessage({id: 'smart_notebook.recording', defaultMessage: '录音中...点击麦克风结束'})}
                        </Text>
                    </View>
                )}
                {/* Real-time voice stream indicator - shows live transcription */}
                {voiceStreamState === 'recording' && (
                    <View style={style.recordingBanner}>
                        <CompassIcon name='microphone' size={16} color={theme.dndIndicator}/>
                        <Text style={style.recordingText}>
                            {intl.formatMessage({id: 'smart_notebook.realtime_recording', defaultMessage: '实时转录中...说出你想写的内容'})}
                        </Text>
                        {voiceStreamResult.partialText ? (
                            <Text style={[style.recordingText, {marginTop: 4, fontStyle: 'italic'}]} numberOfLines={2}>
                                "{voiceStreamResult.partialText}"
                            </Text>
                        ) : null}
                    </View>
                )}
                {voiceStreamState === 'connecting' && (
                    <View style={style.recordingBanner}>
                        <ActivityIndicator size='small' color={theme.buttonBg}/>
                        <Text style={style.recordingText}>
                            {intl.formatMessage({id: 'smart_notebook.connecting_voice', defaultMessage: '正在连接语音服务...'})}
                        </Text>
                    </View>
                )}
                {voiceProcessing && (
                    <View style={style.recordingBanner}>
                        <ActivityIndicator size='small' color={theme.buttonBg}/>
                        <Text style={style.recordingText}>
                            {intl.formatMessage({id: 'smart_notebook.processing_voice', defaultMessage: '语音转文字中...'})}
                        </Text>
                    </View>
                )}

                {/* Toolbar - only show in edit mode */}
                {mode !== 'viewing' && (
                <View style={style.toolbar}>
                    <TouchableOpacity onPress={insertHeading} style={style.toolbarBtn}>
                        <Text style={style.toolbarText}>H1</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={insertBulletList} style={style.toolbarBtn}>
                        <Text style={style.toolbarText}>•</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={insertNumberedList} style={style.toolbarBtn}>
                        <Text style={style.toolbarText}>1.</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={insertQuote} style={style.toolbarBtn}>
                        <Text style={style.toolbarText}>"</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={insertCode} style={style.toolbarBtn}>
                        <Text style={style.toolbarText}>&lt;/&gt;</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={uploadFile} style={style.toolbarBtn}>
                        <CompassIcon name='folder-outline' size={20} color={theme.centerChannelColor}/>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={uploadImage} style={style.toolbarBtn}>
                        <CompassIcon name='image-outline' size={20} color={theme.centerChannelColor}/>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={uploadVideo} style={style.toolbarBtn}>
                        <CompassIcon name='video-outline' size={20} color={theme.centerChannelColor}/>
                    </TouchableOpacity>
                    {/* Real-time voice stream button - independent from chat window voice messages */}
                    {voiceStreamState === 'connecting' || voiceProcessing ? (
                        <View style={style.toolbarBtn}>
                            <ActivityIndicator size='small' color={theme.buttonBg}/>
                        </View>
                    ) : voiceStreamState === 'recording' ? (
                        <TouchableOpacity
                            onPress={async () => {
                                const finalText = await stopStreaming();
                                console.log('[SmartNote] Voice stopped, final text:', finalText);
                            }}
                            style={[style.toolbarBtn, style.toolbarBtnActive]}
                        >
                            <CompassIcon name='microphone' size={20} color={theme.dndIndicator}/>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity
                            onPress={async () => {
                                const started = await startStreaming();
                                if (!started) {
                                    Alert.alert(
                                        intl.formatMessage({id: 'smart_notebook.voice_error', defaultMessage: '语音转文字失败'}),
                                        voiceStreamResult.error || '启动失败',
                                    );
                                }
                            }}
                            style={style.toolbarBtn}
                        >
                            <CompassIcon name='microphone-outline' size={20} color={theme.centerChannelColor}/>
                        </TouchableOpacity>
                    )}
                </View>
                )}

                {/* Save Progress Dialog */}
                <Modal
                    visible={saveProgress.visible}
                    transparent={true}
                    animationType='fade'
                    statusBarTranslucent={true}
                >
                    <View style={style.saveProgressOverlay}>
                        <View style={style.saveProgressDialog}>
                            <ActivityIndicator
                                size='large'
                                color={theme.buttonBg}
                                style={style.saveProgressIndicator}
                            />
                            <Text style={style.saveProgressMessage}>
                                {saveProgress.message}
                            </Text>
                            {saveProgress.total > 0 && (
                                <View style={style.saveProgressBar}>
                                    <View
                                        style={[
                                            style.saveProgressBarFill,
                                            {width: `${(saveProgress.current / saveProgress.total) * 100}%`},
                                        ]}
                                    />
                                </View>
                            )}
                            {saveProgress.total > 0 && (
                                <Text style={style.saveProgressText}>
                                    {saveProgress.current} / {saveProgress.total}
                                </Text>
                            )}
                        </View>
                    </View>
                </Modal>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

// ---- Styles ----

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: theme.sidebarBg,
    },
    headerBtn: {
        padding: 8,
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    headerActionBtn: {
        padding: 8,
        marginRight: 4,
    },
    headerActionText: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.sidebarText,
    },
    saveBtn: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: theme.buttonBg,
        borderRadius: 4,
    },
    saveBtnText: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.buttonColor,
    },
    saveBtnTextDisabled: {
        opacity: 0.5,
    },
    saveSuccessContainer: {
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    saveSuccessText: {
        ...typography('Body', 100),
        color: theme.onlineIndicator,
    },
    headerTitle: {
        ...typography('Heading', 200, 'SemiBold'),
        color: theme.sidebarText,
        flex: 1,
    },
    headerTitleContainer: {
        flex: 1,
        alignItems: 'center',
    },
    headerLabel: {
        ...typography('Heading', 300, 'SemiBold'),
        color: theme.sidebarText,
    },
    editorContainer: {
        flex: 1,
    },
    editor: {
        flex: 1,
        paddingHorizontal: 16,
        paddingVertical: 12,
        ...typography('Body', 100),
        color: theme.centerChannelColor,
        minHeight: 200,
    },
    readOnlyContainer: {
        flex: 1,
        paddingHorizontal: 16,
        paddingVertical: 12,
        minHeight: 200,
    },
    readOnlyContent: {
        ...typography('Body', 100),
        color: theme.centerChannelColor,
        lineHeight: 24,
    },
    toolbar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
        paddingHorizontal: 8,
        paddingVertical: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.1),
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.02),
    },
    toolbarBtn: {
        padding: 8,
        borderRadius: 4,
    },
    toolbarBtnActive: {
        backgroundColor: changeOpacity(theme.dndIndicator, 0.15),
    },
    recordingBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        backgroundColor: changeOpacity(theme.dndIndicator, 0.08),
        paddingHorizontal: 16,
    },
    recordingText: {
        ...typography('Body', 75),
        color: theme.dndIndicator,
        marginLeft: 8,
    },
    toolbarText: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    saveProgressOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    saveProgressDialog: {
        backgroundColor: theme.centerChannelBg,
        borderRadius: 12,
        padding: 24,
        minWidth: 280,
        maxWidth: 320,
        alignItems: 'center',
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.25,
        shadowRadius: 4,
    },
    saveProgressIndicator: {
        marginBottom: 16,
    },
    saveProgressMessage: {
        ...typography('Body', 200, 'Medium'),
        color: theme.centerChannelColor,
        textAlign: 'center',
        marginBottom: 12,
    },
    saveProgressBar: {
        width: '100%',
        height: 4,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.1),
        borderRadius: 2,
        marginBottom: 8,
        overflow: 'hidden',
    },
    saveProgressBarFill: {
        height: '100%',
        backgroundColor: theme.buttonBg,
        borderRadius: 2,
    },
    saveProgressText: {
        ...typography('Body', 75, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.6),
        textAlign: 'center',
    },
}));

export default SmartNoteDetailScreen;
