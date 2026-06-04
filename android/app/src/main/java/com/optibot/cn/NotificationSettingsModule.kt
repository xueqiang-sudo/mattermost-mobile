package com.optibot.cn

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class NotificationSettingsModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "NotificationSettings"

    @ReactMethod
    fun syncNotificationChannels(promise: Promise) {
        try {
            JiguangOptibotLog.i("NotificationSettings.syncNotificationChannels start")
            val context = reactApplicationContext.applicationContext
            MessageNotificationChannel.ensureAppNotificationChannels(context)
            MessageNotificationChannel.purgeNonWhitelistedChannelsOnce(context)
            JiguangOptibotLog.i("NotificationSettings.syncNotificationChannels success")
            promise.resolve(true)
        } catch (e: Exception) {
            JiguangOptibotLog.e("NotificationSettings.syncNotificationChannels exception", e)
            promise.reject("SYNC_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun openAppNotificationSettings(promise: Promise) {
        try {
            val context = reactApplicationContext.applicationContext
            val activity = reactApplicationContext.currentActivity
            JiguangOptibotLog.i(
                "NotificationSettings.openAppNotificationSettings start " +
                    "hasActivity=${activity != null}",
            )
            val opened = MessageNotificationChannel.openAppNotificationSettings(context, activity)
            if (opened) {
                JiguangOptibotLog.i("NotificationSettings.openAppNotificationSettings success")
                promise.resolve(true)
            } else {
                JiguangOptibotLog.w("NotificationSettings.openAppNotificationSettings failed")
                promise.reject("OPEN_FAILED", "Unable to open app notification settings")
            }
        } catch (e: Exception) {
            JiguangOptibotLog.e("NotificationSettings.openAppNotificationSettings exception", e)
            promise.reject("OPEN_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun getResolvedMessageChannelId(promise: Promise) {
        try {
            val context = reactApplicationContext.applicationContext
            MessageNotificationChannel.ensureAppNotificationChannels(context)
            val channelId = MessageNotificationChannel.resolveMessageChannelId(context)
            promise.resolve(channelId)
        } catch (e: Exception) {
            JiguangOptibotLog.e("NotificationSettings.getResolvedMessageChannelId exception", e)
            promise.reject("CHANNEL_ID_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun isHuaweiLikeDevice(promise: Promise) {
        promise.resolve(MessageNotificationChannel.isHuaweiLikeDevice())
    }

    @ReactMethod
    fun openMessageChannelSettings(promise: Promise) {
        try {
            JiguangOptibotLog.i("NotificationSettings.openMessageChannelSettings")
            val context = reactApplicationContext.applicationContext
            val activity = reactApplicationContext.currentActivity
            val opened = MessageNotificationChannel.openChannelSettings(context, activity)
            JiguangOptibotLog.i("NotificationSettings.openMessageChannelSettings result=$opened")
            promise.resolve(opened)
        } catch (e: Exception) {
            JiguangOptibotLog.e("NotificationSettings.openMessageChannelSettings exception", e)
            promise.resolve(false)
        }
    }
}
