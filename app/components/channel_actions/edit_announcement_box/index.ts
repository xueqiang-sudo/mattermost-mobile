// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import {of as of$} from 'rxjs';
import {distinctUntilChanged, switchMap} from 'rxjs/operators';
import {type StyleProp, type ViewStyle} from 'react-native';

import {observeChannelInfo} from '@queries/servers/channel';

import EditAnnouncementBox from './edit_announcement';

import type {WithDatabaseArgs} from '@typings/database/database';

type OwnProps = WithDatabaseArgs & {
    channelId: string;
    containerStyle?: StyleProp<ViewStyle>;
}

const enhanced = withObservables(['channelId'], ({channelId, database}: OwnProps) => {
    const channelInfo = observeChannelInfo(database, channelId);
    const hasAnnouncement = channelInfo.pipe(
        switchMap((c) => of$(Boolean(c?.header?.trim()))),
        distinctUntilChanged(),
    );

    return {
        hasAnnouncement,
    };
});

export default withDatabase(enhanced(EditAnnouncementBox));
