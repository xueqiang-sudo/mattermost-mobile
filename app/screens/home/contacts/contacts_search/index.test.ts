// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {filterValidSearchItems} from '@utils/contact_employee_search_path';

import type {TeamMemberSearchItem} from '@types/team_member_search';

describe('contacts_search filterValidSearchItems', () => {
    it('should drop invalid search items without employee id', () => {
        const validItem = {
            employee: {id: 'emp-1', username: 'alice', nickname: 'Alice'} as UserProfile,
            cascade_departments: [],
        } as TeamMemberSearchItem;

        const invalidItem = {
            employee: undefined,
            cascade_departments: [],
        } as unknown as TeamMemberSearchItem;

        const filtered = filterValidSearchItems([validItem, invalidItem]);
        expect(filtered).toHaveLength(1);
        expect(filtered[0].employee.id).toBe('emp-1');
    });
});
