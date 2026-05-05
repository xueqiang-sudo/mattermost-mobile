// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {nativeApplicationVersion, nativeBuildVersion} from 'expo-application';
import {Platform} from 'react-native';

import {storeGlobal} from '@actions/app/global';
import {UPDATE, UPDATE_TYPE, APP_UPDATE_STORE_KEY} from '@constants/update';
import NetworkManager from '@managers/network_manager';
import {getLocalizedMessage} from '@i18n';
import {queryGlobalValue} from '@queries/app/global';
import {dismissOverlay, showOverlay} from '@screens/navigation';
import EphemeralStore from '@store/ephemeral_store';

import type {Client} from '@client/rest';
import type {AppVersionCheckResponse} from '@client/rest/update';

type AppUpdateSkipInfo = {
    skipCount: number;
    lastSkippedVersion: string;
    lastSkipTime: number;
};

/**
 * 从本地存储获取跳过信息
 */
const getSkipInfo = async (): Promise<AppUpdateSkipInfo | null> => {
    try {
        const records = await queryGlobalValue(APP_UPDATE_STORE_KEY)?.fetch();
        if (records?.length && records[0]?.value) {
            return records[0].value;
        }
    } catch {
        // 静默失败
    }
    return null;
};

/**
 * 保存跳过信息到本地存储
 */
const saveSkipInfo = async (info: AppUpdateSkipInfo) => {
    try {
        await storeGlobal(APP_UPDATE_STORE_KEY, info, false);
    } catch {
        // 静默失败
    }
};

/**
 * 检查建议更新是否可以跳过
 */
const canSkipUpdate = async (version: string): Promise<boolean> => {
    const skipInfo = await getSkipInfo();
    if (!skipInfo) {
        return true;
    }

    if (skipInfo.lastSkippedVersion !== version) {
        return true;
    }

    if (skipInfo.skipCount >= UPDATE.SKIP_MAX_COUNT) {
        return false;
    }

    const cooldownMs = UPDATE.SKIP_COOLDOWN_HOURS * 60 * 60 * 1000;
    if (Date.now() - skipInfo.lastSkipTime < cooldownMs) {
        return true;
    }

    return true;
};

/**
 * 记录一次跳过
 */
const recordSkip = async (version: string) => {
    const skipInfo = await getSkipInfo();
    if (skipInfo && skipInfo.lastSkippedVersion === version) {
        skipInfo.skipCount += 1;
        skipInfo.lastSkipTime = Date.now();
    } else {
        const newInfo: AppUpdateSkipInfo = {
            skipCount: 1,
            lastSkippedVersion: version,
            lastSkipTime: Date.now(),
        };
        await saveSkipInfo(newInfo);
        return;
    }
    await saveSkipInfo(skipInfo);
};

/**
 * 伪实现：当后端接口不可用时，使用本地配置进行版本检测
 */
const checkAppVersionMock = (): AppVersionCheckResponse => {
    return {
        status: 'OK',
        data: {
            update_type: 'none',
            latest_version: nativeApplicationVersion || '0.0.0',
            latest_build_number: nativeBuildVersion || '',
            min_supported_version: nativeApplicationVersion || '0.0.0',
            update_title: null,
            update_description: null,
            download_url_android: null,
            app_store_id_ios: null,
            package_name_android: null,
            release_date: null,
            force_update_until: null,
        },
    };
};

/**
 * 跳转到应用商店
 */
const openAppStore = async (responseData: AppVersionCheckResponse['data']) => {
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
 * 显示更新弹窗
 */
const showUpdateOverlay = (updateType: 'suggest' | 'force', responseData: AppVersionCheckResponse['data']) => {
    const title = responseData.update_title ||
        (updateType === UPDATE_TYPE.FORCE
            ? getLocalizedMessage(EphemeralStore.getCurrentLocale(), 'mobile.update.force.title', 'App Update Required')
            : getLocalizedMessage(EphemeralStore.getCurrentLocale(), 'mobile.update.suggest.title', 'New Version Available'));
    const description = responseData.update_description ||
        (updateType === UPDATE_TYPE.FORCE
            ? getLocalizedMessage(EphemeralStore.getCurrentLocale(), 'mobile.update.force.description', 'A new version of the app is available. You must update to continue using this application.')
            : getLocalizedMessage(EphemeralStore.getCurrentLocale(), 'mobile.update.suggest.description', 'A new version of the app is available. Update now to get the latest features and improvements.'));

    const componentId = 'AppUpdateOverlay';
    dismissOverlay(componentId).catch(() => {/* 忽略 */});

    showOverlay(
        'AppUpdate' as any,
        {
            updateType,
            title,
            description,
            latestVersion: responseData.latest_version,
            onUpdate: () => openAppStore(responseData),
            onLater: async () => {
                await recordSkip(responseData.latest_version);
                dismissOverlay(componentId).catch(() => {/* 忽略 */});
            },
            onDismiss: () => {
                dismissOverlay(componentId).catch(() => {/* 忽略 */});
            },
        },
        {
            overlay: {
                interceptTouchOutside: false,
            },
        },
        componentId,
    );
};

/**
 * 检测并处理App版本更新
 * @param serverUrl 当前服务器地址
 * @returns 如果强制更新返回 false 阻止进入首页，否则返回 true
 */
export const checkAndHandleUpdate = async (serverUrl: string): Promise<boolean> => {
    try {
        const currentVersion = nativeApplicationVersion;
        const currentBuild = nativeBuildVersion;
        if (!currentVersion) {
            return true;
        }

        let response: AppVersionCheckResponse;
        try {
            const client: Client = await NetworkManager.getAndCreateClient(serverUrl);
            response = await Promise.race([
                client.checkAppVersion(Platform.OS, currentVersion, currentBuild || undefined),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('timeout')), UPDATE.CHECK_TIMEOUT),
                ),
            ]);
        } catch {
            response = checkAppVersionMock();
        }

        if (!response?.data) {
            return true;
        }

        const {update_type: updateType} = response.data;

        if (updateType === UPDATE_TYPE.NONE) {
            return true;
        }

        if (updateType === UPDATE_TYPE.FORCE) {
            showUpdateOverlay(UPDATE_TYPE.FORCE, response.data);
            return false;
        }

        if (updateType === UPDATE_TYPE.SUGGEST) {
            const canSkip = await canSkipUpdate(response.data.latest_version);
            if (canSkip) {
                showUpdateOverlay(UPDATE_TYPE.SUGGEST, response.data);
            }
        }

        return true;
    } catch {
        return true;
    }
};
