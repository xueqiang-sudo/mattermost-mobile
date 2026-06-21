// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {createIntl, createIntlCache} from 'react-intl';

import {formatTimeSeparatorLabel, formatWeChatPostHeaderTime} from './wechat_message_time';

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

    it('should show zh-CN 12-hour time with 上午/下午 for today when isMilitaryTime is false', () => {
        const zhIntl = createIntl({locale: 'zh-CN', messages: {}}, createIntlCache());
        const createAt = new Date('2025-06-14T10:58:00+08:00').getTime();
        const text = formatWeChatPostHeaderTime(zhIntl, createAt, 'Asia/Shanghai', false);
        expect(text).toMatch(/上午|下午/);
        expect(text).not.toMatch(/AM|PM/i);
    });

    it('should show 24-hour time for today when isMilitaryTime is true', () => {
        const createAt = new Date('2025-06-15T12:00:00Z').getTime();
        const text = formatWeChatPostHeaderTime(intl, createAt, 'America/New_York', true);
        expect(text).toBe('08:00');
    });
});

describe('formatTimeSeparatorLabel', () => {
    const intl = createIntl({locale: 'en-US', messages: {}}, createIntlCache());
    const zhIntl = createIntl({locale: 'zh-CN', messages: {}}, createIntlCache());

    beforeAll(() => {
        jest.useFakeTimers({doNotFake: ['nextTick']});
        jest.setSystemTime(new Date('2025-06-21T12:00:00Z'));
    });

    afterAll(() => {
        jest.useRealTimers();
    });

    it('should use English month-day date when locale is en-US', () => {
        const createAt = new Date('2025-06-14T10:58:00+08:00').getTime();
        const text = formatTimeSeparatorLabel(intl, createAt, 'Asia/Shanghai', false);
        expect(text).toMatch(/Jun 14.*PM/i);
        expect(text).not.toMatch(/月|日/);
    });

    it('should use Chinese month-day date when locale is zh-CN', () => {
        const createAt = new Date('2025-06-14T10:58:00+08:00').getTime();
        const text = formatTimeSeparatorLabel(zhIntl, createAt, 'Asia/Shanghai', false);
        expect(text).toMatch(/6月14日.*上午/);
    });
});
