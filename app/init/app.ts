// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import LocalConfig from '@assets/config.json';
import {CallsManager} from '@calls/calls_manager';
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
import {clearCachedUpdateApk} from '@utils/file/apk_download';
import {logDebug, logError} from '@utils/log';
import JPushManager from '@init/jpush';

// Controls whether the main initialization (database, etc...) is done, either on app launch
// or on the Share Extension, for example.
let baseAppInitialized = false;
const DEBUG_PANEL_OVERLAY_ID = 'debug_panel_overlay';

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

    // Initialize debug panel console interceptor as early as possible so logs during
    // app startup are captured. The overlay is shown after RNN is ready (see below).
    if (__DEBUG_PANEL__) {
        const {initConsoleInterceptor} = require('@utils/debug_logger');
        initConsoleInterceptor();
    }

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

    try {
        await clearCachedUpdateApk();
        logDebug('[app.start] 已清理缓存的更新 APK');
    } catch (error) {
        logError('[app.start] 清理缓存更新 APK 失败', error);
    }

    PushNotifications.init(serverCredentials.length > 0);
    JPushManager.init();

    await WebsocketManager.init(serverCredentials);

    initialLaunch();

    // Show debug panel overlay after RNN has rendered the initial screen.
    // The 1500ms delay gives RNN time to complete its first layout before we push an overlay.
    if (__DEBUG_PANEL__) {
        setTimeout(() => {
            const {Navigation} = require('react-native-navigation');
            const {Screens} = require('@constants');
            Navigation.dismissOverlay(DEBUG_PANEL_OVERLAY_ID).catch(() => {
                // ignore if overlay does not exist yet
            });
            Navigation.showOverlay({
                component: {
                    id: DEBUG_PANEL_OVERLAY_ID,
                    name: Screens.DEBUG_PANEL,
                    options: {
                        overlay: {interceptTouchOutside: false},
                        layout: {
                            backgroundColor: 'transparent',
                            componentBackgroundColor: 'transparent',
                        },
                    },
                },
            });
        }, 1500);
    }
}
