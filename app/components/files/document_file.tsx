// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {forwardRef, useImperativeHandle, useRef} from 'react';
import {StyleSheet, TouchableOpacity, View} from 'react-native';

import Document, {type DocumentRef} from '@components/document';
import ProgressBar from '@components/progress_bar';
import {useTheme} from '@context/theme';
import {useDownloadFileAndPreview} from '@hooks/files';
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
}

const styles = StyleSheet.create({
    progress: {
        justifyContent: 'flex-end',
        height: 48,
        left: 2,
        top: 5,
        width: 44,
    },
});

const DocumentFile = forwardRef<DocumentRef, DocumentFileProps>(({backgroundColor, canDownloadFiles, disabled = false, enableSecureFilePreview, file}: DocumentFileProps, ref) => {
    const theme = useTheme();
    const document = useRef<DocumentRef>(null);
    const {downloading, progress, toggleDownloadAndPreview} = useDownloadFileAndPreview(enableSecureFilePreview);

    // Office 文件没有 PDF 预览时，禁用点击（只显示文件名和大小）
    const isOfficeWithoutPdfPreview = isDocument(file) && !isPdf(file) && !hasPdfPreview(file);
    const isDisabled = disabled || isOfficeWithoutPdfPreview;

    const handlePreviewPress = async () => {
        document.current?.handlePreviewPress();
    };

    useImperativeHandle(ref, () => ({
        handlePreviewPress,
    }), []);

    const icon = (
        <FileIcon
            backgroundColor={backgroundColor}
            file={file}
        />
    );

    let fileAttachmentComponent = icon;
    if (downloading) {
        fileAttachmentComponent = (
            <>
                {icon}
                <View style={[StyleSheet.absoluteFill, styles.progress]}>
                    <ProgressBar
                        progress={progress}
                        color={theme.buttonBg}
                    />
                </View>
            </>
        );
    }

    return (
        <Document
            canDownloadFiles={canDownloadFiles}
            enableSecureFilePreview={enableSecureFilePreview}
            file={file}
            downloadAndPreviewFile={toggleDownloadAndPreview}
            ref={document}
        >
            <TouchableOpacity
                disabled={isDisabled}
                onPress={handlePreviewPress}
            >
                {fileAttachmentComponent}
            </TouchableOpacity>
        </Document>
    );
});

DocumentFile.displayName = 'DocumentFile';

export default DocumentFile;
