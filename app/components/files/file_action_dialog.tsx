// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Modal, Pressable, StyleSheet, Text, View, ActivityIndicator} from 'react-native';
import {useIntl} from 'react-intl';

import CompassIcon from '@components/compass_icon';
import {useTheme} from '@context/theme';
import {useServerUrl} from '@context/server';
import NetworkManager from '@managers/network_manager';
import DatabaseManager from '@database/manager';
import {getFormattedFileSize} from '@utils/file';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

type FileActionDialogProps = {
    visible: boolean;
    file: FileInfo | null;
    onClose: () => void;
    onOpenWithOtherApp?: (file: FileInfo) => void;
    onPreview?: (file: FileInfo) => void;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    container: {
        backgroundColor: theme.centerChannelBg,
        borderRadius: 12,
        padding: 20,
        minWidth: 300,
        maxWidth: 400,
        marginHorizontal: 20,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    fileIcon: {
        width: 48,
        height: 48,
        borderRadius: 8,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    fileInfo: {
        flex: 1,
    },
    fileName: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.centerChannelColor,
        marginBottom: 4,
    },
    fileSize: {
        ...typography('Body', 75, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.56),
    },
    closeButton: {
        padding: 4,
    },
    divider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.16),
        marginVertical: 16,
    },
    message: {
        ...typography('Body', 100, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.72),
        textAlign: 'center',
        marginBottom: 16,
    },
    buttonContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
    },
    button: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 8,
        marginHorizontal: 4,
    },
    buttonPrimary: {
        backgroundColor: theme.buttonBg,
    },
    buttonText: {
        ...typography('Body', 100, 'SemiBold'),
    },
    buttonTextPrimary: {
        color: theme.buttonColor,
    },
    pollingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 20,
    },
    pollingText: {
        ...typography('Body', 100, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.72),
        marginLeft: 12,
    },
}));

// Office文件类型
const OFFICE_FILE_TYPES = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];

const FileActionDialog = ({
    visible,
    file,
    onClose,
    onOpenWithOtherApp,
    onPreview,
}: FileActionDialogProps) => {
    const intl = useIntl();
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const serverUrl = useServerUrl();
    const [isPolling, setIsPolling] = useState(false);
    const pollingRef = useRef<NodeJS.Timeout | null>(null);
    const pollingCountRef = useRef(0);
    const MAX_POLLING_ATTEMPTS = 30; // 最多轮询30次，每次2秒，共60秒

    const getFileExtension = (fileName: string): string => {
        const parts = fileName.split('.');
        return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
    };

    const isOfficeFile = (fileName: string): boolean => {
        const ext = getFileExtension(fileName);
        return OFFICE_FILE_TYPES.includes(ext);
    };

    // 清理轮询
    const stopPolling = useCallback(() => {
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
        }
        pollingCountRef.current = 0;
        setIsPolling(false);
    }, []);

    // 轮询检查PDF转换状态
    const startPolling = useCallback(async (fileInfo: FileInfo) => {
        if (!fileInfo.id) return;

        setIsPolling(true);
        pollingCountRef.current = 0;

        pollingRef.current = setInterval(async () => {
            pollingCountRef.current += 1;

            try {
                // 从服务器获取最新的文件信息（不是本地数据库）
                const client = NetworkManager.getClient(serverUrl);
                const updatedFileInfo = await client.getFileInfo(fileInfo.id!);

                // 检查是否已转换完成
                if (updatedFileInfo.pdf_preview_id) {
                    stopPolling();

                    // 保存 pdf_preview_id 到本地数据库，以便下次直接打开
                    try {
                        const {operator} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
                        const fileWithPdfId = {
                            ...updatedFileInfo,
                            id: fileInfo.id,
                        };
                        await operator.handleFiles({
                            files: [fileWithPdfId],
                            prepareRecordsOnly: false,
                        });
                    } catch (dbError) {
                        console.error('Failed to save pdf_preview_id to database:', dbError);
                        // 继续打开预览，不影响用户体验
                    }

                    // 转换完成，直接打开预览
                    onPreview?.({...fileInfo, pdf_preview_id: updatedFileInfo.pdf_preview_id});
                    onClose();
                    return;
                }

                // 超过最大轮询次数
                if (pollingCountRef.current >= MAX_POLLING_ATTEMPTS) {
                    stopPolling();
                    // 显示提示，让用户选择用其他应用打开
                }
            } catch (error) {
                console.error('Polling error:', error);
                stopPolling();
            }
        }, 2000); // 每2秒轮询一次
    }, [serverUrl, onPreview, onClose, stopPolling]);

    // 处理预览按钮点击
    const handlePreview = useCallback(() => {
        if (!file) return;

        const ext = getFileExtension(file.name);
        const isOffice = isOfficeFile(file.name);

        // Office文件且未转换
        if (isOffice && !file.pdf_preview_id) {
            startPolling(file);
            return;
        }

        // 其他情况直接预览
        onPreview?.(file);
        onClose();
    }, [file, startPolling, onPreview, onClose]);

    // 处理用其他应用打开
    const handleOpenWithOtherApp = useCallback(() => {
        if (!file || !onOpenWithOtherApp) return;
        onOpenWithOtherApp(file);
        onClose();
    }, [file, onOpenWithOtherApp, onClose]);

    // 组件卸载时清理轮询
    useEffect(() => {
        return () => {
            stopPolling();
        };
    }, [stopPolling]);

    // 对话框关闭时清理轮询
    useEffect(() => {
        if (!visible) {
            stopPolling();
        }
    }, [visible, stopPolling]);

    if (!file) return null;

    const fileName = file.name || 'Unknown';
    const fileSize = getFormattedFileSize(file.size);
    const ext = getFileExtension(fileName);
    const isOffice = isOfficeFile(fileName);
    const hasConverted = Boolean(file.pdf_preview_id);

    // 确定显示内容
    let content;
    if (isPolling) {
        // 轮询中：显示等待状态
        content = (
            <View style={styles.pollingContainer}>
                <ActivityIndicator size='small' color={theme.buttonBg}/>
                <Text style={styles.pollingText}>
                    {intl.formatMessage({
                        id: 'file.converting',
                        defaultMessage: 'Converting document, please wait...',
                    })}
                </Text>
            </View>
        );
    } else if (isOffice && !hasConverted) {
        // Office文件未转换：显示预览按钮
        content = (
            <>
                <Text style={styles.message}>
                    {intl.formatMessage({
                        id: 'file.conversion_pending_message',
                        defaultMessage: 'This document is being converted to PDF for preview. Please try again in a moment.',
                    })}
                </Text>
                <View style={styles.buttonContainer}>
                    <Pressable
                        style={[styles.button, styles.buttonPrimary]}
                        onPress={handlePreview}
                    >
                        <Text style={[styles.buttonText, styles.buttonTextPrimary]}>
                            {intl.formatMessage({id: 'file.preview', defaultMessage: 'Preview'})}
                        </Text>
                    </Pressable>
                </View>
            </>
        );
    } else {
        // 不可识别的文件：只显示用其他应用打开
        content = (
            <>
                <Text style={styles.message}>
                    {intl.formatMessage({
                        id: 'file.unrecognized_message',
                        defaultMessage: 'This file type cannot be opened. You can download it to view with other apps.',
                    })}
                </Text>
                <View style={styles.buttonContainer}>
                    <Pressable
                        style={[styles.button, styles.buttonPrimary]}
                        onPress={handleOpenWithOtherApp}
                    >
                        <Text style={[styles.buttonText, styles.buttonTextPrimary]}>
                            {intl.formatMessage({id: 'file.open_with_other', defaultMessage: 'Open with Other App'})}
                        </Text>
                    </Pressable>
                </View>
            </>
        );
    }

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType='fade'
            onRequestClose={onClose}
        >
            <Pressable style={styles.overlay} onPress={onClose}>
                <Pressable style={styles.container} onPress={(e) => e.stopPropagation()}>
                    {/* Header with file info */}
                    <View style={styles.header}>
                        <View style={styles.fileIcon}>
                            <CompassIcon
                                name='file-document-outline'
                                size={28}
                                color={theme.centerChannelColor}
                            />
                        </View>
                        <View style={styles.fileInfo}>
                            <Text style={styles.fileName} numberOfLines={2}>
                                {fileName}
                            </Text>
                            <Text style={styles.fileSize}>
                                {fileSize}
                            </Text>
                        </View>
                        <Pressable style={styles.closeButton} onPress={onClose}>
                            <CompassIcon
                                name='close'
                                size={24}
                                color={changeOpacity(theme.centerChannelColor, 0.56)}
                            />
                        </Pressable>
                    </View>

                    <View style={styles.divider}/>

                    {/* Content */}
                    {content}
                </Pressable>
            </Pressable>
        </Modal>
    );
};

export default FileActionDialog;
