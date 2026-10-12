// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {DatabaseProvider} from '@nozbe/watermelondb/react';
import React, {type ComponentType, useEffect, useState} from 'react';

import DeviceInfoProvider from '@context/device';
import ServerProvider from '@context/server';
import ThemeProvider from '@context/theme';
import UserLocaleProvider from '@context/user_locale';
import DatabaseManager from '@database/manager';
import {subscribeActiveServers} from '@database/subscription/servers';
import {debugLog} from '@store/debug_log';
import {secureGetFromRecord} from '@utils/types';

import type {Database} from '@nozbe/watermelondb';
import type ServersModel from '@typings/database/models/app/servers';

type State = {
    database: Database;
    serverUrl: string;
    serverDisplayName: string;
};

export function withServerDatabase<T extends JSX.IntrinsicAttributes>(Component: ComponentType<T>): ComponentType<T> {
    const componentName = Component.displayName || Component.name || 'Unknown';

    return function ServerDatabaseComponent(props: T) {
        const [state, setState] = useState<State | undefined>();

        const observer = (servers: ServersModel[]) => {
            debugLog('withServerDatabase', `[${componentName}] observer called with ${servers?.length || 0} servers`);
            const server = servers?.length ? servers.reduce((a, b) =>
                (b.lastActiveAt > a.lastActiveAt ? b : a),
            ) : undefined;

            if (server) {
                const database =
                    secureGetFromRecord(DatabaseManager.serverDatabases, server.url)?.database;

                if (database) {
                    debugLog('withServerDatabase', `[${componentName}] database ready for ${server.url}`);
                    setState({
                        database,
                        serverUrl: server.url,
                        serverDisplayName: server.displayName,
                    });
                } else {
                    debugLog('withServerDatabase', `[${componentName}] database NOT found for ${server.url}`);
                }
            } else {
                debugLog('withServerDatabase', `[${componentName}] no active server found`);
                setState(undefined);
            }
        };

        useEffect(() => {
            debugLog('withServerDatabase', `[${componentName}] subscribing to active servers`);
            const subscription = subscribeActiveServers(observer);

            return () => {
                subscription?.unsubscribe();
            };
        }, []);

        if (!state?.database) {
            debugLog('withServerDatabase', `[${componentName}] returning null - no database yet`);
            return null;
        }

        return (
            <DatabaseProvider
                database={state.database}
                key={state.serverUrl}
            >
                <DeviceInfoProvider>
                    <UserLocaleProvider database={state.database}>
                        <ServerProvider server={{displayName: state.serverDisplayName, url: state.serverUrl}}>
                            <ThemeProvider>
                                <Component {...props}/>
                            </ThemeProvider>
                        </ServerProvider>
                    </UserLocaleProvider>
                </DeviceInfoProvider>
            </DatabaseProvider>
        );
    };
}
