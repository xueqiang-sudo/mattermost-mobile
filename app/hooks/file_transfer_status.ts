// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useEffect, useState} from 'react';

import fileTransferManager from '@managers/file_transfer_manager';

import type {DownloadState} from '@managers/file_transfer_manager';

/**
 * Hook to subscribe to file download status
 * @param fileId - The file ID to track
 * @returns DownloadState or undefined if not downloading
 */
export const useFileDownloadStatus = (fileId: string | undefined): DownloadState | undefined => {
    const [status, setStatus] = useState<DownloadState | undefined>(() => {
        if (!fileId) {
            return undefined;
        }
        return fileTransferManager.getDownloadStatus(fileId);
    });

    useEffect(() => {
        if (!fileId) {
            return;
        }

        const unsubscribe = fileTransferManager.subscribe(fileId, setStatus);
        return unsubscribe;
    }, [fileId]);

    return status;
};
