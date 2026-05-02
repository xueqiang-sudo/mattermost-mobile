// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import {of} from 'rxjs';
import {startWith, switchMap} from 'rxjs/operators';

import {observeIsPlaybooksEnabled} from '@playbooks/database/queries/version';
import {observeRecentConversationsForTeam} from '@queries/servers/channel';
import {observeCurrentTeamId} from '@queries/servers/system';

import ConversationListLayout from './conversation_list_layout';

import type {WithDatabaseArgs} from '@typings/database/database';
import type ChannelModel from '@typings/database/models/servers/channel';

const enhanced = withObservables([], ({database}: WithDatabaseArgs) => {
    const currentTeamId = observeCurrentTeamId(database);
    /** 切换团队时先清空列表：switchMap 取消订阅后否则会一直显示上一团队末次发出的会话，直到新团队 observable 首次发射 */
    const sortedChannels = currentTeamId.pipe(
        switchMap((teamId) => {
            if (!teamId) {
                return of([]);
            }
            return observeRecentConversationsForTeam(database, teamId).pipe(
                startWith([] as ChannelModel[]),
            );
        }),
    );
    const playbooksEnabled = observeIsPlaybooksEnabled(database);

    return {
        currentTeamId,
        sortedChannels,
        playbooksEnabled,
    };
});

export default withDatabase(enhanced(ConversationListLayout));
