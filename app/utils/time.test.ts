// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {getFormattedTime} from './time';

describe('getFormattedTime', () => {
    test('returns time in military format for en-US', () => {
        const result = getFormattedTime(true, 'America/New_York', '2025-03-31T12:00:00Z', 'en-US');
        expect(result).toBe('08:00');
    });

    test('returns time in 12-hour format with AM/PM for en-US', () => {
        const result = getFormattedTime(false, 'America/New_York', '2025-03-31T12:00:00Z', 'en-US');
        expect(result).toBe('8:00 AM');
    });

    test('returns time in 12-hour format with 上午/下午 for zh-CN', () => {
        const result = getFormattedTime(false, 'Asia/Shanghai', '2025-06-14T10:58:00+08:00', 'zh-CN');
        expect(result).toBe('上午10:58');
    });

    test('returns time in 24-hour format for zh-CN', () => {
        const result = getFormattedTime(true, 'Asia/Shanghai', '2025-06-14T14:04:00+08:00', 'zh-CN');
        expect(result).toBe('14:04');
    });

    test('handles UserTimezone object with automaticTimezone', () => {
        const timezone = {useAutomaticTimezone: true, automaticTimezone: 'Asia/Tokyo', manualTimezone: 'America/Los_Angeles'};
        const result = getFormattedTime(false, timezone, '2025-03-31T12:00:00Z', 'en-US');
        expect(result).toBe('9:00 PM');
    });

    test('handles UserTimezone object with manualTimezone', () => {
        const timezone = {useAutomaticTimezone: false, automaticTimezone: 'Asia/Tokyo', manualTimezone: 'America/Los_Angeles'};
        const result = getFormattedTime(false, timezone, '2025-03-31T12:00:00Z', 'en-US');
        expect(result).toBe('5:00 AM');
    });

    test('uses local time when timezone is undefined', () => {
        const result = getFormattedTime(false, '', '2025-03-31T12:00:00Z', 'en-US');
        expect(result).toMatch(/AM|PM/i);
    });
});
