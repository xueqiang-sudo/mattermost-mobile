// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';
import {defineMessages, useIntl} from 'react-intl';
import {Alert} from 'react-native';

import {deletePost} from '@actions/remote/post';
import {BaseOption} from '@components/common_post_options';
import {useServerUrl} from '@context/server';
import {dismissBottomSheet} from '@screens/navigation';

import type PostModel from '@typings/database/models/servers/post';
import type {AvailableScreens} from '@typings/screens/navigation';

type Props = {
    bottomSheetId: AvailableScreens;
    combinedPost?: Post | PostModel;
    post: PostModel;
}

const messages = defineMessages({
    withdraw: {
        id: 'mobile.post_info.withdraw',
        defaultMessage: '撤回',
    },
});

const DeletePostOption = ({bottomSheetId, combinedPost, post}: Props) => {
    const serverUrl = useServerUrl();
    const {formatMessage} = useIntl();

    const onPress = useCallback(() => {
        Alert.alert(
            formatMessage({id: 'mobile.post.withdraw_title', defaultMessage: '撤回消息'}),
            formatMessage({
                id: 'mobile.post.withdraw_question',
                defaultMessage: '确认撤回这条消息吗？',
            }),
            [{
                text: formatMessage({id: 'common.cancel', defaultMessage: 'Cancel'}),
                style: 'cancel',
            }, {
                text: formatMessage({id: 'mobile.post_info.withdraw', defaultMessage: '撤回'}),
                style: 'destructive',
                onPress: async () => {
                    await dismissBottomSheet(bottomSheetId);
                    deletePost(serverUrl, combinedPost || post);
                },
            }],
        );
    }, [formatMessage, bottomSheetId, serverUrl, combinedPost, post]);

    return (
        <BaseOption
            message={messages.withdraw}
            iconName='trash-can-outline'
            onPress={onPress}
            testID='post_options.delete_post.option'
            isDestructive={true}
        />
    );
};

export default DeletePostOption;
