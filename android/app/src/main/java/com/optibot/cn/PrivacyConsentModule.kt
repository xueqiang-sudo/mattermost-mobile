package com.optibot.cn

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * 隐私合规：JS 层用户同意隐私政策后的回调模块。
 *
 * 目前仅作为 JS 层同意状态的标记，不再控制原生层的传感器访问。
 * 隐私合规通过隐私政策弹窗在 JS 层控制 SDK 初始化时机。
 */
class PrivacyConsentModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "PrivacyConsent"

    @ReactMethod
    fun allowSensorAccess() {
        // 隐私合规：不再控制原生层传感器访问，仅作为 JS 层标记
        // 实际隐私保护通过 JS 层延迟初始化敏感 SDK 实现
    }
}
