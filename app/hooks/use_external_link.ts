// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useMemo} from 'react';

export type ExternalLinkQueryParams = {
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_content?: string;
    userId?: string;
}

type StateProps = {
    userId: string;
    telemetryId: string;
    isCloud: boolean;
}

export function useExternalLink(
    _stateProps: StateProps,
    href: string,
    _location: string = '',
    _overwriteQueryParams: ExternalLinkQueryParams = {},
): [string, Record<string, string>] {
    return useMemo(() => {
        return [href || '', {}];
    }, [href]);
}
