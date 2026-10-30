// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

export type UploadFileStatus = 'pending' | 'uploading' | 'completed' | 'failed';

export type UploadFileItem = {
    id: string;
    name: string;
    size: number;
    progress: number;
    status: UploadFileStatus;
    error?: string;
};
