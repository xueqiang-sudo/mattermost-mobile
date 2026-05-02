// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';

import {removeDraftFile} from '@actions/local/draft';
import RemoveButton from '@components/upload_item_shared/remove_button';
import {markDraftVideoProcessingAborted} from '@utils/file/draft_video_local_processing';
import {useEditPost} from '@context/edit_post';
import {useServerUrl} from '@context/server';
import DraftEditPostUploadManager from '@managers/draft_upload_manager';

type Props = {
    channelId: string;
    rootId: string;
    clientId: string;
    fileId: string;
    insetInTile?: boolean;
}

export default function UploadRemove({
    channelId,
    rootId,
    clientId,
    fileId,
    insetInTile,
}: Props) {
    const serverUrl = useServerUrl();
    const {onFileRemove, isEditMode} = useEditPost();

    const onPress = useCallback(() => {
        if (isEditMode) {
            onFileRemove?.(fileId || clientId);
            return;
        }
        markDraftVideoProcessingAborted(clientId);
        DraftEditPostUploadManager.cancel(clientId);
        removeDraftFile(serverUrl, channelId, rootId, clientId);
    }, [onFileRemove, isEditMode, fileId, clientId, serverUrl, channelId, rootId]);

    return (
        <RemoveButton
            insetInTile={insetInTile}
            onPress={onPress}
            testID={`remove-button-${fileId}`}
        />
    );
}
