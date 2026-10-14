// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {forwardRef, useImperativeHandle, useRef} from 'react';

import Document, {type DocumentRef} from '@components/document';
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
    uploadStatus?: string;
}

const DocumentFile = forwardRef<DocumentRef, DocumentFileProps>(({backgroundColor, canDownloadFiles, disabled = false, enableSecureFilePreview, file}: DocumentFileProps, ref) => {
    const document = useRef<DocumentRef>(null);
    const {toggleDownloadAndPreview} = useDownloadFileAndPreview(enableSecureFilePreview);

    useImperativeHandle(ref, () => ({
        handlePreviewPress: () => {
            document.current?.handlePreviewPress();
        },
    }), []);

    const icon = (
        <FileIcon
            backgroundColor={backgroundColor}
            file={file}
        />
    );

    return (
        <Document
            canDownloadFiles={canDownloadFiles}
            enableSecureFilePreview={enableSecureFilePreview}
            file={file}
            downloadAndPreviewFile={toggleDownloadAndPreview}
            ref={document}
        >
            {icon}
        </Document>
    );
});

DocumentFile.displayName = 'DocumentFile';

export default DocumentFile;
