package com.optibot.cnutils.helpers

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import android.util.Log

/**
 * Open system notification management UI for the current app.
 *
 * Note: Many OEMs expose private Activities for notification settings. We keep
 * this implementation defensive:
 * - try resolveActivity before startActivity
 * - always fall back to standard Settings.ACTION_APP_NOTIFICATION_SETTINGS
 */
object NotificationManagementSettings {
    private const val TAG = "NotificationManagement"

    private fun hasActivity(context: Context, intent: Intent): Boolean {
        return try {
            context.packageManager?.resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY) != null
        } catch (error: Exception) {
            false
        }
    }

    fun openNotificationManagementSettings(context: Context, packageName: String): Boolean {
        val brand = (Build.BRAND ?: "").uppercase()
        val manufacturer = (Build.MANUFACTURER ?: "").uppercase()

        val isHuaweiBrand = brand.contains("HUAWEI") || brand.contains("HONOR") || manufacturer.contains("HUAWEI") || manufacturer.contains("HONOR")
        if (isHuaweiBrand) {
            // Huawei/Honor: open notification management UI via Phone Manager (system private activity).
            // Public docs are not available; we attempt several known extras keys.
            try {
                val intent = Intent().apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    component = ComponentName(
                        "com.huawei.systemmanager",
                        "com.huawei.notificationmanager.ui.NotificationManagmentActivity",
                    )
                    // Best-effort extras (keys differ across versions).
                    putExtra("packageName", packageName)
                    putExtra("app_package", packageName)
                    putExtra("pkg_name", packageName)
                    putExtra("app_uid", context.applicationInfo.uid)
                }

                if (hasActivity(context, intent)) {
                    context.startActivity(intent)
                    return true
                }
            } catch (error: Exception) {
                Log.w(TAG, "Huawei notification management jump failed: ${error.message}")
            }
        }

        val isOppoBrand = brand.contains("OPPO") || brand.contains("ONEPLUS") || brand.contains("REALME") || manufacturer.contains("OPPO")
        if (isOppoBrand) {
            try {
                val intent = Intent().apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    component = ComponentName(
                        "com.coloros.notificationmanager",
                        "com.coloros.notificationmanager.AppDetailPreferenceActivity",
                    )
                    // Known extras key in many ColorOS variants.
                    putExtra("pkg_name", packageName)
                    putExtra("app_package", packageName)
                    putExtra("app_uid", context.applicationInfo.uid)
                }

                if (hasActivity(context, intent)) {
                    context.startActivity(intent)
                    return true
                }
            } catch (error: Exception) {
                Log.w(TAG, "Oppo notification management jump failed: ${error.message}")
            }
        }

        // Default (AOSP / most OEM): open standard app notification settings entry.
        // This is the most compatible fallback; it may map to different UI variants per OEM.
        return try {
            val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
                // Some OEMs use uid/channel-id internally.
                putExtra(Settings.EXTRA_CHANNEL_ID, context.applicationInfo.uid)
            }

            if (hasActivity(context, intent)) {
                context.startActivity(intent)
                true
            } else {
                false
            }
        } catch (error: Exception) {
            Log.w(TAG, "Default notification management jump failed: ${error.message}")
            false
        }
    }
}

