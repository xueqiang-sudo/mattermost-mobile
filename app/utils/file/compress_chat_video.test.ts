// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {getRealPath, Video} from 'react-native-compressor';

import {compressChatVideoAsset} from './compress_chat_video';

import type {Asset} from 'react-native-image-picker';

jest.mock('@utils/file/video_compress_overlay', () => ({
    reportVideoCompressProgress: jest.fn(),
}));

jest.mock('@utils/log', () => ({
    logError: jest.fn(),
}));

describe('compressChatVideoAsset', () => {
    beforeEach(() => {
        jest.clearAllMocks();
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
        expect(out).toMatchObject({
            uri: 'file:///cache/compressed.mp4',
            type: 'video/mp4',
            fileName: 'compressed.mp4',
        });
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
});
