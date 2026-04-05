// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {buildDepartmentScopeDisplayFromBreadcrumb, cascadePathLabel, filterValidSearchItems} from './contact_employee_search_path';

import type {ContactEmployeeSearchItem} from '@client/rest/contact';

describe('contact_employee_search_path', () => {
    it('should filter invalid search items', () => {
        const validItem = {
            employee: {id: 'emp-1', name: 'Alice'},
            cascade_departments: [],
        } as ContactEmployeeSearchItem;

        const invalidItem = {
            employee: undefined,
            cascade_departments: [],
        } as unknown as ContactEmployeeSearchItem;

        const filtered = filterValidSearchItems([validItem, invalidItem]);
        expect(filtered).toHaveLength(1);
        expect(filtered[0].employee.id).toBe('emp-1');
    });

    it('should build cascade path label with leaf and parent path', () => {
        const item = {
            employee: {id: 'e1', name: 'Bob'},
            cascade_departments: [[
                {id: 1, name: 'DeptA'},
                {id: 2, name: 'DeptB'},
            ]],
        } as unknown as ContactEmployeeSearchItem;

        const label = cascadePathLabel(item, 'Default', 'Acme');
        expect(label).toContain('DeptB');
        expect(label).toContain('\n');
    });

    it('should omit parent line when only enterprise and one department', () => {
        const {leaf, parentLine} = buildDepartmentScopeDisplayFromBreadcrumb(
            ['Acme Corp', '吕碧城'],
            'Default',
            'Acme Corp',
        );
        expect(leaf).toBe('吕碧城');
        expect(parentLine).toBeNull();
    });

    it('should add parent line when path has multiple ancestors', () => {
        const {leaf, parentLine} = buildDepartmentScopeDisplayFromBreadcrumb(
            ['Acme Corp', 'East', 'Sales', 'Team A'],
            'Default',
            'Acme Corp',
        );
        expect(leaf).toBe('Team A');
        expect(parentLine).toBe('East/Sales');
    });

    it('should ellipsis long parent path like formatPathForDisplay', () => {
        const seg = 'abcdefghijklmnop';
        const {parentLine} = buildDepartmentScopeDisplayFromBreadcrumb(
            ['Ent', `${seg}1`, `${seg}2`, `${seg}3`, `${seg}4`, 'Leaf'],
            'Default',
            'Ent',
        );
        expect(parentLine).toContain('...');
    });
});
