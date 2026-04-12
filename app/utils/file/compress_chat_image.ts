// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {deleteAsync} from 'expo-file-system';
import {getRealPath, Image} from 'react-native-compressor';

import {ENABLE_IMAGE_COMPRESS} from '@constants/media_processing';
import {lookupMimeType} from '@utils/file';
import {reportVideoCompressProgress} from '@utils/file/video_compress_overlay';
import {logError} from '@utils/log';

import type {DocumentPickerResponse} from 'react-native-document-picker';
import type {Asset} from 'react-native-image-picker';

const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'm4v', 'webm', 'mkv', '3gp']);
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'tiff']);

function fileBaseName(file: Asset | DocumentPickerResponse): string {
    return (
        ('fileName' in file && file.fileName) ||
        ('name' in file && file.name) ||
        ''
    );
}

function isProbablyVideo(file: Asset | DocumentPickerResponse): boolean {
    if (file.type?.startsWith('video/')) {
        return true;
    }
    const ext = fileBaseName(file).split('.').pop()?.toLowerCase();
    return Boolean(ext && VIDEO_EXTENSIONS.has(ext));
}

/** Skip GIF — compressor may drop animation frames. */
function isGifFile(file: Asset | DocumentPickerResponse): boolean {
    if (file.type === 'image/gif') {
        return true;
    }
    return fileBaseName(file).toLowerCase().endsWith('.gif');
}

function isProbablyImage(file: Asset | DocumentPickerResponse): boolean {
    if (isProbablyVideo(file) || isGifFile(file)) {
        return false;
    }
    if (file.type?.startsWith('image/')) {
        return true;
    }
    const name = fileBaseName(file);
    const ext = name.split('.').pop()?.toLowerCase();
    return Boolean(ext && IMAGE_EXTENSIONS.has(ext));
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

function outputImageName(compressedUri: string, originalName: string): string {
    const raw = compressedUri.split('/').pop() || 'image.jpg';
    const decoded = decodeURIComponent(raw.split('?')[0] || raw);
    if (decoded.includes('.')) {
        return decoded;
    }
    const origExt = originalName.split('.').pop()?.toLowerCase();
    const ext = origExt && ['png', 'webp', 'heic', 'heif'].includes(origExt) ? origExt : 'jpg';
    return `${decoded}.${ext}`;
}

export type CompressChatImageOptions = {
    isAborted?: () => boolean;
    /** 0–1; Image.compress has no native progress — we emit coarse steps for overlay / placeholders. */
    onProgress?: (progress: number) => void;
};

/**
 * Compresses chat images via react-native-compressor (auto / WhatsApp-style).
 * On failure, returns the original asset unchanged.
 */
export async function compressChatImageAsset(
    file: Asset | DocumentPickerResponse,
    options?: CompressChatImageOptions,
): Promise<Asset | DocumentPickerResponse> {
    if (!ENABLE_IMAGE_COMPRESS || !isProbablyImage(file) || !file.uri) {
        return file;
    }

    let inputUri = file.uri;

    try {
        if (
            inputUri.startsWith('ph://') ||
            inputUri.startsWith('content://') ||
            inputUri.startsWith('assets-library://')
        ) {
            inputUri = await getRealPath(inputUri, 'image');
        }
    } catch (e) {
        logError('[compressChatImageAsset.getRealPath]', e);
        return file;
    }

    inputUri = ensureFileScheme(inputUri);

    try {
        reportVideoCompressProgress(0);
        options?.onProgress?.(0);
        options?.onProgress?.(0.15);
        reportVideoCompressProgress(0.15);

        const compressedUri = await Image.compress(inputUri, {
            compressionMethod: 'auto',
        });

        const outUri = ensureFileScheme(compressedUri);
        const baseName = outputImageName(outUri, fileBaseName(file));
        const outMime = lookupMimeType(baseName) || 'image/jpeg';

        reportVideoCompressProgress(1);
        options?.onProgress?.(1);

        if (options?.isAborted?.()) {
            await deleteAsync(outUri, {idempotent: true}).catch(() => undefined);
            reportVideoCompressProgress(0);
            return file;
        }

        if ('fileName' in file) {
            const {fileSize: _fs, ...rest} = file as Asset;
            return {
                ...rest,
                uri: outUri,
                type: outMime,
                fileName: baseName,
            } as Asset;
        }

        const {size: _size, ...docRest} = file as DocumentPickerResponse;
        return {
            ...docRest,
            uri: outUri,
            type: outMime,
            name: baseName,
        } as DocumentPickerResponse;
    } catch (e) {
        logError('[compressChatImageAsset] compression failed, using original file', e);
        reportVideoCompressProgress(0);
        return file;
    }
}
