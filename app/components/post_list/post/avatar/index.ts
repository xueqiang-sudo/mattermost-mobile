// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import {of as of$} from 'rxjs';

import {observePostAuthor} from '@queries/servers/post';
import {observeConfigBooleanValue} from '@queries/servers/system';

import Avatar from './avatar';

import type {WithDatabaseArgs} from '@typings/database/database';
import type PostModel from '@typings/database/models/servers/post';
import type UserModel from '@typings/database/models/servers/user';

type AvatarContainerProps = {
    post: PostModel;

    /** 语音转文字失败等 ephemeral：post.userId 可能与当前用户不一致，强制显示本人头像 */
    forcedAuthor?: UserModel;
};

const withPost = withObservables(['post', 'forcedAuthor'], ({database, post, forcedAuthor}: AvatarContainerProps & WithDatabaseArgs) => {
    const enablePostIconOverride = observeConfigBooleanValue(database, 'EnablePostIconOverride');

    const author = forcedAuthor ? of$(forcedAuthor) : observePostAuthor(database, post);

    return {
        author,
        enablePostIconOverride,
    };
});

export default withDatabase(withPost(Avatar));
