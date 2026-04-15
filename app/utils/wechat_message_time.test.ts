// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {createIntl, createIntlCache} from 'react-intl';

import {formatWeChatPostHeaderTime} from './wechat_message_time';

describe('formatWeChatPostHeaderTime', () => {
    const intl = createIntl({locale: 'en-US', messages: {}}, createIntlCache());

    beforeAll(() => {
        jest.useFakeTimers({doNotFake: ['nextTick']});
        jest.setSystemTime(new Date('2025-06-15T12:00:00Z'));
    });

    afterAll(() => {
        jest.useRealTimers();
    });

    it('should show 12-hour time for today when isMilitaryTime is false', () => {
        const createAt = new Date('2025-06-15T12:00:00Z').getTime();
        const text = formatWeChatPostHeaderTime(intl, createAt, 'America/New_York', false);
        expect(text).toMatch(/AM|PM/i);
    });

    it('should show 24-hour time for today when isMilitaryTime is true', () => {
        const createAt = new Date('2025-06-15T12:00:00Z').getTime();
        const text = formatWeChatPostHeaderTime(intl, createAt, 'America/New_York', true);
        expect(text).toBe('8:00');
    });
});
