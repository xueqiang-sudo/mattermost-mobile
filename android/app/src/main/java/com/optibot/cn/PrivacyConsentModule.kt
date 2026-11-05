package com.optibot.cn

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * 隐私合规：JS 层用户同意隐私政策后，调用此模块解锁传感器访问。
 *
 * 在此之前，MainApplication.getSystemService 会对 SENSOR_SERVICE 返回 null，
 * 阻止 React Native 在用户同意前读取传感器列表。
 */
class PrivacyConsentModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "PrivacyConsent"

    @ReactMethod
    fun allowSensorAccess() {
        MainApplication.sensorAccessAllowed = true
    }
}
