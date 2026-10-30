// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useMemo} from 'react';
import {Modal, View, Text, FlatList, TouchableOpacity, StyleSheet, Dimensions} from 'react-native';
import {useIntl} from 'react-intl';
import {changeOpacity} from '@utils/theme';
import CompassIcon from '@components/compass_icon';

import type {UploadFileItem} from '@typings/components/upload_progress_panel';

type Props = {
    visible: boolean;
    files: UploadFileItem[];
    onClose: () => void;
    onRetry?: (fileId: string) => void;
};

const {width: SCREEN_WIDTH} = Dimensions.get('window');

const UploadProgressPanel = ({visible, files, onClose, onRetry}: Props) => {
    const intl = useIntl();

    const stats = useMemo(() => {
        const total = files.length;
        const completed = files.filter((f) => f.status === 'completed').length;
        const failed = files.filter((f) => f.status === 'failed').length;
        const uploading = files.filter((f) => f.status === 'uploading').length;
        const totalProgress = total > 0 ? completed / total : 0;

        return {total, completed, failed, uploading, totalProgress};
    }, [files]);

    const renderFileItem = ({item}: {item: UploadFileItem}) => {
        const getStatusIcon = () => {
            switch (item.status) {
                case 'completed':
                    return <CompassIcon name='check-circle' size={20} color='#4CAF50'/>;
                case 'failed':
                    return <CompassIcon name='alert-circle' size={20} color='#F44336'/>;
                case 'uploading':
                    return <CompassIcon name='cloud-upload' size={20} color='#2196F3'/>;
                default:
                    return <CompassIcon name='clock-outline' size={20} color='#9E9E9E'/>;
            }
        };

        const getStatusText = () => {
            switch (item.status) {
                case 'completed':
                    return intl.formatMessage({id: 'upload_progress.status.completed', defaultMessage: 'Completed'});
                case 'failed':
                    return intl.formatMessage({id: 'upload_progress.status.failed', defaultMessage: 'Failed'});
                case 'uploading':
                    return `${Math.round(item.progress * 100)}%`;
                default:
                    return intl.formatMessage({id: 'upload_progress.status.pending', defaultMessage: 'Pending'});
            }
        };

        const getFileIcon = () => {
            const ext = item.name.split('.').pop()?.toLowerCase();
            if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) {
                return 'file-image-outline';
            }
            if (['mp4', 'mov', 'avi', 'mkv'].includes(ext || '')) {
                return 'file-video-outline';
            }
            if (['pdf'].includes(ext || '')) {
                return 'file-pdf-outline';
            }
            if (['doc', 'docx'].includes(ext || '')) {
                return 'file-word-outline';
            }
            if (['xls', 'xlsx'].includes(ext || '')) {
                return 'file-excel-outline';
            }
            return 'file-outline';
        };

        return (
            <View style={styles.fileItem}>
                <View style={styles.fileIcon}>
                    <CompassIcon name={getFileIcon()} size={32} color='#666'/>
                </View>
                <View style={styles.fileInfo}>
                    <Text style={styles.fileName} numberOfLines={1}>
                        {item.name}
                    </Text>
                    {item.status === 'uploading' && (
                        <View style={styles.progressBar}>
                            <View
                                style={[
                                    styles.progressFill,
                                    {width: `${item.progress * 100}%`},
                                ]}
                            />
                        </View>
                    )}
                    <View style={styles.statusRow}>
                        <Text style={styles.fileSize}>{formatFileSize(item.size)}</Text>
                        <View style={styles.statusContainer}>
                            {getStatusIcon()}
                            <Text style={styles.statusText}>{getStatusText()}</Text>
                            {item.status === 'failed' && onRetry && (
                                <TouchableOpacity
                                    style={styles.retryButton}
                                    onPress={() => onRetry(item.id)}
                                >
                                    <Text style={styles.retryText}>
                                        {intl.formatMessage({id: 'upload_progress.retry', defaultMessage: 'Retry'})}
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                </View>
            </View>
        );
    };

    const allCompleted = stats.completed + stats.failed === stats.total;
    const hasFailed = stats.failed > 0;

    return (
        <Modal
            visible={visible}
            animationType='slide'
            transparent={true}
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <View style={styles.panel}>
                    <View style={styles.header}>
                        <Text style={styles.title}>
                            {intl.formatMessage({id: 'upload_progress.title', defaultMessage: 'Upload Files'})}
                        </Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                            <CompassIcon name='close' size={24} color='#666'/>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.totalProgress}>
                        <View style={styles.totalInfo}>
                            <Text style={styles.totalText}>
                                {intl.formatMessage(
                                    {id: 'upload_progress.total', defaultMessage: 'Total: {completed}/{total} files'},
                                    {completed: stats.completed, total: stats.total}
                                )}
                            </Text>
                            {stats.uploading > 0 && (
                                <Text style={styles.uploadingText}>
                                    {intl.formatMessage(
                                        {id: 'upload_progress.uploading', defaultMessage: 'Uploading {count}'},
                                        {count: stats.uploading}
                                    )}
                                </Text>
                            )}
                            {hasFailed && (
                                <Text style={styles.failedText}>
                                    {intl.formatMessage(
                                        {id: 'upload_progress.failed', defaultMessage: 'Failed {count}'},
                                        {count: stats.failed}
                                    )}
                                </Text>
                            )}
                        </View>
                        <View style={styles.totalProgressBar}>
                            <View
                                style={[
                                    styles.totalProgressFill,
                                    {width: `${stats.totalProgress * 100}%`},
                                ]}
                            />
                        </View>
                    </View>

                    <FlatList
                        data={files}
                        renderItem={renderFileItem}
                        keyExtractor={(item) => item.id}
                        style={styles.fileList}
                        showsVerticalScrollIndicator={true}
                    />

                    {allCompleted && (
                        <View style={styles.footer}>
                            <TouchableOpacity style={styles.doneButton} onPress={onClose}>
                                <Text style={styles.doneButtonText}>
                                    {intl.formatMessage({id: 'upload_progress.done', defaultMessage: 'Done'})}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            </View>
        </Modal>
    );
};

const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    panel: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        maxHeight: '80%',
        minHeight: 400,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity('#000', 0.1),
    },
    title: {
        fontSize: 18,
        fontWeight: '600',
        color: '#333',
    },
    closeButton: {
        padding: 4,
    },
    totalProgress: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: '#f5f5f5',
    },
    totalInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    totalText: {
        fontSize: 14,
        fontWeight: '500',
        color: '#333',
        marginRight: 12,
    },
    uploadingText: {
        fontSize: 13,
        color: '#2196F3',
        marginRight: 8,
    },
    failedText: {
        fontSize: 13,
        color: '#F44336',
    },
    totalProgressBar: {
        height: 6,
        backgroundColor: '#e0e0e0',
        borderRadius: 3,
        overflow: 'hidden',
    },
    totalProgressFill: {
        height: '100%',
        backgroundColor: '#4CAF50',
        borderRadius: 3,
    },
    fileList: {
        flex: 1,
        paddingHorizontal: 16,
    },
    fileItem: {
        flexDirection: 'row',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity('#000', 0.05),
    },
    fileIcon: {
        width: 48,
        height: 48,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f5f5f5',
        borderRadius: 8,
        marginRight: 12,
    },
    fileInfo: {
        flex: 1,
        justifyContent: 'center',
    },
    fileName: {
        fontSize: 14,
        fontWeight: '500',
        color: '#333',
        marginBottom: 4,
    },
    progressBar: {
        height: 4,
        backgroundColor: '#e0e0e0',
        borderRadius: 2,
        overflow: 'hidden',
        marginBottom: 4,
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#2196F3',
        borderRadius: 2,
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    fileSize: {
        fontSize: 12,
        color: '#999',
    },
    statusContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    statusText: {
        fontSize: 12,
        color: '#666',
        marginLeft: 4,
    },
    retryButton: {
        marginLeft: 8,
        paddingHorizontal: 8,
        paddingVertical: 2,
        backgroundColor: '#2196F3',
        borderRadius: 4,
    },
    retryText: {
        fontSize: 12,
        color: '#fff',
        fontWeight: '500',
    },
    footer: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderTopWidth: 1,
        borderTopColor: changeOpacity('#000', 0.1),
    },
    doneButton: {
        backgroundColor: '#4CAF50',
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    doneButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
    },
});

export default UploadProgressPanel;
