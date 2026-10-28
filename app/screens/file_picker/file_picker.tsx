// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useState} from 'react';
import {useIntl} from 'react-intl';
import {ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import {dismissModal} from '@screens/navigation';
import {debugLog} from '@store/debug_log';
import {changeOpacity} from '@utils/theme';
import {useTheme} from '@context/theme';

import {FilePickerProvider, useFilePicker} from './context/file_picker_context';
import GroupFilesTab from './tabs/group_files_tab';
import PhotoAlbumTab from './tabs/photo_album_tab';
import FilesTab from './tabs/files_tab';

import type {AvailableScreens} from '@typings/screens/navigation';
import type {FileInfo} from '@mattermost/types/files';

type TabKey = 'chat' | 'photo_album' | 'files';

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    tabBar: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E5E5',
    },
    tabItem: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 12,
        position: 'relative',
    },
    tabLabel: {
        fontSize: 15,
        fontWeight: '500',
    },
    tabIndicator: {
        position: 'absolute',
        bottom: 0,
        height: 3,
        width: '60%',
        borderRadius: 1.5,
    },
    tabContent: {
        flex: 1,
    },
    actionBar: {
        borderTopWidth: 1,
        borderTopColor: '#E5E5E5',
        backgroundColor: '#fff',
    },
    actionBarRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 10,
    },
    foldButton: {
        padding: 4,
    },
    selectedCount: {
        fontSize: 14,
        color: '#666',
        flex: 1,
        textAlign: 'center',
    },
    sendButton: {
        backgroundColor: '#07C160',
        borderRadius: 8,
        paddingVertical: 8,
        paddingHorizontal: 20,
    },
    sendButtonDisabled: {
        backgroundColor: '#C7C7C7',
    },
    sendButtonText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    fileList: {
        maxHeight: 200,
        borderTopWidth: 1,
        borderTopColor: '#F0F0F0',
    },
    fileListEmpty: {
        paddingVertical: 8,
    },
    fileItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#F0F0F0',
    },
    fileItemIcon: {
        marginRight: 10,
    },
    fileItemName: {
        flex: 1,
        fontSize: 14,
        color: '#333',
    },
    removeButton: {
        padding: 4,
    },
    removeText: {
        fontSize: 13,
        color: '#FF4D4F',
    },
});

type FilePickerContentProps = {
    componentId: AvailableScreens;
    onSend: (files: FileInfo[]) => void;
    channelId: string;
};

function getFileIcon(name: string): string {
    const ext = (name || '').split('.').pop()?.toLowerCase() || '';
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'heic', 'heif'];
    const videoExts = ['mp4', 'mov', 'avi', 'mkv', 'wmv', 'flv', 'm4v', 'webm', 'mpg', 'mpeg', 'ogm'];
    const audioExts = ['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a', 'wma'];
    const pdfExts = ['pdf'];
    const wordExts = ['doc', 'docx', 'odt'];
    const textExts = ['txt', 'rtf'];
    const sheetExts = ['xls', 'xlsx', 'csv', 'ods'];
    const slideExts = ['ppt', 'pptx', 'odp'];
    const zipExts = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'];
    const codeExts = ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'h', 'css', 'html', 'json', 'xml', 'yaml', 'yml', 'sql', 'sh', 'bash'];

    if (imageExts.includes(ext)) return 'file-image-outline';
    if (videoExts.includes(ext)) return 'file-video-outline';
    if (audioExts.includes(ext)) return 'file-audio-outline';
    if (pdfExts.includes(ext)) return 'file-pdf-outline';
    if (wordExts.includes(ext)) return 'file-word-outline';
    if (textExts.includes(ext)) return 'file-text-outline';
    if (sheetExts.includes(ext)) return 'file-excel-outline';
    if (slideExts.includes(ext)) return 'file-powerpoint-outline';
    if (zipExts.includes(ext)) return 'file-zip-outline';
    if (codeExts.includes(ext)) return 'file-code-outline';
    return 'file-generic-outline';
}

function FilePickerContent({componentId, onSend, channelId}: FilePickerContentProps) {
    const intl = useIntl();
    const theme = useTheme();
    const {getSelectedFiles, getSelectedCount, state, dispatch} = useFilePicker();
    const [activeTab, setActiveTab] = useState<TabKey>('chat');
    const [expanded, setExpanded] = useState(false);
    const [sending, setSending] = useState(false);


    const selectedCount = state.selectedFiles.size;
    const canSend = selectedCount > 0 && !sending;

    debugLog('filePicker', `Render: selectedCount=${selectedCount}, canSend=${canSend}, sending=${sending}`);

    const handleSend = useCallback(async () => {
        // Prevent duplicate clicks
        if (sending) {
            debugLog('filePicker', 'handleSend already in progress, ignoring duplicate click');
            return;
        }

        try {
            setSending(true);
            debugLog('filePicker', '=== handleSend STARTED ===');
            const files = Array.from(state.selectedFiles.values());
            debugLog('filePicker', `handleSend called with ${files.length} files`);

            if (files.length === 0) {
                debugLog('filePicker', 'ERROR: no files selected');
                Alert.alert(
                    intl.formatMessage({id: 'mobile.link.error.title', defaultMessage: 'Error'}),
                    intl.formatMessage({
                        id: 'file_picker.no_files_selected',
                        defaultMessage: 'Please select at least one file to send.',
                    }),
                );
                setSending(false);
                return;
            }

            // Validate and normalize files before sending
            const normalizedFiles = files.map((file, index) => {
                debugLog('filePicker', `Processing file ${index + 1}:`, JSON.stringify({
                    name: file.name,
                    uri: file.uri,
                    id: file.id,
                    clientId: file.clientId,
                    mime_type: file.mime_type,
                    size: file.size,
                    extension: file.extension,
                    source: file.source,
                }));

                // Ensure all required fields are present
                const normalized = {
                    ...file,
                    id: file.id || file.clientId || `file_${index}_${Date.now()}`,
                    clientId: file.clientId || file.id || `client_${index}_${Date.now()}`,
                    name: file.name || 'unknown',
                    uri: file.uri || '',
                    mime_type: file.mime_type || 'application/octet-stream',
                    size: file.size || 0,
                    extension: file.extension || file.name?.split('.').pop() || '',
                };
                debugLog('filePicker', `Normalized file ${index + 1}: id=${normalized.id}, uri=${normalized.uri}`);
                return normalized;
            });

            debugLog('filePicker', `All ${normalizedFiles.length} files validated successfully`);

            // 标记文件已交付上传：关闭弹窗卸载 Provider 时不要删相册缓存文件，
            // 否则后台上传读不到文件导致发送失败。
            dispatch({type: 'MARK_HANDED_OFF'});

            // 【关键修改】先dismiss modal，再在后台执行onSend
            // 这样可以立刻关闭弹窗，给用户最好的UX体验
            debugLog('filePicker', 'Dismissing modal first (before onSend)');
            try {
                await dismissModal({componentId});
                debugLog('filePicker', 'Modal dismissed successfully');
            } catch (dismissError) {
                debugLog('filePicker', `Dismiss modal error: ${dismissError instanceof Error ? dismissError.message : String(dismissError)}`);
                // 继续执行，不中断onSend
            }

            debugLog('filePicker', 'Executing onSend in background (fire and forget)');
            // 不await onSend - 让它在后台执行，不阻塞UI
            // 由于onUploadFiles中已经缓存了所有必需的refs，async操作是安全的
            onSend(normalizedFiles).catch((sendError) => {
                debugLog('filePicker', `Background onSend error: ${sendError instanceof Error ? sendError.message : String(sendError)}`);
                debugLog('filePicker', `Error stack: ${sendError instanceof Error ? sendError.stack : 'N/A'}`);
            });
            debugLog('filePicker', 'onSend queued to background, handleSend completed');

            // 立刻结束handleSend，Modal已关闭，用户能立刻继续操作
            setSending(false);
        } catch (error) {
            debugLog('filePicker', `=== handleSend UNEXPECTED ERROR ===`);
            debugLog('filePicker', `Error: ${error instanceof Error ? error.message : String(error)}`);
            debugLog('filePicker', `Stack: ${error instanceof Error ? error.stack : 'N/A'}`);

            Alert.alert(
                intl.formatMessage({id: 'mobile.link.error.title', defaultMessage: 'Error'}),
                intl.formatMessage({
                    id: 'file_picker.unexpected_error',
                    defaultMessage: 'An unexpected error occurred. Please try again.',
                }),
            );
            setSending(false);
        }
    }, [componentId, state.selectedFiles, onSend, intl, sending, dispatch]);

    const selectedFilesList = Array.from(state.selectedFiles.values());

    const tabs: {key: TabKey; label: string}[] = [
        {key: 'chat', label: intl.formatMessage({id: 'file_picker.tab.chat', defaultMessage: 'Chat'})},
        {key: 'photo_album', label: intl.formatMessage({id: 'file_picker.tab.photo_album', defaultMessage: 'Photos'})},
        {key: 'files', label: intl.formatMessage({id: 'file_picker.tab.phone_files', defaultMessage: 'Phone Files'})},
    ];

    debugLog('filePicker', `Rendering ${tabs.length} tabs:`, JSON.stringify(tabs.map(t => ({key: t.key, label: t.label}))));

    const renderTabContent = () => {
        switch (activeTab) {
            case 'chat':
                return <GroupFilesTab channelId={channelId}/>;
            case 'photo_album':
                return <PhotoAlbumTab/>;
            case 'files':
                return <FilesTab/>;
        }
    };

    const renderFileItem = ({item}: {item: any}) => (
        <View style={styles.fileItem}>
            <CompassIcon
                name={getFileIcon(item.name)}
                size={24}
                color={changeOpacity('#000', 0.4)}
                style={styles.fileItemIcon}
            />
            <Text style={styles.fileItemName} numberOfLines={1}>
                {item.name || 'Unknown'}
            </Text>
            <TouchableOpacity
                onPress={() => dispatch({type: 'REMOVE_FILE', fileId: item.id || item.clientId})}
                style={styles.removeButton}
            >
                <Text style={styles.removeText}>
                    {intl.formatMessage({id: 'file_picker.remove', defaultMessage: 'Remove'})}
                </Text>
            </TouchableOpacity>
        </View>
    );

    return (
        <SafeAreaView edges={['bottom']} style={styles.container}>
            <View style={styles.tabBar}>
                {tabs.map((tab) => {
                    const isActive = activeTab === tab.key;
                    return (
                        <TouchableOpacity
                            key={tab.key}
                            style={styles.tabItem}
                            onPress={() => {
                                debugLog('filePicker', `Tab changed to: ${tab.key}`);
                                setActiveTab(tab.key);
                            }}
                        >
                            <Text style={[
                                styles.tabLabel,
                                {color: isActive ? theme.buttonBg : changeOpacity(theme.centerChannelColor, 0.6)},
                            ]}>
                                {tab.label}
                            </Text>
                            {isActive && (
                                <View style={[styles.tabIndicator, {backgroundColor: theme.buttonBg}]}/>
                            )}
                        </TouchableOpacity>
                    );
                })}
            </View>

            <View style={styles.tabContent}>
                {renderTabContent()}
            </View>

            <View style={styles.actionBar}>
                <View style={styles.actionBarRow}>
                    <TouchableOpacity
                        onPress={() => setExpanded(!expanded)}
                        style={styles.foldButton}
                        disabled={selectedCount === 0}
                    >
                        <CompassIcon
                            name={expanded ? 'chevron-down' : 'chevron-up'}
                            size={20}
                            color={selectedCount > 0 ? theme.centerChannelColor : changeOpacity(theme.centerChannelColor, 0.3)}
                        />
                    </TouchableOpacity>
                    <Text style={styles.selectedCount}>
                        {intl.formatMessage(
                            {
                                id: 'file_picker.selected_count_center',
                                defaultMessage: '{count} files selected',
                            },
                            {count: selectedCount},
                        )}
                    </Text>
                    <TouchableOpacity
                        onPress={handleSend}
                        style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
                        disabled={!canSend}
                    >
                        {sending ? (
                            <ActivityIndicator size='small' color={theme.buttonColor}/>
                        ) : (
                            <Text style={styles.sendButtonText}>
                                {intl.formatMessage({
                                    id: 'file_picker.send',
                                    defaultMessage: 'Send',
                                })}
                            </Text>
                        )}
                    </TouchableOpacity>
                </View>

                {expanded && selectedCount > 0 && (
                    <FlatList
                        data={selectedFilesList}
                        renderItem={renderFileItem}
                        keyExtractor={(item) => item.id || item.clientId || String(Math.random())}
                        style={styles.fileList}
                        contentContainerStyle={selectedFilesList.length === 0 ? styles.fileListEmpty : undefined}
                        showsVerticalScrollIndicator={false}
                    />
                )}
            </View>
        </SafeAreaView>
    );
}

type FilePickerProps = {
    componentId: AvailableScreens;
    onSend: (files: FileInfo[]) => void;
    channelId: string;
};

export default function FilePicker({componentId, onSend, channelId}: FilePickerProps) {
    debugLog('filePicker', `FilePicker component rendering, channelId=${channelId}`);
    return (
        <FilePickerProvider maxSelection={9}>
            <FilePickerContent componentId={componentId} onSend={onSend} channelId={channelId}/>
        </FilePickerProvider>
    );
}
