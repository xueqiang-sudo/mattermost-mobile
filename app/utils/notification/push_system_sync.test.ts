// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {resolvePushForSystemState} from './push_system_sync';

describe('resolvePushForSystemState', () => {
    it('returns none when system notifications are disabled', () => {
        expect(resolvePushForSystemState(false, 'all')).toBe('none');
        expect(resolvePushForSystemState(false, 'mention')).toBe('none');
        expect(resolvePushForSystemState(false, 'none')).toBe('none');
    });

    it('returns all when system is enabled and push is none', () => {
        expect(resolvePushForSystemState(true, 'none')).toBe('all');
        expect(resolvePushForSystemState(true, undefined)).toBe('all');
    });

    it('preserves mention or all when system is enabled', () => {
        expect(resolvePushForSystemState(true, 'mention')).toBe('mention');
        expect(resolvePushForSystemState(true, 'all')).toBe('all');
    });
});
