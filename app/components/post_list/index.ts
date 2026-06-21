// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import React from 'react';
import {of as of$} from 'rxjs';
import {map, switchMap} from 'rxjs/operators';

import {Preferences} from '@constants';
import {getDisplayNamePreferenceAsBool} from '@helpers/api/preference';
import {queryAllCustomEmojis} from '@queries/servers/custom_emoji';
import {queryDisplayNamePreferences} from '@queries/servers/preference';
import {observeSavedPostsByIds, observeIsPostAcknowledgementsEnabled} from '@queries/servers/post';
import {observeConfigBooleanValue} from '@queries/servers/system';
import {observeCurrentUser} from '@queries/servers/user';
import {mapCustomEmojiNames} from '@utils/emoji/helpers';
import {getTimezone} from '@utils/user';

import PostList from './post_list';

import type {WithDatabaseArgs} from '@typings/database/database';
import type PostModel from '@typings/database/models/servers/post';

const enhancedWithoutPosts = withObservables([], ({database}: WithDatabaseArgs) => {
    const currentUser = observeCurrentUser(database);
    return {
        appsEnabled: observeConfigBooleanValue(database, 'FeatureFlagAppsEnabled'),
        currentTimezone: currentUser.pipe((switchMap((user) => of$(getTimezone(user?.timezone || null))))),
        currentUserId: currentUser.pipe((switchMap((user) => of$(user?.id)))),
        currentUsername: currentUser.pipe((switchMap((user) => of$(user?.username)))),
        customEmojiNames: queryAllCustomEmojis(database).observeWithColumns(['name']).pipe(
            switchMap((customEmojis) => of$(mapCustomEmojiNames(customEmojis))),
        ),
        isPostAcknowledgementEnabled: observeIsPostAcknowledgementsEnabled(database),
        isMilitaryTime: queryDisplayNamePreferences(database).
            observeWithColumns(['value']).pipe(
                map((prefs) => getDisplayNamePreferenceAsBool(prefs, Preferences.USE_MILITARY_TIME)),
            ),
    };
});

const enhanced = withObservables(['posts'], ({database, posts}: {posts: PostModel[]} & WithDatabaseArgs) => {
    const postIds = posts.map((p) => p.id);
    return {
        savedPostIds: observeSavedPostsByIds(database, postIds),
    };
});

export default React.memo(withDatabase(enhancedWithoutPosts(enhanced(PostList))));
