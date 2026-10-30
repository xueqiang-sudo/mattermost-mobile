// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {forwardRef, useImperativeHandle} from 'react';
import {useIntl} from 'react-intl';

import Document, {type DocumentRef} from '@components/document';
import {useDownloadFileAndPreview} from '@hooks/files';
import {alertDownloadDocumentDisabled, alertOnlyPDFSupported} from '@utils/document';
import {hasPdfPreview, isPdf} from '@utils/file';

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
    const intl = useIntl();
    const {downloadAndPreviewFile} = useDownloadFileAndPreview(enableSecureFilePreview);

    // Directly expose the download/preview function instead of going through Document's ref chain.
    // This avoids the "undefined is not a function" error that occurred when the nested ref chain
    // (file.tsx -> DocumentFile -> Document) had timing issues.
    useImperativeHandle(ref, () => ({
        handlePreviewPress: () => {
            if (!canDownloadFiles) {
                alertDownloadDocumentDisabled(intl);
                return;
            }

            if (enableSecureFilePreview && !isPdf(file) && !hasPdfPreview(file)) {
                alertOnlyPDFSupported(intl);
                return;
            }

            downloadAndPreviewFile(file);
        },
    }), [canDownloadFiles, enableSecureFilePreview, downloadAndPreviewFile, file, intl]);

    const icon = (
        <FileIcon
            backgroundColor={backgroundColor}
            file={file}
        />
    );

    // Document component is still rendered for consistency, but we no longer rely on its ref
    return (
        <Document
            canDownloadFiles={canDownloadFiles}
            enableSecureFilePreview={enableSecureFilePreview}
            file={file}
            downloadAndPreviewFile={downloadAndPreviewFile}
        >
            {icon}
        </Document>
    );
});

DocumentFile.displayName = 'DocumentFile';

export default DocumentFile;
