// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import {of} from 'rxjs';
import {switchMap} from 'rxjs/operators';

import {observeCurrentChannelId} from '@queries/servers/system';
import {queryMyChannels} from '@queries/servers/channel';

import ForwardMessage from './forward_message';

import type {WithDatabaseArgs} from '@typings/database/database';

const enhanced = withObservables([], ({database}: WithDatabaseArgs) => {
    const currentChannelId = observeCurrentChannelId(database);
    const channels = currentChannelId.pipe(
        switchMap(() => queryMyChannels(database).observe()),
    );

    return {
        currentChannelId,
        channels,
    };
});

export default withDatabase(enhanced(ForwardMessage));
