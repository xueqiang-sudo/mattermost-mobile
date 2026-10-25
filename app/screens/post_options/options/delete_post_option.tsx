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
        defaultMessage: 'Withdraw',
    },
});

const DeletePostOption = ({bottomSheetId, combinedPost, post}: Props) => {
    const serverUrl = useServerUrl();
    const {formatMessage} = useIntl();

    // Check if this post is part of a batch
    const batchId = (post.props as any)?.batch_id || (combinedPost?.props as any)?.batch_id;

    const onPress = useCallback(() => {
        if (batchId) {
            // Show batch delete options
            Alert.alert(
                formatMessage({id: 'mobile.post.withdraw_title', defaultMessage: 'Withdraw Message'}),
                formatMessage({
                    id: 'mobile.post.withdraw_batch_question',
                    defaultMessage: 'This message is part of a batch. Do you want to delete just this message or all messages in the batch?',
                }),
                [{
                    text: formatMessage({id: 'common.cancel', defaultMessage: 'Cancel'}),
                    style: 'cancel',
                }, {
                    text: formatMessage({id: 'mobile.post_info.withdraw_this', defaultMessage: 'Delete This'}),
                    style: 'destructive',
                    onPress: async () => {
                        await dismissBottomSheet(bottomSheetId);
                        deletePost(serverUrl, combinedPost || post);
                    },
                }, {
                    text: formatMessage({id: 'mobile.post_info.withdraw_all', defaultMessage: 'Delete All'}),
                    style: 'destructive',
                    onPress: async () => {
                        await dismissBottomSheet(bottomSheetId);
                        const {deletePostBatch} = await import('@actions/remote/post');
                        deletePostBatch(serverUrl, batchId);
                    },
                }],
            );
        } else {
            // Single post delete
            Alert.alert(
                formatMessage({id: 'mobile.post.withdraw_title', defaultMessage: 'Withdraw Message'}),
                formatMessage({
                    id: 'mobile.post.withdraw_question',
                    defaultMessage: 'Are you sure you want to withdraw this message?',
                }),
                [{
                    text: formatMessage({id: 'common.cancel', defaultMessage: 'Cancel'}),
                    style: 'cancel',
                }, {
                    text: formatMessage({id: 'mobile.post_info.withdraw', defaultMessage: 'Withdraw'}),
                    style: 'destructive',
                    onPress: async () => {
                        await dismissBottomSheet(bottomSheetId);
                        deletePost(serverUrl, combinedPost || post);
                    },
                }],
            );
        }
    }, [formatMessage, bottomSheetId, serverUrl, combinedPost, post, batchId]);

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
