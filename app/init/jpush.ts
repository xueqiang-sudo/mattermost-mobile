// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import RNUtils from '@mattermost/rnutils';
import JCore from 'jcore-react-native';
import JPush from 'jpush-react-native';
import {AppState, DeviceEventEmitter, NativeModules, Platform, type AppStateStatus} from 'react-native';

import {openNotification} from '@actions/remote/notifications';
import {Events, Screens} from '@constants';
import {
    buildNotificationFromJPushExtras,
    hasRequiredJPushExtras,
    resolveJPushServerUrl,
} from '@init/jpush_notification';
import {handleInAppNotification} from '@init/push_notifications';
import EphemeralStore from '@store/ephemeral_store';
import NavigationStore from '@store/navigation_store';
import {logDebug, logError, logInfo, logWarning} from '@utils/log';
import {areSystemNotificationsEnabled, JPUSH_NEW_MESSAGE_CHANNEL_ID} from '@utils/notification/message_notification_pref';

const JPUSH_APP_KEY = 'e5e6799b552158d3a1d22d0a';
const JPUSH_CHANNEL = 'developer-default';

const TAG = '[JPushManager]';

const REGISTRATION_ID_RETRY_DELAYS_MS = [0, 800, 2000, 5000, 12000];

/**
 * 极光推送通知事件回调参数形状
 * 来自 jpush-react-native API: addNotificationListener
 */
type JPushNotificationEvent = {
    messageID: string;
    title: string;
    content: string;
    badge: string;
    ring: string;
    extras: Record<string, string>;
    notificationEventType: 'notificationArrived' | 'notificationOpened';
};

class JPushManager {
    private connected = false;
    private registerId = '';
    private initialized = false;
    private listenersAttached = false;
    private registrationRetryTimeouts: Array<ReturnType<typeof setTimeout>> = [];
    private appReady = false;
    private pendingColdStartNotification: JPushNotificationEvent | null = null;
    private loggedIn = false;
    private systemNotificationsEnabled = true;
    private lastNotifyPush: UserNotifyPropsPush | string | undefined;
    private lastUserId = '';

    /** 待 Registration 连接成功后设置的别名（userId） */
    private pendingUserId = '';
    private appLifecycleAttached = false;
    private appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
    private lastAppState: AppStateStatus = AppState.currentState;

    /**
     * 初始化极光推送 SDK
     */
    init() {
        if (this.initialized) {
            logDebug(`${TAG} 已初始化，跳过重复 init`);
            return;
        }

        logInfo(`${TAG} 开始初始化极光推送`, {
            platform: Platform.OS,
            '__DEV__ Value': __DEV__,
            production: !__DEV__,
            appKey: `${JPUSH_APP_KEY.slice(0, 8)}...`,
            channel: JPUSH_CHANNEL,
        });

        if (__DEV__) {
            // API 要求 setLoggerEnable 必须在 init 之前调用
            JPush.setLoggerEnable(true);
            // eslint-disable-next-line no-unused-expressions, @typescript-eslint/no-explicit-any
            JCore && typeof (JCore as any).setLoggerEnable === 'function' && (JCore as any).setLoggerEnable(true);
            logDebug(`${TAG} 已开启极光 SDK 调试日志`);
        }

        try {
            // Android: 后台保持长连接，确保 App 退后台/杀进程也能即时收到推送
            // iOS: 开启后台长连接
            JPush.setBackgroundEnable(true);
            logInfo(`${TAG} 已开启后台长连接`);

            // 必须在 init 之前注册：否则 Android onConnected 可能在 JS 返回前就触发，导致永远收不到「已连接」
            this.setupListeners();

            if (Platform.OS === 'android') {
                const jpushModule = NativeModules.JPushModule as {
                    setChannelAndSound?: (params: {channel: string; channelId: string; sound?: string}) => void;
                } | undefined;
                if (jpushModule?.setChannelAndSound) {
                    jpushModule.setChannelAndSound({
                        channel: '新消息通知',
                        channelId: JPUSH_NEW_MESSAGE_CHANNEL_ID,
                    });
                }
            }

            // Android 忽略参数（从 AndroidManifest.xml meta-data 读取），iOS 使用参数配置
            JPush.init({
                appKey: JPUSH_APP_KEY,
                channel: JPUSH_CHANNEL,
                production: !__DEV__,
            });
            this.initialized = true;
            logInfo(`${TAG} 极光 SDK 初始化成功`);

            // Android：stopPush() 会持久化到下次启动；resume 由 syncForNotifyPush 在权限校验通过后调用
            if (Platform.OS === 'android') {
                logInfo(`${TAG} 设置保留最近通知条数`);
                JPush.setLatestNotificationNumber({notificationMaxNumber: 1});
                const jpushModule = NativeModules.JPushModule as {
                    setLinkMergeEnable?: (enable: boolean) => void;
                } | undefined;
                jpushModule?.setLinkMergeEnable?.(false);
                logInfo(`${TAG} 检查推送接收状态`);
                JPush.isPushStopped((stopped) => {
                    logDebug(`${TAG} 推送接收状态`, {stopped});
                });
                this.logKeepLongConnInBackground();
            }

            this.scheduleRegistrationIdRetries();

            // DeviceEventEmitter 不排队：晚订阅的设置页会错过连接事件，启动后立刻重放当前状态
            setTimeout(() => this.emitStateForListeners(), 0);
        } catch (error) {
            logError(`${TAG} 极光 SDK 初始化失败`, error);
            this.initialized = false;
        }
    }

    /**
     * App 启动时调用：注册前后台监听，并清除通知栏极光通知
     */
    onAppStart() {
        this.attachAppLifecycle();
        this.clearDisplayedNotifications('appStart');
    }

    /**
     * 监听 App 进入前台（含从后台回来），统一清理极光通知栏
     */
    private attachAppLifecycle() {
        if (this.appLifecycleAttached) {
            return;
        }
        this.appLifecycleAttached = true;
        this.lastAppState = AppState.currentState;
        this.appStateSubscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
            if (this.lastAppState !== 'active' && nextState === 'active') {
                this.clearDisplayedNotifications('foreground');
                // eslint-disable-next-line no-void
                void this.syncOnForegroundIfLoggedIn();
            }
            this.lastAppState = nextState;
        });
        logDebug(`${TAG} 已注册 App 前后台监听（进入前台时清理通知）`);
    }

    /**
     * 统一清理系统通知栏中的极光/应用推送通知。
     * JPush.clearAllNotifications 仅清 SDK 内部记录；须配合 RNUtils 清除系统通知中心已投递通知。
     */
    clearDisplayedNotifications(source: 'appStart' | 'foreground' | 'notificationOpened' | 'logout') {
        try {
            if (typeof RNUtils.clearAllDeliveredNotifications === 'function') {
                RNUtils.clearAllDeliveredNotifications();
            } else {
                logWarning(`${TAG} RNUtils.clearAllDeliveredNotifications 不可用，请重新编译原生工程`);
            }
            JPush.clearLocalNotifications();
            JPush.clearAllNotifications();
            if (typeof JPush.setBadge === 'function') {
                JPush.setBadge({badge: 0, appBadge: 0});
            }
            logInfo(`${TAG} 已清除通知栏推送通知`, {source});
        } catch (error) {
            logError(`${TAG} 清除通知栏推送失败`, {source, error});
        }
    }

    private logKeepLongConnInBackground() {
        if (Platform.OS !== 'android') {
            return;
        }
        if (typeof JPush.getKeepLongConnInBackground !== 'function') {
            logWarning(`${TAG} getKeepLongConnInBackground 不可用`);
            return;
        }
        JPush.getKeepLongConnInBackground((result: {keepLongConn?: boolean}) => {
            logInfo(`${TAG} 后台长连接保持状态`, {
                keepLongConn: result?.keepLongConn,
                result,
            });
        });
    }

    /**
     * 将内存中的连接/注册状态再次广播给 JS 监听方（解决页面晚于事件挂载导致一直显示未连接）
     */
    emitStateForListeners() {
        const effectivelyConnected = this.connected || Boolean(this.registerId);
        DeviceEventEmitter.emit(Events.JPUSH_CONNECT_STATUS, {connectEnable: effectivelyConnected});
        if (this.registerId) {
            DeviceEventEmitter.emit(Events.JPUSH_REGISTER_ID, {registerID: this.registerId});
        }
        logDebug(`${TAG} 已重放状态: sdkConnected=${this.connected}, hasRegId=${Boolean(this.registerId)}, effective=${effectivelyConnected}`);
    }

    /**
     * 进入通知管理页时再次向 SDK 拉取 RegistrationID（连接事件可能早于页面订阅）
     */
    refreshRegistrationFromSdk() {
        if (!this.initialized) {
            logWarning(`${TAG} refreshRegistrationFromSdk 跳过：尚未初始化`);
            return;
        }
        this.emitStateForListeners();
        this.scheduleRegistrationIdRetries();
    }

    /**
     * 标记 App 导航已就绪，如有暂存冷启动通知则立即处理
     * 由 launch.ts 在 launchApp 流程末尾调用
     */
    markAppReady() {
        this.appReady = true;
        this.processPendingColdStartNotification('markAppReady');
    }

    /**
     * 获取并清空冷启动暂存通知
     * 由 launch.ts 的 initialLaunch 主动拉取
     */
    getPendingColdStartNotification(): JPushNotificationEvent | null {
        const pending = this.pendingColdStartNotification;
        this.pendingColdStartNotification = null;
        return pending;
    }

    /**
     * 设置登录状态
     * 由 launch.ts 在用户进入 Home 后调用
     */
    setLoggedIn(status: boolean) {
        this.loggedIn = status;
        if (status) {
            this.processPendingColdStartNotification('setLoggedIn');
        }
    }

    isLoggedIn(): boolean {
        return this.loggedIn;
    }

    /**
     * 登出/会话终止时清理极光推送状态：清 alias、停 Android push、清 pending 与通知栏。
     * 保留 registerId 与 initialized，下次登录由 syncForNotifyPush 恢复。
     */
    resetForLogout(source: string) {
        logInfo(`${TAG} resetForLogout`, {source});
        this.loggedIn = false;
        this.pendingUserId = '';
        this.lastUserId = '';
        this.lastNotifyPush = undefined;
        this.pendingColdStartNotification = null;
        EphemeralStore.clearPendingJPushNotification();

        this.clearDisplayedNotifications('logout');

        if (this.initialized) {
            const sequence = Date.now();
            logInfo(`${TAG} 清除用户别名`, {sequence, source});
            JPush.deleteAlias({sequence});
            this.stopPush();
        }
    }

    private clearRegistrationIdRetries() {
        for (const t of this.registrationRetryTimeouts) {
            clearTimeout(t);
        }
        this.registrationRetryTimeouts = [];
    }

    /** RegistrationID 在 init 后常延迟数秒才可用，分段重试拉取 */
    private scheduleRegistrationIdRetries() {
        this.clearRegistrationIdRetries();
        for (const ms of REGISTRATION_ID_RETRY_DELAYS_MS) {
            const handle = setTimeout(() => {
                this.getRegistrationId();
            }, ms);
            this.registrationRetryTimeouts.push(handle);
        }
        logDebug(`${TAG} 已安排 RegistrationID 拉取重试: ${REGISTRATION_ID_RETRY_DELAYS_MS.join(',')}ms`);
    }

    /**
     * 设置极光事件监听
     */
    private setupListeners() {
        if (this.listenersAttached) {
            return;
        }
        this.listenersAttached = true;

        JPush.addConnectEventListener((result) => {
            const status = result.connectEnable ? '已连接' : '未连接';
            logInfo(`${TAG} 极光连接状态变化: ${status}`, result);
            this.connected = result.connectEnable;
            DeviceEventEmitter.emit(Events.JPUSH_CONNECT_STATUS, result);
            if (result.connectEnable) {
                this.getRegistrationId();
            }
        });

        JPush.addNotificationListener((notification: JPushNotificationEvent) => {
            if (!this.systemNotificationsEnabled) {
                logDebug(`${TAG} 系统通知未开启，忽略极光远端通知`, {
                    eventType: notification.notificationEventType,
                });
                return;
            }
            if (!this.loggedIn) {
                logInfo(`${TAG} 未登录，忽略极光远端通知`, {
                    eventType: notification.notificationEventType,
                });
                if (notification.notificationEventType === 'notificationOpened') {
                    this.clearDisplayedNotifications('notificationOpened');
                    this.handleNotificationOpened(notification);
                }
                return;
            }
            logInfo(`${TAG} 收到极光远端通知`, {
                eventType: notification.notificationEventType,
                title: notification.title,
                extras: notification.extras,
            });
            DeviceEventEmitter.emit(Events.JPUSH_NOTIFICATION_EVENT, notification);

            if (notification.notificationEventType === 'notificationOpened') {
                this.clearDisplayedNotifications('notificationOpened');
                this.handleNotificationOpened(notification);
            } else {
                this.handleNotificationArrived(notification);
            }
        });

        logDebug(`${TAG} 事件监听已注册: connectEventListener, notificationListener`);
    }

    /**
     * 处理用户点击通知栏通知事件（notificationOpened）
     * 热启动直接处理；冷启动暂存由 initialLaunch 消费
     */
    private handleNotificationOpened(notification: JPushNotificationEvent) {
        const {extras} = notification;
        if (!extras) {
            logWarning(`${TAG} [handleNotificationOpened] 通知 extras 为空，无法处理`);
            return;
        }

        if (!this.appReady) {
            this.pendingColdStartNotification = notification;
            logInfo(`${TAG} [handleNotificationOpened] 冷启动，暂存通知等待 App 就绪`);
            return;
        }

        if (!this.loggedIn) {
            logInfo(`${TAG} [handleNotificationOpened] 未登录，忽略通知跳转`);
            return;
        }

        // eslint-disable-next-line no-void
        void this.openChannelByExtras(notification);
    }

    private processPendingColdStartNotification(source: 'markAppReady' | 'setLoggedIn') {
        const pending = this.pendingColdStartNotification;
        if (!pending) {
            return;
        }

        if (!this.appReady || !this.loggedIn) {
            logInfo(`${TAG} [${source}] 冷启动通知等待 App 就绪与登录态恢复`, {
                appReady: this.appReady,
                loggedIn: this.loggedIn,
            });
            return;
        }

        logInfo(`${TAG} [${source}] App 就绪且已登录，处理暂存冷启动通知`);
        this.pendingColdStartNotification = null;
        this.handleNotificationOpened(pending);
    }

    /**
     * 通过 extras 打开频道；serverUrl 来自应用配置，不读推送 extras
     */
    private async openChannelByExtras(notification: JPushNotificationEvent) {
        const {extras} = notification;

        if (!hasRequiredJPushExtras(extras, notification.content)) {
            logWarning(`${TAG} [openChannelByExtras] extras 缺少必填字段`, {extras});
            return;
        }

        const serverUrl = await resolveJPushServerUrl();
        if (!serverUrl) {
            logWarning(`${TAG} [openChannelByExtras] 无法解析 serverUrl（CONNECT_URL / DefaultServerUrl / 当前服务器）`);
            return;
        }

        logInfo(`${TAG} [openChannelByExtras]`, {
            serverUrl,
            channelId: extras.channel_id,
            postId: extras.post_id,
        });

        const notificationData = buildNotificationFromJPushExtras(notification, serverUrl);

        const screensInStack = NavigationStore.getScreensInStack();
        const visibleScreen = NavigationStore.getVisibleScreen();
        const isAtLoginOrOnboarding = visibleScreen === Screens.LOGIN ||
            screensInStack.includes(Screens.LOGIN);

        if (isAtLoginOrOnboarding) {
            logInfo(`${TAG} [openChannelByExtras] 当前在登录/引导页，忽略通知跳转`);
            return;
        }

        EphemeralStore.setPendingJPushNotification(serverUrl, notificationData);

        const isAtHome = screensInStack.includes(Screens.HOME);

        if (!isAtHome) {
            logInfo(`${TAG} [openChannelByExtras] 尚未进入 Home，保留暂存通知`);
            return;
        }

        try {
            await openNotification(serverUrl, notificationData);
        } catch (error) {
            logError(`${TAG} [openChannelByExtras] 处理失败`, error);
        } finally {
            EphemeralStore.clearPendingJPushNotification();
        }
    }

    /**
     * 处理通知到达事件（notificationArrived）
     * App 前台：显示 in-app overlay；后台：原生层已展示通知，JS 无需额外处理
     */
    private async handleNotificationArrived(notification: JPushNotificationEvent) {
        const {extras} = notification;
        if (!extras) {
            return;
        }

        if (!this.loggedIn) {
            logDebug(`${TAG} [handleNotificationArrived] 未登录，忽略前台通知`);
            return;
        }

        if (AppState.currentState !== 'active') {
            return;
        }

        if (!hasRequiredJPushExtras(extras, notification.content)) {
            logDebug(`${TAG} [handleNotificationArrived] 前台抵达但 extras 不完整`);
            return;
        }

        const serverUrl = await resolveJPushServerUrl();
        if (!serverUrl) {
            logDebug(`${TAG} [handleNotificationArrived] 无法解析 serverUrl`);
            return;
        }

        logInfo(`${TAG} [handleNotificationArrived] 前台通知到达`, {
            serverUrl,
            channelId: extras.channel_id,
        });

        try {
            const notificationData = buildNotificationFromJPushExtras(notification, serverUrl, {
                userInteraction: false,
                foreground: true,
            });

            await handleInAppNotification(
                serverUrl,
                notificationData as unknown as NotificationWithData,
            );
        } catch (error) {
            logError(`${TAG} [handleNotificationArrived] 前台通知处理失败`, error);
        }
    }

    /**
     * 获取 Registration ID
     */
    private getRegistrationId() {
        JPush.getRegistrationID((result) => {
            if (result.registerID) {
                this.clearRegistrationIdRetries();
                logInfo(`${TAG} 获取 Registration ID 成功: ${result.registerID}`);
                this.registerId = result.registerID;
                DeviceEventEmitter.emit(Events.JPUSH_REGISTER_ID, result);

                // 部分环境下 onConnected 事件未传到 JS，有 RegistrationID 即视为已连上极光
                if (!this.connected) {
                    this.connected = true;
                    DeviceEventEmitter.emit(Events.JPUSH_CONNECT_STATUS, {connectEnable: true});
                }

                this.applyPendingUserAlias();
            } else {
                logDebug(`${TAG} Registration ID 仍为空，将依赖后续重试或连接回调`, result);
            }
        });
    }

    /**
     * 按系统通知权限 + 用户 notify_props.push 同步极光：
     * 权限关闭或 push=none 则停止接收；否则 init/resume 并设置别名
     */
    async syncForNotifyPush(push: UserNotifyPropsPush | string | undefined, userId: string) {
        this.lastNotifyPush = push;

        if (!userId) {
            logWarning(`${TAG} syncForNotifyPush 跳过，缺少 userId`);
            return;
        }
        this.lastUserId = userId;

        logDebug(`${TAG} syncForNotifyPush 开始`, {
            push,
            userId,
            initialized: this.initialized,
        });

        const systemEnabled = await areSystemNotificationsEnabled();
        this.systemNotificationsEnabled = systemEnabled;

        const shouldReceivePush = systemEnabled && push !== 'none';
        logDebug(`${TAG} syncForNotifyPush 决策`, {
            systemEnabled,
            push,
            shouldReceivePush,
        });
        if (!shouldReceivePush) {
            logInfo(`${TAG} 停止接收极光推送`, {
                push,
                systemNotificationsEnabled: systemEnabled,
            });
            this.pendingUserId = '';
            if (this.initialized) {
                this.stopPush();
            }
            return;
        }

        if (!this.initialized) {
            this.init();
        }
        this.resumePush();
        this.pendingUserId = userId;
        this.applyPendingUserAlias();
        logInfo(`${TAG} 已按 notify_props.push 同步极光`, {push, userId, hasRegistration: Boolean(this.registerId)});
    }

    /** 从系统设置返回前台时，对齐 notify_props.push 并重新同步极光 */
    private async syncOnForegroundIfLoggedIn() {
        if (!this.loggedIn || !this.lastUserId) {
            logDebug(`${TAG} syncOnForegroundIfLoggedIn 跳过`, {
                loggedIn: this.loggedIn,
                hasLastUserId: Boolean(this.lastUserId),
            });
            return;
        }
        logDebug(`${TAG} syncOnForegroundIfLoggedIn 重新同步`, {
            push: this.lastNotifyPush,
            userId: this.lastUserId,
        });
        const {syncActiveUserPushWithSystemSettings} = await import('@utils/notification/push_system_sync');
        await syncActiveUserPushWithSystemSettings();
    }

    /**
     * 设置页检测到系统通知权限变化时调用（与 notify_props.push 一并生效）
     */
    async syncForSystemNotificationPermission(push: UserNotifyPropsPush | string | undefined, userId: string) {
        await this.syncForNotifyPush(push, userId);
    }

    /**
     * Registration 连接成功（已取得 RegistrationID）后再设置别名
     */
    private applyPendingUserAlias() {
        if (!this.pendingUserId || !this.initialized) {
            return;
        }
        if (!this.registerId) {
            logDebug(`${TAG} 等待 Registration 连接成功后再设置别名`, {userId: this.pendingUserId});
            return;
        }
        this.setUserAlias(this.pendingUserId);
    }

    /**
     * 设置用户别名，用于定向推送
     * @param userId 用户 ID
     */
    setUserAlias(userId: string) {
        if (!this.initialized) {
            logWarning(`${TAG} setUserAlias 跳过，JPush 尚未初始化`);
            return;
        }
        if (!this.registerId) {
            logWarning(`${TAG} setUserAlias 跳过，Registration 尚未连接成功`);
            return;
        }
        const sequence = Date.now();
        logInfo(`${TAG} 设置用户别名`, {alias: userId, sequence, registerId: this.registerId});
        JPush.setAlias({sequence, alias: userId});
    }

    /**
     * 停止推送服务（仅 Android）
     */
    stopPush() {
        if (Platform.OS === 'android') {
            logInfo(`${TAG} 停止推送服务`);
            JPush.stopPush();
        }
    }

    /**
     * 恢复推送服务（仅 Android）
     */
    resumePush() {
        if (Platform.OS === 'android') {
            logInfo(`${TAG} 恢复推送服务`);
            JPush.resumePush();
        }
    }

    /**
     * 是否已完成极光 SDK 初始化
     */
    isInitialized(): boolean {
        return this.initialized;
    }

    /**
     * 获取连接状态
     */
    isConnected(): boolean {
        return this.connected;
    }

    /**
     * 获取当前 Registration ID
     */
    getCurrentRegisterId(): string {
        return this.registerId;
    }
}

export default new JPushManager();
