// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/** Key in FileInfo.postProps for draft-only video capture processing state (not sent to server). */
export const DRAFT_VIDEO_POST_PROP_KEY = 'mmDraftVideoLocal';

export type DraftVideoLocalStage = 'resolving' | 'compressing';

export type DraftVideoLocalPostProps = {
    localProcessing: true;
    stage: DraftVideoLocalStage;
    /** Compression progress 0–1; meaningful when stage is compressing */
    progress: number;
};

export function isDraftVideoLocalProcessingFile(file: FileInfo): boolean {
    const p = file.postProps?.[DRAFT_VIDEO_POST_PROP_KEY] as DraftVideoLocalPostProps | undefined;
    return Boolean(p?.localProcessing);
}

export function getDraftVideoLocalMeta(file: FileInfo): DraftVideoLocalPostProps | undefined {
    return file.postProps?.[DRAFT_VIDEO_POST_PROP_KEY] as DraftVideoLocalPostProps | undefined;
}

const abortedClientIds = new Set<string>();

export function markDraftVideoProcessingAborted(clientId: string) {
    abortedClientIds.add(clientId);
}

export function clearDraftVideoProcessingAborted(clientId: string) {
    abortedClientIds.delete(clientId);
}

export function isDraftVideoProcessingAborted(clientId: string) {
    return abortedClientIds.has(clientId);
}

/** Draft placeholder for camera/gallery media (image or video) while compress/extract runs. */
export function buildDraftMediaPlaceholderFile(params: {
    clientId: string;
    userId: string;
    name: string;
    stage: DraftVideoLocalStage;
    progress?: number;
    mime_type: string;
    extension: string;
    /** Local file URI for immediate thumbnail preview (image/video). */
    uri?: string;
}): FileInfo {
    const {clientId, userId, name, stage, progress = 0, mime_type, extension, uri} = params;
    const normalizedUri = uri && !uri.startsWith('file://') ? `file://${uri}` : uri;
    return {
        clientId,
        user_id: userId,
        name,
        extension,
        mime_type,
        size: 0,
        has_preview_image: false,
        height: 1,
        width: 1,
        uri: normalizedUri,
        localPath: normalizedUri?.replace(/^file:\/\//, ''),
        postProps: {
            [DRAFT_VIDEO_POST_PROP_KEY]: {
                localProcessing: true,
                stage,
                progress,
            },
        },
    };
}

export function buildDraftVideoPlaceholderFile(params: {
    clientId: string;
    userId: string;
    name: string;
    stage: DraftVideoLocalStage;
    progress?: number;
}): FileInfo {
    const {clientId, userId, name, stage, progress = 0} = params;
    return buildDraftMediaPlaceholderFile({
        clientId,
        userId,
        name,
        stage,
        progress,
        mime_type: 'video/mp4',
        extension: 'mp4',
    });
}

export function patchDraftVideoPlaceholder(
    file: FileInfo,
    patch: Partial<Pick<DraftVideoLocalPostProps, 'stage' | 'progress'>> & {name?: string},
): FileInfo {
    const prev = getDraftVideoLocalMeta(file);
    if (!prev) {
        return file;
    }
    const nextMeta: DraftVideoLocalPostProps = {
        localProcessing: true,
        stage: patch.stage ?? prev.stage,
        progress: patch.progress ?? prev.progress,
    };
    return {
        ...file,
        name: patch.name ?? file.name,
        postProps: {
            ...file.postProps,
            [DRAFT_VIDEO_POST_PROP_KEY]: nextMeta,
        },
    };
}

/** Hooks for camera-recorded video: draft placeholder + replace when compression/extract completes. */
export type DraftVideoProcessingBridge = {
    currentUserId: string;
    addVideoPlaceholder: (file: FileInfo) => void;
    updateVideoPlaceholder: (clientId: string, file: FileInfo) => Promise<void>;
    completeVideoProcessing: (clientId: string, files: ExtractedFileInfo[]) => void;
    removeVideoPlaceholder: (clientId: string) => void;
};
