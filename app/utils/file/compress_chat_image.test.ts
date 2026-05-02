// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {deleteAsync} from 'expo-file-system';
import {getRealPath, Image} from 'react-native-compressor';

import {compressChatImageAsset} from './compress_chat_image';

import type {Asset} from 'react-native-image-picker';

jest.mock('expo-file-system', () => ({
    deleteAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@utils/file/video_compress_overlay', () => ({
    reportVideoCompressProgress: jest.fn(),
}));

jest.mock('@utils/log', () => ({
    logError: jest.fn(),
}));

describe('compressChatImageAsset', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should return the original asset when mime type is video', async () => {
        const file = {uri: 'file://a.mp4', type: 'video/mp4', fileName: 'a.mp4'} as Asset;
        await expect(compressChatImageAsset(file)).resolves.toBe(file);
        expect(Image.compress).not.toHaveBeenCalled();
    });

    it('should return the original asset for GIF (preserve animation)', async () => {
        const file = {uri: 'file://a.gif', type: 'image/gif', fileName: 'a.gif'} as Asset;
        await expect(compressChatImageAsset(file)).resolves.toBe(file);
        expect(Image.compress).not.toHaveBeenCalled();
    });

    it('should compress image assets', async () => {
        const file = {uri: 'file://in.jpg', type: 'image/jpeg', fileName: 'in.jpg'} as Asset;
        const out = await compressChatImageAsset(file);
        expect(Image.compress).toHaveBeenCalledWith(
            'file://in.jpg',
            expect.objectContaining({compressionMethod: 'auto'}),
        );
        expect(out).toMatchObject({
            uri: 'file:///cache/compressed.jpg',
            type: expect.stringMatching(/^image\//),
            fileName: 'compressed.jpg',
        });
    });

    it('should resolve real path for content URIs before compressing', async () => {
        const file = {uri: 'content://images/1', type: 'image/jpeg', fileName: 'x.jpg'} as Asset;
        await compressChatImageAsset(file);
        expect(getRealPath).toHaveBeenCalledWith('content://images/1', 'image');
    });

    it('should delete compressed output and return original when isAborted after compress', async () => {
        const file = {uri: 'file://in.jpg', type: 'image/jpeg', fileName: 'in.jpg'} as Asset;
        const out = await compressChatImageAsset(file, {
            isAborted: () => true,
        });
        expect(deleteAsync).toHaveBeenCalledWith('file:///cache/compressed.jpg', {idempotent: true});
        expect(out).toMatchObject({uri: 'file://in.jpg', fileName: 'in.jpg'});
    });

    it('should not compress when ENABLE_IMAGE_COMPRESS is false', async () => {
        let compressOff: typeof compressChatImageAsset;
        jest.isolateModules(() => {
            jest.doMock('@constants/media_processing', () => ({
                ENABLE_VIDEO_COMPRESS: true,
                ENABLE_IMAGE_COMPRESS: false,
            }));
            compressOff = require('./compress_chat_image').compressChatImageAsset;
        });
        const file = {uri: 'file://in.jpg', type: 'image/jpeg', fileName: 'in.jpg'} as Asset;
        await expect(compressOff!(file)).resolves.toBe(file);
        expect(Image.compress).not.toHaveBeenCalled();
    });
});
