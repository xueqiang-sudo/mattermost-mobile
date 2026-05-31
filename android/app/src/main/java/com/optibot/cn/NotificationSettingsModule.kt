package com.optibot.cn

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class NotificationSettingsModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "NotificationSettings"

    @ReactMethod
    fun openMessageChannelSettings(promise: Promise) {
        try {
            JiguangOptibotLog.i("NotificationSettings.openMessageChannelSettings")
            val context = reactApplicationContext.applicationContext
            val activity = reactApplicationContext.currentActivity
            val opened = MessageNotificationChannel.openChannelSettings(context, activity)
            if (opened) {
                JiguangOptibotLog.i("NotificationSettings.openMessageChannelSettings success")
                promise.resolve(true)
            } else {
                JiguangOptibotLog.w("NotificationSettings.openMessageChannelSettings failed")
                promise.reject("OPEN_FAILED", "Unable to open notification channel settings")
            }
        } catch (e: Exception) {
            JiguangOptibotLog.e("NotificationSettings.openMessageChannelSettings exception", e)
            promise.reject("OPEN_FAILED", e.message, e)
        }
    }
}
