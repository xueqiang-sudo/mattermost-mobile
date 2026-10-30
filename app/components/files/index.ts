// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import {of as of$, from as from$} from 'rxjs';
import {switchMap} from 'rxjs/operators';

import {queryFilesForPost, queryMediaFilesForChannel} from '@queries/servers/file';
import {observeCanDownloadFiles, observeEnableSecureFilePreview} from '@queries/servers/security';
import {observeConfigBooleanValue} from '@queries/servers/system';
import {filesLocalPathValidation, isImage, isVideo} from '@utils/file';

import Files from './files';

import type {WithDatabaseArgs} from '@typings/database/database';
import type PostModel from '@typings/database/models/servers/post';

type EnhanceProps = WithDatabaseArgs & {
    post: PostModel;
    serverUrl: string;
}

const enhance = withObservables(['post'], ({database, post, serverUrl}: EnhanceProps) => {
    const publicLinkEnabled = observeConfigBooleanValue(database, 'EnablePublicLink');

    const filesInfo = queryFilesForPost(database, post.id).observeWithColumns(['local_path']).pipe(
        switchMap((fs) => from$(filesLocalPathValidation(fs, post.userId, serverUrl))),
    );

    const channelMediaFiles = queryMediaFilesForChannel(database, post.channelId).observeWithColumns(['local_path']).pipe(
        switchMap((fs) => from$(
            filesLocalPathValidation(fs.filter((f) => isImage(f) || isVideo(f)), post.userId, serverUrl),
        )),
    );

    // 观察 post 的 props 变化，确保 upload_status 更新时 UI 能响应
    const postProps = post.observe().pipe(
        switchMap((p) => of$(p.props)),
    );

    return {
        canDownloadFiles: observeCanDownloadFiles(database),
        enableSecureFilePreview: observeEnableSecureFilePreview(database),
        postId: of$(post.id),
        channelId: of$(post.channelId),
        message: of$(post.message),
        postProps,
        publicLinkEnabled,
        filesInfo,
        channelMediaFiles,
    };
});

export default withDatabase(enhance(Files));
