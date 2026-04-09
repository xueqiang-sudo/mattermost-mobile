// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {getRealPath, Video} from 'react-native-compressor';

import {reportVideoCompressProgress} from '@utils/file/video_compress_overlay';
import {logError} from '@utils/log';

import type {DocumentPickerResponse} from 'react-native-document-picker';
import type {Asset} from 'react-native-image-picker';

const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'm4v', 'webm', 'mkv', '3gp']);

function isProbablyVideo(file: Asset | DocumentPickerResponse): boolean {
    if (file.type?.startsWith('video/')) {
        return true;
    }
    const name = ('fileName' in file && file.fileName) || ('name' in file && file.name) || '';
    const ext = name.split('.').pop()?.toLowerCase();
    return Boolean(ext && VIDEO_EXTENSIONS.has(ext));
}

function ensureFileScheme(uri: string): string {
    if (uri.startsWith('file://')) {
        return uri;
    }
    if (uri.startsWith('/')) {
        return `file://${uri}`;
    }
    return uri;
}

function outputBaseName(compressedUri: string): string {
    const raw = compressedUri.split('/').pop() || 'video.mp4';
    const decoded = decodeURIComponent(raw.split('?')[0] || raw);
    return decoded.includes('.') ? decoded : `${decoded}.mp4`;
}

/**
 * Compresses chat-bound videos (camera, gallery, files) toward a smaller MP4 suitable for upload.
 * On failure, returns the original asset unchanged.
 */
export async function compressChatVideoAsset(
    file: Asset | DocumentPickerResponse,
): Promise<Asset | DocumentPickerResponse> {
    if (!isProbablyVideo(file) || !file.uri) {
        return file;
    }

    let inputUri = file.uri;

    try {
        if (
            inputUri.startsWith('ph://') ||
            inputUri.startsWith('content://') ||
            inputUri.startsWith('assets-library://')
        ) {
            inputUri = await getRealPath(inputUri, 'video');
        }
    } catch (e) {
        logError('[compressChatVideoAsset.getRealPath]', e);
        return file;
    }

    inputUri = ensureFileScheme(inputUri);

    try {
        reportVideoCompressProgress(0);
        const compressedUri = await Video.compress(
            inputUri,
            {
                compressionMethod: 'auto',
                maxSize: 1080,
                minimumFileSizeForCompress: 1,
            },
            (progress) => {
                reportVideoCompressProgress(progress);
            },
        );

        const outUri = ensureFileScheme(compressedUri);
        const baseName = outputBaseName(outUri);
        reportVideoCompressProgress(1);

        if ('fileName' in file) {
            const {fileSize: _fs, duration: _duration, ...rest} = file as Asset;
            return {
                ...rest,
                uri: outUri,
                type: 'video/mp4',
                fileName: baseName,
            } as Asset;
        }

        const {size: _size, ...docRest} = file as DocumentPickerResponse;
        return {
            ...docRest,
            uri: outUri,
            type: 'video/mp4',
            name: baseName,
        } as DocumentPickerResponse;
    } catch (e) {
        logError('[compressChatVideoAsset] compression failed, using original file', e);
        reportVideoCompressProgress(0);
        return file;
    }
}
