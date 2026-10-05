// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {forwardRef, useImperativeHandle, type ReactNode, useCallback} from 'react';
import {useIntl} from 'react-intl';

import {debugLog} from '@store/debug_log';
import {alertDownloadDocumentDisabled, alertOnlyPDFSupported} from '@utils/document';
import {hasPdfPreview, isPdf} from '@utils/file';

export type DocumentRef = {
    handlePreviewPress: () => void;
}

type DocumentProps = {
    canDownloadFiles: boolean;
    enableSecureFilePreview: boolean;
    file: FileInfo;
    children: ReactNode;
    downloadAndPreviewFile: (file: FileInfo) => void;
}

const Document = forwardRef<DocumentRef, DocumentProps>(({canDownloadFiles, children, downloadAndPreviewFile, enableSecureFilePreview, file}: DocumentProps, ref) => {
    const intl = useIntl();

    const handlePreviewPress = useCallback(async () => {
        debugLog('FILE_CLICK', `Document.handlePreviewPress called for ${file.name}`);
        debugLog('FILE_CLICK', `canDownloadFiles: ${canDownloadFiles}, enableSecureFilePreview: ${enableSecureFilePreview}`);
        debugLog('FILE_CLICK', `isPdf: ${isPdf(file)}, hasPdfPreview: ${hasPdfPreview(file)}`);

        if (!canDownloadFiles) {
            debugLog('FILE_CLICK', 'canDownloadFiles is false, alerting');
            alertDownloadDocumentDisabled(intl);
            return;
        }

        // 如果有 PDF 预览版本，允许预览（即使是 Office 文件）
        if (enableSecureFilePreview && !isPdf(file) && !hasPdfPreview(file)) {
            debugLog('FILE_CLICK', 'enableSecureFilePreview is true and not PDF, alerting');
            alertOnlyPDFSupported(intl);
            return;
        }

        debugLog('FILE_CLICK', 'calling downloadAndPreviewFile');
        downloadAndPreviewFile(file);
    }, [canDownloadFiles, enableSecureFilePreview, downloadAndPreviewFile, file, intl]);

    useImperativeHandle(ref, () => ({
        handlePreviewPress,
    }), [handlePreviewPress]);

    return children;
});

Document.displayName = 'Document';

export default Document;
