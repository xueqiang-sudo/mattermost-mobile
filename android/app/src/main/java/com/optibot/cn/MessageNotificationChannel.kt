package com.optibot.cn

import android.app.Activity
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationChannelGroup
import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationCompat
import com.mattermost.helpers.CustomPushNotificationHelper

/**
 * 「新消息通知」系统通知渠道：创建、鸿蒙/华为兼容与跳转系统设置。
 * 渠道 ID 与 [CustomPushNotificationHelper.CHANNEL_JPUSH_NEW_MESSAGE_ID] 保持一致。
 *
 * 鸿蒙 4.x（Android 兼容层）：IM 类推送若走 HMS「社交通讯」分类，系统默认 IMPORTANCE_DEFAULT，无横幅。
 * 须使用自建 HIGH 渠道，且 JPush 通知勿带 CATEGORY_MESSAGE（见 [OptibotJPushNotificationBuilder]）。
 */
object MessageNotificationChannel {

    const val CHANNEL_NAME = "新消息通知"
    private const val CHANNEL_GROUP_ID = "optibot_message_group"
    private const val CHANNEL_GROUP_NAME = "消息通知"
    private const val PRIME_NOTIFICATION_ID = 0x4F50544E // "OPTN"
    private const val PREFS_NAME = "optibot_notification_channel"
    private const val PREF_PRIMED_SUFFIX = "_primed"

    private val LEGACY_CHANNEL_IDS = listOf(
        "jpush_new_message",
        "jpush_new_message_v2",
        "jpush_new_message_v3",
        "jpush_new_message_v4",
        "channel_01",
    )

    /** 华为/鸿蒙上需 HIGH 才有「横幅通知」；创建后不可再编程降级。 */
    private fun messageChannelImportance(): Int = NotificationManager.IMPORTANCE_HIGH

    @JvmStatic
    fun ensureCreated(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return
        }

        val notificationManager =
            context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        for (legacyId in LEGACY_CHANNEL_IDS) {
            notificationManager.deleteNotificationChannel(legacyId)
        }

        purgeHuaweiSocialChannels(notificationManager)

        val channelId = CustomPushNotificationHelper.CHANNEL_JPUSH_NEW_MESSAGE_ID
        val existing = notificationManager.getNotificationChannel(channelId)
        if (existing != null && existing.importance >= messageChannelImportance()) {
            return
        }

        if (existing != null) {
            notificationManager.deleteNotificationChannel(channelId)
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val group = NotificationChannelGroup(CHANNEL_GROUP_ID, CHANNEL_GROUP_NAME)
            notificationManager.createNotificationChannelGroup(group)
        }

        val channel = NotificationChannel(channelId, CHANNEL_NAME, messageChannelImportance())
        channel.description = CHANNEL_NAME
        channel.setShowBadge(true)
        channel.enableVibration(true)
        channel.enableLights(true)
        channel.lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            channel.group = CHANNEL_GROUP_ID
        }

        val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        val audioAttributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        channel.setSound(soundUri, audioAttributes)

        notificationManager.createNotificationChannel(channel)
    }

    /**
     * 鸿蒙/HMS 在收到 IM 推送后会创建「社交通讯」低优先级渠道；删除以免设置页落到该分类。
     */
    private fun purgeHuaweiSocialChannels(notificationManager: NotificationManager) {
        val keepIds = setOf(
            CustomPushNotificationHelper.CHANNEL_JPUSH_NEW_MESSAGE_ID,
            CustomPushNotificationHelper.CHANNEL_MIN_IMPORTANCE_ID,
        )
        for (channel in notificationManager.notificationChannels) {
            if (channel.id in keepIds) {
                continue
            }
            val name = channel.name?.toString() ?: ""
            if (name == CHANNEL_NAME) {
                continue
            }
            if (name.contains("社交通讯") || name.contains("社交") ||
                name.contains("社交通信") || name.contains("通信") ||
                name.contains("消息") || name.equals("social", ignoreCase = true) ||
                name.contains("social_communication", ignoreCase = true) ||
                name.contains("social messaging", ignoreCase = true) ||
                name.contains("im", ignoreCase = true) && name.length <= 6 ||
                name.equals("message", ignoreCase = true) ||
                name.contains("notification", ignoreCase = true) && name.length <= 15
            ) {
                notificationManager.deleteNotificationChannel(channel.id)
                continue
            }
            if (channel.id.contains("social", ignoreCase = true) ||
                channel.id.contains("im_", ignoreCase = true) ||
                channel.id.contains("huawei", ignoreCase = true)
            ) {
                notificationManager.deleteNotificationChannel(channel.id)
                continue
            }
            if (channel.importance < NotificationManager.IMPORTANCE_HIGH) {
                notificationManager.deleteNotificationChannel(channel.id)
            }
        }
    }

    /**
     * 每次收到推送通知后调用，清理 HMS 可能新创建的「社交通讯」渠道。
     * 保持系统通知设置中始终显示「新消息通知」而非 HMS 默认分类。
     */
    @JvmStatic
    fun purgeOnNotificationReceived(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return
        }
        try {
            val notificationManager =
                context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            purgeHuaweiSocialChannels(notificationManager)
        } catch (_: Exception) {
        }
    }

    /**
     * 首次安装后向自建 HIGH 渠道发一条瞬时通知并取消，促使鸿蒙/华为在系统设置中注册该渠道（含横幅项）。
     */
    @JvmStatic
    fun primeIfNeeded(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return
        }
        ensureCreated(context)

        val channelId = CustomPushNotificationHelper.CHANNEL_JPUSH_NEW_MESSAGE_ID
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val prefKey = channelId + PREF_PRIMED_SUFFIX
        if (prefs.getBoolean(prefKey, false)) {
            return
        }

        val notificationManager =
            context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channel = notificationManager.getNotificationChannel(channelId) ?: return
        if (channel.importance < messageChannelImportance()) {
            return
        }

        try {
            val notification = NotificationCompat.Builder(context, channelId)
                .setSmallIcon(R.mipmap.ic_notification)
                .setContentTitle(CHANNEL_NAME)
                .setContentText(" ")
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_STATUS)
                .setAutoCancel(true)
                .setTimeoutAfter(1)
                .build()
            notificationManager.notify(PRIME_NOTIFICATION_ID, notification)
            notificationManager.cancel(PRIME_NOTIFICATION_ID)
            prefs.edit().putBoolean(prefKey, true).apply()
        } catch (_: Exception) {
            // 忽略：渠道已创建即可，prime 为增强项
        }
    }

    @JvmStatic
    fun resolveMessageChannelId(context: Context): String {
        ensureCreated(context)
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return CustomPushNotificationHelper.CHANNEL_JPUSH_NEW_MESSAGE_ID
        }

        val notificationManager =
            context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val canonicalId = CustomPushNotificationHelper.CHANNEL_JPUSH_NEW_MESSAGE_ID

        notificationManager.getNotificationChannel(canonicalId)?.let { channel ->
            if (channel.importance >= messageChannelImportance()) {
                return canonicalId
            }
        }

        for (channel in notificationManager.notificationChannels) {
            if (channel.name?.toString() == CHANNEL_NAME &&
                channel.importance >= messageChannelImportance()
            ) {
                return channel.id
            }
        }

        return canonicalId
    }

    @JvmStatic
    fun openChannelSettings(context: Context, activity: Activity? = null): Boolean {
        ensureCreated(context)
        primeIfNeeded(context)
        purgeOnNotificationReceived(context)

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return openAppNotificationSettings(context, activity)
        }

        val channelId = resolveMessageChannelId(context)
        val channelIntents = buildChannelSettingsIntents(context, channelId)

        for (intent in channelIntents) {
            if (tryStartSettings(context, activity, intent)) {
                return true
            }
        }

        // 渠道设置 Intent 全部失败，回退前再次清理 HMS 渠道
        purgeOnNotificationReceived(context)
        return openAppNotificationSettings(context, activity)
    }

    private fun buildChannelSettingsIntents(context: Context, channelId: String): List<Intent> {
        val pkg = context.packageName
        val baseFlags = Intent.FLAG_ACTIVITY_NEW_TASK
        val intents = mutableListOf<Intent>()

        // 标准 Android / 鸿蒙兼容层
        intents.add(
            Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS).apply {
                putExtra(Settings.EXTRA_APP_PACKAGE, pkg)
                putExtra(Settings.EXTRA_CHANNEL_ID, channelId)
                addFlags(baseFlags)
            },
        )
        intents.add(
            Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS).apply {
                putExtra("android.provider.extra.APP_PACKAGE", pkg)
                putExtra("android.provider.extra.CHANNEL_ID", channelId)
                addFlags(baseFlags)
            },
        )
        intents.add(
            Intent("android.settings.CHANNEL_NOTIFICATION_SETTINGS").apply {
                putExtra(Settings.EXTRA_APP_PACKAGE, pkg)
                putExtra(Settings.EXTRA_CHANNEL_ID, channelId)
                putExtra("app_package", pkg)
                putExtra("app_uid", context.applicationInfo.uid)
                putExtra("channel_id", channelId)
                addFlags(baseFlags)
            },
        )

        // APP_NOTIFICATION_SETTINGS 带渠道参数：部分华为/鸿蒙版本会路由到渠道页
        intents.add(
            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                putExtra(Settings.EXTRA_APP_PACKAGE, pkg)
                putExtra(Settings.EXTRA_CHANNEL_ID, channelId)
                putExtra("android.provider.extra.CHANNEL_ID", channelId)
                putExtra(":settings:fragment_args_key", channelId)
                addFlags(baseFlags)
            },
        )
        intents.add(
            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                putExtra(Settings.EXTRA_APP_PACKAGE, pkg)
                putExtra("app_package", pkg)
                putExtra("channel_id", channelId)
                putExtra("notification_channel_id", channelId)
                addFlags(baseFlags)
            },
        )

        // 鸿蒙 4.x / EMUI 常用设置 Activity
        intents.add(
            Intent().apply {
                component = ComponentName(
                    "com.android.settings",
                    "com.android.settings.notification.NotificationChannelSettingsActivity",
                )
                putExtra(Settings.EXTRA_APP_PACKAGE, pkg)
                putExtra(Settings.EXTRA_CHANNEL_ID, channelId)
                putExtra("android.provider.extra.APP_PACKAGE", pkg)
                putExtra("android.provider.extra.CHANNEL_ID", channelId)
                addFlags(baseFlags)
            },
        )
        intents.add(
            Intent().apply {
                component = ComponentName(
                    "com.android.settings",
                    "com.android.settings.Settings\$NotificationAppSettingsActivity",
                )
                putExtra(Settings.EXTRA_APP_PACKAGE, pkg)
                putExtra(Settings.EXTRA_CHANNEL_ID, channelId)
                putExtra(":settings:fragment_args_key", channelId)
                addFlags(baseFlags)
            },
        )
        intents.add(
            Intent().apply {
                component = ComponentName(
                    "com.huawei.systemmanager",
                    "com.huawei.notificationmanager.ui.notificationbar.AppNotificationSettingsActivity",
                )
                putExtra("packageName", pkg)
                putExtra("channelId", channelId)
                putExtra(Settings.EXTRA_CHANNEL_ID, channelId)
                addFlags(baseFlags)
            },
        )
        intents.add(
            Intent().apply {
                component = ComponentName(
                    "com.huawei.systemmanager",
                    "com.huawei.notificationmanager.ui.NotificationManagerActivity",
                )
                putExtra("packageName", pkg)
                putExtra("channelId", channelId)
                putExtra("currentChannelId", channelId)
                addFlags(baseFlags)
            },
        )

        return intents
    }

    private fun tryStartSettings(context: Context, activity: Activity?, intent: Intent): Boolean {
        val host = activity ?: context
        if (intent.resolveActivity(host.packageManager) == null) {
            return false
        }
        return try {
            if (activity != null) {
                activity.startActivity(intent)
            } else {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(intent)
            }
            true
        } catch (_: Exception) {
            false
        }
    }

    private fun openAppNotificationSettings(context: Context, activity: Activity?): Boolean {
        purgeOnNotificationReceived(context)

        val pkg = context.packageName
        val baseFlags = Intent.FLAG_ACTIVITY_NEW_TASK
        val intents = mutableListOf(
            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                putExtra(Settings.EXTRA_APP_PACKAGE, pkg)
            },
            Intent("android.settings.APP_NOTIFICATION_SETTINGS").apply {
                putExtra("android.provider.extra.APP_PACKAGE", pkg)
                putExtra("app_package", pkg)
                putExtra("app_uid", context.applicationInfo.uid)
            },
            // 华为/鸿蒙 应用通知管理 Activity
            Intent().apply {
                component = ComponentName(
                    "com.huawei.systemmanager",
                    "com.huawei.notificationmanager.ui.NotificationManagerActivity",
                )
                putExtra("packageName", pkg)
                addFlags(baseFlags)
            },
            Intent().apply {
                component = ComponentName(
                    "com.huawei.systemmanager",
                    "com.huawei.notificationmanager.ui.notificationbar.AppNotificationSettingsActivity",
                )
                putExtra("packageName", pkg)
                addFlags(baseFlags)
            },
            Intent().apply {
                component = ComponentName(
                    "com.android.settings",
                    "com.android.settings.Settings\$NotificationAppSettingsActivity",
                )
                putExtra(Settings.EXTRA_APP_PACKAGE, pkg)
                addFlags(baseFlags)
            },
            Intent().apply {
                component = ComponentName(
                    "com.android.settings",
                    "com.android.settings.notification.AppNotificationSettingsActivity",
                )
                putExtra(Settings.EXTRA_APP_PACKAGE, pkg)
                addFlags(baseFlags)
            },
        )

        for (intent in intents) {
            if (tryStartSettings(context, activity, intent)) {
                return true
            }
        }
        return false
    }
}
