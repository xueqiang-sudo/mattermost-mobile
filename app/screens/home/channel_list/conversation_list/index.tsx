// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import {of} from 'rxjs';
import {switchMap} from 'rxjs/operators';

import {observeIsPlaybooksEnabled} from '@playbooks/database/queries/version';
import {observeRecentConversationsForTeam} from '@queries/servers/channel';
import {observeCurrentTeamId} from '@queries/servers/system';

import ConversationListLayout from './conversation_list_layout';

import type {WithDatabaseArgs} from '@typings/database/database';

const enhanced = withObservables([], ({database}: WithDatabaseArgs) => {
    const currentTeamId = observeCurrentTeamId(database);
    const sortedChannels = currentTeamId.pipe(
        switchMap((teamId) => (teamId ? observeRecentConversationsForTeam(database, teamId) : of([]))),
    );
    const playbooksEnabled = observeIsPlaybooksEnabled(database);

    return {
        sortedChannels,
        playbooksEnabled,
    };
});

export default withDatabase(enhanced(ConversationListLayout));
