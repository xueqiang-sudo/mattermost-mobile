// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {DEFAULT_DEPARTMENT_NAME, type ContactEmployeeSearchItem} from '@client/rest/contact';
import {DEPARTMENT_PATH_DISPLAY_MAX_LENGTH, formatPathForDisplay} from '@utils/department_path';

/**
 * 搜索范围 / 个人信息式部门展示：末级部门名 + 可选上级路径行（与 {@link formatPathForDisplay} 省略号规则一致）。
 * 仅当上级路径含多级（parent 段 join 后含 `/`）时返回第二行，与 employee_profile 一致。
 */
export function buildDepartmentScopeDisplayFromBreadcrumb(
    breadcrumb: string[],
    defaultDepartmentLabel: string,
    enterpriseLabel: string,
): {leaf: string; parentLine: string | null} {
    if (breadcrumb.length === 0) {
        return {leaf: '', parentLine: null};
    }
    const normalized = breadcrumb.map((s) => normalizeDepartmentName(s, defaultDepartmentLabel));
    const leaf = normalized[normalized.length - 1] ?? '';
    const parentSegments = normalized.slice(0, -1);
    const parentPathStr = parentSegments.join('/');
    if (!parentPathStr || !parentPathStr.includes('/')) {
        return {leaf, parentLine: null};
    }
    const parentFormatted = formatPathForDisplay(
        parentSegments,
        DEPARTMENT_PATH_DISPLAY_MAX_LENGTH,
        '/',
        enterpriseLabel,
    );
    if (!parentFormatted) {
        return {leaf, parentLine: null};
    }
    return {leaf, parentLine: parentFormatted};
}

export function normalizeDepartmentName(name: string, defaultDepartmentLabel: string): string {
    return name === DEFAULT_DEPARTMENT_NAME ? defaultDepartmentLabel : name;
}

export function cascadePathParts(item: ContactEmployeeSearchItem, defaultDepartmentLabel: string): string[] {
    const rawPaths = item.cascade_departments as unknown;
    if (!Array.isArray(rawPaths) || rawPaths.length === 0) {
        return [];
    }

    // 兼容后端返回两种结构：
    // 1) Department[][]（历史约定）
    // 2) Department[]（部分接口当前实际返回）
    const firstEntry = rawPaths[0];
    const chain = (Array.isArray(firstEntry) ? firstEntry : rawPaths).filter(
        (d): d is {name: string} => Boolean(d && typeof d === 'object' && 'name' in d),
    );

    return chain.map((d) => normalizeDepartmentName(d.name, defaultDepartmentLabel));
}

export function cascadePathLabel(item: ContactEmployeeSearchItem, defaultDepartmentLabel: string, enterpriseLabel: string): string {
    const parts = cascadePathParts(item, defaultDepartmentLabel);
    if (!parts.length) {
        return '';
    }

    const leaf = parts[parts.length - 1];
    const parentPath = formatPathForDisplay(
        parts.slice(0, -1),
        DEPARTMENT_PATH_DISPLAY_MAX_LENGTH,
        '/',
        enterpriseLabel,
    );

    return parentPath ? `${leaf}\n${parentPath}` : leaf;
}

function isValidSearchItem(item: ContactEmployeeSearchItem | undefined): item is ContactEmployeeSearchItem {
    return Boolean(item?.employee?.id);
}

export function filterValidSearchItems(items: ContactEmployeeSearchItem[] = []) {
    return items.filter(isValidSearchItem);
}
