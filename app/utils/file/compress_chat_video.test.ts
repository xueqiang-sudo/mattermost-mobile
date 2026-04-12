// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {deleteAsync, getInfoAsync} from 'expo-file-system';
import {getRealPath, Video} from 'react-native-compressor';

import {compressChatVideoAsset} from './compress_chat_video';

import type {Asset} from 'react-native-image-picker';

jest.mock('expo-file-system', () => ({
    deleteAsync: jest.fn().mockResolvedValue(undefined),
    getInfoAsync: jest.fn().mockResolvedValue({exists: true, size: 500_000}),
}));

jest.mock('@utils/file/video_compress_overlay', () => ({
    reportVideoCompressProgress: jest.fn(),
}));

jest.mock('@utils/log', () => ({
    logError: jest.fn(),
}));

describe('compressChatVideoAsset', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.mocked(getInfoAsync).mockResolvedValue({exists: true, size: 500_000});
    });

    it('should return the original asset when mime type is not video', async () => {
        const file = {uri: 'file://a.jpg', type: 'image/jpeg', fileName: 'a.jpg'} as Asset;
        await expect(compressChatVideoAsset(file)).resolves.toBe(file);
        expect(Video.compress).not.toHaveBeenCalled();
    });

    it('should compress video assets and return mp4 metadata', async () => {
        const file = {uri: 'file://in.mov', type: 'video/quicktime', fileName: 'in.mov'} as Asset;
        const out = await compressChatVideoAsset(file);
        expect(Video.compress).toHaveBeenCalled();
        expect(getInfoAsync).toHaveBeenCalled();
        expect(out).toMatchObject({
            uri: 'file:///cache/compressed.mp4',
            type: 'video/mp4',
            fileName: 'compressed.mp4',
        });
    });

    it('should return original asset when compressed file is suspiciously small', async () => {
        jest.mocked(getInfoAsync).mockResolvedValueOnce({exists: true, size: 100});
        const file = {uri: 'file://in.mov', type: 'video/quicktime', fileName: 'in.mov'} as Asset;
        const out = await compressChatVideoAsset(file);
        expect(deleteAsync).toHaveBeenCalledWith('file:///cache/compressed.mp4', {idempotent: true});
        expect(out).toBe(file);
    });

    it('should resolve real path for content URIs before compressing', async () => {
        const file = {uri: 'content://video/1', type: 'video/mp4', fileName: 'x.mp4'} as Asset;
        await compressChatVideoAsset(file);
        expect(getRealPath).toHaveBeenCalledWith('content://video/1', 'video');
        expect(Video.compress).toHaveBeenCalledWith(
            expect.stringContaining('file://'),
            expect.any(Object),
            expect.any(Function),
        );
    });

    it('should delete compressed output and return original when isAborted after compress', async () => {
        const file = {uri: 'file://in.mov', type: 'video/quicktime', fileName: 'in.mov'} as Asset;
        const out = await compressChatVideoAsset(file, {
            isAborted: () => true,
        });
        expect(deleteAsync).toHaveBeenCalledWith('file:///cache/compressed.mp4', {idempotent: true});
        expect(out).toMatchObject({uri: 'file://in.mov', fileName: 'in.mov'});
    });

    it('should not compress when ENABLE_VIDEO_COMPRESS is false', async () => {
        let compressOff: typeof compressChatVideoAsset;
        jest.isolateModules(() => {
            jest.doMock('@constants/media_processing', () => ({
                ENABLE_VIDEO_COMPRESS: false,
                ENABLE_IMAGE_COMPRESS: true,
                CHAT_VIDEO_COMPRESSION_METHOD: 'manual',
                CHAT_VIDEO_COMPRESS_MAX_SIZE: 720,
                CHAT_VIDEO_COMPRESS_BITRATE: 1_200_000,
            }));
            compressOff = require('./compress_chat_video').compressChatVideoAsset;
        });
        const file = {uri: 'file://in.mov', type: 'video/mp4', fileName: 'in.mov'} as Asset;
        await expect(compressOff!(file)).resolves.toBe(file);
        expect(Video.compress).not.toHaveBeenCalled();
    });
});
