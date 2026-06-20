// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import {of as of$} from 'rxjs';
import {switchMap, map} from 'rxjs/operators';

import {General, Tutorial} from '@constants';
import {observeTutorialWatched} from '@queries/app/global';
import {observeChannelMembers} from '@queries/servers/channel';
import {observeConfigValue, observeCurrentTeamId, observeCurrentUserId} from '@queries/servers/system';
import {observeTeammateNameDisplay} from '@queries/servers/user';

import CreateDirectMessage from './create_direct_message';

import type {WithDatabaseArgs} from '@typings/database/database';

type OwnProps = WithDatabaseArgs & {
    channelId?: string;
    isExistingChannel?: boolean;
    currentUserId?: string;
}

const enhanced = withObservables(['channelId', 'isExistingChannel'], ({database, channelId, isExistingChannel}: OwnProps) => {
    const restrictDirectMessage = observeConfigValue(database, 'RestrictDirectMessage').pipe(
        switchMap((v) => of$(v !== General.RESTRICT_DIRECT_MESSAGE_ANY)),
    );

    // When in "Add Members" mode, observe existing channel members
    const existingMemberIds = (isExistingChannel && channelId)
        ? observeChannelMembers(database, channelId).pipe(
            map((members) => members.map((m) => m.userId)),
        )
        : of$([] as string[]);

    return {
        teammateNameDisplay: observeTeammateNameDisplay(database),
        currentUserId: observeCurrentUserId(database),
        currentTeamId: observeCurrentTeamId(database),
        tutorialWatched: observeTutorialWatched(Tutorial.PROFILE_LONG_PRESS),
        restrictDirectMessage,
        existingMemberIds,
    };
});

export default withDatabase(enhanced(CreateDirectMessage));
