// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';

import {observeCanDownloadFiles, observeEnableSecureFilePreview} from '@queries/servers/security';
import {observeConfigBooleanValue} from '@queries/servers/system';

import Footer from './footer';

import type {WithDatabaseArgs} from '@typings/database/database';
import type {GalleryItemType} from '@typings/screens/gallery';

type FooterProps = WithDatabaseArgs & {
    item: GalleryItemType;
}

const enhanced = withObservables(['item'], ({database}: FooterProps) => {
    return {
        canDownloadFiles: observeCanDownloadFiles(database),
        enablePublicLink: observeConfigBooleanValue(database, 'EnablePublicLink'),
        enableSecureFilePreview: observeEnableSecureFilePreview(database),
    };
});

export default withDatabase(enhanced(Footer));
