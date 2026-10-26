// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {fetchConfigAndLicense} from '@actions/remote/systems';
import {startBackgroundSync} from '@actions/remote/channel_sync';
import DatabaseManager from '@database/manager';
import {getServerCredentials} from '@init/credentials';
import IntuneManager from '@managers/intune_manager';
import PerformanceMetricsManager from '@managers/performance_metrics_manager';
import SecurityManager from '@managers/security_manager';
import WebsocketManager from '@managers/websocket_manager';
import {debugLog} from '@store/debug_log';

type AfterLoginArgs = {
    serverUrl: string;
}

export async function loginEntry({serverUrl}: AfterLoginArgs): Promise<{error?: unknown}> {
    const operator = DatabaseManager.serverDatabases[serverUrl]?.operator;
    if (!operator) {
        return {error: `${serverUrl} database not found`};
    }

    // There are cases where the target may be reset and a performance metric
    // be added after login. This would be done with a wrong value, so we make
    // sure we don't do this by skipping the load metric here.
    PerformanceMetricsManager.skipLoadMetric();

    // But still we want to log the TTI
    PerformanceMetricsManager.startTimeToInteraction();

    try {
        // Use maxRetries=2 to ensure DiagnosticId is fetched reliably
        const clData = await fetchConfigAndLicense(serverUrl, false, undefined, 2);
        if (clData.error) {
            return {error: clData.error};
        }
        debugLog('loginEntry', `Config and license fetched - hasDiagnosticId: ${Boolean(clData.config?.DiagnosticId)}`);

        const credentials = await getServerCredentials(serverUrl);
        if (credentials?.token) {
            const intunePolicy = await IntuneManager.getPolicy(serverUrl);
            SecurityManager.addServer(serverUrl, clData.config, false, intunePolicy);
            WebsocketManager.createClient(serverUrl, credentials.token, credentials.preauthSecret);
            await WebsocketManager.initializeClient(serverUrl, 'Login');

            // 启动后台全量异步增量同步（不阻塞登录流程）
            debugLog('loginEntry', 'Starting background message sync');
            startBackgroundSync(serverUrl).catch(err => {
                debugLog('loginEntry', `Background sync failed: ${err}`);
                // 不阻塞登录流程
            });
        }

        return {};
    } catch (error) {
        return {error};
    }
}
