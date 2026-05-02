// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {
    buildDraftVideoPlaceholderFile,
    clearDraftVideoProcessingAborted,
    DRAFT_VIDEO_POST_PROP_KEY,
    getDraftVideoLocalMeta,
    isDraftVideoLocalProcessingFile,
    isDraftVideoProcessingAborted,
    markDraftVideoProcessingAborted,
    patchDraftVideoPlaceholder,
} from './draft_video_local_processing';

describe('draft_video_local_processing', () => {
    afterEach(() => {
        clearDraftVideoProcessingAborted('c1');
        clearDraftVideoProcessingAborted('c2');
    });

    it('should build placeholder with resolving stage in postProps', () => {
        const f = buildDraftVideoPlaceholderFile({
            clientId: 'c1',
            userId: 'u1',
            name: 'Preparing…',
            stage: 'resolving',
        });
        expect(f.clientId).toBe('c1');
        expect(f.postProps?.[DRAFT_VIDEO_POST_PROP_KEY]).toEqual({
            localProcessing: true,
            stage: 'resolving',
            progress: 0,
        });
        expect(isDraftVideoLocalProcessingFile(f)).toBe(true);
        expect(getDraftVideoLocalMeta(f)?.stage).toBe('resolving');
    });

    it('should patch stage and progress', () => {
        let f = buildDraftVideoPlaceholderFile({
            clientId: 'c1',
            userId: 'u1',
            name: 'A',
            stage: 'resolving',
        });
        f = patchDraftVideoPlaceholder(f, {stage: 'compressing', progress: 0.5, name: 'B'});
        expect(f.name).toBe('B');
        expect(getDraftVideoLocalMeta(f)).toMatchObject({stage: 'compressing', progress: 0.5});
    });

    it('should track aborted client ids', () => {
        expect(isDraftVideoProcessingAborted('c2')).toBe(false);
        markDraftVideoProcessingAborted('c2');
        expect(isDraftVideoProcessingAborted('c2')).toBe(true);
        clearDraftVideoProcessingAborted('c2');
        expect(isDraftVideoProcessingAborted('c2')).toBe(false);
    });
});
