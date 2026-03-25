// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';
import {defineMessages} from 'react-intl';
import {DeviceEventEmitter} from 'react-native';

import {updateDraftMessage} from '@actions/local/draft';
import {BaseOption} from '@components/common_post_options';
import {Events, Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {dismissBottomSheet} from '@screens/navigation';

import type PostModel from '@typings/database/models/servers/post';
import type {AvailableScreens} from '@typings/screens/navigation';

type Props = {
    bottomSheetId: AvailableScreens;
    post: PostModel;
}

const messages = defineMessages({
    recall_edit: {
        id: 'mobile.post_info.reedit',
        defaultMessage: '重新编辑',
    },
});

const RecallEditOption = ({bottomSheetId, post}: Props) => {
    const serverUrl = useServerUrl();

    const onPress = useCallback(async () => {
        const draftRootId = post.rootId || '';
        const message = post.messageSource || post.message;

        await dismissBottomSheet(bottomSheetId);

        // Keep draft root semantics consistent with the referenced thread.
        if (draftRootId) {
            DeviceEventEmitter.emit(Events.POST_DRAFT_SET_REPLY_ROOT, {channelId: post.channelId, rootId: draftRootId});
        } else {
            DeviceEventEmitter.emit(Events.POST_DRAFT_CLEAR_REPLY_ROOT);
        }

        await updateDraftMessage(serverUrl, post.channelId, draftRootId, message);

        // Focus the composer and bring up keyboard.
        DeviceEventEmitter.emit(Events.POST_DRAFT_FOCUS, {location: Screens.CHANNEL, channelId: post.channelId});
    }, [bottomSheetId, post.channelId, post.messageSource, post.rootId, serverUrl, post]);

    return (
        <BaseOption
            message={messages.recall_edit}
            iconName='pencil-outline'
            onPress={onPress}
            testID='post_options.recall_edit.option'
        />
    );
};

export default RecallEditOption;

