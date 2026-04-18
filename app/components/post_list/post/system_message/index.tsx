// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import {map} from 'rxjs/operators';

import {observeChannel} from '@queries/servers/channel';
import {observeConfigBooleanValue} from '@queries/servers/system';
import {observeUser} from '@queries/servers/user';

import SystemMessage from './system_message';

import type {WithDatabaseArgs} from '@typings/database/database';
import type PostModel from '@typings/database/models/servers/post';

const enhance = withObservables(['post'], ({post, database}: {post: PostModel} & WithDatabaseArgs) => ({
    author: observeUser(database, post.userId),
    channelType: observeChannel(database, post.channelId).pipe(
        map((ch) => ch?.type),
    ),
    hideGuestTags: observeConfigBooleanValue(database, 'HideGuestTags'),
}));

export default withDatabase(enhance(SystemMessage));
