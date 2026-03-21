// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import {of} from 'rxjs';
import {switchMap} from 'rxjs/operators';

import {observeIsPlaybooksEnabled} from '@playbooks/database/queries/version';
import {observeRecentConversationsForTeam} from '@queries/servers/channel';
import {observeDraftCount} from '@queries/servers/drafts';
import {observeScheduledPostEnabled, observeScheduledPostsForTeam} from '@queries/servers/scheduled_post';
import {observeCurrentTeamId} from '@queries/servers/system';
import {observeTeamLastChannelId} from '@queries/servers/team';
import {hasScheduledPostError} from '@utils/scheduled_post';

import ConversationListLayout from './conversation_list_layout';

import type {WithDatabaseArgs} from '@typings/database/database';

const enhanced = withObservables([], ({database}: WithDatabaseArgs) => {
    const currentTeamId = observeCurrentTeamId(database);
    const sortedChannels = currentTeamId.pipe(
        switchMap((teamId) => (teamId ? observeRecentConversationsForTeam(database, teamId) : of([]))),
    );
    const draftsCount = currentTeamId.pipe(switchMap((teamId) => observeDraftCount(database, teamId)));
    const allScheduledPost = currentTeamId.pipe(switchMap((teamId) => observeScheduledPostsForTeam(database, teamId, true)));
    const lastChannelId = currentTeamId.pipe(switchMap((teamId) => observeTeamLastChannelId(database, teamId)));
    const scheduledPostCount = allScheduledPost.pipe(
        switchMap((scheduledPosts) => of(scheduledPosts.length)),
    );
    const scheduledPostHasError = allScheduledPost.pipe(
        switchMap((scheduledPosts) => of(hasScheduledPostError(scheduledPosts))),
    );
    const scheduledPostsEnabled = observeScheduledPostEnabled(database);
    const playbooksEnabled = observeIsPlaybooksEnabled(database);

    return {
        sortedChannels,
        lastChannelId,
        draftsCount,
        scheduledPostCount,
        scheduledPostHasError,
        scheduledPostsEnabled,
        playbooksEnabled,
    };
});

export default withDatabase(enhanced(ConversationListLayout));
