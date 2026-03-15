// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * 部门路径展示与截断工具
 * - 纯展示（如个人信息页）：去掉「企业通讯录」首段后展示，超长用 首/.../尾 截断
 * - 导航型（如部门详情面包屑）：保留完整路径，超长用 首 > ... > 尾，... 可点展开中间段
 */

export const DEPARTMENT_PATH_DISPLAY_MAX_LENGTH = 35;
export const NAV_PATH_MAX_VISIBLE = 5;

/** 去掉路径首段（若为 enterpriseLabel），仅用于纯展示场景 */
export function getDisplaySegments(segments: string[], enterpriseLabel: string): string[] {
    if (segments.length > 0 && segments[0] === enterpriseLabel) {
        return segments.slice(1);
    }
    return segments;
}

/**
 * 纯展示用：去前缀 + 超长截断为 首 + sep + "..." + sep + 尾
 * 仅用于个人信息页等部门路径纯展示
 */
export function formatPathForDisplay(
    segments: string[],
    maxLength: number,
    separator: string,
    enterpriseLabel: string,
): string {
    const display = getDisplaySegments(segments, enterpriseLabel);
    if (display.length === 0) {
        return '';
    }
    const full = display.join(separator);
    if (full.length <= maxLength || display.length <= 2) {
        return full;
    }
    const first = display[0];
    const last = display[display.length - 1];
    const ellipsis = '...';
    const truncated = `${first}${separator}${ellipsis}${separator}${last}`;
    return truncated.length <= full.length ? truncated : full;
}

export type NavigationalPathItem =
    | { type: 'segment'; label: string; originalIndex: number }
    | { type: 'ellipsis'; label: string };

export type NavigationalPathView = {
    items: NavigationalPathItem[];
    fullSegments: string[];
    middleSegments: string[];
};

/**
 * 导航用：不去前缀，对完整 segments 做截断
 * 若 length <= maxVisible 则全部展示；否则 首 1 段 + ellipsis + 尾 1 段
 * 用于部门详情面包屑，首段保留「企业通讯录」可点回根
 */
export function getNavigationalPathView(
    segments: string[],
    maxVisible: number,
): NavigationalPathView {
    const fullSegments = segments;
    if (fullSegments.length <= maxVisible) {
        const items: NavigationalPathItem[] = fullSegments.map((label, i) => ({
            type: 'segment',
            label,
            originalIndex: i,
        }));
        return { items, fullSegments, middleSegments: [] };
    }
    const first = fullSegments[0];
    const last = fullSegments[fullSegments.length - 1];
    const middleSegments = fullSegments.slice(1, -1);
    const items: NavigationalPathItem[] = [
        { type: 'segment', label: first, originalIndex: 0 },
        { type: 'ellipsis', label: '...' },
        { type: 'segment', label: last, originalIndex: fullSegments.length - 1 },
    ];
    return { items, fullSegments, middleSegments };
}
