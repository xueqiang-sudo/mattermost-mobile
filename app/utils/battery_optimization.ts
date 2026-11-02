import {NativeModules, Platform} from 'react-native';

import {logDebug, logError} from '@utils/log';

const {BatteryOptimization} = NativeModules;

/**
 * 检查当前应用是否已在电池优化白名单中。
 * iOS 没有此概念，始终返回 true。
 */
export async function isIgnoringBatteryOptimizations(): Promise<boolean> {
    if (Platform.OS !== 'android' || !BatteryOptimization) {
        return true;
    }
    try {
        return await BatteryOptimization.isIgnoringBatteryOptimizations();
    } catch (error) {
        logError('[BatteryOptimization] isIgnoring check failed', error);
        return false;
    }
}

/**
 * 请求用户将本应用加入电池优化白名单。
 * 仅在 Android 且尚未在白名单中时弹出系统对话框。
 * 小米 MIUI、华为 EMUI 等国产 ROM 的激进省电策略会导致 WebSocket 断连、
 * WatermelonDB observer 延迟等问题，加入白名单可显著改善稳定性。
 */
export async function requestBatteryOptimizationExemption(): Promise<void> {
    if (Platform.OS !== 'android' || !BatteryOptimization) {
        return;
    }
    try {
        const alreadyIgnoring = await BatteryOptimization.isIgnoringBatteryOptimizations();
        if (alreadyIgnoring) {
            logDebug('[BatteryOptimization] Already in whitelist, skipping request');
            return;
        }
        await BatteryOptimization.requestIgnoreBatteryOptimizations();
        logDebug('[BatteryOptimization] Request dialog shown');
    } catch (error) {
        logError('[BatteryOptimization] request failed', error);
    }
}
