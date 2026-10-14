// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * 智能截断文件名，保留扩展名，中间省略（类似微信）
 * 微信风格：保留文件名前半部分和末尾的关键部分（如"- 副本"），中间用...省略
 *
 * @param fileName 原始文件名
 * @param maxLength 最大字符数（不包括扩展名）
 * @returns 截断后的文件名和扩展名
 *
 * @example
 * truncateFileName('副本2026.TECH. CDN Functionality Questionnaire EN(1) - 副本.xlsx', 30)
 * // 返回: {name: '副本2026.TECH. CDN Fun...- 副本', ext: 'xlsx'}
 */
export const truncateFileName = (fileName: string, maxLength: number = 30): {name: string, ext: string} => {
    const lastDotIndex = fileName.lastIndexOf('.');

    // 没有扩展名或扩展名在开头（如 .gitignore）
    if (lastDotIndex <= 0) {
        if (fileName.length > maxLength) {
            // 保留前 2/3 和后 1/3
            const headLen = Math.ceil((maxLength - 3) * 0.67);
            const tailLen = maxLength - 3 - headLen;
            return {name: fileName.slice(0, headLen) + '...' + (tailLen > 0 ? fileName.slice(-tailLen) : ''), ext: ''};
        }
        return {name: fileName, ext: ''};
    }

    const name = fileName.slice(0, lastDotIndex);
    const ext = fileName.slice(lastDotIndex + 1);

    if (name.length <= maxLength) {
        return {name, ext};
    }

    // 微信风格：保留前 2/3 和后 1/3，中间省略
    // 例如："副本2026.TECH. CDN Functionality Questionnaire EN(1) - 副本"
    // 变成："副本2026.TECH. CDN Fun...- 副本"
    const headLen = Math.ceil((maxLength - 3) * 0.67);
    const tailLen = maxLength - 3 - headLen;
    const truncatedName = name.slice(0, headLen) + '...' + (tailLen > 0 ? name.slice(-tailLen) : '');

    return {name: truncatedName, ext};
};
