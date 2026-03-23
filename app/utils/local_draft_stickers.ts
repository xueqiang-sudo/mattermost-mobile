// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {
    copyAsync,
    deleteAsync,
    documentDirectory,
    getInfoAsync,
    makeDirectoryAsync,
    readAsStringAsync,
    writeAsStringAsync,
} from 'expo-file-system';

import {generateId} from '@utils/general';
import {safeParseJSON} from '@utils/helpers';

export type LocalDraftSticker = {
    id: string;
    /** file:// URI under app documentDirectory */
    localUri: string;
    addedAt: number;
};

const MANIFEST_FILE = 'local_draft_stickers.json';
const STICKERS_SUBDIR = 'local_draft_stickers';

function manifestPath(): string {
    return `${documentDirectory}${MANIFEST_FILE}`;
}

export function localStickersDirectory(): string {
    return `${documentDirectory}${STICKERS_SUBDIR}/`;
}

export async function loadLocalDraftStickers(): Promise<LocalDraftSticker[]> {
    try {
        const path = manifestPath();
        const info = await getInfoAsync(path);
        if (!info.exists) {
            return [];
        }
        const raw = await readAsStringAsync(path);
        const parsed = safeParseJSON(raw);
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed.filter(
            (x): x is LocalDraftSticker =>
                Boolean(x) &&
                typeof (x as LocalDraftSticker).id === 'string' &&
                typeof (x as LocalDraftSticker).localUri === 'string',
        );
    } catch {
        return [];
    }
}

export async function saveLocalDraftStickers(stickers: LocalDraftSticker[]): Promise<void> {
    await writeAsStringAsync(manifestPath(), JSON.stringify(stickers));
}

function toFileUri(path: string): string {
    if (path.startsWith('file://')) {
        return path;
    }
    return `file://${path}`;
}

/**
 * Copy a picked image into app storage and append to the manifest (WeChat-style "my stickers").
 */
export async function addLocalDraftStickerFromSourceUri(sourceUri: string): Promise<LocalDraftSticker | undefined> {
    const dir = localStickersDirectory();
    await makeDirectoryAsync(dir, {intermediates: true});
    const rawExt = sourceUri.split('.').pop()?.split('?')[0] ?? 'png';
    const safeExt = /^[a-z0-9]+$/i.test(rawExt) ? rawExt : 'png';
    const id = generateId();
    const destPath = `${dir}${id}.${safeExt}`;
    await copyAsync({from: sourceUri, to: destPath});
    const entry: LocalDraftSticker = {
        id,
        localUri: toFileUri(destPath),
        addedAt: Date.now(),
    };
    const list = await loadLocalDraftStickers();
    list.push(entry);
    await saveLocalDraftStickers(list);
    return entry;
}

export async function removeLocalDraftSticker(id: string): Promise<void> {
    const list = await loadLocalDraftStickers();
    const found = list.find((s) => s.id === id);
    const next = list.filter((s) => s.id !== id);
    await saveLocalDraftStickers(next);
    if (found?.localUri) {
        const path = found.localUri.replace('file://', '');
        try {
            await deleteAsync(path, {idempotent: true});
        } catch {
            // ignore
        }
    }
}
