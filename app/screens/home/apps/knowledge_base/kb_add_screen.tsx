// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    ActivityIndicator,
    Alert,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {useNavigation} from '@react-navigation/native';
import CompassIcon from '@components/compass_icon';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {showFilePickerScreen} from '@screens/file_picker/show_modal';
import {popTopScreen} from '@screens/navigation';
import NetworkManager from '@managers/network_manager';
import {debugLog} from '@store/debug_log';

import type {FileInfo} from '@mattermost/types/files';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {AvailableScreens} from '@typings/screens/navigation';

import {
    createKBDocText,
    createKBDocURL,
    createKBDocFile,
} from '../workbench_api';

type AddDocType = 'text' | 'url' | 'file';

type Props = {
    componentId: AvailableScreens;
    teamId: string;
    onDocAdded?: () => void;
};

const KBAddScreen = ({teamId, onDocAdded}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const navigation = useNavigation();
    const style = getStyleSheet(theme);

    const [addType, setAddType] = useState<AddDocType>('text');
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [url, setUrl] = useState('');
    const [file, setFile] = useState<FileInfo | null>(null);
    const [loading, setLoading] = useState(false);

    // 检查是否可以保存
    const canSave = useCallback(() => {
        if (addType === 'text') {
            return title.trim().length > 0 && content.trim().length > 0;
        } else if (addType === 'url') {
            return title.trim().length > 0 && url.trim().length > 0;
        } else if (addType === 'file') {
            return file !== null;
        }
        return false;
    }, [addType, title, content, url, file]);

    // 选择文件 - 使用和云盘相同的文件选择器，支持群组文件、相册、手机文件
    const handlePickFile = useCallback(() => {
        debugLog('[KBAdd] === handlePickFile START ===');

        const onFileSelected = (files: FileInfo[]) => {
            debugLog('[KBAdd] onFileSelected callback invoked');

            if (!files || files.length === 0) {
                debugLog('[KBAdd] No files selected');
                return;
            }

            try {
                const selected = files[0];
                debugLog('[KBAdd] File selected:', JSON.stringify({
                    name: selected.name,
                    size: selected.size,
                    localPath: selected.localPath,
                    uri: selected.uri,
                    id: selected.id,
                }));

                // 缓存当前title以便安全使用
                setFile(selected);
                debugLog('[KBAdd] File state updated');

                if (!title.trim()) {
                    setTitle(selected.name);
                    debugLog('[KBAdd] Title set to file name:', selected.name);
                }

                debugLog('[KBAdd] File pick completed successfully');
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                debugLog('[KBAdd] ERROR in onFileSelected:', errorMsg);
                debugLog('[KBAdd] Stack:', error instanceof Error ? error.stack : 'N/A');
                Alert.alert(
                    intl.formatMessage({id: 'mobile.link.error.title', defaultMessage: 'Error'}),
                    intl.formatMessage({
                        id: 'workbench.kb.file_pick_error',
                        defaultMessage: 'Failed to select file. Please try again.',
                    }),
                );
            }
        };

        try {
            showFilePickerScreen(
                '',
                onFileSelected,
                intl.formatMessage({id: 'workbench.kb.select_file', defaultMessage: 'Select File'}),
            );
            debugLog('[KBAdd] File picker modal opened');
        } catch (modalErr) {
            const errorMsg = modalErr instanceof Error ? modalErr.message : String(modalErr);
            debugLog('[KBAdd] ERROR opening modal:', errorMsg);
            Alert.alert(
                intl.formatMessage({id: 'mobile.link.error.title', defaultMessage: 'Error'}),
                intl.formatMessage({
                    id: 'workbench.kb.modal_error',
                    defaultMessage: 'Failed to open file picker. Please try again.',
                }),
            );
        }
    }, [intl, title]);

    // 保存
    const handleSave = useCallback(async () => {
        if (loading || !canSave() || !teamId || !serverUrl) {
            return;
        }

        try {
            setLoading(true);
            debugLog('[KBAdd] Saving document', {
                teamId,
                addType,
                titleLength: title.trim().length,
                contentLength: content.trim().length,
                urlLength: url.trim().length,
                hasFile: Boolean(file),
            });

            let result;
            if (addType === 'text') {
                result = await createKBDocText(serverUrl, teamId, title.trim(), content.trim());
            } else if (addType === 'url') {
                result = await createKBDocURL(serverUrl, teamId, title.trim(), url.trim());
            } else if (addType === 'file' && file) {
                const fileName = file.name || 'unknown';
                const fileType = file.mime_type || 'application/octet-stream';

                // 本地待上传文件（相册/手机）有 uri；channel 文件只有 localPath 或都没有。
                let fileUri = file.uri || file.localPath || '';

                // channel 文件：localPath 有效则复用，否则清空走下载。
                if (!file.uri && file.id && file.localPath) {
                    try {
                        const {getInfoAsync} = await import('expo-file-system');
                        const cachedUri = file.localPath.startsWith('file://') ? file.localPath : `file://${file.localPath}`;
                        const cachedInfo = await getInfoAsync(cachedUri);
                        if (cachedInfo.exists) {
                            fileUri = cachedUri;
                            debugLog('[KBAdd] Reusing valid local cache, skip download:', cachedUri);
                        } else {
                            fileUri = '';
                            debugLog('[KBAdd] localPath stale (file missing), will download:', file.localPath);
                        }
                    } catch (cacheErr) {
                        fileUri = '';
                        debugLog('[KBAdd] localPath check failed, will download:', cacheErr instanceof Error ? cacheErr.message : String(cacheErr));
                    }
                }

                // 无本地文件但有 id：从服务器下载。
                if (!fileUri && file.id) {
                    const {downloadAsync, cacheDirectory, makeDirectoryAsync} = await import('expo-file-system');
                    const client = NetworkManager.getClient(serverUrl);
                    const authHeader = (client as any).requestHeaders?.['Authorization'] || '';
                    const downloadUrl = `${serverUrl}/api/v4/files/${file.id}`;
                    // 服务器从 basename 取文件名，basename 须为原始文件名，唯一性放到时间戳子目录。
                    const downloadDir = `${cacheDirectory}kb_add_${Date.now()}/`;
                    await makeDirectoryAsync(downloadDir, {intermediates: true});
                    const localUri = `${downloadDir}${fileName}`;

                    // 取不到鉴权头时直接报错，否则会把 401 错误页当文件存下来再上传。
                    if (!authHeader) {
                        throw new Error(`Missing auth header for file download: ${fileName}`);
                    }

                    const downloadResult = await downloadAsync(downloadUrl, localUri, {
                        headers: {'Authorization': authHeader},
                    });
                    if (downloadResult?.uri) {
                        fileUri = downloadResult.uri;
                        debugLog('[KBAdd] File downloaded:', fileUri);
                    } else {
                        throw new Error(`Download failed for ${fileName}`);
                    }
                }

                debugLog('[KBAdd] File path resolution:', JSON.stringify({
                    localPath: file.localPath,
                    uri: file.uri,
                    resolvedUri: fileUri,
                    fileName,
                    fileType,
                }));

                if (!fileUri) {
                    throw new Error('File has no local path or URI');
                }

                // 交给原生上传前，确认磁盘上文件确实存在；传不存在的路径给原生层会硬崩。
                // 不要 decode、不要去 file:// 前缀——原样传，对齐聊天窗口上传路径。
                try {
                    const {getInfoAsync} = await import('expo-file-system');
                    const checkUri = fileUri.startsWith('file://') ? fileUri : `file://${fileUri}`;
                    const info = await getInfoAsync(checkUri);
                    if (!info.exists) {
                        debugLog('[KBAdd] File not found on disk:', checkUri);
                        throw new Error(`File not found on disk: ${fileName}`);
                    }
                } catch (existErr) {
                    const existErrMsg = existErr instanceof Error ? existErr.message : String(existErr);
                    debugLog('[KBAdd] Existence check failed:', existErrMsg);
                    throw new Error(`Failed to read file: ${fileName}`);
                }

                result = await createKBDocFile(serverUrl, teamId, fileUri, fileName, fileType);
            }

            if (result?.error) {
                throw new Error(result.error);
            }

            debugLog('[KBAdd] Document saved successfully');

            // 调用回调刷新列表
            onDocAdded?.();

            // 返回上一页
            popTopScreen();
        } catch (err) {
            debugLog('[KBAdd] Save failed', {error: String(err)});
            Alert.alert(
                intl.formatMessage({id: 'workbench.kb.error', defaultMessage: 'Error'}),
                `${intl.formatMessage({
                    id: 'workbench.kb.add_failed',
                    defaultMessage: 'Failed to add document',
                })}: ${String(err)}`,
            );
        } finally {
            setLoading(false);
        }
    }, [loading, canSave, teamId, serverUrl, addType, title, content, url, file, onDocAdded, intl]);

    return (
        <SafeAreaView edges={['top', 'bottom']} style={style.container}>
            {/* Custom Header */}
            <View style={style.header}>
                <TouchableOpacity style={style.headerBtn} onPress={() => navigation.goBack()}>
                    <CompassIcon name='arrow-left' size={20} color={theme.sidebarText}/>
                </TouchableOpacity>
                <Text style={style.headerTitle} numberOfLines={1}>
                    {intl.formatMessage({id: 'workbench.kb.add_title', defaultMessage: 'Add Document'})}
                </Text>
                <TouchableOpacity
                    style={style.headerButton}
                    onPress={handleSave}
                    disabled={!canSave() || loading}
                >
                    <Text style={[style.saveButtonText, !canSave() && style.saveButtonTextDisabled]}>
                        {intl.formatMessage({id: 'workbench.kb.save', defaultMessage: 'Save'})}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* 类型选择 */}
            <View style={style.typeSelector}>
                <TouchableOpacity
                    style={[style.typeButton, addType === 'text' && style.typeButtonActive]}
                    onPress={() => setAddType('text')}
                >
                    <CompassIcon
                        name='text-box-outline'
                        size={20}
                        color={addType === 'text' ? theme.buttonBg : theme.centerChannelColor}
                    />
                    <Text
                        style={[
                            style.typeButtonText,
                            addType === 'text' && style.typeButtonTextActive,
                        ]}
                    >
                        {intl.formatMessage({
                            id: 'workbench.kb.type_text',
                            defaultMessage: 'Text',
                        })}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[style.typeButton, addType === 'url' && style.typeButtonActive]}
                    onPress={() => setAddType('url')}
                >
                    <CompassIcon
                        name='link-variant'
                        size={20}
                        color={addType === 'url' ? theme.buttonBg : theme.centerChannelColor}
                    />
                    <Text
                        style={[
                            style.typeButtonText,
                            addType === 'url' && style.typeButtonTextActive,
                        ]}
                    >
                        {intl.formatMessage({
                            id: 'workbench.kb.type_url',
                            defaultMessage: 'URL',
                        })}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[style.typeButton, addType === 'file' && style.typeButtonActive]}
                    onPress={() => setAddType('file')}
                >
                    <CompassIcon
                        name='file-document-outline'
                        size={20}
                        color={addType === 'file' ? theme.buttonBg : theme.centerChannelColor}
                    />
                    <Text
                        style={[
                            style.typeButtonText,
                            addType === 'file' && style.typeButtonTextActive,
                        ]}
                    >
                        {intl.formatMessage({
                            id: 'workbench.kb.type_file',
                            defaultMessage: 'File',
                        })}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* 表单 */}
            <View style={style.form}>
                {/* 标题输入（文件类型时隐藏） */}
                {addType !== 'file' && (
                    <View style={style.inputContainer}>
                        <Text style={style.label}>
                            {intl.formatMessage({
                                id: 'workbench.kb.title',
                                defaultMessage: 'Title',
                            })}
                        </Text>
                        <TextInput
                            style={style.textInput}
                            value={title}
                            onChangeText={setTitle}
                            placeholder={intl.formatMessage({
                                id: 'workbench.kb.title_placeholder',
                                defaultMessage: 'Enter title',
                            })}
                            placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.44)}
                            autoCapitalize='sentences'
                        />
                    </View>
                )}

                {/* 文本类型：内容输入 */}
                {addType === 'text' && (
                    <View style={style.inputContainer}>
                        <Text style={style.label}>
                            {intl.formatMessage({
                                id: 'workbench.kb.content',
                                defaultMessage: 'Content',
                            })}
                        </Text>
                        <TextInput
                            style={[style.textInput, style.textArea]}
                            value={content}
                            onChangeText={setContent}
                            placeholder={intl.formatMessage({
                                id: 'workbench.kb.content_placeholder',
                                defaultMessage: 'Enter content',
                            })}
                            placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.44)}
                            multiline={true}
                            textAlignVertical='top'
                            autoCapitalize='sentences'
                        />
                    </View>
                )}

                {/* URL 类型：URL 输入 */}
                {addType === 'url' && (
                    <View style={style.inputContainer}>
                        <Text style={style.label}>
                            {intl.formatMessage({
                                id: 'workbench.kb.url',
                                defaultMessage: 'URL',
                            })}
                        </Text>
                        <TextInput
                            style={style.textInput}
                            value={url}
                            onChangeText={setUrl}
                            placeholder='https://example.com/document.pdf'
                            placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.44)}
                            autoCapitalize='none'
                            autoCorrect={false}
                            keyboardType='url'
                        />
                    </View>
                )}

                {/* 文件类型：文件选择 */}
                {addType === 'file' && (
                    <View style={style.inputContainer}>
                        <Text style={style.label}>
                            {intl.formatMessage({
                                id: 'workbench.kb.file',
                                defaultMessage: 'File',
                            })}
                        </Text>
                        <TouchableOpacity
                            style={style.filePicker}
                            onPress={handlePickFile}
                        >
                            {file ? (
                                <View style={style.fileInfo}>
                                    <CompassIcon
                                        name='file-document-outline'
                                        size={24}
                                        color={theme.linkColor}
                                    />
                                    <View style={style.fileDetails}>
                                        <Text style={style.fileName} numberOfLines={1}>
                                            {file.name}
                                        </Text>
                                        <Text style={style.fileSize}>
                                            {file.size ? `${(file.size / 1024).toFixed(1)} KB` : ''}
                                        </Text>
                                    </View>
                                    <CompassIcon
                                        name='check-circle'
                                        size={24}
                                        color={theme.onlineIndicator}
                                    />
                                </View>
                            ) : (
                                <View style={style.filePlaceholder}>
                                    <CompassIcon
                                        name='file-upload-outline'
                                        size={32}
                                        color={changeOpacity(theme.centerChannelColor, 0.44)}
                                    />
                                    <Text style={style.filePlaceholderText}>
                                        {intl.formatMessage({
                                            id: 'workbench.kb.tap_to_select',
                                            defaultMessage: 'Tap to select file',
                                        })}
                                    </Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        </SafeAreaView>
    );
};

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
    headerTitle: {
        ...typography('Heading', 200, 'SemiBold'),
        color: theme.sidebarText,
        flex: 1,
    },
    headerButton: {
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    saveButtonText: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.linkColor,
    },
    saveButtonTextDisabled: {
        color: changeOpacity(theme.linkColor, 0.4),
    },
    typeSelector: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    typeButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        marginHorizontal: 4,
        borderRadius: 8,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
    },
    typeButtonActive: {
        backgroundColor: changeOpacity(theme.buttonBg, 0.12),
    },
    typeButtonText: {
        ...typography('Body', 75, 'Regular'),
        color: theme.centerChannelColor,
        marginLeft: 6,
    },
    typeButtonTextActive: {
        color: theme.buttonBg,
        fontWeight: '600',
    },
    form: {
        flex: 1,
        padding: 16,
    },
    inputContainer: {
        marginBottom: 20,
    },
    label: {
        ...typography('Body', 75, 'SemiBold'),
        color: theme.centerChannelColor,
        marginBottom: 8,
    },
    textInput: {
        ...typography('Body', 200, 'Regular'),
        color: theme.centerChannelColor,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        borderRadius: 8,
        padding: 12,
        backgroundColor: theme.centerChannelBg,
    },
    textArea: {
        height: 200,
        textAlignVertical: 'top',
    },
    filePicker: {
        borderWidth: 2,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        borderStyle: 'dashed',
        borderRadius: 8,
        padding: 24,
    },
    fileInfo: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    fileDetails: {
        flex: 1,
        marginLeft: 12,
    },
    fileName: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    fileSize: {
        ...typography('Body', 50, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginTop: 2,
    },
    filePlaceholder: {
        alignItems: 'center',
    },
    filePlaceholderText: {
        ...typography('Body', 100, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginTop: 12,
    },
}));

export default KBAddScreen;
