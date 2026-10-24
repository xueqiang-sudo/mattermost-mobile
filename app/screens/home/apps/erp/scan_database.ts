// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * 扫码记录本地存储
 * 使用 expo-file-system 存储 JSON 文件
 */

import {documentDirectory, readAsStringAsync, writeAsStringAsync, getInfoAsync, makeDirectoryAsync} from 'expo-file-system';

export type ScanRecord = {
    id: string;
    scanType: 'stock_in' | 'stock_out';
    codeSheetNo: string;
    boxNo: string;
    netWeight: number;
    rawScan: string;
    isMasterSheet: boolean;
    scanDate: string;       // '2026-10-23'
    scanSession: string;    // '01-09:15'
    status: 'pending' | 'uploaded' | 'failed';
    createdAt: number;
    uploadedAt?: number;
};

type ScanStore = {
    records: ScanRecord[];
};

const SCAN_DIR = `${documentDirectory}scan_records/`;
const SCAN_FILE = `${SCAN_DIR}data.json`;

function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

async function ensureDir(): Promise<void> {
    const info = await getInfoAsync(SCAN_DIR);
    if (!info.exists) {
        await makeDirectoryAsync(SCAN_DIR, {intermediates: true});
    }
}

async function loadStore(): Promise<ScanStore> {
    await ensureDir();
    try {
        const info = await getInfoAsync(SCAN_FILE);
        if (!info.exists) {
            return {records: []};
        }
        const content = await readAsStringAsync(SCAN_FILE);
        return JSON.parse(content) as ScanStore;
    } catch {
        return {records: []};
    }
}

async function saveStore(store: ScanStore): Promise<void> {
    await ensureDir();
    await writeAsStringAsync(SCAN_FILE, JSON.stringify(store));
}

// ── Public API ──

export async function addScanRecord(record: Omit<ScanRecord, 'id' | 'createdAt'>): Promise<ScanRecord> {
    const store = await loadStore();
    const newRecord: ScanRecord = {
        ...record,
        id: generateId(),
        createdAt: Date.now(),
    };
    store.records.push(newRecord);
    await saveStore(store);
    return newRecord;
}

export async function getScanRecords(filters?: {
    scanType?: string;
    scanDate?: string;
    scanSession?: string;
    status?: string;
}): Promise<ScanRecord[]> {
    const store = await loadStore();
    let records = store.records;

    if (filters?.scanType) {
        records = records.filter((r) => r.scanType === filters.scanType);
    }
    if (filters?.scanDate) {
        records = records.filter((r) => r.scanDate === filters.scanDate);
    }
    if (filters?.scanSession) {
        records = records.filter((r) => r.scanSession === filters.scanSession);
    }
    if (filters?.status) {
        records = records.filter((r) => r.status === filters.status);
    }

    return records.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteScanRecords(ids: string[]): Promise<void> {
    const store = await loadStore();
    const idSet = new Set(ids);
    store.records = store.records.filter((r) => !idSet.has(r.id));
    await saveStore(store);
}

export async function updateScanRecordStatus(ids: string[], status: 'uploaded' | 'failed'): Promise<void> {
    const store = await loadStore();
    const idSet = new Set(ids);
    for (const record of store.records) {
        if (idSet.has(record.id)) {
            record.status = status;
            if (status === 'uploaded') {
                record.uploadedAt = Date.now();
            }
        }
    }
    await saveStore(store);
}

export async function getDistinctScanDates(scanType?: string): Promise<string[]> {
    const store = await loadStore();
    let records = store.records;
    if (scanType) {
        records = records.filter((r) => r.scanType === scanType);
    }
    const dates = new Set(records.map((r) => r.scanDate));
    return Array.from(dates).sort().reverse();
}

export async function getDistinctScanSessions(scanDate: string, scanType?: string): Promise<string[]> {
    const store = await loadStore();
    let records = store.records.filter((r) => r.scanDate === scanDate);
    if (scanType) {
        records = records.filter((r) => r.scanType === scanType);
    }
    const sessions = new Set(records.map((r) => r.scanSession));
    return Array.from(sessions).sort().reverse();
}

export async function createCurrentSession(scanDate: string, scanType?: string): Promise<string> {
    const sessions = await getDistinctScanSessions(scanDate, scanType);
    const seq = sessions.length + 1;
    const seqStr = String(seq).padStart(2, '0');
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    return `${seqStr}-${h}:${m}`;
}

export function createCurrentDate(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}
