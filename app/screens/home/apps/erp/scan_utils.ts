// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * 二维码解析工具
 * 支持两种格式：
 *   格式1: Tab分隔 (11字段): code_sheet_no, box_no, net_weight, item_code, batch, fixed, type, model, spec, color, grade
 *   格式2: €分隔 (i前缀): i€concat_field€item_code€batch€fixed€type€spec€color€grade
 *     concat_field 以 "9" 开头时按固定长度拆分: 9 + 11位码单号 + 3位箱号 + 6位净重
 */

export type ParsedQrCode = {
    codeSheetNo: string;   // 码单号
    boxNo: string;         // 箱号
    netWeight: number;     // 净重
    isMasterSheet: boolean; // 是否主单（以9开头）
    rawFields: string[];   // 原始字段
};

function splitAndFilter(s: string, sep: string): string[] {
    return s.split(sep).filter((p) => p !== '');
}

export function parseQrCode(raw: string): ParsedQrCode | null {
    const tabParts = splitAndFilter(raw, '\t');
    const euroParts = splitAndFilter(raw, '€');

    if (tabParts.length >= 10) {
        return parseTabFormat(tabParts);
    }
    if (euroParts.length >= 3) {
        return parseEuroFormat(euroParts);
    }

    // 无法解析，返回基本信息
    return {
        codeSheetNo: raw.trim(),
        boxNo: '',
        netWeight: 0,
        isMasterSheet: false,
        rawFields: [raw.trim()],
    };
}

function parseTabFormat(parts: string[]): ParsedQrCode {
    const first = parts[0];
    const isMaster = first.startsWith('9');
    let codeSheetNo = first;

    if (isMaster && first.length >= 12) {
        codeSheetNo = first.substring(1, 12);
    }

    const boxNo = parts.length > 1 ? parts[1] : '';
    const netWeightStr = parts.length > 2 ? parts[2] : '0';
    const netWeight = parseFloat(netWeightStr) || 0;

    return {
        codeSheetNo,
        boxNo,
        netWeight,
        isMasterSheet: isMaster,
        rawFields: parts,
    };
}

function parseEuroFormat(parts: string[]): ParsedQrCode {
    // parts[0] = "i"（前缀）
    const concatField = parts.length > 1 ? parts[1] : '';
    const isMaster = concatField.startsWith('9');

    let codeSheetNo = concatField;
    let boxNo = '';
    let netWeight = 0;

    if (isMaster && concatField.length >= 21) {
        codeSheetNo = concatField.substring(1, 12);
        boxNo = concatField.substring(12, 15);
        const weightStr = concatField.substring(15, 21);
        netWeight = parseFloat(weightStr) / 100; // 6位数字，后2位是小数
    }

    return {
        codeSheetNo,
        boxNo,
        netWeight,
        isMasterSheet: isMaster,
        rawFields: parts,
    };
}
