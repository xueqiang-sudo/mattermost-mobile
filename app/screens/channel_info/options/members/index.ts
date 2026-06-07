// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import {of as of$} from 'rxjs';
import {switchMap} from 'rxjs/operators';

import {observeChannel, observeChannelInfo} from '@queries/servers/channel';
import General from '@constants/general';

import Members from './members';

import type {WithDatabaseArgs} from '@typings/database/database';

type Props = WithDatabaseArgs & {
    channelId: string;
    channelType?: ChannelType;
    isTeamDefaultOpenChannel?: boolean;
}

const enhanced = withObservables(['channelId'], ({channelId, database}: Props) => {
    const info = observeChannelInfo(database, channelId);

    const channelObservable = observeChannel(database, channelId);

    const displayName = channelObservable.pipe(
        switchMap((c) => {
            // 企业总群（默认频道）：副标题显示"企业总群"而非频道 displayName
            if (c?.name === General.DEFAULT_CHANNEL) {
                return of$('enterprise_main_channel');
            }
            return of$(c?.displayName);
        }));

    const count = info.pipe(
        switchMap((i) => of$(i?.memberCount || 0)),
    );

    const channelType = channelObservable.pipe(
        switchMap((c) => of$(c?.type as ChannelType | undefined)),
    );

    return {
        displayName,
        count,
        channelType,
    };
});

export default withDatabase(enhanced(Members));
