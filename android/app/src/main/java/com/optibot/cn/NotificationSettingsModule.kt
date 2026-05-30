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
            val context = reactApplicationContext.applicationContext
            val activity = reactApplicationContext.currentActivity
            val opened = MessageNotificationChannel.openChannelSettings(context, activity)
            if (opened) {
                promise.resolve(true)
            } else {
                promise.reject("OPEN_FAILED", "Unable to open notification channel settings")
            }
        } catch (e: Exception) {
            promise.reject("OPEN_FAILED", e.message, e)
        }
    }
}
