package com.optibot.cn

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * 原生桥接模块：检查 / 请求 Android 电池优化白名单。
 *
 * 小米 MIUI、华为 EMUI 等国产 ROM 对后台进程有激进的省电策略，
 * 可能导致 WebSocket 断连、WatermelonDB observer 延迟、JPush 推送通道被杀等问题。
 * 将本应用加入电池优化白名单可显著改善在这些设备上的稳定性。
 */
class BatteryOptimizationModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "BatteryOptimization"

    /**
     * 检查当前应用是否已在电池优化白名单中。
     */
    @ReactMethod
    fun isIgnoringBatteryOptimizations(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
                promise.resolve(true)
                return
            }
            val pm = reactContext.getSystemService(PowerManager::class.java)
            val ignoring = pm?.isIgnoringBatteryOptimizations(reactContext.packageName) ?: false
            promise.resolve(ignoring)
        } catch (e: Exception) {
            promise.reject("BATTERY_CHECK_FAILED", e.message, e)
        }
    }

    /**
     * 弹出系统对话框，请求用户将本应用加入电池优化白名单。
     * 需要 AndroidManifest.xml 中声明 REQUEST_IGNORE_BATTERY_OPTIMIZATIONS 权限。
     */
    @ReactMethod
    fun requestIgnoreBatteryOptimizations(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
                promise.resolve(true)
                return
            }
            val pm = reactContext.getSystemService(PowerManager::class.java)
            if (pm?.isIgnoringBatteryOptimizations(reactContext.packageName) == true) {
                promise.resolve(true)
                return
            }
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:${reactContext.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            // 部分 ROM 不支持此 Intent，降级打开电池设置页
            try {
                val fallbackIntent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                reactContext.startActivity(fallbackIntent)
                promise.resolve(true)
            } catch (e2: Exception) {
                promise.reject("BATTERY_REQUEST_FAILED", e2.message, e2)
            }
        }
    }
}
