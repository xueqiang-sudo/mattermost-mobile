// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {nativeApplicationVersion, nativeBuildVersion} from 'expo-application';
import {InteractionManager, Platform} from 'react-native';
import {Navigation} from 'react-native-navigation';

import {storeGlobal} from '@actions/app/global';
import LocalConfig from '@assets/config.json';
import {Screens} from '@constants';
import Preferences from '@constants/preferences';
import {UPDATE, UPDATE_TYPE, APP_UPDATE_STORE_KEY} from '@constants/update';
import {getLocalizedMessage} from '@i18n';
import {getActiveServerUrl} from '@init/credentials';
import NetworkManager from '@managers/network_manager';
import {queryGlobalValue} from '@queries/app/global';
import {dismissOverlay, showOverlay} from '@screens/navigation';
import EphemeralStore from '@store/ephemeral_store';
import {logInfo} from '@utils/log';

import type {Client} from '@client/rest';
import type {AppVersionCheckResponse} from '@client/rest/update';
import type {LaunchProps} from '@typings/launch';

/** V2：仅「稍后再说」写入；在抑制时长内且远端/本地版本与点击时一致则抑制建议弹窗 */
type AppUpdateLaterSuppressInfo = {
    laterSuppressAt: number;
    remoteVersionAtLater: string;
    localVersionAtLater: string;
    localBuildAtLater: string;
};

export type LaunchUpdateGateResult = 'continue' | 'abort' | {action: 'suggest'; data: AppVersionCheckResponse};

function parseLaterSuppressInfo(raw: unknown): AppUpdateLaterSuppressInfo | null {
    if (!raw || typeof raw !== 'object') {
        return null;
    }
    const o = raw as Record<string, unknown>;
    if (typeof o.laterSuppressAt !== 'number') {
        return null;
    }
    if (typeof o.remoteVersionAtLater !== 'string' || typeof o.localVersionAtLater !== 'string') {
        return null;
    }
    const localBuildAtLater = typeof o.localBuildAtLater === 'string' ? o.localBuildAtLater : '';
    return {
        laterSuppressAt: o.laterSuppressAt,
        remoteVersionAtLater: o.remoteVersionAtLater,
        localVersionAtLater: o.localVersionAtLater,
        localBuildAtLater,
    };
}

/**
 * 从本地存储读取原始值并解析为 V2；旧版 skipCount/lastSkipTime 等无 laterSuppressAt 时返回 null
 */
const getLaterSuppressInfo = async (): Promise<AppUpdateLaterSuppressInfo | null> => {
    try {
        const records = await queryGlobalValue(APP_UPDATE_STORE_KEY)?.fetch();
        if (records?.length && records[0]?.value !== undefined && records[0]?.value !== null) {
            return parseLaterSuppressInfo(records[0].value);
        }
    } catch {
        // 静默失败
    }
    return null;
};

const saveLaterSuppressInfo = async (info: AppUpdateLaterSuppressInfo) => {
    try {
        await storeGlobal(APP_UPDATE_STORE_KEY, info, false);
    } catch {
        // 静默失败
    }
};

/**
 * 用户点击「稍后再说」：记录抑制起点时间戳与版本快照（远端 + 本地 version/build）
 */
const recordLaterSuppress = async (remoteLatest: string) => {
    const info: AppUpdateLaterSuppressInfo = {
        laterSuppressAt: Date.now(),
        remoteVersionAtLater: remoteLatest,
        localVersionAtLater: nativeApplicationVersion ?? '',
        localBuildAtLater: nativeBuildVersion ?? '',
    };
    await saveLaterSuppressInfo(info);
};

/**
 * 是否应展示建议更新弹窗（true = 展示；false = 抑制窗口内已「稍后再说」且版本未变）
 */
const shouldShowSuggestUpdate = async (remoteLatest: string): Promise<boolean> => {
    const info = await getLaterSuppressInfo();
    if (!info) {
        return true;
    }
    if (Date.now() - info.laterSuppressAt >= UPDATE.SUGGEST_LATER_SUPPRESS_MS) {
        return true;
    }
    if (remoteLatest !== info.remoteVersionAtLater) {
        return true;
    }
    if ((nativeApplicationVersion ?? '') !== info.localVersionAtLater) {
        return true;
    }
    if ((nativeBuildVersion ?? '') !== info.localBuildAtLater) {
        return true;
    }
    return false;
};

/**
 * 跳转到应用商店
 */
const openAppStore = async (responseData: AppVersionCheckResponse) => {
    const {Linking} = require('react-native');
    if (Platform.OS === 'ios') {
        const appStoreId = responseData.app_store_id_ios;
        if (appStoreId) {
            const url = `itms-apps://itunes.apple.com/app/id${appStoreId}`;
            try {
                await Linking.openURL(url);
            } catch {
                try {
                    await Linking.openURL(`https://apps.apple.com/app/id${appStoreId}`);
                } catch {
                    // 静默失败
                }
            }
        }
    } else {
        const packageName = responseData.package_name_android;
        if (packageName) {
            try {
                await Linking.openURL(`market://details?id=${packageName}`);
            } catch {
                const downloadUrl = responseData.download_url_android;
                if (downloadUrl) {
                    try {
                        await Linking.openURL(downloadUrl);
                    } catch {
                        // 静默失败
                    }
                }
            }
        }
    }
};

/**
 * 检测 Android 设备上是否安装了应用商店（可打开 market:// 协议）
 * iOS 平台直接返回 false，不需要此检测
 */
const checkAndroidAppStoreAvailable = async (packageName: string): Promise<boolean> => {
    if (Platform.OS !== 'android') {
        return false;
    }
    if (!packageName) {
        return false;
    }
    try {
        const {Linking} = require('react-native');
        const canOpen = await Linking.canOpenURL(`market://details?id=${packageName}`);
        return canOpen;
    } catch {
        return false;
    }
};

/**
 * 直接打开 APK 下载链接（Android 内部分发场景）
 */
const openApkDownload = async (downloadUrl: string) => {
    const {Linking} = require('react-native');
    if (downloadUrl) {
        try {
            await Linking.openURL(downloadUrl);
        } catch {
            // 静默失败
        }
    }
};

const UPDATE_OVERLAY_COMPONENT_ID = 'AppUpdateOverlay';

let activeUpdateListener: {remove: () => void} | null = null;
let shouldKeepOverlay = false;

/**
 * 清理更新 overlay 监听（用户操作后调用）
 */
const dismissUpdateOverlay = () => {
    shouldKeepOverlay = false;
    if (activeUpdateListener) {
        activeUpdateListener.remove();
        activeUpdateListener = null;
    }
    dismissOverlay(UPDATE_OVERLAY_COMPONENT_ID).catch(() => {/* 忽略 */});
};

/**
 * 内部函数：构建 overlay 的 passProps
 */
const buildOverlayProps = (updateType: 'suggest' | 'force', responseData: AppVersionCheckResponse, hasAppStore: boolean) => {
    const locale = EphemeralStore.getCurrentLocale();
    let title = responseData.update_title ?? '';
    if (!title) {
        if (updateType === UPDATE_TYPE.FORCE) {
            title = getLocalizedMessage(locale, 'mobile.update.force.title', 'App Update Required');
        } else {
            title = getLocalizedMessage(locale, 'mobile.update.suggest.title', 'New Version Available');
        }
    }
    let description = responseData.update_description ?? '';
    if (!description) {
        if (updateType === UPDATE_TYPE.FORCE) {
            description = getLocalizedMessage(locale, 'mobile.update.force.description', 'A new version of the app is available. You must update to continue using this application.');
        } else {
            description = getLocalizedMessage(locale, 'mobile.update.suggest.description', 'A new version of the app is available. Update now to get the latest features and improvements.');
        }
    }

    const baseProps = {
        updateType,
        title,
        description,
        latestVersion: responseData.latest_version,
        theme: EphemeralStore.theme || Preferences.THEMES.denim,
        onLater: async () => {
            await recordLaterSuppress(responseData.latest_version);
            dismissUpdateOverlay();
        },
        onDismiss: () => {
            dismissUpdateOverlay();
        },
    };

    if (Platform.OS === 'android') {
        const downloadUrl = responseData.download_url_android;
        return {
            ...baseProps,
            hasAppStore,
            onUpdate: () => {
                dismissUpdateOverlay();
                openApkDownload(downloadUrl || '');
            },
            onStoreUpdate: hasAppStore ? () => {
                dismissUpdateOverlay();
                openAppStore(responseData);
            } : undefined,
        };
    }

    return {
        ...baseProps,
        onUpdate: () => {
            dismissUpdateOverlay();
            openAppStore(responseData);
        },
    };
};

/**
 * 内部函数：渲染更新 overlay 组件
 */
const renderUpdateOverlayComponent = (updateType: 'suggest' | 'force', responseData: AppVersionCheckResponse, hasAppStore: boolean) => {
    showOverlay(
        Screens.APP_UPDATE,
        buildOverlayProps(updateType, responseData, hasAppStore),
        {
            overlay: {
                interceptTouchOutside: false,
            },
        },
        UPDATE_OVERLAY_COMPONENT_ID,
    );
};

/**
 * 显示更新弹窗（支持 setRoot 后自动重展示，确保在任何页面都会持久显示直到用户手动操作）
 */
export const showUpdateOverlay = async (updateType: 'suggest' | 'force', responseData: AppVersionCheckResponse) => {
    logInfo('[Update] showUpdateOverlay called', {updateType, latestVersion: responseData.latest_version});

    let hasAppStore = false;
    if (Platform.OS === 'android') {
        hasAppStore = await checkAndroidAppStoreAvailable(responseData.package_name_android || '');
        logInfo('[Update] Android app store check', {hasAppStore, packageName: responseData.package_name_android});
    }

    if (activeUpdateListener) {
        activeUpdateListener.remove();
        activeUpdateListener = null;
    }

    shouldKeepOverlay = true;

    // 立即展示 overlay
    renderUpdateOverlayComponent(updateType, responseData, hasAppStore);

    // 延迟注册 listener，避免捕捉到触发本次展示的同一个 setRoot 事件
    setTimeout(() => {
        activeUpdateListener = Navigation.events().registerCommandCompletedListener(({commandName}) => {
            if (commandName === 'setRoot' && shouldKeepOverlay) {
                logInfo('[Update] setRoot completed, re-showing update overlay');
                renderUpdateOverlayComponent(updateType, responseData, hasAppStore);
            }
        });
    }, 200);
};

/**
 * 请求版本策略（仅 app_version_check，不依赖会话接口）
 */
export const fetchAppVersionCheck = async (serverUrl: string): Promise<AppVersionCheckResponse | null> => {
    logInfo('[Update] fetchAppVersionCheck started', {enabled: LocalConfig.EnableAppUpdateCheck});
    if (!LocalConfig.EnableAppUpdateCheck) {
        logInfo('[Update] fetchAppVersionCheck aborted: not enabled');
        return null;
    }

    const currentVersion = nativeApplicationVersion;
    const currentBuild = nativeBuildVersion;
    if (!currentVersion) {
        return null;
    }

    try {
        const client: Client = await NetworkManager.getAndCreateClient(serverUrl);
        const response = await Promise.race([
            client.checkAppVersion(Platform.OS, currentVersion, currentBuild || undefined),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('timeout')), UPDATE.CHECK_TIMEOUT),
            ),
        ]);
        logInfo('[Update] fetchAppVersionCheck response', {hasResponse: Boolean(response), updateType: response?.update_type});
        return response ?? null;
    } catch (error) {
        logInfo('[Update] fetchAppVersionCheck error', {error: error instanceof Error ? error.message : String(error)});
        return null;
    }
};

/**
 * 冷启动版本检测：在 getMe 等会话接口之前调用。
 * 强制更新：先进入 Login 根栈，再展示 Overlay，返回 'abort' 阻止后续启动。
 * 建议更新：返回 {action:'suggest', data} 由调用方在导航完成后展示 Overlay。
 */
export const runLaunchUpdateGate = async (
    serverUrl: string,
    launchProps: LaunchProps,
    resetToLoginForForce: (passProps: LaunchProps) => void | Promise<unknown>,
): Promise<LaunchUpdateGateResult> => {
    logInfo('[Update] runLaunchUpdateGate started', {serverUrl, enabled: LocalConfig.EnableAppUpdateCheck});
    if (!LocalConfig.EnableAppUpdateCheck) {
        logInfo('[Update] runLaunchUpdateGate aborted: not enabled');
        return 'continue';
    }

    const data = await fetchAppVersionCheck(serverUrl);
    logInfo('[Update] runLaunchUpdateGate fetched', {hasData: Boolean(data), updateType: data?.update_type});
    if (!data) {
        logInfo('[Update] runLaunchUpdateGate aborted: no data');
        return 'continue';
    }

    const {update_type: updateType} = data;
    logInfo('[Update] runLaunchUpdateGate updateType', {updateType, noneMatch: updateType === UPDATE_TYPE.NONE, suggestMatch: updateType === UPDATE_TYPE.SUGGEST, forceMatch: updateType === UPDATE_TYPE.FORCE});

    if (updateType === UPDATE_TYPE.NONE) {
        return 'continue';
    }

    if (updateType === UPDATE_TYPE.FORCE) {
        const passProps = {...launchProps, serverUrl};
        await Promise.resolve(resetToLoginForForce(passProps));
        InteractionManager.runAfterInteractions(() => {
            showUpdateOverlay(UPDATE_TYPE.FORCE, data);
        });
        return 'abort';
    }

    if (updateType === UPDATE_TYPE.SUGGEST) {
        const showSuggest = await shouldShowSuggestUpdate(data.latest_version);
        logInfo('[Update] runLaunchUpdateGate suggest', {showSuggest, latestVersion: data.latest_version});
        if (showSuggest) {
            return {action: 'suggest', data};
        }
    }

    return 'continue';
};

/**
 * 手动检查更新（供 About 页面「检查更新」按钮调用）
 * 返回响应数据或 null（请求失败时），调用方自行处理 UI 反馈
 */
export const manualCheckForUpdate = async (): Promise<AppVersionCheckResponse | null> => {
    const serverUrl = await getActiveServerUrl();
    if (!serverUrl) {
        return null;
    }
    return fetchAppVersionCheck(serverUrl);
};
