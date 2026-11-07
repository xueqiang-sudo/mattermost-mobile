// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {NativeModules, Platform} from 'react-native';

/**
 * 检查用户是否已同意隐私政策。
 * - Android：读取原生 PrivacyConsentActivity 写入的 SharedPreferences
 * - iOS：不需要隐私弹窗（App Store 无此要求），直接返回 true
 */
export async function hasAcceptedAgreement(): Promise<boolean> {
    try {
        if (Platform.OS === 'android' && NativeModules.PrivacyConsent?.hasAccepted) {
            return await NativeModules.PrivacyConsent.hasAccepted();
        }
        // iOS 和其他平台：无需隐私弹窗
        return true;
    } catch {
        return true;
    }
}

export async function setAcceptedAgreement(): Promise<void> {
    // Android 由原生 PrivacyConsentActivity 处理
    // iOS 无需处理
}
