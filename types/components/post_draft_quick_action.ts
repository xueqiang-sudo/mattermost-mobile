// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {DraftVideoProcessingBridge} from '@utils/file/draft_video_local_processing';

export interface QuickActionAttachmentProps {
    disabled: boolean;
    fileCount?: number;
    maxFilesReached: boolean;
    maxFileCount: number;
    onUploadFiles: (files: FileInfo[]) => void;
    draftVideoProcessingBridge?: DraftVideoProcessingBridge;
    testID?: string;
}
