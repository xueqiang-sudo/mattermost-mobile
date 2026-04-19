// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import TestHelper from '@test/test_helper';

import {createContactSectionsByNickname, getContactSectionId, getContactListDisplayName} from './contact_section';

describe('contact_section', () => {
    describe('getContactListDisplayName', () => {
        it('prefers nickname over username', () => {
            const u = TestHelper.fakeUser({
                username: 'ab',
                nickname: 'Beta',
                first_name: 'A',
                last_name: 'B',
            });
            expect(getContactListDisplayName(u)).toBe('Beta');
        });
    });

    describe('getContactSectionId', () => {
        it('uses digit section for leading number', () => {
            expect(getContactSectionId('13103261688')).toBe('1');
        });

        it('uppercases latin letters', () => {
            expect(getContactSectionId('qiang')).toBe('Q');
        });

        it('maps CJK to pinyin initial letter', () => {
            expect(getContactSectionId('邱某某')).toMatch(/^[A-Z]$/);
        });
    });

    describe('createContactSectionsByNickname', () => {
        it('splits users into letter sections', () => {
            const alice = TestHelper.fakeUser({id: '1', username: 'a1', nickname: 'Alice'});
            const bob = TestHelper.fakeUser({id: '2', username: 'b1', nickname: 'Bob'});
            const sections = createContactSectionsByNickname([bob, alice]);
            const ids = sections.map((s) => s.id).sort();
            expect(ids).toContain('A');
            expect(ids).toContain('B');
            expect(sections.find((s) => s.id === 'A')?.first).toBe(true);
            expect((sections.find((s) => s.id === 'A') as {mmSectionLabel?: string})?.mmSectionLabel).toBe('A');
        });
    });
});
