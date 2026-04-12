// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {deleteAsync, getInfoAsync} from 'expo-file-system';
import {Platform} from 'react-native';
import {getRealPath, Video} from 'react-native-compressor';

import {
    CHAT_VIDEO_COMPRESS_BITRATE,
    CHAT_VIDEO_COMPRESS_MAX_SIZE,
    CHAT_VIDEO_COMPRESSION_METHOD,
    ENABLE_VIDEO_COMPRESS,
} from '@constants/media_processing';
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

export type CompressChatVideoOptions = {
    isAborted?: () => boolean;

    /** Fired with 0–1 during compression (in addition to overlay progress). */
    onProgress?: (progress: number) => void;
};

/** Outputs smaller than this are treated as corrupt (e.g. Android manual+maxSize bug in react-native-compressor #380). */
const MIN_VALID_COMPRESSED_BYTES = 4096;

/**
 * Compresses chat-bound videos (camera, gallery, files) toward a smaller MP4 suitable for upload.
 * On failure, returns the original asset unchanged.
 */
export async function compressChatVideoAsset(
    file: Asset | DocumentPickerResponse,
    options?: CompressChatVideoOptions,
): Promise<Asset | DocumentPickerResponse> {
    if (!ENABLE_VIDEO_COMPRESS || !isProbablyVideo(file) || !file.uri) {
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
        options?.onProgress?.(0);

        /**
         * Android: `manual` + `maxSize` can corrupt MP4 (react-native-compressor #380). The old workaround was
         * `manual` without `maxSize`, which keeps the camera's full resolution — a fixed bitrate then looks
         * blurry (bits/pixel too low) or requires a huge bitrate (30s → ~30MB). Chat apps first downscale then
         * encode; `auto` + `maxSize` does that on Android and is not the #380 failure mode.
         */
        const isAndroid = Platform.OS === 'android';
        const effectiveMethod: 'auto' | 'manual' = isAndroid ? 'auto' : CHAT_VIDEO_COMPRESSION_METHOD;

        const compressorOptions: {
            compressionMethod: 'auto' | 'manual';
            maxSize: number;
            minimumFileSizeForCompress: number;
            bitrate?: number;
        } = {
            compressionMethod: effectiveMethod,
            minimumFileSizeForCompress: 1,
            maxSize: CHAT_VIDEO_COMPRESS_MAX_SIZE,
        };

        if (effectiveMethod === 'manual') {
            compressorOptions.bitrate = CHAT_VIDEO_COMPRESS_BITRATE;
        }

        const compressedUri = await Video.compress(
            inputUri,
            compressorOptions,
            (progress) => {
                reportVideoCompressProgress(progress);
                options?.onProgress?.(progress);
            },
        );

        const outUri = ensureFileScheme(compressedUri);
        const baseName = outputBaseName(outUri);

        try {
            const statPath = outUri.replace(/^file:\/\//, '');
            const finfo = await getInfoAsync(statPath, {size: true});
            if (
                finfo.exists &&
                'size' in finfo &&
                typeof finfo.size === 'number' &&
                finfo.size < MIN_VALID_COMPRESSED_BYTES
            ) {
                logError(
                    '[compressChatVideoAsset] compressed file too small, discarding (likely corrupt output)',
                    {size: finfo.size},
                );
                await deleteAsync(outUri, {idempotent: true}).catch(() => undefined);
                reportVideoCompressProgress(0);
                return file;
            }
        } catch (statErr) {
            logError('[compressChatVideoAsset.getInfoAsync]', statErr);
        }

        reportVideoCompressProgress(1);
        options?.onProgress?.(1);

        if (options?.isAborted?.()) {
            await deleteAsync(outUri, {idempotent: true}).catch(() => undefined);
            reportVideoCompressProgress(0);
            return file;
        }

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
