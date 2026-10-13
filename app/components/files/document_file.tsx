// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {forwardRef, useImperativeHandle, useRef} from 'react';
import {StyleSheet, Text, View} from 'react-native';

import Document, {type DocumentRef} from '@components/document';
import ProgressBar from '@components/progress_bar';
import {useTheme} from '@context/theme';
import {useDownloadFileAndPreview} from '@hooks/files';
import {useFileDownloadStatus} from '@hooks/file_transfer_status';
import {hasPdfPreview, isDocument, isPdf} from '@utils/file';

import FileIcon from './file_icon';

export type DocumentFileRef = {
    handlePreviewPress: () => void;
}

type DocumentFileProps = {
    backgroundColor?: string;
    disabled?: boolean;
    canDownloadFiles: boolean;
    enableSecureFilePreview: boolean;
    file: FileInfo;
    uploadStatus?: string;
}

const styles = StyleSheet.create({
    progress: {
        justifyContent: 'flex-end',
        height: 48,
        left: 2,
        top: 5,
        width: 44,
    },
    statusContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
    },
    statusText: {
        fontSize: 12,
        color: '#999',
        marginLeft: 8,
    },
});

const DocumentFile = forwardRef<DocumentRef, DocumentFileProps>(({backgroundColor, canDownloadFiles, disabled = false, enableSecureFilePreview, file, uploadStatus}: DocumentFileProps, ref) => {
    const theme = useTheme();
    const document = useRef<DocumentRef>(null);
    const {downloading, progress, toggleDownloadAndPreview} = useDownloadFileAndPreview(enableSecureFilePreview);
    const downloadStatus = useFileDownloadStatus(file.id);
    const isAutoDownloading = downloadStatus?.status === 'downloading';
    const isUploading = uploadStatus === 'uploading';

    const handlePreviewPress = async () => {
        // 下载中时禁止点击
        if (isAutoDownloading) {
            return;
        }
        document.current?.handlePreviewPress();
    };

    useImperativeHandle(ref, () => ({
        handlePreviewPress,
    }), [isAutoDownloading]);

    const icon = (
        <FileIcon
            backgroundColor={backgroundColor}
            file={file}
        />
    );

    let fileAttachmentComponent = icon;
    if (downloading || isAutoDownloading) {
        const currentProgress = isAutoDownloading ? (downloadStatus?.progress || 0) : progress;
        fileAttachmentComponent = (
            <>
                {icon}
                <View style={[StyleSheet.absoluteFill, styles.progress]}>
                    <ProgressBar
                        progress={currentProgress}
                        color={theme.buttonBg}
                    />
                </View>
            </>
        );
    }

    return (
        <>
            <Document
                canDownloadFiles={canDownloadFiles}
                enableSecureFilePreview={enableSecureFilePreview}
                file={file}
                downloadAndPreviewFile={toggleDownloadAndPreview}
                ref={document}
            >
                {fileAttachmentComponent}
            </Document>
            {isAutoDownloading && (
                <View style={styles.statusContainer}>
                    <ProgressBar
                        progress={downloadStatus?.progress || 0}
                        color={theme.buttonBg}
                    />
                    <Text style={styles.statusText}>
                        接收中... {Math.round((downloadStatus?.progress || 0) * 100)}%
                    </Text>
                </View>
            )}
            {downloadStatus?.status === 'completed' && (
                <View style={styles.statusContainer}>
                    <Text style={styles.statusText}>已接收</Text>
                </View>
            )}
            {isUploading && (
                <View style={styles.statusContainer}>
                    <Text style={styles.statusText}>发送中...</Text>
                </View>
            )}
        </>
    );
});

DocumentFile.displayName = 'DocumentFile';

export default DocumentFile;
