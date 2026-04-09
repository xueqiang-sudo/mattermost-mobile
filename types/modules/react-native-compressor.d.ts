// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

declare module 'react-native-compressor' {
    export type VideoCompressionOptions = {
        compressionMethod?: 'auto' | 'manual';
        maxSize?: number;
        bitrate?: number;
        minimumFileSizeForCompress?: number;
    };

    export const Video: {
        compress(
            url: string,
            options?: VideoCompressionOptions,
            onProgress?: (progress: number) => void,
        ): Promise<string>;
    };

    export function getRealPath(path: string, type?: 'video' | 'image'): Promise<string>;
}
