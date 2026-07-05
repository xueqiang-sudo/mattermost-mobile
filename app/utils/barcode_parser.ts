// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * 仓储条码解析器
 *
 * 条码数据由不可见的控制字符（0x01-0x1F）分隔各字段。
 * 在手机屏幕上控制字符不可见，导致所有字段挤在一起显示为"乱码"。
 *
 * 预期字段列表（按条码中的顺序）：
 *  类型前缀、单号、日期、数量、单价、箱数、筒数、毛重、净重、
 *  批号、品名、规格、色泽、等级、管色
 *
 * 部分字段内部的小数点或横杠也可能用控制字符表示（如毛重 381.2 → 381[ctrl]2）。
 */

export type BarcodeField = {
    key: string;
    label: string;
    value: string;
};

// 字段定义：按条码中的存储顺序排列
// 注意：字段顺序可根据实际条码调整
const FIELD_DEFS: Array<{key: string; label: string}> = [
    {key: 'prefix', label: '类型'},
    {key: 'order_no', label: '单号'},
    {key: 'date', label: '日期'},
    {key: 'quantity', label: '数量'},
    {key: 'unit_price', label: '单价'},
    {key: 'boxes', label: '箱数'},
    {key: 'tubes', label: '筒数'},
    {key: 'gross_weight', label: '毛重'},
    {key: 'net_weight', label: '净重'},
    {key: 'lot_no', label: '批号'},
    {key: 'product_name', label: '品名'},
    {key: 'spec', label: '规格'},
    {key: 'color', label: '色泽'},
    {key: 'grade', label: '等级'},
    {key: 'tube_color', label: '管色'},
];

// 用于显示时跳过的字段（如类型前缀不需要显示）
const HIDDEN_FIELDS = new Set(['prefix']);

// 需要追加单位的字段
const UNIT_SUFFIX: Record<string, string> = {
    gross_weight: ' Kg',
    net_weight: ' Kg',
};

/**
 * 控制字符正则：匹配 0x01-0x1F 范围内的字符（排除常见空白 0x09/0x0A/0x0D）
 */
const CTRL_CHAR_RE = /[\x01-\x08\x0B\x0C\x0E-\x1F]/g;

/**
 * 检测字符串是否包含控制字符（条码字段分隔符）
 */
export function hasControlChars(str: string): boolean {
    return CTRL_CHAR_RE.test(str);
}

/**
 * 将控制字符还原为可见的点号（用于调试日志）
 */
export function makeControlCharsVisible(str: string): string {
    return str.replace(CTRL_CHAR_RE, (ch) => `[0x${ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}]`);
}

/**
 * 解析仓储条码数据为结构化字段列表
 *
 * @param raw 扫描得到的原始字符串（含控制字符分隔符）
 * @returns 解析后的字段列表；如无法解析则返回空数组
 */
export function parseWarehouseBarcode(raw: string): BarcodeField[] {
    if (!raw) return [];

    // 1. 检查是否有控制字符（字段分隔符）
    if (hasControlChars(raw)) {
        return parseByControlChars(raw);
    }

    // 2. 无控制字符（被复制粘贴时丢失），使用正则模式提取
    return parseByPattern(raw);
}

/**
 * 方式一：按控制字符拆分字段
 * 控制字符（0x01-0x1F）是条码中各字段的分隔符
 */
function parseByControlChars(raw: string): BarcodeField[] {
    // 按控制字符拆分，过滤空段
    const segments = raw.split(CTRL_CHAR_RE).filter((s) => s.length > 0);

    const fields: BarcodeField[] = [];

    for (let i = 0; i < segments.length && i < FIELD_DEFS.length; i++) {
        const def = FIELD_DEFS[i];
        let value = segments[i];

        // 如果字段值中包含控制字符作为小数点（如毛重 381[ctrl]2 → 381.2），
        // 这里 split 已经处理了，但有些字段可能内部还有嵌套的控制字符
        // 用点号替换残余的控制字符
        value = value.replace(CTRL_CHAR_RE, '.');

        // 追加单位
        if (UNIT_SUFFIX[def.key]) {
            value += UNIT_SUFFIX[def.key];
        }

        if (!HIDDEN_FIELDS.has(def.key)) {
            fields.push({key: def.key, label: def.label, value});
        }
    }

    // 多出的段（字段定义未覆盖的部分）作为附加字段显示
    for (let i = FIELD_DEFS.length; i < segments.length; i++) {
        const value = segments[i].replace(CTRL_CHAR_RE, '.');
        if (value) {
            fields.push({key: `extra_${i}`, label: `字段${i + 1}`, value});
        }
    }

    return fields;
}

/**
 * 方式二：基于正则模式提取字段（兜底方案）
 * 当控制字符被复制粘贴丢失时使用
 */
function parseByPattern(raw: string): BarcodeField[] {
    const fields: BarcodeField[] = [];

    // 1. 提取类型前缀（首字母）
    let remaining = raw;
    if (/^[A-Z]/.test(remaining)) {
        remaining = remaining.substring(1);
    }

    // 2. 提取单号（11位数字，以2开头，含日期信息）
    const orderMatch = remaining.match(/^(\d{11})/);
    if (orderMatch) {
        const orderNo = orderMatch[1];
        fields.push({key: 'order_no', label: '单号', value: orderNo});

        // 从单号中推导日期：前6位为 YYMMDD
        const yy = orderNo.substring(0, 2);
        const mm = orderNo.substring(2, 4);
        const dd = orderNo.substring(4, 6);
        if (parseInt(mm, 10) >= 1 && parseInt(mm, 10) <= 12 && parseInt(dd, 10) >= 1 && parseInt(dd, 10) <= 31) {
            fields.push({key: 'date', label: '日期', value: `20${yy}-${mm}-${dd}`});
        }

        remaining = remaining.substring(orderNo.length);
    }

    // 3. 提取中间数字段（数量、单价、箱数、筒数、毛重、净重等）
    // 这些字段在控制字符丢失后合并在一起，尝试按常见位宽拆分
    const numericBlockMatch = remaining.match(/^(\d+)/);
    if (numericBlockMatch) {
        const numBlock = numericBlockMatch[1];
        parseNumericBlock(numBlock, fields);
        remaining = remaining.substring(numBlock.length);
    }

    // 4. 提取批号（格式如 e25-9 或 25-9）
    const lotMatch = remaining.match(/^([a-zA-Z]?\d+-\d+)/);
    if (lotMatch) {
        let lotValue = lotMatch[1];
        // 去掉前缀字母（如 e25-9 → 25-9）
        if (/^[a-zA-Z]/.test(lotValue)) {
            lotValue = lotValue.substring(1);
        }
        fields.push({key: 'lot_no', label: '批号', value: lotValue});
        remaining = remaining.substring(lotMatch[0].length);
    }

    // 5. 跳过可能的控制字符和编码段（如 E0001）
    const skipMatch = remaining.match(/^[A-Z]\d{4}/);
    if (skipMatch) {
        remaining = remaining.substring(skipMatch[0].length);
    }

    // 6. 提取品名（CJK 字符段，可能包含 ASCII 前缀如 BTS）
    const cjkNamePattern = /([A-Za-z]*[一-鿿]+)/;
    const nameMatch = remaining.match(cjkNamePattern);
    if (nameMatch) {
        fields.push({key: 'product_name', label: '品名', value: nameMatch[1]});
        remaining = remaining.substring(nameMatch.index! + nameMatch[0].length);
    }

    // 7. 提取规格（格式如 140D/72f）
    const specMatch = remaining.match(/^(\d+D\/\d+f?)/i);
    if (specMatch) {
        fields.push({key: 'spec', label: '规格', value: specMatch[1]});
        remaining = remaining.substring(specMatch[0].length);
    }

    // 8. 提取色泽（可能包含编码前缀 + CJK 名称）
    // 先跳过编码前缀（如 ff）
    const colorPrefixMatch = remaining.match(/^[a-fA-F]{2}/);
    if (colorPrefixMatch) {
        remaining = remaining.substring(colorPrefixMatch[0].length);
    }

    // 色泽 = 数字编码 + 颜色名称
    const colorMatch = remaining.match(/^(\d*[一-鿿]+)/);
    if (colorMatch) {
        fields.push({key: 'color', label: '色泽', value: colorMatch[1]});
        remaining = remaining.substring(colorMatch[0].length);
    }

    // 9. 提取等级（2-3位大写字母，如 AA, EAA）
    const gradeMatch = remaining.match(/^([A-Z]{2,3})/);
    if (gradeMatch) {
        let gradeValue = gradeMatch[1];
        // 如果首字母是类型标记（E），去掉
        if (gradeValue.length === 3 && gradeValue[0] === 'E') {
            gradeValue = gradeValue.substring(1);
        }
        fields.push({key: 'grade', label: '等级', value: gradeValue});
        remaining = remaining.substring(gradeMatch[0].length);
    }

    // 10. 管色（剩余 CJK 文本）
    const tubeColorMatch = remaining.match(/([一-鿿]+)/);
    if (tubeColorMatch) {
        fields.push({key: 'tube_color', label: '管色', value: tubeColorMatch[1]});
    }

    return fields;
}

/**
 * 尝试将合并的数字块拆分为独立字段
 * 例如 "1603249060898" → 数量:15, 单价:5, 箱数:16, 筒数:307, 毛重:381.2, 净重:324.9
 *
 * 注意：控制字符丢失后数字字段合并在一起，无法可靠拆分。
 * 此函数仅作为提示性展示，具体位宽需根据实际条码调整。
 */
function parseNumericBlock(block: string, fields: BarcodeField[]): void {
    // 由于控制字符丢失，数字字段的位宽不确定
    // 这里尝试常见的拆分方式，但可能不准确
    // 如果解析不确定，直接将整个块显示为"数据"

    // 尝试按照用户提供的预期位宽拆分：
    // 数量(2) + 单价(1) + 箱数(2) + 筒数(3) + 毛重(4,无小数点) + 净重(4,无小数点)
    // = 2+1+2+3+4+4 = 16 位
    // 但实际可能更短或更长

    // 暂时不做数字拆分，显示为原始数据提示用户
    if (block.length > 0) {
        fields.push({key: 'raw_numeric', label: '数据', value: block});
    }
}

/**
 * 将解析后的字段列表格式化为多行文本（用于 Alert 或简单显示）
 */
export function formatBarcodeFields(fields: BarcodeField[]): string {
    if (fields.length === 0) return '';

    return fields
        .map((f) => `${f.label}：${f.value}`)
        .join('\n');
}
