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
    withdrawThis: {
        id: 'mobile.post_info.withdraw_this',
        defaultMessage: '撤回该条消息',
    },
    withdrawAll: {
        id: 'mobile.post_info.withdraw_all',
        defaultMessage: '撤回本次发送的全部消息',
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
                formatMessage({id: 'mobile.post.withdraw_title', defaultMessage: '撤回消息'}),
                formatMessage({
                    id: 'mobile.post.withdraw_batch_question',
                    defaultMessage: '该消息属于批次发送，请选择撤回范围',
                }),
                [{
                    text: formatMessage({id: 'common.cancel', defaultMessage: '取消'}),
                    style: 'cancel',
                }, {
                    text: formatMessage(messages.withdrawThis),
                    style: 'destructive',
                    onPress: async () => {
                        await dismissBottomSheet(bottomSheetId);
                        deletePost(serverUrl, combinedPost || post);
                    },
                }, {
                    text: formatMessage(messages.withdrawAll),
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
                formatMessage({id: 'mobile.post.withdraw_title', defaultMessage: '撤回消息'}),
                formatMessage({
                    id: 'mobile.post.withdraw_question',
                    defaultMessage: '确定要撤回这条消息吗？',
                }),
                [{
                    text: formatMessage({id: 'common.cancel', defaultMessage: '取消'}),
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
