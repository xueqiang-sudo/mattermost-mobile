package com.optibot.cn

import cn.jpush.android.api.NotificationMessage
import java.util.zip.Adler32
import kotlin.math.abs

/**
 * 与 JPush SDK [cn.jpush.android.x.b#a(cn.jpush.android.d.d)] 一致的 notificationId 算法。
 * SDK 展示通知时使用该 ID，而非 NotificationMessage.notificationId。
 */
object JPushNotificationIdHelper {

    @JvmStatic
    fun compute(message: NotificationMessage): Int {
        val messageId = message.msgId?.trim().orEmpty()
        return compute(messageId)
    }

    @JvmStatic
    fun compute(messageId: String): Int {
        if (messageId.isEmpty()) {
            return 0
        }
        return try {
            val parsed = messageId.toInt()
            if (parsed >= 0) parsed else abs(parsed)
        } catch (_: NumberFormatException) {
            val adler = Adler32()
            adler.update(messageId.toByteArray())
            abs(adler.value.toInt())
        }
    }
}
