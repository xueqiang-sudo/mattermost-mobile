// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useEffect, useRef, useState} from 'react';

import {doPing} from '@actions/remote/general';
import NetworkManager from '@managers/network_manager';
import {logDebug} from '@utils/log';

const PING_INTERVAL_MS = 30000;
const PING_TIMEOUT_MS = 5000;

export const useServerReachability = (
    serverUrl: string,
    isConnected: boolean | null,
    appState: string,
): boolean | null => {
    const [isReachable, setIsReachable] = useState<boolean | null>(null);
    const isCheckingRef = useRef(false);

    useEffect(() => {
        if (!serverUrl || isConnected === false || appState !== 'active') {
            return undefined;
        }

        let cancelled = false;

        const checkReachability = async () => {
            if (isCheckingRef.current) {
                return;
            }

            isCheckingRef.current = true;
            try {
                let client;
                try {
                    client = NetworkManager.getClient(serverUrl);
                } catch {
                    // Client may not exist yet; doPing will create one.
                }

                const result = await doPing(serverUrl, false, PING_TIMEOUT_MS, undefined, client);
                if (!cancelled) {
                    const reachable = !result.error;
                    setIsReachable(reachable);
                    logDebug('[useServerReachability] ping result', {serverUrl, reachable});
                }
            } finally {
                isCheckingRef.current = false;
            }
        };

        checkReachability();
        const intervalId = setInterval(checkReachability, PING_INTERVAL_MS);

        return () => {
            cancelled = true;
            clearInterval(intervalId);
        };
    }, [serverUrl, isConnected, appState]);

    return isReachable;
};
