package com.optibot.cn

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * 隐私合规模块：跟踪用户是否已同意隐私政策。
 *
 * 在用户同意前，禁止访问敏感数据（如传感器、Android ID 等）。
 */
class PrivacyConsentModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        // 全局同意状态，默认为 false（未同意）
        @Volatile
        var hasUserConsent: Boolean = false
            private set
    }

    override fun getName(): String = "PrivacyConsent"

    @ReactMethod
    fun allowSensorAccess() {
        // 用户已同意隐私政策，允许访问传感器等敏感功能
        hasUserConsent = true
    }

    /**
     * 检查是否已获得用户同意
     */
    fun hasConsent(): Boolean {
        return hasUserConsent
    }
}
