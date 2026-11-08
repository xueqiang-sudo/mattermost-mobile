// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Clipboard,
    Keyboard,
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
import {Image} from 'expo-image';

import {SafeAreaView} from 'react-native-safe-area-context';

import {useNavigation, useRoute, type RouteProp} from '@react-navigation/native';
import CompassIcon from '@components/compass_icon';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import DatabaseManager from '@database/manager';
import {useDownloadFileAndPreview} from '@hooks/files';
import {useVoiceRecorder, type VoiceRecorderErrorCode} from '@hooks/use_voice_recorder';
import {useVoiceStream} from '@hooks/use_voice_stream';
import {getServerCredentials} from '@init/credentials';
import NetworkManager from '@managers/network_manager';
import {getCurrentTeamId, getCurrentUserId} from '@queries/servers/system';
import {showSmartNotebookFilePicker} from '@screens/file_picker/show_modal';
import {debugLog} from '@store/debug_log';
import {openUnifiedFileViewer} from '@utils/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import {getDriveDownloadUrl} from '../workbench_api';

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

    const {noteId: initialNoteId, noteTitle} = route.params;
    const initialIsNew = initialNoteId === 'new';

    // 【关键修复】使用 state 追踪 noteId 和 isNew，创建笔记后可以更新
    const [currentNoteId] = useState<string>(initialNoteId);
    const isNew = currentNoteId === 'new';

    // Mode: 'new' = creating new note, 'viewing' = read-only, 'editing' = edit mode
    type NoteMode = 'new' | 'viewing' | 'editing';
    const [mode, setMode] = useState<NoteMode>(initialIsNew ? 'new' : 'viewing');

    const textInputRef = useRef<TextInput>(null);
    const editorScrollViewRef = useRef<ScrollView>(null);

    // 滚动到指定 block 的处理函数
    const handleScrollToBlock = useCallback((index: number) => {
        // 使用 setTimeout 确保布局已更新
        setTimeout(() => {
            if (editorScrollViewRef.current) {
                // 估算每个 block 的高度和位置
                // 这里使用一个简单的估算，实际可以根据 block 类型调整
                const estimatedBlockHeight = 50; // 估算每个 block 的平均高度
                const blockPosition = index * estimatedBlockHeight;

                // 滚动到目标位置，留出一些空间在工具栏上方
                editorScrollViewRef.current.scrollTo({
                    y: Math.max(0, blockPosition - 100), // 留出 100px 空间
                    animated: true,
                });
            }
        }, 200); // 等待键盘动画和布局更新
    }, []);

    // 【关键修复】文件预览功能（对齐云盘预览逻辑）
    const {downloadAndPreviewFile, PreviewLoadingModal, showPreviewLoading, hidePreviewLoading} = useDownloadFileAndPreview(true);

    const handlePreviewFile = useCallback(async (fileInfo: FileInfo) => {
        const driveFileId = fileInfo.id;
        debugLog('[SmartNote] Previewing file (drive-based):', {name: fileInfo.name, driveFileId});

        if (!driveFileId) {
            debugLog('[SmartNote] Missing fileId, falling back to default preview');
            downloadAndPreviewFile(fileInfo);
            return;
        }

        // 【关键修复】懒加载 teamId，不依赖 init effect
        let effectiveTeamId = teamId;
        if (!effectiveTeamId) {
            try {
                const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
                effectiveTeamId = await getCurrentTeamId(database);
                debugLog('[SmartNote] Lazy-loaded teamId:', effectiveTeamId);
            } catch (err) {
                debugLog('[SmartNote] Failed to get teamId:', String(err));
            }
        }

        if (!effectiveTeamId) {
            debugLog('[SmartNote] Still no teamId, falling back to default preview');
            downloadAndPreviewFile(fileInfo);
            return;
        }

        try {
            const downloadUrl = getDriveDownloadUrl(serverUrl, effectiveTeamId, driveFileId);
            const ext = (fileInfo.extension || '').toLowerCase();
            const officeExtensions = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp'];
            const isOffice = officeExtensions.includes(ext);

            // 对齐云盘：Office 文件需要 mm_file_id 才能进行 PDF 转换
            const mmFileId = fileInfo.mm_file_id || '';

            // 尝试获取完整文件信息（包含 pdf_preview_id）
            let enrichedFileInfo: FileInfo | null = null;
            if (mmFileId) {
                try {
                    const client = NetworkManager.getClient(serverUrl);
                    const timestamp = Date.now();
                    try {
                        enrichedFileInfo = await client.getFileInfo(`${mmFileId}?_t=${timestamp}`);
                    } catch {
                        enrichedFileInfo = await client.getFileInfo(mmFileId);
                    }
                    debugLog('[SmartNote] Got file info', {
                        pdf_preview_id: enrichedFileInfo?.pdf_preview_id,
                        pdf_conversion_status: (enrichedFileInfo as any)?.pdf_conversion_status,
                    });
                } catch (err) {
                    debugLog('[SmartNote] getFileInfo failed, using manual construction', String(err));
                }
            }

            const finalFileInfo: FileInfo = enrichedFileInfo || {
                ...fileInfo,
                id: mmFileId,
                uri: downloadUrl,
                link: downloadUrl,
            };

            // 如果有 Mattermost 文件 ID，走标准预览流程（自动触发转换+轮询+下载）
            if (mmFileId) {
                debugLog('[SmartNote] Using Mattermost preview pipeline (mm_file_id exists)');
                // 构建完整的 FileInfo 用于 downloadAndPreviewFile
                const previewFileInfo: FileInfo = {
                    id: mmFileId,
                    name: fileInfo.name,
                    extension: ext,
                    mime_type: fileInfo.mime_type,
                    size: fileInfo.size,
                    user_id: enrichedFileInfo?.user_id || '',
                    create_at: enrichedFileInfo?.create_at || 0,
                    update_at: enrichedFileInfo?.update_at || 0,
                    delete_at: 0,
                    post_id: '',
                    channel_id: '',
                    has_preview_image: enrichedFileInfo?.has_preview_image || false,
                    height: 0,
                    width: 0,
                    pdf_preview_id: enrichedFileInfo?.pdf_preview_id,
                };
                downloadAndPreviewFile(previewFileInfo);
            } else {
                // 没有 mm_file_id，直接从云盘下载后打开（旧文件）
                debugLog('[SmartNote] No mm_file_id, downloading from drive API');
                showPreviewLoading({
                    visible: true,
                    fileName: fileInfo.name,
                    currentStep: 'downloading',
                    steps: ['downloading', 'opening'],
                    canCancel: false,
                });

                const {cacheDirectory, downloadAsync, makeDirectoryAsync} = await import('expo-file-system');
                const timestamp = Date.now();
                const safeName = fileInfo.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                const tempPath = `${cacheDirectory}smartnote_preview_${timestamp}/${safeName}`;
                const dir = tempPath.substring(0, tempPath.lastIndexOf('/'));
                await makeDirectoryAsync(dir, {intermediates: true});

                const client = NetworkManager.getClient(serverUrl);
                const headers = client.getRequestHeaders('GET');

                debugLog('[SmartNote] Downloading from drive:', {downloadUrl, tempPath});
                const downloadResult = await downloadAsync(downloadUrl, tempPath, {headers});

                if (!downloadResult.uri) {
                    throw new Error('Download failed - no URI returned');
                }

                debugLog('[SmartNote] Download complete:', downloadResult.uri);

                const localFileInfo: FileInfo = {
                    ...finalFileInfo,
                    localPath: downloadResult.uri,
                };

                showPreviewLoading((prev: any) => ({...prev, currentStep: 'opening', canCancel: false}));
                await new Promise((resolve) => setTimeout(resolve, 200));

                openUnifiedFileViewer(localFileInfo, theme);
                hidePreviewLoading();
            }
        } catch (err) {
            debugLog('[SmartNote] Preview error:', err instanceof Error ? err.message : String(err));
            hidePreviewLoading();
            Alert.alert(
                intl.formatMessage({id: 'smart_notebook.preview_error', defaultMessage: '预览失败'}),
                intl.formatMessage({id: 'smart_notebook.preview_failed', defaultMessage: '无法打开此文件。'}),
            );
        }
    }, [downloadAndPreviewFile, teamId, serverUrl, intl, theme, showPreviewLoading, hidePreviewLoading]);

    // 【关键改造】图片全屏预览
    const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);

    const handlePreviewImage = useCallback((fileInfo: FileInfo) => {
        debugLog('[SmartNote] Previewing image:', {name: fileInfo.name, id: fileInfo.id});
        // 使用 localPath（完整的图片 URL）
        if (fileInfo.localPath) {
            setFullscreenImage(fileInfo.localPath);
        }
    }, []);

    const [userId, setUserId] = useState('');
    const [teamId, setTeamId] = useState('');
    const [bearerToken, setBearerToken] = useState('');
    const [title, setTitle] = useState(noteTitle || '');
    const [blocks, setBlocks] = useState<SmartNoteBlock[]>([createBlock('paragraph', '')]);
    const [originalBlocks, setOriginalBlocks] = useState<SmartNoteBlock[]>([]); // For cancel comparison
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(!isNew);
    const [voiceProcessing, setVoiceProcessing] = useState(false);
    const [savedTitle, setSavedTitle] = useState(''); // 保存时的标题

    // 脉冲动画
    const pulseAnim = useRef(new Animated.Value(1)).current;

    // 录音开始时启动脉冲动画
    useEffect(() => {
        if (voiceStreamState === 'recording') {
            const pulse = Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, {
                        toValue: 0.3,
                        duration: 800,
                        useNativeDriver: true,
                    }),
                    Animated.timing(pulseAnim, {
                        toValue: 1,
                        duration: 800,
                        useNativeDriver: true,
                    }),
                ])
            );
            pulse.start();
            return () => pulse.stop();
        } else {
            pulseAnim.setValue(1);
        }
    }, [voiceStreamState, pulseAnim]);

    // 标题输入对话框状态
    const [showTitleDialog, setShowTitleDialog] = useState(false);
    const [titleInput, setTitleInput] = useState('');

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
    // 【关键修复】比较当前标题和保存时的标题，而不是和初始 prop 比较
    // 【关键修复】更智能的变更检测
    // 1. 比较 blocks 内容（不仅仅是 JSON 字符串）
    // 2. 如果 blocks 只包含空段落，认为没有变更
    const hasActualContent = blocks.some(block => {
        if (block.type === 'paragraph' || block.type === 'heading') {
            return block.content && block.content.trim().length > 0;
        }
        // 其他类型的块（图片、文件等）认为有内容
        return true;
    });

    const blocksChanged = JSON.stringify(blocks) !== JSON.stringify(originalBlocks);
    const titleChanged = title !== savedTitle;

    // 只有当有实际内容且发生了变化时，才认为有变更
    const hasChanges = (hasActualContent && blocksChanged) || titleChanged;

    // ---- Init ----
    useEffect(() => {
        const init = async () => {
            try {
                const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
                const uid = await getCurrentUserId(database);
                setUserId(uid);

                // 获取 teamId（用于云盘文件预览）
                const tid = await getCurrentTeamId(database);
                if (tid) {
                    setTeamId(tid);
                }

                // Get bearer token for WebSocket connection (real-time voice)
                const credentials = await getServerCredentials(serverUrl);
                if (credentials?.token) {
                    setBearerToken(credentials.token);
                }

                if (!isNew) {
                    const note = await getNote(serverUrl, uid, currentNoteId);
                    if (note) {
                        setTitle(note.title);
                        setSavedTitle(note.title); // 初始化保存的标题
                        let noteBlocks = note.blocks && note.blocks.length > 0
                            ? note.blocks
                            : [createBlock('paragraph', '')];

                        // 加载时将 <br> 转回 \n（对齐 webapp 的 HTML 格式 → mobile TextInput 格式）
                        noteBlocks = noteBlocks.map((b) => {
                            if ((b.type === 'paragraph' || b.type === 'heading' || b.type === 'blockquote') && b.content) {
                                return {...b, content: b.content.replace(/<br\s*\/?>/gi, '\n')};
                            }
                            return b;
                        });

                        // 编辑区不显示标题：移除第一个 H1 块（标题已在顶部导航栏显示）
                        if (noteBlocks.length > 0) {
                            const first = noteBlocks[0];
                            if (first.type === 'heading' && first.meta?.level === 1) {
                                noteBlocks = noteBlocks.slice(1);
                                if (noteBlocks.length === 0) {
                                    noteBlocks = [createBlock('paragraph', '')];
                                }
                            }
                        }

                        setBlocks(noteBlocks);
                        setOriginalBlocks(JSON.parse(JSON.stringify(noteBlocks)));
                    }
                } else {
                    // 新笔记，初始标题为空
                    setSavedTitle('');
                }
            } catch (e) {
                console.error('[SmartNoteDetail] init error:', e);
            } finally {
                setLoading(false);
            }
        };
        init();
    }, [serverUrl, currentNoteId, isNew]);

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
    // 【关键改造】对齐 webapp：立即上传文件，不再延迟到保存时
    const handleFilesSelected = useCallback(async (files: FileInfo[]) => {
        debugLog('smartNotebook', `[handleFilesSelected] called with ${files.length} files`);
        files.forEach((file, i) => {
            debugLog('smartNotebook', `[handleFilesSelected] File ${i + 1}: name=${file.name}, uri=${file.uri}, id=${file.id}, mime=${file.mime_type}, size=${file.size}, source=${(file as any).source || 'unknown'}`);
        });

        if (files.length === 0 || !userId) {
            return;
        }

        const newBlocks: SmartNoteBlock[] = [];

        // 【关键改造】对齐 webapp：立即上传每个文件，不显示阻塞式进度 Modal
        for (let index = 0; index < files.length; index++) {
            const file = files[index];
            const fileName = file.name || '';

            // 【关键修复】如果 MIME 类型为空，从文件扩展名推断
            let mimeType = file.mime_type || '';
            if (!mimeType || mimeType === '') {
                const ext = fileName.split('.').pop()?.toLowerCase() || '';
                const mimeMap: Record<string, string> = {
                    'jpg': 'image/jpeg',
                    'jpeg': 'image/jpeg',
                    'png': 'image/png',
                    'gif': 'image/gif',
                    'webp': 'image/webp',
                    'svg': 'image/svg+xml',
                    'bmp': 'image/bmp',
                    'mp4': 'video/mp4',
                    'avi': 'video/x-msvideo',
                    'mov': 'video/quicktime',
                    'webm': 'video/webm',
                    'mp3': 'audio/mpeg',
                    'wav': 'audio/wav',
                    'ogg': 'audio/ogg',
                    'm4a': 'audio/mp4',
                    'pdf': 'application/pdf',
                    'doc': 'application/msword',
                    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'xls': 'application/vnd.ms-excel',
                    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    'txt': 'text/plain',
                };
                mimeType = mimeMap[ext] || 'application/octet-stream';
            }

            const blockType = getMediaType(fileName, mimeType);
            const blockId = generateId();
            const extension = fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : '';

            debugLog('smartNotebook', `[handleFilesSelected] Processing file: ${fileName}, id=${file.id}, uri=${file.uri}`);

            try {
                let uploadResult: {url: string; fileId: string; mmFileId: string};

                // 如果文件已有 id（来自群组文件/云盘），直接使用，无需重新上传
                if (file.id) {
                    debugLog('smartNotebook', `[handleFilesSelected] File already on server, using existing id: ${file.id}`);
                    const teamId = await getCurrentTeamId(DatabaseManager.getServerDatabaseAndOperator(serverUrl).database);
                    uploadResult = {
                        url: file.uri || `${serverUrl}/api/v4/teams/${teamId}/drive/files/${file.id}/download`,
                        fileId: file.id,
                        mmFileId: (file as any).mm_file_id || file.id,
                    };
                } else {
                    // 本地文件，需要上传
                    debugLog('smartNotebook', `[handleFilesSelected] Uploading local file: ${fileName}`);
                    uploadResult = await uploadMedia(serverUrl, userId, {
                        uri: file.uri!,
                        name: fileName,
                        type: mimeType,
                    });
                }

                debugLog('smartNotebook', `[handleFilesSelected] Upload success:`, {
                    url: uploadResult.url,
                    fileId: uploadResult.fileId,
                    mmFileId: uploadResult.mmFileId,
                });

                // 对齐 webapp：视频/音频存为 image 类型，caption 编码实际 URL
                let content = uploadResult.url;
                let caption = fileName;

                if (isVideo(fileName, mimeType)) {
                    content = uploadResult.url;
                    caption = `[VIDEO:${uploadResult.url}]${fileName}`;
                } else if (isAudio(fileName, mimeType)) {
                    content = '';
                    caption = `[AUDIO:${uploadResult.url}]${fileName}`;
                }

                debugLog('smartNotebook', `[handleFilesSelected] Creating block: id=${blockId}, blockType=${blockType}, caption=${caption}`);

                newBlocks.push({
                    id: blockId,
                    type: blockType,
                    content,
                    order: blocks.length + index,
                    meta: {
                        // webapp 兼容字段
                        url: content,
                        fileName,
                        extension,
                        mmFileId: uploadResult.mmFileId || '',
                        caption,
                        fileId: uploadResult.fileId || '',
                        // mobile 额外字段
                        size: file.size || 0,
                        mimeType: file.mime_type || mimeType,
                        isLocal: false,  // 【关键改造】已上传，不是本地文件
                    },
                });
            } catch (error: any) {
                debugLog('smartNotebook', `[handleFilesSelected] Upload failed:`, {
                    fileName,
                    error: error?.message || String(error),
                });

                Alert.alert(
                    intl.formatMessage({id: 'smart_notebook.upload_failed', defaultMessage: '上传失败'}),
                    `${fileName}: ${error?.message || '未知错误'}`,
                );
            }
        }

        if (newBlocks.length === 0) {
            debugLog('smartNotebook', `[handleFilesSelected] No blocks created (all uploads failed)`);
            return;
        }

        debugLog('smartNotebook', `[handleFilesSelected] Created ${newBlocks.length} blocks, inserting at cursor=${focusedBlockIndex}`);

        // 【关键修复】在光标位置插入文件块，原段落块自动后移，光标聚焦到文件块后的段落块
        setBlocks(prev => {
            const updated = [...prev];
            const insertAt = focusedBlockIndex >= 0 ? focusedBlockIndex : prev.length;

            // 插入文件块（在光标位置）
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
    }, [focusedBlockIndex, serverUrl, userId, intl]);

    // Debug: Monitor blocks state changes
    useEffect(() => {
        debugLog('smartNotebook', `[smart_note_detail] blocks: ${blocks.length}, cursor=${focusedBlockIndex}`);
    }, [blocks.length, focusedBlockIndex]);

    // ---- Add block of specific type ----
    // 【关键修复】智能插入/替换 + 光标跟随
    const addBlock = useCallback((type: SmartNoteBlock['type'], meta?: Record<string, any>) => {
        const newBlock = createBlock(type, '');
        if (meta) {
            newBlock.meta = meta;
        }

        setBlocks(prev => {
            const updated = [...prev];
            let insertAt: number;
            let shouldReplace = false;

            if (focusedBlockIndex >= 0 && focusedBlockIndex < prev.length) {
                const currentBlock = prev[focusedBlockIndex];
                // 检查当前块是否是空块
                const isEmpty = !currentBlock.content || currentBlock.content.trim() === '';

                if (isEmpty) {
                    // 当前块为空，替换它
                    insertAt = focusedBlockIndex;
                    shouldReplace = true;
                    debugLog('smartNotebook', `[addBlock] Replacing empty block at index ${focusedBlockIndex} with type ${type}`);
                } else {
                    // 当前块有内容，在后面插入
                    insertAt = focusedBlockIndex + 1;
                    debugLog('smartNotebook', `[addBlock] Inserting after non-empty block at index ${focusedBlockIndex}`);
                }
            } else {
                // 没有光标，追加到末尾
                insertAt = prev.length;
                debugLog('smartNotebook', `[addBlock] No cursor, appending to end`);
            }

            // 如果要替换，先删除当前块
            if (shouldReplace) {
                updated.splice(insertAt, 1);
            }

            // 插入新块
            updated.splice(insertAt, 0, newBlock);

            // 更新 order
            updated.forEach((b, i) => { b.order = i; });

            // 光标聚焦到新块
            setTimeout(() => setPendingFocusIndex(insertAt), 50);

            return updated;
        });
    }, [focusedBlockIndex]);

    // ---- Toolbar actions ----
    const insertHeading = useCallback(() => {
        addBlock('heading', {level: 1});
    }, [addBlock]);

    const insertBulletList = useCallback(() => {
        // 使用 webapp 格式：单个 block，items 数组
        addBlock('bulleted-list', {items: ['']});
    }, [addBlock]);

    const insertNumberedList = useCallback(() => {
        // 使用 webapp 格式：单个 block，items 数组
        addBlock('numbered-list', {items: ['']});
    }, [addBlock]);

    const insertChecklist = useCallback(() => {
        // 使用 webapp 格式：单个 block，items 数组
        addBlock('checklist', {items: [{text: '', checked: false}]});
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
                    newBlock.meta = {
                        caption: asset.fileName || '图片',
                        fileName: asset.fileName || 'image.jpg',
                        isLocal: false,
                        url: uploadResult.url,
                        mmFileId: uploadResult.mmFileId || '',
                    };
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
                    const newBlock = createBlock('image', uploadResult.url);
                    newBlock.meta = {
                        caption: `[VIDEO:${uploadResult.url}]${asset.fileName || '视频'}`,
                        fileName: asset.fileName || 'video.mp4',
                        isLocal: false,
                        url: uploadResult.url,
                        mmFileId: uploadResult.mmFileId || '',
                    };
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

    const performSave = useCallback(async (overrideTitle?: string): Promise<boolean> => {
        if (!userId || saving) return false;

        setSaving(true);

        // 【关键改造】对齐 webapp：文件已在选择时立即上传，保存时无需再上传
        debugLog('[SmartNotebook] performSave: 开始保存', {
            totalBlocks: blocks.length,
            blockDetails: blocks.map(b => ({
                id: b.id,
                type: b.type,
                isLocal: b.meta?.isLocal,
                fileName: b.meta?.fileName,
                fileId: b.meta?.fileId,
            })),
        });

        try {
            // 保存时把标题作为 H1 块加回开头（服务端需要标题在 blocks 中）
            const noteTitle = overrideTitle || title.trim() || extractTitleFromBlocks(blocks);
            const titleBlock: SmartNoteBlock = {
                id: 'title_h1',
                type: 'heading',
                content: noteTitle,
                order: 0,
                meta: {level: 1},
            };
            const blocksToSave: SmartNoteBlock[] = [titleBlock, ...blocks.map((b, i) => {
                const saved = {...b, order: i + 1};
                // 对齐 webapp Editor.js：段落中的 \n 转为 <br>，否则 webapp 会折叠为一行
                if ((saved.type === 'paragraph' || saved.type === 'heading' || saved.type === 'blockquote') && saved.content) {
                    saved.content = saved.content.replace(/\n/g, '<br>');
                }
                return saved;
            })];

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

            debugLog('[SmartNotebook] handleSave: 开始保存', {
                isNew,
                noteId: currentNoteId,
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

                        // 【简化】保存成功后直接返回列表，无需更新 currentNoteId
                    } else {
                        debugLog('[SmartNotebook] handleSave: 创建笔记失败', {createdNote});
                        throw new Error('创建笔记失败');
                    }
                } else {
                    debugLog('[SmartNotebook] handleSave: 更新现有笔记', {noteId: currentNoteId});
                    await updateNote(serverUrl, userId, currentNoteId, {
                        title: noteTitle,
                        blocks: blocksToSave,
                    });
                    debugLog('[SmartNotebook] handleSave: 更新笔记成功');
                }
            } catch (saveError) {
                debugLog('[SmartNotebook] handleSave: 保存失败', {
                    isNew,
                    noteId: currentNoteId,
                    error: saveError instanceof Error ? saveError.message : String(saveError),
                    stack: saveError instanceof Error ? saveError.stack : undefined,
                });
                throw saveError;
            }

            // 隐藏保存进度
            setSaveProgress({visible: false, current: 0, total: 0, message: ''});

            // 更新已保存标题，避免保存后误报"未保存更改"
            setSavedTitle(noteTitle);

            debugLog('[SmartNotebook] performSave: 保存成功');
            return true;
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

            return false;
        } finally {
            setSaving(false);
        }
    }, [userId, saving, title, blocks, isNew, serverUrl, currentNoteId, intl, extractTitleFromBlocks]);

    const handleSave = useCallback(async (): Promise<boolean> => {
        if (!userId || saving) return false;

        // 已有标题的笔记直接保存，不弹标题输入框
        if (savedTitle) {
            return performSave(savedTitle);
        }

        // 新建笔记才提示输入标题
        Keyboard.dismiss();
        setTimeout(() => {
            setShowTitleDialog(true);
        }, 100);
        return false;
    }, [userId, saving, savedTitle, performSave]);

    // ---- Enter edit mode ----
    const handleEdit = useCallback(() => {
        setMode('editing');
        setOriginalBlocks(JSON.parse(JSON.stringify(blocks))); // Store current blocks for cancel comparison
    }, [blocks]);

    // ---- Cancel editing ----
    const handleCancel = useCallback(() => {
        // 【关键修复】先收起键盘，避免遮挡对话框
        Keyboard.dismiss();

        if (hasChanges) {
            setTimeout(() => {
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
            }, 100); // 等待键盘收起动画
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
        Keyboard.dismiss();
        if (hasChanges) {
            Alert.alert(
                intl.formatMessage({id: 'smart_notebook.unsaved_changes', defaultMessage: '未保存的更改'}),
                intl.formatMessage({id: 'smart_notebook.unsaved_changes_message', defaultMessage: '是否保存更改？'}),
                [
                    {
                        // 取消：留在当前页面
                        text: intl.formatMessage({id: 'common.cancel', defaultMessage: '取消'}),
                        style: 'cancel',
                    },
                    {
                        // 不保存：直接返回
                        text: intl.formatMessage({id: 'smart_notebook.dont_save', defaultMessage: '不保存'}),
                        style: 'destructive',
                        onPress: () => navigation.goBack(),
                    },
                    {
                        // 保存：handleSave 内部已处理保存+返回
                        text: intl.formatMessage({id: 'smart_notebook.save', defaultMessage: '保存'}),
                        onPress: () => handleSave(),
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
                    {/* 左侧：返回按钮 + 标题 */}
                    <TouchableOpacity onPress={handleGoBack} style={style.headerBtn}>
                        <CompassIcon
                            name='arrow-left'
                            size={20}
                            color={theme.sidebarText}
                        />
                    </TouchableOpacity>
                    <View style={style.headerTitleContainer}>
                        <Text style={style.headerLabel} numberOfLines={1}>
                            {title || intl.formatMessage({id: 'smart_notebook.untitled', defaultMessage: '无标题'})}
                        </Text>
                    </View>

                    {/* 右侧：操作按钮组 */}
                    <View style={style.headerActions}>
                        {/* 工具栏按钮（新建和已有笔记始终显示） */}
                        <>
                                {/* +号：在末尾添加段落并聚焦 */}
                                <TouchableOpacity
                                    onPress={() => {
                                        setBlocks(prev => {
                                            const newBlock = createBlock('paragraph', '');
                                            const updated = [...prev, newBlock];
                                            updated.forEach((b, i) => { b.order = i; });
                                            setTimeout(() => setPendingFocusIndex(updated.length - 1), 50);
                                            return updated;
                                        });
                                    }}
                                    style={style.headerActionBtn}
                                >
                                    <CompassIcon name='plus' size={20} color={theme.sidebarText}/>
                                </TouchableOpacity>

                                {/* 文件上传按钮 */}
                                <TouchableOpacity onPress={uploadFile} style={style.headerActionBtn}>
                                    <CompassIcon name='folder-outline' size={20} color={theme.sidebarText}/>
                                </TouchableOpacity>

                                {/* 语音按钮 */}
                                {voiceStreamState === 'connecting' || voiceProcessing ? (
                                    <View style={style.headerActionBtn}>
                                        <ActivityIndicator size='small' color={theme.sidebarText}/>
                                    </View>
                                ) : voiceStreamState === 'recording' ? (
                                    <TouchableOpacity
                                        onPress={async () => {
                                            const finalText = await stopStreaming();
                                            console.log('[SmartNote] Voice stopped, final text:', finalText);
                                        }}
                                        style={[style.headerActionBtn, style.recordingBtn]}
                                    >
                                        <CompassIcon name='microphone' size={20} color={theme.dndIndicator}/>
                                    </TouchableOpacity>
                                ) : (
                                    <TouchableOpacity
                                        onPress={async () => {
                                            if (!bearerToken || bearerToken.trim() === '') {
                                                Alert.alert(
                                                    intl.formatMessage({id: 'smart_notebook.voice_error', defaultMessage: '语音转文字失败'}),
                                                    '认证信息尚未准备好，请稍后再试',
                                                );
                                                return;
                                            }
                                            const started = await startStreaming();
                                            if (!started) {
                                                Alert.alert(
                                                    intl.formatMessage({id: 'smart_notebook.voice_error', defaultMessage: '语音转文字失败'}),
                                                    voiceStreamResult.error || '启动失败',
                                                );
                                            }
                                        }}
                                        style={style.headerActionBtn}
                                    >
                                        <CompassIcon name='microphone-outline' size={20} color={theme.sidebarText}/>
                                    </TouchableOpacity>
                                )}

                                {/* 复制按钮 */}
                                <TouchableOpacity onPress={handleCopy} style={style.headerActionBtn}>
                                    <CompassIcon name='content-copy' size={20} color={theme.sidebarText}/>
                                </TouchableOpacity>

                                {/* 保存按钮 */}
                                <TouchableOpacity onPress={handleSave} style={style.headerActionBtn} disabled={saving}>
                                    {saving ? (
                                        <ActivityIndicator size='small' color={theme.sidebarText}/>
                                    ) : (
                                        <Text style={style.headerActionText}>
                                            {intl.formatMessage({id: 'smart_notebook.save', defaultMessage: '保存'})}
                                        </Text>
                                    )}
                                </TouchableOpacity>
                        </>
                    </View>
                </View>

                {/* Content Area - Always editable */}
                <ScrollView
                    ref={editorScrollViewRef}
                    style={style.editorContainer}
                    keyboardShouldPersistTaps='handled'
                    contentContainerStyle={{paddingBottom: 40}}
                >
                    <BlockEditor
                        blocks={blocks}
                        onChange={handleBlocksChange}
                        theme={theme}
                        editable={true}
                        serverUrl={serverUrl}
                        onFocusedIndexChange={handleFocusedIndexChange}
                        pendingFocusIndex={pendingFocusIndex}
                        onFocusApplied={handleFocusApplied}
                        onScrollToBlock={handleScrollToBlock}
                        onPreviewFile={handlePreviewFile}
                        onPreviewImage={handlePreviewImage}
                    />
                </ScrollView>

                {/* 【关键修复】文件预览 Loading Modal */}
                {PreviewLoadingModal}

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
                            {intl.formatMessage({id: 'smart_notebook.realtime_recording', defaultMessage: '正在录音...点击麦克风结束'})}
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

                {/* Title Input Dialog */}
                <Modal
                    visible={showTitleDialog}
                    transparent={true}
                    animationType='fade'
                    statusBarTranslucent={true}
                    onRequestClose={() => {
                        setShowTitleDialog(false);
                        setTitleInput('');
                    }}
                >
                    <KeyboardAvoidingView
                        style={style.titleDialogOverlay}
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    >
                        <View style={style.titleDialogContainer}>
                            <Text style={style.titleDialogTitle}>
                                {intl.formatMessage({
                                    id: 'smart_notebook.enter_title',
                                    defaultMessage: '请输入标题',
                                })}
                            </Text>
                            <TextInput
                                style={style.titleDialogInput}
                                value={titleInput}
                                onChangeText={setTitleInput}
                                placeholder={intl.formatMessage({
                                    id: 'smart_notebook.untitled',
                                    defaultMessage: '无标题',
                                })}
                                autoFocus
                            />
                            <View style={style.titleDialogButtons}>
                                <TouchableOpacity
                                    onPress={() => {
                                        setShowTitleDialog(false);
                                        setTitleInput('');
                                    }}
                                    style={[style.titleDialogBtn, style.titleDialogBtnCancel]}
                                >
                                    <Text style={style.titleDialogBtnTextCancel}>
                                        {intl.formatMessage({
                                            id: 'smart_notebook.cancel',
                                            defaultMessage: '取消',
                                        })}
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={async () => {
                                        const newTitle = titleInput.trim() || intl.formatMessage({
                                            id: 'smart_notebook.untitled',
                                            defaultMessage: '无标题',
                                        });
                                        setTitleInput('');
                                        setTitle(newTitle);

                                        // 先关闭标题对话框，等待淡出动画完成
                                        // 避免两个 Modal（标题对话框淡出 + 保存进度淡入）同时切换导致 UI 卡死
                                        setShowTitleDialog(false);
                                        await new Promise((resolve) => setTimeout(resolve, 300));

                                        // 执行保存
                                        const saved = await performSave(newTitle);
                                        if (saved) {
                                            // 等待保存进度 Modal 淡出动画完成后再返回
                                            // 避免 Modal 关闭动画与导航转换冲突导致卡死
                                            await new Promise((resolve) => setTimeout(resolve, 300));
                                            navigation.goBack();
                                        }
                                    }}
                                    style={[style.titleDialogBtn, style.titleDialogBtnConfirm]}
                                >
                                    <Text style={style.titleDialogBtnTextConfirm}>
                                        {intl.formatMessage({
                                            id: 'smart_notebook.save',
                                            defaultMessage: '保存',
                                        })}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </KeyboardAvoidingView>
                </Modal>

                {/* 【关键改造】图片全屏预览 Modal */}
                <Modal
                    visible={!!fullscreenImage}
                    transparent={true}
                    animationType='fade'
                    statusBarTranslucent={true}
                    onRequestClose={() => setFullscreenImage(null)}
                >
                    <View style={{
                        flex: 1,
                        backgroundColor: '#000',
                        justifyContent: 'center',
                        alignItems: 'center',
                    }}>
                        <TouchableOpacity
                            style={{
                                position: 'absolute',
                                top: 50,
                                right: 20,
                                zIndex: 10,
                                padding: 10,
                                backgroundColor: 'rgba(0,0,0,0.5)',
                                borderRadius: 20,
                            }}
                            onPress={() => setFullscreenImage(null)}
                        >
                            <CompassIcon name='close' size={28} color='#fff'/>
                        </TouchableOpacity>
                        {fullscreenImage && (
                            <Image
                                source={{uri: fullscreenImage}}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                }}
                                contentFit='contain'
                            />
                        )}
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
        padding: 10,
        marginHorizontal: 2,
        minWidth: 36,
        alignItems: 'center',
        justifyContent: 'center',
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
    headerTitle: {
        ...typography('Heading', 200, 'SemiBold'),
        color: theme.sidebarText,
        flex: 1,
    },
    headerTitleContainer: {
        flex: 1,
        marginLeft: 8,
        justifyContent: 'center',
    },
    headerLabel: {
        ...typography('Heading', 300, 'SemiBold'),
        color: theme.sidebarText,
    },
    recordingBtn: {
        backgroundColor: theme.dndIndicator + '20',
        borderRadius: 16,
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
    toolbarBtnLarge: {
        padding: 12,
        borderRadius: 6,
        marginLeft: 4,
    },
    toolbarBtnActive: {
        backgroundColor: changeOpacity(theme.dndIndicator, 0.15),
    },
    toolbarBtnRecording: {
        backgroundColor: theme.dndIndicator,
        position: 'relative',
        overflow: 'visible',
    },
    recordingPulse: {
        position: 'absolute',
        top: -4,
        left: -4,
        right: -4,
        bottom: -4,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: theme.dndIndicator,
        opacity: 0.6,
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

    // Title Dialog Styles
    titleDialogOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    titleDialogContainer: {
        width: '80%',
        backgroundColor: theme.centerChannelBg,
        borderRadius: 12,
        padding: 20,
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
    },
    titleDialogTitle: {
        ...typography('Heading', 400, 'SemiBold'),
        color: theme.centerChannelColor,
        marginBottom: 8,
    },
    titleDialogMessage: {
        ...typography('Body', 200, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.7),
        marginBottom: 16,
    },
    titleDialogInput: {
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.2),
        borderRadius: 8,
        padding: 12,
        marginBottom: 16,
        ...typography('Body', 200, 'Regular'),
        color: theme.centerChannelColor,
    },
    titleDialogButtons: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
    },
    titleDialogBtn: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 8,
        marginLeft: 8,
    },
    titleDialogBtnCancel: {
        backgroundColor: 'transparent',
    },
    titleDialogBtnConfirm: {
        backgroundColor: theme.buttonBg,
    },
    titleDialogBtnTextCancel: {
        ...typography('Body', 200, 'Medium'),
        color: changeOpacity(theme.centerChannelColor, 0.6),
    },
    titleDialogBtnTextConfirm: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.buttonColor,
    },
}));

export default SmartNoteDetailScreen;
