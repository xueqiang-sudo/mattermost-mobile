// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {CONNECT_URL} from '@env';
import Emm from '@mattermost/react-native-emm';
import {Alert, AppState, DeviceEventEmitter, Linking, Platform} from 'react-native';
import {Notifications} from 'react-native-notifications';

import {removePost} from '@actions/local/post';
import {terminateSession} from '@actions/local/session';
import {switchToChannelById} from '@actions/remote/channel';
import {appEntry, pushNotificationEntry, upgradeEntry} from '@actions/remote/entry';
import {openNotification} from '@actions/remote/notifications';
import {logout} from '@actions/remote/session';
import {fetchAndSwitchToThread} from '@actions/remote/thread';
import {runLaunchUpdateGate, showUpdateOverlay} from '@actions/remote/update';
import LocalConfig from '@assets/config.json';
import {DeepLink, Events, Launch, PushNotification} from '@constants';
import {PostTypes} from '@constants/post';
import DatabaseManager from '@database/manager';
import {getActiveServerUrl, getServerCredentials, removeServerCredentials} from '@init/credentials';
import JPushManager from '@init/jpush';
import {
    buildNotificationFromJPushExtras,
    resolveJPushServerUrl,
} from '@init/jpush_notification';
import {getAutoClient} from '@managers/network_manager';
import PerformanceMetricsManager from '@managers/performance_metrics_manager';
import {getLastViewedChannelIdAndServer, getOnboardingViewed, getLastViewedThreadIdAndServer} from '@queries/app/global';
import {getAllServers} from '@queries/app/servers';
import {queryPostsByType} from '@queries/servers/post';
import {getThemeForCurrentTeam} from '@queries/servers/preference';
import {getCurrentUserId} from '@queries/servers/system';
import {queryMyTeams} from '@queries/servers/team';
import {getCurrentUser} from '@queries/servers/user';
import {resetToHome, resetToLogin, resetToTeams, resetToOnboarding} from '@screens/navigation';
import EphemeralStore from '@store/ephemeral_store';
import {getLaunchPropsFromDeepLink, handleDeepLink} from '@utils/deep_link';
import {setMessageNotificationEnabled} from '@utils/notification/message_notification_pref';
import {logError, logInfo} from '@utils/log';
import {getNotificationProps} from '@utils/user';
import {convertToNotificationData} from '@utils/notification';
import {removeProtocol} from '@utils/url';

import type {DeepLinkWithData, LaunchProps} from '@typings/launch';

const initialNotificationTypes = [PushNotification.NOTIFICATION_TYPE.MESSAGE, PushNotification.NOTIFICATION_TYPE.SESSION];

export const initialLaunch = async () => {
    logInfo('[Launch.startup] initialLaunch started');
    const deepLinkUrl = await Linking.getInitialURL();
    if (deepLinkUrl) {
        logInfo('[Launch.startup] Launch from deeplink', {deepLinkUrl});
        return launchAppFromDeepLink(deepLinkUrl, true);
    }

    const notification = await Notifications.getInitialNotification();
    let tapped = Platform.select({android: true, ios: false})!;
    if (Platform.OS === 'ios' && notification) {
        // when a notification is received on iOS, getInitialNotification, will return the notification
        // as the app will initialized cause we are using background fetch,
        // that does not necessarily mean that the app was opened cause of the notification was tapped.
        // Here we are going to dettermine if the notification still exists in NotificationCenter to determine if
        // the app was opened because of a tap or cause of the background fetch init
        const delivered = await Notifications.ios.getDeliveredNotifications();
        tapped = delivered.find((d) => (d as unknown as NotificationData).ack_id === notification?.payload.ack_id) == null;
    }
    if (initialNotificationTypes.includes(notification?.payload?.type) && tapped) {
        logInfo('[Launch.startup] Launch from notification', {type: notification?.payload?.type});
        const notificationData = convertToNotificationData(notification!);
        EphemeralStore.setProcessingNotification(notificationData.identifier);
        return launchAppFromNotification(notificationData, true);
    }

    const jpushNotification = JPushManager.getPendingColdStartNotification();
    if (jpushNotification) {
        logInfo('[Launch.startup] Launch from JPush notification');
        const serverUrl = await resolveJPushServerUrl();
        if (!serverUrl) {
            logInfo('[Launch.startup] JPush 冷启动：无法从配置解析 serverUrl，走普通启动');
            return launchApp({launchType: Launch.Normal, coldStart: true});
        }
        const notificationData = buildNotificationFromJPushExtras(jpushNotification, serverUrl);
        EphemeralStore.setProcessingNotification(notificationData.identifier);
        return launchAppFromNotification(notificationData, true);
    }

    const coldStart = notification ? (tapped || AppState.currentState === 'active') : true;
    logInfo('[Launch.startup] Launch as normal flow', {coldStart});
    return launchApp({launchType: Launch.Normal, coldStart});
};

const launchAppFromDeepLink = async (deepLinkUrl: string, coldStart = false) => {
    const props = getLaunchPropsFromDeepLink(deepLinkUrl, coldStart);
    return launchApp(props);
};

const launchAppFromNotification = async (notification: NotificationWithData, coldStart = false) => {
    const props = await getLaunchPropsFromNotification(notification, coldStart);
    return launchApp(props);
};

/**
 *
 * @param props set of properties used to determine how to launch the app depending on the containing values
 * @param resetNavigation used when loading the add_server screen and remove all the navigation stack

 * @returns a redirection to a screen, either onboarding, add_server, login or home depending on the scenario
 */
export const launchApp = async (props: LaunchProps) => {
    logInfo('[Launch.startup] launchApp entered', {
        launchType: props?.launchType,
        hasExtra: Boolean(props?.extra),
        launchError: Boolean(props?.launchError),
        hasServerUrlInProps: Boolean(props?.serverUrl),
    });
    let serverUrl: string | undefined;
    switch (props?.launchType) {
        case Launch.DeepLink:
            if (props.extra && props.extra.type !== DeepLink.Invalid) {
                const extra = props.extra as DeepLinkWithData;
                const existingServer = DatabaseManager.searchUrl(extra.data!.serverUrl);
                serverUrl = existingServer;
                props.serverUrl = serverUrl || extra.data?.serverUrl;
                if (extra.type === DeepLink.MagicLink && extra.data && 'token' in extra.data) {
                    const result = await handleDeepLink(extra);
                    if (result.error) {
                        props.launchError = true;
                    } else {
                        return '';
                    }
                } else if (!serverUrl && extra.type !== DeepLink.Server) {
                    props.launchError = true;
                } else if (extra.type === DeepLink.Server) {
                    if (removeProtocol(serverUrl) === extra.data?.serverUrl) {
                        props.extra = undefined;
                        props.launchType = Launch.Normal;
                    } else {
                        serverUrl = await getActiveServerUrl();
                    }
                }
            }
            break;
        case Launch.Notification: {
            serverUrl = props.serverUrl;
            const extra = props.extra as NotificationWithData;
            const sessionExpiredNotification = Boolean(props.serverUrl && extra.payload?.type === PushNotification.NOTIFICATION_TYPE.SESSION);
            if (sessionExpiredNotification) {
                DeviceEventEmitter.emit(Events.SESSION_EXPIRED, serverUrl);
                return '';
            }
            break;
        }
        default:
            // serverUrl = await getActiveServerUrl()
            // qgs: 写死服务器地址
            serverUrl = CONNECT_URL || LocalConfig.DefaultServerUrl;
            logInfo('[Launch.startup] Using configured startup server url', {serverUrl});
            break;
    }

    if (props.launchError && !serverUrl) {
        serverUrl = await getActiveServerUrl();
    }

    logInfo('[Launch.startup] Scheduling ephemeral post cleanup');
    cleanupEphemeralPosts();

    let suggestUpdateData: {updateType: 'suggest'; responseData: import('@client/rest/update').AppVersionCheckResponse} | null = null;

    if (serverUrl) {
        logInfo('[Launch.startup] App version gate before session APIs', {serverUrl});
        const updateGate = await runLaunchUpdateGate(serverUrl, props, resetToLogin);
        logInfo('[Launch.startup] updateGate result', {updateGate, isAbort: updateGate === 'abort', isObject: typeof updateGate === 'object'});
        if (updateGate === 'abort') {
            logInfo('[Launch.startup] Force update: showing overlay on login root');
            return '';
        }
        if (typeof updateGate === 'object' && updateGate.action === 'suggest') {
            logInfo('[Launch.startup] Setting suggestUpdateData', {version: updateGate.data.latest_version});
            suggestUpdateData = {updateType: 'suggest', responseData: updateGate.data};
        } else {
            logInfo('[Launch.startup] No suggest update data', {isString: typeof updateGate === 'string'});
        }

        logInfo('[Launch.startup] Validating startup credentials', {serverUrl});
        let hasCredentials = Boolean(await getServerCredentials(serverUrl));
        const myUser = await (await getAutoClient(serverUrl)).getMe().catch(() => null);
        if (!(myUser && myUser.nickname)) {
            hasCredentials = false;
            logInfo('not exist user launchToLogin', Boolean(myUser));
            await logout(serverUrl, undefined, {skipServerLogout: true, skipEvents: true}).then(() => logInfo('logout success')).catch((errTmp) => logInfo('logout error', errTmp));
            await terminateSession(serverUrl, false).catch((errTmp) => logInfo('terminateSession error', errTmp));
        }

        if (hasCredentials) {
            logInfo('exist user launchToHome', myUser && myUser.nickname);
            const database = DatabaseManager.serverDatabases[serverUrl]?.database;
            let hasCurrentUser = false;
            if (database) {
                EphemeralStore.theme = await getThemeForCurrentTeam(database);
                const currentUserId = await getCurrentUserId(database);
                hasCurrentUser = Boolean(currentUserId);
            }

            let launchType = props.launchType;
            if (!hasCurrentUser) {
                // migrating from v1
                if (launchType === Launch.Normal) {
                    launchType = Launch.Upgrade;
                }

                const result = await upgradeEntry(serverUrl);
                if (result.error) {
                    Alert.alert(
                        'Error Upgrading',
                        `An error occurred while upgrading the app to the new version.\n\nDetails: ${result.error}\n\nThe app will now quit.`,
                        [{
                            text: 'OK',
                            onPress: async () => {
                                await DatabaseManager.destroyServerDatabase(serverUrl!);
                                await removeServerCredentials(serverUrl!);
                                Emm.exitApp();
                            },
                        }],
                    );
                    return '';
                }
            }

            const homeResult = launchToHome({...props, launchType, serverUrl});
            if (suggestUpdateData) {
                homeResult.then(() => {
                    logInfo('[Launch.startup] Showing suggest update overlay after launchToHome');
                    showUpdateOverlay(suggestUpdateData!.updateType, suggestUpdateData!.responseData);
                });
            }
            return homeResult;
        }
    }

    logInfo('[Launch.startup] Checking onboarding viewed state', LocalConfig.ShowOnboarding);
    const onboardingViewed = LocalConfig.ShowOnboarding && await getOnboardingViewed();

    // if the config value is set and the onboarding has not been seeing yet, show the onboarding
    if (LocalConfig.ShowOnboarding && !onboardingViewed) {
        logInfo('[Launch.startup] Routing to onboarding');
        return resetToOnboarding(props);
    }

    logInfo('[Launch.startup] Routing to login', {serverUrl});
    const loginResult = resetToLogin({...props, serverUrl});
    if (suggestUpdateData) {
        Promise.resolve(loginResult).then(() => {
            logInfo('[Launch.startup] Showing suggest update overlay after resetToLogin');
            showUpdateOverlay(suggestUpdateData!.updateType, suggestUpdateData!.responseData);
        });
    }
    return loginResult;
};

const syncJPushAfterLogin = async (serverUrl: string) => {
    try {
        const database = DatabaseManager.serverDatabases[serverUrl]?.database;
        if (!database) {
            return;
        }

        const user = await getCurrentUser(database);
        const userId = user?.id;
        if (!userId) {
            return;
        }

        const {push} = getNotificationProps(user);
        logInfo('[Launch.syncJPushAfterLogin] push', push);
        await setMessageNotificationEnabled(push !== 'none');
        JPushManager.syncForNotifyPush(push, userId);
    } catch (error) {
        logError('[Launch.syncJPushAfterLogin]', error);
    }
};

/** 登录后进入 Home 前同步 JPush（含消息通知开关与 alias） */
export const prepareJPushAfterLogin = async (serverUrl: string) => {
    JPushManager.markAppReady();
    JPushManager.setLoggedIn(true);
    await syncJPushAfterLogin(serverUrl);
};

export const launchToHome = async (props: LaunchProps) => {
    logInfo('[Launch.launchToHome] launchToHome', props);
    if (props.serverUrl) {
        await prepareJPushAfterLogin(props.serverUrl);
    } else {
        JPushManager.markAppReady();
        JPushManager.setLoggedIn(true);
    }

    let openPushNotification = false;

    switch (props.launchType) {
        case Launch.DeepLink: {
            appEntry(props.serverUrl!);
            break;
        }
        case Launch.Notification: {
            const extra = props.extra as NotificationWithData;
            openPushNotification = Boolean(props.serverUrl && !props.launchError && extra.userInteraction && extra.payload?.channel_id && !extra.payload?.userInfo?.local);
            if (openPushNotification) {
                await resetToHome(props);
                return pushNotificationEntry(props.serverUrl!, extra.payload!, 'Notification');
            }

            appEntry(props.serverUrl!);
            break;
        }
        case Launch.Normal:
            if (props.coldStart) {
                const lastViewedChannel = await getLastViewedChannelIdAndServer();
                const lastViewedThread = await getLastViewedThreadIdAndServer();

                if (lastViewedThread && lastViewedThread.server_url === props.serverUrl && lastViewedThread.thread_id) {
                    PerformanceMetricsManager.setLoadTarget('THREAD');
                    fetchAndSwitchToThread(props.serverUrl!, lastViewedThread.thread_id, false, undefined, true);
                } else if (lastViewedChannel && lastViewedChannel.server_url === props.serverUrl && lastViewedChannel.channel_id) {
                    PerformanceMetricsManager.setLoadTarget('CHANNEL');
                    switchToChannelById(props.serverUrl!, lastViewedChannel.channel_id);
                } else {
                    PerformanceMetricsManager.setLoadTarget('HOME');
                }

                appEntry(props.serverUrl!);
            }
            break;
    }

    let nTeams = 0;
    if (props.serverUrl) {
        const database = DatabaseManager.serverDatabases[props.serverUrl]?.database;
        if (database) {
            nTeams = await queryMyTeams(database).fetchCount();
        }
    }

    if (nTeams) {
        logInfo('Launch app in Home screen');
        const homeResult = await resetToHome(props);
        const pending = EphemeralStore.getPendingJPushNotification();
        if (pending) {
            EphemeralStore.clearPendingJPushNotification();
            openNotification(pending.serverUrl, pending.notification).catch(
                (error) => logError('[Launch.launchToHome] pending JPush notification failed', error),
            );
        }
        return homeResult;
    }

    logInfo('Launch app in Select Teams screen');
    return resetToTeams();
};

export const relaunchApp = (props: LaunchProps) => {
    return launchApp(props);
};

export const getLaunchPropsFromNotification = async (notification: NotificationWithData, coldStart = false): Promise<LaunchProps> => {
    const launchProps: LaunchProps = {
        launchType: Launch.Notification,
        coldStart,
    };

    const {payload} = notification;
    launchProps.extra = notification;
    let serverUrl: string | undefined;

    try {
        if (payload?.server_url) {
            DatabaseManager.getServerDatabaseAndOperator(payload.server_url);
            serverUrl = payload.server_url;
        } else if (payload?.server_id) {
            serverUrl = await DatabaseManager.getServerUrlFromIdentifier(payload.server_id);
        } else {
            serverUrl = CONNECT_URL || LocalConfig.DefaultServerUrl;
        }
    } catch {
        launchProps.launchError = true;
    }

    if (!serverUrl) {
        serverUrl = await getActiveServerUrl();
    }

    if (serverUrl) {
        launchProps.serverUrl = serverUrl;
    } else {
        launchProps.launchError = true;
    }

    return launchProps;
};

export async function cleanupEphemeralPosts() {
    const servers = await getAllServers();

    for (const server of servers) {
        const database = DatabaseManager.serverDatabases[server.url]?.database;
        if (!database) {
            continue;
        }
        /* eslint-disable-next-line no-await-in-loop */
        const posts = await queryPostsByType(database, PostTypes.EPHEMERAL).fetch();
        posts.forEach((post) => removePost(server.url, post));
    }
}
