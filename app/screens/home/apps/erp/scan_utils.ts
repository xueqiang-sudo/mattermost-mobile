// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * 二维码解析工具
 * 支持三种格式：
 *   格式1: Tab分隔 (11字段): code_sheet_no, box_no, net_weight, item_code, batch, fixed, type, model, spec, color, grade
 *   格式2: €分隔 (i前缀): i€concat_field€item_code€batch€fixed€type€spec€color€grade
 *     concat_field 以 "9" 开头时按固定长度拆分: 9 + 11位码单号 + 3位箱号 + 6位净重
 *   格式3: 空格分隔: 11位码单号 箱号 其他信息...
 *     例: "26110201004 6 000086000069KH002002YJ0001 POY中弹单丝轻网 50D/36F 顶顶顶顶 AA"
 */


export type ParsedQrCode = {
    codeSheetNo: string;   // 码单号
    boxNo: string;         // 箱号
    netWeight: number;     // 净重（kg）
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

    // 纯数字格式：19位或20位
    const trimmed = raw.trim();
    if (/^\d+$/.test(trimmed) && (trimmed.length === 19 || trimmed.length === 20)) {
        return parsePlainNumericFormat(trimmed);
    }

    // 空格分隔格式：11位码单号 箱号 其他信息...
    const spaceParts = splitAndFilter(raw, ' ');
    if (spaceParts.length >= 2 && /^\d{11}$/.test(spaceParts[0])) {
        return parseSpaceFormat(spaceParts);
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
    const isMaster = first === '9';

    let codeSheetNo = '';
    let boxNo = '';
    let netWeight = 0;

    if (isMaster) {
        // 总码单格式: 9\t码单号\t箱数量\t净重\t...
        codeSheetNo = parts.length > 1 ? parts[1] : '';
        boxNo = parts.length > 2 ? parts[2] : '';
        const netWeightStr = parts.length > 3 ? parts[3] : '0';
        netWeight = parseFloat(netWeightStr) / 100 || 0;
    } else {
        // 箱单格式: 码单号\t箱号\t净重\t...
        codeSheetNo = first;
        boxNo = parts.length > 1 ? parts[1] : '';
        const netWeightStr = parts.length > 2 ? parts[2] : '0';
        netWeight = parseFloat(netWeightStr) / 100 || 0;
    }

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
        netWeight = parseInt(weightStr, 10) / 100; // 除以100转换为kg
    }

    return {
        codeSheetNo,
        boxNo,
        netWeight,
        isMasterSheet: isMaster,
        rawFields: parts,
    };
}

function parsePlainNumericFormat(raw: string): ParsedQrCode {
    // 纯数字格式：19位或20位
    // 20位以9开头：总码单 (9 + 11位码单号 + 2位箱数 + 6位净重)
    // 19位：箱单 (11位码单号 + 2位箱号 + 6位净重)
    const isMaster = raw.startsWith('9') && raw.length === 20;

    let codeSheetNo = '';
    let boxNo = '';
    let netWeight = 0;

    if (isMaster) {
        // 20位总码单：9 + 11位码单号 + 2位箱数 + 6位净重
        codeSheetNo = raw.substring(1, 12);
        boxNo = raw.substring(12, 14);
        const weightStr = raw.substring(14, 20);
        netWeight = parseInt(weightStr, 10) / 100; // 除以100转换为kg
    } else {
        // 19位箱单：11位码单号 + 2位箱号 + 6位净重
        codeSheetNo = raw.substring(0, 11);
        boxNo = raw.substring(11, 13);
        const weightStr = raw.substring(13, 19);
        netWeight = parseInt(weightStr, 10) / 100; // 除以100转换为kg
    }

    return {
        codeSheetNo,
        boxNo,
        netWeight,
        isMasterSheet: isMaster,
        rawFields: [raw],
    };
}

function parseSpaceFormat(parts: string[]): ParsedQrCode {
    // 空格分隔格式：11位码单号 箱号 其他信息...
    // 例: "26110201004 6 000086000069KH002002YJ0001 POY中弹单丝轻网 50D/36F 顶顶顶顶 AA"
    //   parts[0] = "26110201004" (11位码单号)
    //   parts[1] = "6" (箱号)
    //   parts[2+] = 其他信息（净重等）

    const codeSheetNo = parts[0]; // 11位码单号
    const boxNo = parts[1] || ''; // 箱号

    // 尝试从后面的字段中提取净重（如果有）
    // 通常净重在 parts[2] 或更后面，格式可能是 "000086" (6位数字，单位：0.01kg)
    let netWeight = 0;
    for (let i = 2; i < parts.length; i++) {
        const part = parts[i];
        // 查找6位纯数字（可能是净重）
        if (/^\d{6}$/.test(part)) {
            netWeight = parseInt(part, 10) / 100; // 除以100转换为kg
            break;
        }
    }

    return {
        codeSheetNo,
        boxNo,
        netWeight,
        isMasterSheet: false, // 空格分隔格式默认是箱单
        rawFields: parts,
    };
}
