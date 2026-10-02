// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useEffect, useState} from 'react';
import {of as of$} from 'rxjs';
import {switchMap, distinctUntilChanged} from 'rxjs/operators';

import {debugLog} from '@store/debug_log';
import {getLoadingTeamChannelsSubject} from '@store/team_load_store';

export const useTeamsLoading = (serverUrl: string) => {
    const subject = getLoadingTeamChannelsSubject(serverUrl);
    const initialValue = subject.getValue() !== 0;
    const [loading, setLoading] = useState(initialValue);

    useEffect(() => {
        debugLog('TEAMS_LOADING', `useTeamsLoading init: subjectValue=${subject.getValue()}, loading=${initialValue}`);
        const sub = getLoadingTeamChannelsSubject(serverUrl).pipe(
            switchMap((v) => of$(v !== 0)),
            distinctUntilChanged(),
        ).subscribe((val) => {
            debugLog('TEAMS_LOADING', `useTeamsLoading changed: loading=${val}`);
            setLoading(val);
        });

        return () => sub.unsubscribe();
    }, []);

    return loading;
};
