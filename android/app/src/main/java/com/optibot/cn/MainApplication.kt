package com.optibot.cn


import android.annotation.SuppressLint
import android.content.res.Configuration
import cn.jpush.android.api.JPushInterface
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
import com.nozbe.watermelondb.jsi.JSIInstaller
import com.nozbe.watermelondb.jsi.WatermelonDBJSIPackage
import com.reactnativenavigation.NavigationApplication
import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ReactNativeHostWrapper
import expo.modules.image.okhttp.ExpoImageOkHttpClientGlideModule
import java.io.File

class MainApplication : NavigationApplication() {
    private var listenerAdded = false

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

        // Delete any previous temp files created by the app
        val tempFolder = File(applicationContext.cacheDir, RealPathUtil.CACHE_DIR_NAME)
        RealPathUtil.deleteTempFiles(tempFolder)
        TurboLog.configure(options = ConfigureOptions(logsDirectory = applicationContext.cacheDir.absolutePath + "/logs", logPrefix = applicationContext.packageName))

        TurboLog.i("ReactNative", "Cleaning temp cache " + tempFolder.absolutePath)

        // Tells React Native to use our RCTOkHttpClientFactory which builds an OKHttpClient
        // with a cookie jar defined in APIClientModule and an interceptor to intercept all
        // requests that originate from React Native's OKHttpClient
        OkHttpClientProvider.setOkHttpClientFactory(RCTOkHttpClientFactory())
        ExpoImageOkHttpClientGlideModule.okHttpClient = RCTOkHttpClientFactory().createNewNetworkModuleClient()

        SoLoader.init(this, OpenSourceMergedSoMapping)
        setupNotificationChannels()
        if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
            // If you opted-in for the New Architecture, we load the native entry point for this app.
            load(bridgelessEnabled = false)
        }
        ApplicationLifecycleDispatcher.onApplicationCreate(this)
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
    }

    /** 初始化通知渠道：创建基本的 HIGH 和 MIN 渠道，设置 JPush 默认通知构建器 */
    private fun setupNotificationChannels() {
        TurboLog.i("ReactNative", "setupNotificationChannels start")
        CustomPushNotificationHelper.createNotificationChannels(this)
        JPushInterface.setDefaultPushNotificationBuilder(OptibotJPushNotificationBuilder(this))
        TurboLog.i(
            "ReactNative",
            "setupNotificationChannels done jpushBuilder=${OptibotJPushNotificationBuilder::class.java.simpleName} " +
                "channelId=${CustomPushNotificationHelper.CHANNEL_JPUSH_NEW_MESSAGE_ID}",
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
