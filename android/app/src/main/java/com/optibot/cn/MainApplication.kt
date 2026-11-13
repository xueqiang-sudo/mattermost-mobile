package com.optibot.cn


import android.annotation.SuppressLint
import android.content.Context
import android.content.res.Configuration
import com.mattermost.helpers.CustomPushNotificationHelper
import com.facebook.react.PackageList
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.load
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.react.soloader.OpenSourceMergedSoMapping
import com.facebook.react.modules.network.OkHttpClientProvider
import com.facebook.soloader.SoLoader
import com.mattermost.networkclient.RCTOkHttpClientFactory
import com.optibot.cnshare.helpers.RealPathUtil
import com.mattermost.turbolog.TurboLog
import com.mattermost.turbolog.ConfigureOptions
import cn.jpush.android.api.JPushInterface
import com.nozbe.watermelondb.jsi.JSIInstaller
import com.nozbe.watermelondb.jsi.WatermelonDBJSIPackage
import com.reactnativenavigation.NavigationApplication
import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ReactNativeHostWrapper
import expo.modules.image.okhttp.ExpoImageOkHttpClientGlideModule
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainApplication : NavigationApplication() {
    private var listenerAdded = false

    companion object {
        @Volatile
        var isSdkInitialized: Boolean = false
            private set

        // 隐私合规：原生层日志文件（JS 层启动时读取并合并到 debugLog）
        private const val NATIVE_LOG_FILE = "native_privacy.log"
        private val timeFormat = SimpleDateFormat("HH:mm:ss.SSS", Locale.getDefault())

        /**
         * 原生层日志：写入文件，供 JS 层读取。
         * 用于在 React Native 初始化前记录关键步骤。
         */
        fun nativeLog(context: Context, tag: String, message: String) {
            val time = timeFormat.format(Date())
            val line = "[$time] [$tag] $message\n"
            try {
                val logFile = File(context.cacheDir, NATIVE_LOG_FILE)
                logFile.appendText(line)
            } catch (e: Exception) {
                // 写文件失败不影响主流程
            }
            // 同时输出到 logcat
            android.util.Log.i(tag, message)
        }
    }

    override val reactNativeHost: ReactNativeHost =
        ReactNativeHostWrapper(this,
            object : DefaultReactNativeHost(this) {
                override fun getPackages(): List<ReactPackage> =
                    PackageList(this).packages.apply {
                        // Packages that cannot be autolinked yet can be added manually here, for example:
                        // add(MyReactNativePackage())
                        add(WatermelonDBJSIPackage())
                        add(QRCodeScannerPackage())
                        add(ApkInstallerPackage())
                        add(LogcatBridgePackage())
                        add(BatteryOptimizationPackage())
                        add(PrivacyConsentPackage())
                    }

                override fun getJSMainModuleName(): String = "index"

                override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

                override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
                override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
            })

    override val reactHost: ReactHost
        get() = getDefaultReactHost(applicationContext, reactNativeHost)

    override fun onCreate() {
        super.onCreate()

        // 崩溃保护：捕获未处理的异常
        val defaultHandler = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            nativeLog(this, "CrashHandler", "未捕获异常: ${throwable.message}")
            nativeLog(this, "CrashHandler", "堆栈: ${throwable.stackTraceToString()}")
            // 调用默认处理器让系统处理崩溃
            defaultHandler?.uncaughtException(thread, throwable)
        }

        // 隐私合规：检查用户是否已同意隐私政策
        val hasConsent = getSharedPreferences(PrivacyConsentActivity.PREF_NAME, MODE_PRIVATE)
            .getBoolean(PrivacyConsentActivity.KEY_CONSENT, false)

        // 验证日志：标记 Application.onCreate 执行时机
        nativeLog(this, "PrivacyVerify", "=== Application.onCreate === hasConsent=$hasConsent")

        if (hasConsent) {
            // 用户已同意，立即初始化 SDK
            nativeLog(this, "PrivacyVerify", "=== 用户已同意，立即初始化 SDK ===")
            initializeSdk()
        } else {
            // 用户未同意时不初始化任何 SDK，等待 PrivacyConsentActivity 调用 initializeSdk()
            nativeLog(this, "PrivacyVerify", "=== 用户未同意，SDK 初始化已延迟 ===")
        }
    }

    /**
     * 初始化 SDK（仅在用户同意隐私政策后调用）
     * 隐私合规：此方法中的 SDK 会收集设备信息，必须在用户同意后才能初始化
     */
    fun initializeSdk() {
        if (isSdkInitialized) {
            nativeLog(this, "PrivacyVerify", "=== SDK 已初始化，跳过重复调用 ===")
            return
        }

        nativeLog(this, "PrivacyVerify", "=== 开始初始化 SDK（用户已同意） ===")

        try {
            // Delete any previous temp files created by the app
            val tempFolder = File(applicationContext.cacheDir, RealPathUtil.CACHE_DIR_NAME)
            RealPathUtil.deleteTempFiles(tempFolder)
            nativeLog(this, "PrivacyVerify", "清理临时缓存目录: ${tempFolder.absolutePath}")

            TurboLog.configure(options = ConfigureOptions(logsDirectory = applicationContext.cacheDir.absolutePath + "/logs", logPrefix = applicationContext.packageName))
            nativeLog(this, "PrivacyVerify", "TurboLog.configure 完成")

            TurboLog.i("ReactNative", "Cleaning temp cache " + tempFolder.absolutePath)

            // Tells React Native to use our RCTOkHttpClientFactory which builds an OKHttpClient
            // with a cookie jar defined in APIClientModule and an interceptor to intercept all
            // requests that originate from React Native's OKHttpClient
            nativeLog(this, "PrivacyVerify", "初始化 OkHttpClient...")
            OkHttpClientProvider.setOkHttpClientFactory(RCTOkHttpClientFactory())
            nativeLog(this, "PrivacyVerify", "OkHttpClient 初始化完成")

            nativeLog(this, "PrivacyVerify", "初始化 ExpoImageOkHttpClient...")
            ExpoImageOkHttpClientGlideModule.okHttpClient = RCTOkHttpClientFactory().createNewNetworkModuleClient()
            nativeLog(this, "PrivacyVerify", "ExpoImageOkHttpClient 初始化完成")

            nativeLog(this, "PrivacyVerify", "初始化 SoLoader...")
            SoLoader.init(this, OpenSourceMergedSoMapping)
            nativeLog(this, "PrivacyVerify", "SoLoader 初始化完成")

            nativeLog(this, "PrivacyVerify", "设置通知渠道...")
            setupNotificationChannels()
            nativeLog(this, "PrivacyVerify", "通知渠道设置完成")

            // 注册自定义通知构建器：使用 HIGH 渠道 + 固定通知 ID + 禁用堆叠
            // 必须在通知渠道创建之后、JPush SDK 初始化之前注册
            nativeLog(this, "PrivacyVerify", "注册 JPush 通知构建器...")
            try {
                JPushInterface.setDefaultPushNotificationBuilder(
                    OptibotJPushNotificationBuilder(this)
                )
                nativeLog(this, "PrivacyVerify", "JPush 通知构建器注册完成")
            } catch (e: Exception) {
                nativeLog(this, "PrivacyVerify", "JPush 通知构建器注册失败: ${e.message}")
            }

            if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
                // If you opted-in for the New Architecture, we load the native entry point for this app.
                nativeLog(this, "PrivacyVerify", "加载新架构入口点...")
                load(bridgelessEnabled = false)
                nativeLog(this, "PrivacyVerify", "新架构入口点加载完成")
            }

            nativeLog(this, "PrivacyVerify", "初始化 ApplicationLifecycleDispatcher...")
            ApplicationLifecycleDispatcher.onApplicationCreate(this)
            nativeLog(this, "PrivacyVerify", "ApplicationLifecycleDispatcher 初始化完成")

            isSdkInitialized = true
            nativeLog(this, "PrivacyVerify", "=== SDK 初始化全部完成 ===")
        } catch (e: Exception) {
            // 崩溃保护：记录错误但不让应用崩溃
            nativeLog(this, "PrivacyVerify", "!!! SDK 初始化失败: ${e.message}")
            nativeLog(this, "PrivacyVerify", "!!! 堆栈: ${e.stackTraceToString()}")
            // 即使失败也标记为已初始化，避免重复调用导致更多问题
            isSdkInitialized = true
        }
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
    }

    /** 初始化通知渠道：创建基本的 HIGH 和 MIN 渠道（JPush 初始化已移至 JS 层用户同意后执行） */
    private fun setupNotificationChannels() {
        TurboLog.i("ReactNative", "setupNotificationChannels start")
        // 仅创建通知渠道，不初始化 JPush SDK（隐私合规：用户同意前不初始化 SDK）
        CustomPushNotificationHelper.createNotificationChannels(this)
        TurboLog.i(
            "ReactNative",
            "setupNotificationChannels done (JPush builder deferred to JS layer)",
        )
    }

    @SuppressLint("VisibleForTests")
    private fun runOnJSQueueThread(action: () -> Unit) {
        reactNativeHost.reactInstanceManager.currentReactContext?.runOnJSQueueThread {
            action()
        } ?: UiThreadUtil.runOnUiThread {
            reactNativeHost.reactInstanceManager.currentReactContext?.runOnJSQueueThread {
                action()
            }
        }
    }
}
