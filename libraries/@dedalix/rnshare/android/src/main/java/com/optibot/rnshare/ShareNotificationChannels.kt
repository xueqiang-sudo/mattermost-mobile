package com.optibot.cnshare

/**
 * 与主工程 [com.mattermost.helpers.CustomPushNotificationHelper.CHANNEL_MIN_IMPORTANCE_ID] 保持一致。
 * rnshare 为独立 library 模块，不可依赖 app 内类，故在此重复渠道 ID。
 */
object ShareNotificationChannels {
    const val OTHER_NOTIFICATION_CHANNEL_ID = "channel_02"
}
