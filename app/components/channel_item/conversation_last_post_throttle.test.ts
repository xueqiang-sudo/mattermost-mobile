// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {asyncScheduler, Subject} from 'rxjs';
import {throttleTime} from 'rxjs/operators';

import {advanceTimers, disableFakeTimers, enableFakeTimers} from '@test/timer_helpers';

import {HOME_CONVERSATION_LAST_POST_THROTTLE_MS} from './conversation_list_constants';

describe('conversation list last post throttle (matches channel_item enhance)', () => {
    afterEach(() => {
        disableFakeTimers();
    });

    it('should emit first value immediately then trailing last value after window', async () => {
        enableFakeTimers();
        const subject = new Subject<{id: string}>();
        const received: string[] = [];
        const sub = subject.pipe(
            throttleTime(HOME_CONVERSATION_LAST_POST_THROTTLE_MS, asyncScheduler, {leading: true, trailing: true}),
        ).subscribe((v) => received.push(v.id));

        subject.next({id: 'a'});
        expect(received).toEqual(['a']);

        subject.next({id: 'b'});
        subject.next({id: 'c'});
        expect(received).toEqual(['a']);

        await advanceTimers(HOME_CONVERSATION_LAST_POST_THROTTLE_MS);
        expect(received).toEqual(['a', 'c']);

        sub.unsubscribe();
    });
});
