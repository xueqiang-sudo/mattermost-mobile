// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {buildQueryString} from '@utils/helpers';

import type ClientBase from './base';

export type AppVersionCheckResponse = {
    update_type: 'none' | 'suggest' | 'force';
    latest_version: string;
    latest_build_number: string;
    min_supported_version: string;
    update_title: string | null;
    update_description: string | null;
    download_url_android: string | null;
    app_store_id_ios: string | null;
    package_name_android: string | null;
    release_date: string | null;
    force_update_until: string | null;
};

export interface ClientUpdateMix {
    checkAppVersion: (platform: string, appVersion: string, buildNumber?: string) => Promise<AppVersionCheckResponse>;
}

const ClientUpdate = <TBase extends Constructor<ClientBase>>(superclass: TBase) => class extends superclass {
    checkAppVersion = async (platform: string, appVersion: string, buildNumber?: string) => {
        const params: Record<string, string> = {
            platform,
            app_version: appVersion,
        };
        if (buildNumber) {
            params.build_number = buildNumber;
        }
        const queryString = buildQueryString(params);
        return this.doFetch(
            `${this.urlVersion}/mobile/app_version_check${queryString}`,
            {method: 'get'},
        );
    };
};

export default ClientUpdate;
