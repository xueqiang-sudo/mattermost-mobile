import {NativeModules, Platform} from 'react-native';

import {logDebug, logError} from '@utils/log';

const {BatteryOptimization} = NativeModules;

/**
 * 低电量阈值（百分比）
 * 只有电量低于此值时才弹出电池优化提示
 * 避免在电量充足时打扰用户
 */
const LOW_BATTERY_THRESHOLD = 30;

/**
 * 检查是否是需要电池优化白名单的品牌
 * 小米、OPPO、vivo 等品牌的激进省电策略会导致后台进程被杀
 * 华为、三星、Google 等品牌电池管理相对宽松，不需要强制提示
 */
function needsBatteryOptimizationExemption(): boolean {
    if (Platform.OS !== 'android') {
        return false;
    }

    // Platform.constants.Brand 在 Android 上可用
    const brand = (Platform.constants as any)?.Brand?.toLowerCase() || '';
    const manufacturer = (Platform.constants as any)?.Manufacturer?.toLowerCase() || '';

    // 需要电池优化白名单的品牌
    const requiredBrands = [
        'xiaomi', 'redmi', 'poco',  // 小米系
        'oppo', 'realme', 'oneplus',  // OPPO 系（OnePlus 部分机型）
        'vivo', 'iqoo',  // vivo 系
        'meizu',  // 魅族
    ];

    // 华为/荣耀：部分机型需要，但大多数不需要，暂时不加入
    // 'huawei', 'honor'

    return requiredBrands.some(b => brand.includes(b) || manufacturer.includes(b));
}

/**
 * 获取当前电池电量百分比
 * 返回 0-100 之间的数值，如果无法获取则返回 100（假设有电）
 */
async function getBatteryLevel(): Promise<number> {
    if (Platform.OS !== 'android' || !BatteryOptimization?.getBatteryLevel) {
        // 如果没有原生模块支持，默认返回 100（不阻止功能）
        return 100;
    }
    try {
        const level = await BatteryOptimization.getBatteryLevel();
        return typeof level === 'number' ? level : 100;
    } catch (error) {
        logError('[BatteryOptimization] getBatteryLevel failed', error);
        return 100;
    }
}

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
 * 【修复】只在小米、OPPO、vivo 等需要电池优化的品牌上弹出，华为等品牌不弹
 * 【修复】只在低电量时弹出，电量充足不弹
 */
export async function requestBatteryOptimizationExemption(): Promise<void> {
    if (Platform.OS !== 'android' || !BatteryOptimization) {
        return;
    }

    // 【关键修复 1】检查品牌，只在需要电池优化的品牌上弹出
    if (!needsBatteryOptimizationExemption()) {
        const brand = (Platform.constants as any)?.Brand || 'unknown';
        logDebug(`[BatteryOptimization] Brand "${brand}" does not need battery optimization exemption, skipping`);
        return;
    }

    // 【关键修复 2】检查电量，只在低电量时弹出
    const batteryLevel = await getBatteryLevel();
    if (batteryLevel > LOW_BATTERY_THRESHOLD) {
        logDebug(`[BatteryOptimization] Battery level ${batteryLevel}% > ${LOW_BATTERY_THRESHOLD}%, skipping request`);
        return;
    }

    try {
        const alreadyIgnoring = await BatteryOptimization.isIgnoringBatteryOptimizations();
        if (alreadyIgnoring) {
            logDebug('[BatteryOptimization] Already in whitelist, skipping request');
            return;
        }
        await BatteryOptimization.requestIgnoreBatteryOptimizations();
        logDebug(`[BatteryOptimization] Request dialog shown (battery: ${batteryLevel}%)`);
    } catch (error) {
        logError('[BatteryOptimization] request failed', error);
    }
}
