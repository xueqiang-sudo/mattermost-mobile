// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import LocalConfig from '@assets/config.json';
import {CallsManager} from '@calls/calls_manager';
import {ContactService} from '@client/rest';
import EmployeeContactService from '@client/rest/employee_contact';
import DatabaseManager from '@database/manager';
import {getAllServerCredentials} from '@init/credentials';
import {initialLaunch} from '@init/launch';
import ManagedApp from '@init/managed_app';
import PushNotifications from '@init/push_notifications';
import GlobalEventHandler from '@managers/global_event_handler';
import NetworkManager from '@managers/network_manager';
import SecurityManager from '@managers/security_manager';
import SessionManager from '@managers/session_manager';
import WebsocketManager from '@managers/websocket_manager';
import {registerScreens} from '@screens/index';
import {registerNavigationListeners, resetToStartupLoading} from '@screens/navigation';
import EphemeralStore from '@store/ephemeral_store';
import NavigationStore from '@store/navigation_store';
import VoiceRecorder from '@mattermost/voice-recorder';
import {logDebug, logError} from '@utils/log';

// Controls whether the main initialization (database, etc...) is done, either on app launch
// or on the Share Extension, for example.
let baseAppInitialized = false;

let serverCredentials: ServerCredential[];

// Fallback Polyfill for Promise.allSettle
Promise.allSettled = Promise.allSettled || (<T>(promises: Array<Promise<T>>) => Promise.all(
    promises.map((p) => p.
        then((value) => ({
            status: 'fulfilled',
            value,
        })).
        catch((reason) => ({
            status: 'rejected',
            reason,
        })),
    ),
));

export async function initialize() {
    if (!baseAppInitialized) {
        baseAppInitialized = true;

        await ContactService.init(LocalConfig.ContactServiceUrl, LocalConfig.ContactServiceApiKey);
        await EmployeeContactService.init(LocalConfig.ContactServiceUrl, LocalConfig.ContactServiceApiKey);

        serverCredentials = await getAllServerCredentials();
        const serverUrls = serverCredentials.map((credential) => credential.serverUrl);

        await DatabaseManager.init(serverUrls);
        await NetworkManager.init(serverCredentials);
        await SecurityManager.init();

        GlobalEventHandler.init();
        ManagedApp.init();
        SessionManager.init();
        CallsManager.initialize();
    }
}

export async function start() {
    // Clean relevant information on ephemeral stores
    NavigationStore.reset();
    EphemeralStore.setCurrentThreadId('');
    EphemeralStore.setProcessingNotification('');

    registerNavigationListeners();
    registerScreens();
    await resetToStartupLoading();

    await initialize();

    // 清理临时录音文件
    try {
        logDebug('[app.start] 开始清理临时录音文件');
        const deletedCount = await VoiceRecorder.cleanExpiredRecordingFiles('c_voice_asr_', 86400000); // 24小时
        logDebug(`[app.start] 清理完成，删除了 ${deletedCount} 个临时录音文件`);
    } catch (error) {
        logError('[app.start] 清理临时录音文件失败', error);
    }

    PushNotifications.init(serverCredentials.length > 0);

    await WebsocketManager.init(serverCredentials);

    initialLaunch();
}
