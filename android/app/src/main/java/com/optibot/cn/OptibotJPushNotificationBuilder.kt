package com.optibot.cn

import android.app.Notification
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import cn.jpush.android.api.BasicPushNotificationBuilder
import cn.jpush.android.api.NotificationMessage
import com.mattermost.helpers.CustomPushNotificationHelper

/**
 * JPush 6.x 已移除 BasicPushNotificationBuilder.notificationChannelId。
 * 在构建通知前写入 [NotificationMessage]，使用应用内「新消息通知」HIGH 渠道。
 *
 * 鸿蒙/华为：勿使用 CATEGORY_MESSAGE，否则本地通知会被归入「社交通讯」DEFAULT（无横幅）。
 */
class OptibotJPushNotificationBuilder(context: Context) : BasicPushNotificationBuilder(context) {

    override fun buildNotification(
        context: Context,
        notificationMessage: NotificationMessage,
    ): Notification {
        MessageNotificationChannel.ensureCreated(context)
        applyMessageChannelConfig(notificationMessage)
        return super.buildNotification(context, notificationMessage)
    }

    override fun buildNotification(params: MutableMap<String, String>): Notification {
        ensureChannelOnBuilderMessage()
        return super.buildNotification(params)
    }

    private fun ensureChannelOnBuilderMessage() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return
        }
        val message = notificationMessage
        if (message != null) {
            applyMessageChannelConfig(message)
            return
        }
        notificationMessage = NotificationMessage().apply {
            applyMessageChannelConfig(this)
        }
    }

    private fun applyMessageChannelConfig(notificationMessage: NotificationMessage) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return
        }
        val channelId = CustomPushNotificationHelper.CHANNEL_JPUSH_NEW_MESSAGE_ID
        notificationMessage.notificationChannelId = channelId
        notificationMessage.notificationImportance = NotificationManager.IMPORTANCE_HIGH
        // JPush DefaultPushNotificationBuilder：2 对应 PRIORITY_HIGH
        notificationMessage.notificationPriority = 2
        // 空字符串：避免华为按 IM/CATEGORY_MESSAGE 映射到「社交通讯」DEFAULT
        notificationMessage.notificationCategory = ""
    }
}
