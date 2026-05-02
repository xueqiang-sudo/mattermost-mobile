// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';
import {defineMessages} from 'react-intl';
import {DeviceEventEmitter} from 'react-native';

import {fetchAndSwitchToThread} from '@actions/remote/thread';
import {BaseOption} from '@components/common_post_options';
import {Events, Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {dismissBottomSheet} from '@screens/navigation';

import type PostModel from '@typings/database/models/servers/post';
import type {AvailableScreens} from '@typings/screens/navigation';

type Props = {
    post: PostModel;
    bottomSheetId: AvailableScreens;
}

const messages = defineMessages({
    quote: {
        id: 'mobile.post_info.quote',
        defaultMessage: 'Quote',
    },
});
const ReplyOption = ({post, bottomSheetId}: Props) => {
    const serverUrl = useServerUrl();

    const handleReply = useCallback(async () => {
        const rootId = post.rootId || post.id;
        await dismissBottomSheet(bottomSheetId);
        await fetchAndSwitchToThread(serverUrl, rootId);
        DeviceEventEmitter.emit(Events.POST_DRAFT_FOCUS, {location: Screens.CHANNEL, channelId: post.channelId});
    }, [bottomSheetId, post, serverUrl]);

    return (
        <BaseOption
            message={messages.quote}
            iconName='reply-outline'
            onPress={handleReply}
            testID='post_options.reply_post.option'
        />
    );
};

export default ReplyOption;
