// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/** Jest manual mock — real native module is not available in unit tests. */
export const getRealPath = jest.fn(async (uri: string) => {
    if (uri.startsWith('content://') || uri.startsWith('ph://') || uri.startsWith('assets-library://')) {
        return `file:///resolved${uri.replace(/[/:]/g, '_')}`;
    }
    return uri.startsWith('file://') ? uri : `file://${uri}`;
});

export const Video = {
    compress: jest.fn(async () => 'file:///cache/compressed.mp4'),
};
