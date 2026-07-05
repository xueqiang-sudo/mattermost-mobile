// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * 条码编码恢复工具
 *
 * 问题背景：
 * react-native-vision-camera 的内置条码解码器（底层为 ML Kit / Apple Vision）
 * 默认以 UTF-8 解析条码字节数据。但中国仓储系统中条码（特别是二维码）常使用
 * GBK / GB2312 编码存储中文。当解码器以 UTF-8 解释 GBK 字节时：
 *   - ASCII 字符（数字、英文字母）因编码重叠可正常显示
 *   - 中文部分因字节序列不合法被替换为乱码字符（）
 *
 * 本工具在 JavaScript 层面尝试恢复被错误解码的条码文本：
 *   1. 检测字符串是否含有乱码标记（U+FFFD）
 *   2. 将字符串按 Latin-1 还原为字节数组（因为 Java/Kotlin 在某些情况下
 *      会使用 Latin-1 作为 fallback 编码，Latin-1 与字节一一对应）
 *   3. 用 GBK / GB2312 重新解码字节数组
 *   4. 验证结果是否含有有效中文字符
 *
 * 注意：如果原生解码器已经将无效字节替换为 U+FFFD（不可逆丢失），则 JS 层面
 * 无法恢复原始数据。此时需要在原生层使用 rawBytes 进行正确的编码检测。
 * 因此本工具需要与原生层的编码增强配合使用。
 */

/**
 * 检测字符串是否可能包含乱码（被错误解码的中文）
 * 判断依据：含有 Unicode 替换字符 U+FFFD，或含有 Latin-1 补充区（0x80-0xFF）
 * 的非 ASCII 字符（这通常是 GBK 字节被当作 Latin-1 处理的特征）
 */
export function isGarbledText(str: string): boolean {
    if (!str) return false;

    // 含有 U+FFFD 替换字符，说明 UTF-8 解码失败
    if (str.includes('�')) return true;

    // 含有大量 Latin-1 补充区字符（0x80-0xFF），可能是 GBK 被当作 Latin-1
    let latin1SupplementCount = 0;
    let totalNonAscii = 0;
    for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);
        if (code > 127) {
            totalNonAscii++;
            if (code >= 0x80 && code <= 0xFF) {
                latin1SupplementCount++;
            }
        }
    }

    // 如果超过一半的非 ASCII 字符都在 Latin-1 补充区，很可能是编码错误
    if (totalNonAscii > 0 && latin1SupplementCount / totalNonAscii > 0.5) {
        return true;
    }

    return false;
}

/**
 * 将字符串按 Latin-1 编码还原为字节数组
 * Latin-1 的前 256 个码位与字节值一一对应，因此可以无损还原
 */
function stringToLatin1Bytes(str: string): Uint8Array {
    const bytes = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
        bytes[i] = str.charCodeAt(i) & 0xFF;
    }
    return bytes;
}

/**
 * 尝试将字节数组按 GBK 解码
 * 使用 TextDecoder API（React Native Hermes 引擎支持）
 */
function tryDecodeAsGBK(bytes: Uint8Array): string | null {
    // 优先尝试 GBK（兼容 GB2312）
    const encodings = ['gbk', 'gb2312', 'gb18030'];
    for (const encoding of encodings) {
        try {
            const decoder = new TextDecoder(encoding, {fatal: true});
            const result = decoder.decode(bytes);
            // 验证解码结果包含中文字符（CJK 统一汉字范围）
            if (/[一-鿿]/.test(result)) {
                return result;
            }
        } catch {
            // 该编码无法解析此字节序列，继续尝试下一个
        }
    }
    return null;
}

/**
 * 尝试将字节数组按 UTF-8 解码（严格模式）
 */
function tryDecodeAsUTF8(bytes: Uint8Array): string | null {
    try {
        const decoder = new TextDecoder('utf-8', {fatal: true});
        return decoder.decode(bytes);
    } catch {
        return null;
    }
}

/**
 * 恢复条码扫描结果的编码
 *
 * @param value 从条码解码器获取的原始字符串
 * @returns 恢复后的正确字符串；如果无法恢复则返回原始值
 *
 * 使用示例：
 * ```ts
 * const rawValue = code.value; // 从 vision-camera 获取
 * const fixedValue = recoverBarcodeEncoding(rawValue);
 * ```
 */
export function recoverBarcodeEncoding(value: string): string {
    if (!value) return value;

    // 快速路径：如果不包含乱码特征，直接返回
    if (!isGarbledText(value)) return value;

    // 将字符串还原为字节数组（假设是 Latin-1 映射）
    const bytes = stringToLatin1Bytes(value);

    // 尝试 1: GBK/GB2312 解码
    const gbkResult = tryDecodeAsGBK(bytes);
    if (gbkResult) return gbkResult;

    // 尝试 2: 严格 UTF-8 解码（检查原始字符串是否被宽松解码）
    const utf8Result = tryDecodeAsUTF8(bytes);
    if (utf8Result) return utf8Result;

    // 尝试 3: 如果字符串包含 U+FFFD，尝试移除它们并返回
    // （部分数据丢失比全部乱码好）
    if (value.includes('�')) {
        const cleaned = value.replace(/�/g, '');
        if (cleaned.length > 0 && cleaned !== value) {
            return cleaned;
        }
    }

    // 无法恢复，返回原始值
    return value;
}
