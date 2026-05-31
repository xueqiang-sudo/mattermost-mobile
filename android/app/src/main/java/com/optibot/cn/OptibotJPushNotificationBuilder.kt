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

    companion object {
        /** 固定通知 ID：新消息覆盖旧消息，与微信行为一致 */
        private const val FIXED_MESSAGE_NOTIFICATION_ID = 0x4F50544D // "OPTM"
    }

    override fun buildNotification(
        context: Context,
        notificationMessage: NotificationMessage,
    ): Notification {
        JiguangOptibotLog.i(
            "buildNotification(NotificationMessage) enter title=${notificationMessage.notificationTitle} " +
                "content=${notificationMessage.notificationContent} " +
                "styleBefore=${notificationMessage.notificationStyle} " +
                "inboxBefore=${notificationMessage.notificationInbox != null} " +
                "bigTextBefore=${notificationMessage.notificationBigText != null} " +
                "idBefore=${notificationMessage.notificationId}",
        )
        MessageNotificationChannel.ensureCreated(context)
        applyMessageChannelConfig(notificationMessage)
        val notification = super.buildNotification(context, notificationMessage)
        JiguangOptibotLog.i(
            "buildNotification(NotificationMessage) done notificationId=$FIXED_MESSAGE_NOTIFICATION_ID " +
                "styleAfter=${notificationMessage.notificationStyle} " +
                "channelId=${notificationMessage.notificationChannelId} " +
                "importance=${notificationMessage.notificationImportance} " +
                "priority=${notificationMessage.notificationPriority} " +
                "category=${notificationMessage.notificationCategory}",
        )
        return notification
    }

    override fun buildNotification(params: MutableMap<String, String>): Notification {
        JiguangOptibotLog.i(
            "buildNotification(Map) enter keys=${params.keys} title=${params["n_title"]} content=${params["n_content"]}",
        )
        ensureChannelOnBuilderMessage()
        val notification = super.buildNotification(params)
        JiguangOptibotLog.i("buildNotification(Map) done notificationId=$FIXED_MESSAGE_NOTIFICATION_ID")
        return notification
    }

    private fun ensureChannelOnBuilderMessage() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            JiguangOptibotLog.d("ensureChannelOnBuilderMessage skipped SDK=${Build.VERSION.SDK_INT}")
            return
        }
        val message = notificationMessage
        if (message != null) {
            JiguangOptibotLog.d("ensureChannelOnBuilderMessage reuse existing NotificationMessage")
            applyMessageChannelConfig(message)
            return
        }
        JiguangOptibotLog.d("ensureChannelOnBuilderMessage create new NotificationMessage")
        notificationMessage = NotificationMessage().apply {
            applyMessageChannelConfig(this)
        }
    }

    private fun applyMessageChannelConfig(notificationMessage: NotificationMessage) {
        val styleBefore = notificationMessage.notificationStyle
        val idBefore = notificationMessage.notificationId
        notificationMessage.notificationId = FIXED_MESSAGE_NOTIFICATION_ID
        // 强制默认样式，避免 Inbox/Messaging 样式在同一张卡片内堆叠多条历史消息
        notificationMessage.notificationStyle = 0
        notificationMessage.notificationInbox = null
        notificationMessage.notificationBigText = null
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            JiguangOptibotLog.i(
                "applyMessageChannelConfig SDK<26 id $idBefore->$FIXED_MESSAGE_NOTIFICATION_ID " +
                    "style $styleBefore->0 (no channel on pre-O)",
            )
            return
        }
        val channelId = CustomPushNotificationHelper.CHANNEL_JPUSH_NEW_MESSAGE_ID
        notificationMessage.notificationChannelId = channelId
        notificationMessage.notificationImportance = NotificationManager.IMPORTANCE_HIGH
        // JPush DefaultPushNotificationBuilder：2 对应 PRIORITY_HIGH
        notificationMessage.notificationPriority = 2
        // 空字符串：避免华为按 IM/CATEGORY_MESSAGE 映射到「社交通讯」DEFAULT
        notificationMessage.notificationCategory = ""
        JiguangOptibotLog.i(
            "applyMessageChannelConfig id $idBefore->$FIXED_MESSAGE_NOTIFICATION_ID " +
                "style $styleBefore->0 channelId=$channelId importance=HIGH priority=2 category=\"\"",
        )
    }
}
