package com.optibot.cn

import android.app.Activity
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.core.app.NotificationCompat
import com.mattermost.helpers.CustomPushNotificationHelper
import java.util.Locale

/**
 * 系统通知渠道：与微信一致仅保留「新消息通知」「其他通知」两项（无渠道分组）。
 * 新消息渠道 ID 与 [CustomPushNotificationHelper.CHANNEL_JPUSH_NEW_MESSAGE_ID] 一致。
 */
object MessageNotificationChannel {

    const val CHANNEL_NAME = "新消息通知"
    const val OTHER_CHANNEL_NAME = "其他通知"
    private const val PRIME_NOTIFICATION_ID = 0x4F50544E // "OPTN"
    private const val PREFS_NAME = "optibot_notification_channel"
    private const val PREF_PRIMED_SUFFIX = "_primed"
    private const val PREF_LEGACY_IDS_CLEANED = "legacy_channel_ids_cleaned_v1"
    /** JPush SDK 自动创建的渠道组 ID（显示为应用名分组） */
    private const val JPUSH_CHANNEL_GROUP_ID = "JIGUANG_CHANNEL_GROUP"
    private const val PREF_NON_WHITELISTED_PURGED = "non_whitelisted_purged_v1"
    /** API 30+ [Settings.EXTRA_CHANNEL_NAME]，用字面量以兼容较低 compileSdk */
    private const val EXTRA_CHANNEL_NAME = "android.provider.extra.CHANNEL_NAME"

    /** 与微信一致：其他类通知用 DEFAULT，避免 MIN 在华为/鸿蒙列表里排在 HIGH 之前 */
    private fun otherChannelImportance(): Int = NotificationManager.IMPORTANCE_DEFAULT

    private val LEGACY_CHANNEL_IDS = listOf(
        "jpush_new_message",
        "jpush_new_message_v2",
        "jpush_new_message_v3",
        "jpush_new_message_v4",
        "channel_01",
        "SHARE_CHANNEL",
        "calls_channel",
    )

    private val ALLOWED_CHANNEL_IDS = setOf(
        CustomPushNotificationHelper.CHANNEL_JPUSH_NEW_MESSAGE_ID,
        CustomPushNotificationHelper.CHANNEL_MIN_IMPORTANCE_ID,
    )

    /** 华为/鸿蒙上需 HIGH 才有「横幅通知」；创建后不可再编程降级。 */
    private fun messageChannelImportance(): Int = NotificationManager.IMPORTANCE_HIGH

    private fun importanceLabel(importance: Int): String = when (importance) {
        NotificationManager.IMPORTANCE_NONE -> "NONE"
        NotificationManager.IMPORTANCE_MIN -> "MIN"
        NotificationManager.IMPORTANCE_LOW -> "LOW"
        NotificationManager.IMPORTANCE_DEFAULT -> "DEFAULT"
        NotificationManager.IMPORTANCE_HIGH -> "HIGH"
        NotificationManager.IMPORTANCE_MAX -> "MAX"
        NotificationManager.IMPORTANCE_UNSPECIFIED -> "UNSPECIFIED"
        else -> "UNKNOWN($importance)"
    }

    private fun logChannelsSnapshot(notificationManager: NotificationManager, phase: String) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return
        }
        val channels = notificationManager.notificationChannels.sortedBy { it.id }
        JiguangOptibotLog.d(
            "MessageNotificationChannel.logChannelsSnapshot phase=$phase count=${channels.size}",
        )
        for (channel in channels) {
            JiguangOptibotLog.d(
                "MessageNotificationChannel.logChannelsSnapshot " +
                    "id=${channel.id} name=${channel.name} " +
                    "importance=${importanceLabel(channel.importance)} group=${channel.group}",
            )
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val groups = notificationManager.notificationChannelGroups
            if (groups.isNotEmpty()) {
                JiguangOptibotLog.d(
                    "MessageNotificationChannel.logChannelsSnapshot phase=$phase channelGroups=" +
                        groups.joinToString { it.id },
                )
            }
        }
    }

    /**
     * 确保仅存在「新消息通知」「其他通知」两个渠道（先创建新消息，再创建其他）。
     * 不再批量 deleteNotificationChannel，避免华为/鸿蒙出现「已删除 N 个类别」。
     */
    @JvmStatic
    fun ensureAppNotificationChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            JiguangOptibotLog.d(
                "MessageNotificationChannel.ensureAppNotificationChannels skipped SDK=${Build.VERSION.SDK_INT}",
            )
            return
        }
        val notificationManager =
            context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        JiguangOptibotLog.i(
            "MessageNotificationChannel.ensureAppNotificationChannels start pkg=${context.packageName}",
        )
        logChannelsSnapshot(notificationManager, "before")
        deleteLegacyChannelIdsOnce(context, notificationManager)
        ensureCreated(context)
        ensureOtherChannelCreated(notificationManager)
        logChannelsSnapshot(notificationManager, "after")
        JiguangOptibotLog.i("MessageNotificationChannel.ensureAppNotificationChannels done")
    }

    /** @deprecated 使用 [ensureAppNotificationChannels] */
    @JvmStatic
    fun syncAppNotificationChannels(context: Context) {
        ensureAppNotificationChannels(context)
    }

    @JvmStatic
    fun ensureCreated(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            JiguangOptibotLog.d("MessageNotificationChannel.ensureCreated skipped SDK=${Build.VERSION.SDK_INT}")
            return
        }

        val notificationManager =
            context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        val channelId = CustomPushNotificationHelper.CHANNEL_JPUSH_NEW_MESSAGE_ID
        val existing = notificationManager.getNotificationChannel(channelId)
        if (existing != null && existing.importance >= messageChannelImportance()) {
            JiguangOptibotLog.i(
                "MessageNotificationChannel.ensureCreated reuse channel=$channelId importance=${existing.importance}",
            )
            return
        }

        if (existing != null) {
            JiguangOptibotLog.w(
                "MessageNotificationChannel.ensureCreated recreate channel=$channelId " +
                    "importance=${existing.importance} below HIGH",
            )
            notificationManager.deleteNotificationChannel(channelId)
        }

        val channel = NotificationChannel(channelId, CHANNEL_NAME, messageChannelImportance())
        channel.description = CHANNEL_NAME
        channel.setShowBadge(true)
        channel.enableVibration(true)
        channel.enableLights(true)
        channel.lockscreenVisibility = Notification.VISIBILITY_PUBLIC

        val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        val audioAttributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        channel.setSound(soundUri, audioAttributes)

        notificationManager.createNotificationChannel(channel)
        JiguangOptibotLog.i(
            "MessageNotificationChannel.ensureCreated channel=$channelId name=$CHANNEL_NAME importance=HIGH",
        )
    }

    private fun ensureOtherChannelCreated(notificationManager: NotificationManager) {
        val channelId = CustomPushNotificationHelper.CHANNEL_MIN_IMPORTANCE_ID
        val targetImportance = otherChannelImportance()
        val existing = notificationManager.getNotificationChannel(channelId)
        if (existing != null) {
            JiguangOptibotLog.d(
                "MessageNotificationChannel.ensureOtherChannelCreated reuse channel=$channelId " +
                    "importance=${importanceLabel(existing.importance)}",
            )
        }
        val channel = NotificationChannel(channelId, OTHER_CHANNEL_NAME, targetImportance)
        channel.description = OTHER_CHANNEL_NAME
        channel.setShowBadge(true)
        channel.enableVibration(false)
        channel.setSound(null, null)
        notificationManager.createNotificationChannel(channel)
        val after = notificationManager.getNotificationChannel(channelId)
        JiguangOptibotLog.i(
            "MessageNotificationChannel.ensureOtherChannelCreated channel=$channelId name=$OTHER_CHANNEL_NAME " +
                "targetImportance=${importanceLabel(targetImportance)} " +
                "actualImportance=${after?.let { importanceLabel(it.importance) } ?: "missing"}",
        )
    }

    /** 仅首次安装/升级时删除历史渠道 ID，之后不再 delete，避免「已删除 N 个类别」。 */
    private fun deleteLegacyChannelIdsOnce(context: Context, notificationManager: NotificationManager) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        if (prefs.getBoolean(PREF_LEGACY_IDS_CLEANED, false)) {
            JiguangOptibotLog.d("MessageNotificationChannel.deleteLegacyChannelIdsOnce already cleaned, skip")
            return
        }
        JiguangOptibotLog.i(
            "MessageNotificationChannel.deleteLegacyChannelIdsOnce start count=${LEGACY_CHANNEL_IDS.size}",
        )
        for (legacyId in LEGACY_CHANNEL_IDS) {
            val hadChannel = notificationManager.getNotificationChannel(legacyId) != null
            notificationManager.deleteNotificationChannel(legacyId)
            JiguangOptibotLog.d(
                "MessageNotificationChannel.deleteLegacyChannelIdsOnce id=$legacyId existed=$hadChannel",
            )
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            for (group in notificationManager.notificationChannelGroups) {
                JiguangOptibotLog.d(
                    "MessageNotificationChannel.deleteLegacyChannelIdsOnce deleteGroup id=${group.id}",
                )
                notificationManager.deleteNotificationChannelGroup(group.id)
            }
        }
        prefs.edit().putBoolean(PREF_LEGACY_IDS_CLEANED, true).apply()
        JiguangOptibotLog.i("MessageNotificationChannel.deleteLegacyChannelIdsOnce done")
    }

    /**
     * JPush.init() 之后会创建 [JPUSH_CHANNEL_GROUP_ID]、KG_channel_normal（普通/不重要）等渠道。
     * 须在 JS [syncNotificationChannels] 中、JPush 初始化完成后调用，一次性移除非白名单渠道与分组。
     */
    @JvmStatic
    fun purgeNonWhitelistedChannelsOnce(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            JiguangOptibotLog.d(
                "MessageNotificationChannel.purgeNonWhitelistedChannelsOnce skipped SDK=${Build.VERSION.SDK_INT}",
            )
            return
        }
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        if (prefs.getBoolean(PREF_NON_WHITELISTED_PURGED, false)) {
            JiguangOptibotLog.d(
                "MessageNotificationChannel.purgeNonWhitelistedChannelsOnce already purged, skip",
            )
            return
        }
        val notificationManager =
            context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        JiguangOptibotLog.i("MessageNotificationChannel.purgeNonWhitelistedChannelsOnce start")
        logChannelsSnapshot(notificationManager, "purge-before")
        for (channel in notificationManager.notificationChannels) {
            if (channel.id in ALLOWED_CHANNEL_IDS) {
                continue
            }
            JiguangOptibotLog.i(
                "MessageNotificationChannel.purgeNonWhitelistedChannelsOnce deleteChannel " +
                    "id=${channel.id} name=${channel.name} " +
                    "importance=${importanceLabel(channel.importance)} group=${channel.group}",
            )
            notificationManager.deleteNotificationChannel(channel.id)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            for (group in notificationManager.notificationChannelGroups) {
                val isJpushGroup = group.id == JPUSH_CHANNEL_GROUP_ID
                JiguangOptibotLog.i(
                    "MessageNotificationChannel.purgeNonWhitelistedChannelsOnce deleteGroup " +
                        "id=${group.id} isJpushGroup=$isJpushGroup",
                )
                notificationManager.deleteNotificationChannelGroup(group.id)
            }
        }
        logChannelsSnapshot(notificationManager, "purge-after")
        prefs.edit().putBoolean(PREF_NON_WHITELISTED_PURGED, true).apply()
        JiguangOptibotLog.i("MessageNotificationChannel.purgeNonWhitelistedChannelsOnce done")
    }

    /**
     * 收到推送后仅清理 HMS「社交通讯」类渠道，不触碰已启用的两个主渠道。
     */
    @JvmStatic
    fun purgeOnNotificationReceived(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return
        }
        try {
            JiguangOptibotLog.d("MessageNotificationChannel.purgeOnNotificationReceived")
            val notificationManager =
                context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            purgeHuaweiSocialChannels(notificationManager)
        } catch (e: Exception) {
            JiguangOptibotLog.e("MessageNotificationChannel.purgeOnNotificationReceived failed", e)
        }
    }

    /** 删除 HMS 自动创建的「社交通讯」等低优先级渠道（不含白名单渠道）。 */
    private fun purgeHuaweiSocialChannels(notificationManager: NotificationManager) {
        val total = notificationManager.notificationChannels.size
        JiguangOptibotLog.d(
            "MessageNotificationChannel.purgeHuaweiSocialChannels scan count=$total",
        )
        for (channel in notificationManager.notificationChannels) {
            if (channel.id in ALLOWED_CHANNEL_IDS) {
                continue
            }
            val name = channel.name?.toString() ?: ""
            if (name == CHANNEL_NAME || name == OTHER_CHANNEL_NAME) {
                continue
            }
            val shouldDelete = name.contains("社交通讯") || name.contains("社交") ||
                name.contains("社交通信") || name.contains("通信") ||
                name.equals("social", ignoreCase = true) ||
                name.contains("social_communication", ignoreCase = true) ||
                channel.id.contains("social", ignoreCase = true) ||
                channel.id.contains("huawei", ignoreCase = true)
            if (shouldDelete) {
                notificationManager.deleteNotificationChannel(channel.id)
                JiguangOptibotLog.d(
                    "MessageNotificationChannel.purgeHuaweiSocialChannels deleted channel=${channel.id} name=$name",
                )
            }
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
            JiguangOptibotLog.d("MessageNotificationChannel.primeIfNeeded already primed channel=$channelId")
            return
        }

        val notificationManager =
            context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channel = notificationManager.getNotificationChannel(channelId) ?: run {
            JiguangOptibotLog.w("MessageNotificationChannel.primeIfNeeded channel missing id=$channelId")
            return
        }
        if (channel.importance < messageChannelImportance()) {
            JiguangOptibotLog.w(
                "MessageNotificationChannel.primeIfNeeded skip importance=${channel.importance} channel=$channelId",
            )
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
            JiguangOptibotLog.i("MessageNotificationChannel.primeIfNeeded success channel=$channelId")
        } catch (e: Exception) {
            JiguangOptibotLog.e("MessageNotificationChannel.primeIfNeeded failed channel=$channelId", e)
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
                JiguangOptibotLog.d(
                    "MessageNotificationChannel.resolveMessageChannelId canonical=$canonicalId " +
                        "importance=${importanceLabel(channel.importance)}",
                )
                return canonicalId
            }
            JiguangOptibotLog.w(
                "MessageNotificationChannel.resolveMessageChannelId canonical=$canonicalId " +
                    "importance too low=${importanceLabel(channel.importance)}",
            )
        }

        for (channel in notificationManager.notificationChannels) {
            if (channel.name?.toString() == CHANNEL_NAME &&
                channel.importance >= messageChannelImportance()
            ) {
                JiguangOptibotLog.d(
                    "MessageNotificationChannel.resolveMessageChannelId matchedByName id=${channel.id}",
                )
                return channel.id
            }
        }

        JiguangOptibotLog.w(
            "MessageNotificationChannel.resolveMessageChannelId fallback=$canonicalId",
        )
        return canonicalId
    }

    /** 打开应用通知总览（与微信一致，展示「新消息通知」「其他通知」列表）。 */
    @JvmStatic
    fun openAppNotificationSettings(context: Context, activity: Activity? = null): Boolean {
        JiguangOptibotLog.i(
            "MessageNotificationChannel.openAppNotificationSettings start " +
                "pkg=${context.packageName} hasActivity=${activity != null}",
        )
        ensureAppNotificationChannels(context)
        primeIfNeeded(context)

        val opened = openAppNotificationSettingsIntents(context, activity)
        JiguangOptibotLog.i(
            "MessageNotificationChannel.openAppNotificationSettings result=$opened",
        )
        return opened
    }

    @JvmStatic
    fun isHuaweiLikeDevice(): Boolean {
        val manufacturer = Build.MANUFACTURER.lowercase(Locale.getDefault())
        return manufacturer.contains("huawei") ||
            manufacturer.contains("honor") ||
            manufacturer.contains("hinova")
    }

    private fun isGenericChannelIntent(intent: Intent): Boolean {
        return intent.component == null
    }

    private fun channelIntentExtras(pkg: String, channelId: String): Bundle =
        Bundle().apply {
            putString(Settings.EXTRA_APP_PACKAGE, pkg)
            putString(Settings.EXTRA_CHANNEL_ID, channelId)
            putString("android.provider.extra.APP_PACKAGE", pkg)
            putString("android.provider.extra.CHANNEL_ID", channelId)
            putString("app_package", pkg)
            putString("channel_id", channelId)
            putString("packageName", pkg)
            putString("package", pkg)
            putString("channelId", channelId)
            putString("channel", channelId)
            putString("channelName", CHANNEL_NAME)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                putString(EXTRA_CHANNEL_NAME, CHANNEL_NAME)
            }
        }

    private fun explicitChannelIntent(
        settingsPackage: String,
        activityClass: String,
        pkg: String,
        channelId: String,
        baseFlags: Int,
    ): Intent = Intent().apply {
        component = ComponentName(settingsPackage, activityClass)
        putExtras(channelIntentExtras(pkg, channelId))
        addFlags(baseFlags)
    }

    /** 显式 Activity：可直达渠道详情（横幅/锁屏/响铃） */
    private fun buildPreferredChannelSettingsIntents(context: Context, channelId: String): List<Intent> {
        val pkg = context.packageName
        val baseFlags = Intent.FLAG_ACTIVITY_NEW_TASK
        val intents = mutableListOf<Intent>()

        val huaweiChannelActivities = listOf(
            "com.huawei.notificationmanager.ui.notificationbar.AppNotificationChannelSettingsActivity",
            "com.huawei.notificationmanager.ui.notificationbar.AppNotificationDetailSettingsActivity",
            "com.huawei.notificationmanager.ui.notificationsettings.NotificationChannelActivity",
            "com.huawei.notificationmanager.ui.notificationbar.NotificationChannelSettingsActivity",
        )
        for (activityClass in huaweiChannelActivities) {
            intents.add(explicitChannelIntent("com.huawei.systemmanager", activityClass, pkg, channelId, baseFlags))
        }

        val settingsPackages = listOf("com.android.settings", "com.huawei.android.settings")
        val aospChannelActivities = listOf(
            "com.android.settings.notification.app.ChannelNotificationSettings",
            "com.android.settings.Settings\$ChannelNotificationSettingsActivity",
            "com.android.settings.notification.app.NotificationChannelSettings",
        )
        for (settingsPackage in settingsPackages) {
            for (activityClass in aospChannelActivities) {
                intents.add(explicitChannelIntent(settingsPackage, activityClass, pkg, channelId, baseFlags))
            }
        }

        // AOSP SubSettings 片段（部分 ROM 仅注册此入口）
        intents.add(
            Intent().apply {
                component = ComponentName("com.android.settings", "com.android.settings.SubSettings")
                putExtra(":settings:show_fragment", "NotificationChannelSettings")
                putExtra(":settings:show_fragment_args", channelIntentExtras(pkg, channelId))
                putExtras(channelIntentExtras(pkg, channelId))
                addFlags(baseFlags)
            },
        )

        return intents
    }

    /**
     * 隐式 ACTION：在华为/鸿蒙上常「启动成功」却落到「应用通知」总览，仅作非华为设备的兜底。
     */
    private fun buildGenericChannelSettingsIntents(context: Context, channelId: String): List<Intent> {
        val pkg = context.packageName
        val baseFlags = Intent.FLAG_ACTIVITY_NEW_TASK
        val intents = mutableListOf<Intent>()

        intents.add(
            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                putExtras(channelIntentExtras(pkg, channelId))
                addFlags(baseFlags)
            },
        )
        intents.add(
            Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS).apply {
                putExtras(channelIntentExtras(pkg, channelId))
                addFlags(baseFlags)
            },
        )
        intents.add(
            Intent("android.settings.CHANNEL_NOTIFICATION_SETTINGS").apply {
                putExtras(channelIntentExtras(pkg, channelId))
                addFlags(baseFlags)
            },
        )

        val canonicalId = CustomPushNotificationHelper.CHANNEL_JPUSH_NEW_MESSAGE_ID
        if (channelId != canonicalId) {
            intents.add(
                Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS).apply {
                    putExtras(channelIntentExtras(pkg, canonicalId))
                    addFlags(baseFlags)
                },
            )
        }

        return intents
    }

    /** 打开「新消息通知」渠道设置页（横幅、锁屏、响铃、声音）；失败时不回退应用通知总览。 */
    @JvmStatic
    fun openChannelSettings(context: Context, activity: Activity? = null): Boolean {
        JiguangOptibotLog.i(
            "MessageNotificationChannel.openChannelSettings start " +
                "pkg=${context.packageName} hasActivity=${activity != null}",
        )
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            JiguangOptibotLog.d(
                "MessageNotificationChannel.openChannelSettings fallback SDK=${Build.VERSION.SDK_INT}",
            )
            return openAppNotificationSettings(context, activity)
        }

        ensureAppNotificationChannels(context)
        primeIfNeeded(context)

        val channelId = resolveMessageChannelId(context)
        JiguangOptibotLog.i(
            "MessageNotificationChannel.openChannelSettings channelId=$channelId name=$CHANNEL_NAME",
        )

        val preferred = buildPreferredChannelSettingsIntents(context, channelId)
        for ((index, intent) in preferred.withIndex()) {
            val label = intentLabel(intent, index)
            if (tryStartSettings(context, activity, intent, label)) {
                JiguangOptibotLog.i(
                    "MessageNotificationChannel.openChannelSettings opened preferred $label",
                )
                return true
            }
            JiguangOptibotLog.d(
                "MessageNotificationChannel.openChannelSettings try next preferred $label",
            )
        }

        val huaweiLike = isHuaweiLikeDevice()
        if (huaweiLike) {
            JiguangOptibotLog.w(
                "MessageNotificationChannel.openChannelSettings skip generic intents on Huawei-like device " +
                    "channelId=$channelId manufacturer=${Build.MANUFACTURER}",
            )
            return false
        }

        val generic = buildGenericChannelSettingsIntents(context, channelId)
        for ((index, intent) in generic.withIndex()) {
            val label = intentLabel(intent, index + preferred.size)
            if (!isGenericChannelIntent(intent)) {
                continue
            }
            if (tryStartSettings(context, activity, intent, label)) {
                JiguangOptibotLog.i(
                    "MessageNotificationChannel.openChannelSettings opened generic $label",
                )
                return true
            }
            JiguangOptibotLog.d(
                "MessageNotificationChannel.openChannelSettings try next generic $label",
            )
        }

        JiguangOptibotLog.w(
            "MessageNotificationChannel.openChannelSettings all channel intents failed channelId=$channelId",
        )
        return false
    }

    private fun intentLabel(intent: Intent, index: Int): String {
        val action = intent.action ?: "no-action"
        val component = intent.component?.flattenToShortString() ?: "no-component"
        return "#$index action=$action component=$component"
    }

    private fun tryStartSettings(
        context: Context,
        activity: Activity?,
        intent: Intent,
        label: String,
    ): Boolean {
        val host = activity ?: context
        if (intent.resolveActivity(host.packageManager) == null) {
            JiguangOptibotLog.d(
                "MessageNotificationChannel.tryStartSettings no resolver label=$label",
            )
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
        } catch (e: Exception) {
            JiguangOptibotLog.w(
                "MessageNotificationChannel.tryStartSettings failed label=$label error=${e.message}",
            )
            false
        }
    }

    private fun openAppNotificationSettingsIntents(context: Context, activity: Activity?): Boolean {
        val pkg = context.packageName
        val baseFlags = Intent.FLAG_ACTIVITY_NEW_TASK
        JiguangOptibotLog.d(
            "MessageNotificationChannel.openAppNotificationSettingsIntents pkg=$pkg " +
                "hasActivity=${activity != null}",
        )
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

        for ((index, intent) in intents.withIndex()) {
            val label = intentLabel(intent, index)
            if (tryStartSettings(context, activity, intent, label)) {
                JiguangOptibotLog.i(
                    "MessageNotificationChannel.openAppNotificationSettingsIntents opened $label",
                )
                return true
            }
            JiguangOptibotLog.d(
                "MessageNotificationChannel.openAppNotificationSettingsIntents try next $label",
            )
        }
        JiguangOptibotLog.w(
            "MessageNotificationChannel.openAppNotificationSettingsIntents all failed pkg=$pkg",
        )
        return false
    }
}
