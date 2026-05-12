package com.optibot.rn

import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import com.facebook.react.bridge.*
import java.io.File

/**
 * React Native 原生模块：调用 Android 系统安装器安装 APK 文件
 */
class ApkInstallerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "ApkInstaller"

    /**
     * 使用 Android FileProvider + ACTION_VIEW intent 触发 APK 安装
     * @param filePath APK 文件本地路径（支持 file:// 前缀）
     * @param promise 返回安装 intent 是否成功启动
     */
    @ReactMethod
    fun installApk(filePath: String, promise: Promise) {
        try {
            val file = File(filePath.replace("file://", ""))
            if (!file.exists()) {
                promise.reject("FILE_NOT_FOUND", "APK file not found: $filePath")
                return
            }

            val context = reactApplicationContext
            val apkUri: Uri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.apk_file_provider",
                file
            )

            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(apkUri, "application/vnd.android.package-archive")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }

            context.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("INSTALL_ERROR", "Failed to install APK: ${e.message}", e)
        }
    }
}