// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';

import {observeIsPlaybooksEnabled} from '@playbooks/database/queries/version';

import CategoriesList from './categories_list';

import type {WithDatabaseArgs} from '@typings/database/database';

const enchanced = withObservables([], ({database}: WithDatabaseArgs) => {
    const playbooksEnabled = observeIsPlaybooksEnabled(database);

    return {
        playbooksEnabled,
    };
});

export default withDatabase(enchanced(CategoriesList));
