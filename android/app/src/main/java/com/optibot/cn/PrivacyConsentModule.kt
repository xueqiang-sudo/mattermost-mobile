package com.optibot.cn

import android.content.Context
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * 隐私合规模块：跟踪用户是否已同意隐私政策。
 *
 * 同意状态通过 SharedPreferences 持久化（由 PrivacyConsentActivity 写入）。
 * React Native 只在用户同意后才启动，所以这里始终是 true。
 * 保留此模块供 JS 层调用以保持兼容。
 */
class PrivacyConsentModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        // 内存缓存，用于快速访问
        @Volatile
        var hasUserConsent: Boolean = false
            private set
    }

    override fun getName(): String = "PrivacyConsent"

    override fun initialize() {
        super.initialize()
        // 从 SharedPreferences 读取同意状态
        hasUserConsent = reactContext
            .getSharedPreferences(PrivacyConsentActivity.PREF_NAME, Context.MODE_PRIVATE)
            .getBoolean(PrivacyConsentActivity.KEY_CONSENT, false)
    }

    @ReactMethod
    fun allowSensorAccess() {
        hasUserConsent = true
    }

    /**
     * JS 层调用：检查是否已获得用户同意（读取 SharedPreferences）
     */
    @ReactMethod
    fun hasAccepted(promise: com.facebook.react.bridge.Promise) {
        val accepted = reactContext
            .getSharedPreferences(PrivacyConsentActivity.PREF_NAME, Context.MODE_PRIVATE)
            .getBoolean(PrivacyConsentActivity.KEY_CONSENT, false)
        hasUserConsent = accepted
        promise.resolve(accepted)
    }

    fun hasConsent(): Boolean {
        return hasUserConsent
    }
}
