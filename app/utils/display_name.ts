// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * 根据语言环境格式化全名
 * - 中文环境（zh-CN、zh-TW 等）：姓在前，名在后，无空格
 * - 非中文环境：名在前，姓在后，中间有空格
 */
export function formatFullName(locale: string, surname: string, givenName: string): string {
    const s = (surname ?? '').trim();
    const g = (givenName ?? '').trim();

    if (!s && !g) {
        return '';
    }

    const isChineseLocale = locale.startsWith('zh');

    if (isChineseLocale) {
        return [s, g].filter(Boolean).join('');
    }

    return [g, s].filter(Boolean).join(' ');
}
