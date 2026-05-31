package com.optibot.cn

import android.app.PendingIntent
import android.content.Context
import android.os.Bundle
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.mattermost.helpers.CustomPushNotificationHelper
import com.mattermost.helpers.DatabaseHelper
import com.mattermost.helpers.Network
import com.mattermost.helpers.PushNotificationDataHelper
import com.mattermost.helpers.database_extension.getServerUrlForIdentifier
import com.optibot.cnutils.helpers.NotificationHelper
import com.wix.reactnativenotifications.Defs.NOTIFICATION_RECEIVED_EVENT_NAME
import com.wix.reactnativenotifications.core.AppLaunchHelper
import com.wix.reactnativenotifications.core.AppLifecycleFacade
import com.wix.reactnativenotifications.core.JsIOHelper
import com.wix.reactnativenotifications.core.NotificationIntentAdapter
import com.wix.reactnativenotifications.core.notification.PushNotification
import kotlinx.coroutines.DelicateCoroutinesApi
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch

class CustomPushNotification(
        context: Context,
        bundle: Bundle,
        appLifecycleFacade: AppLifecycleFacade,
        appLaunchHelper: AppLaunchHelper,
        jsIoHelper: JsIOHelper
) : PushNotification(context, bundle, appLifecycleFacade, appLaunchHelper, jsIoHelper) {
    private val dataHelper = PushNotificationDataHelper(context)

    companion object {
        private val FIXED_LATEST_MESSAGE_NOTIFICATION_ID = CustomPushNotificationHelper.FIXED_LATEST_MESSAGE_NOTIFICATION_ID
    }

    init {
        try {
            DatabaseHelper.instance?.init(context)
            NotificationHelper.cleanNotificationPreferencesIfNeeded(context)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    @OptIn(DelicateCoroutinesApi::class)
    override fun onReceived() {
        JiguangOptibotLog.i("CustomPushNotification.onReceived enter")
        MessageNotificationChannel.purgeOnNotificationReceived(mContext)

        val initialData = mNotificationProps.asBundle()
        val type = initialData.getString("type")
        val ackId = initialData.getString("ack_id")
        val postId = initialData.getString("post_id")
        val channelId = initialData.getString("channel_id")
        val signature = initialData.getString("signature")
        val isIdLoaded = initialData.getString("id_loaded") == "true"
        val notificationId = NotificationHelper.getNotificationId(initialData)
        val serverUrl = addServerUrlToBundle(initialData)
        JiguangOptibotLog.i(
            "CustomPushNotification.onReceived type=$type channelId=$channelId postId=$postId " +
                "ackId=$ackId isIdLoaded=$isIdLoaded notificationId=$notificationId " +
                "serverUrlPresent=${!serverUrl.isNullOrEmpty()} signaturePresent=${!signature.isNullOrEmpty()}",
        )
        Network.init(mContext)

        GlobalScope.launch {
            try {
                handlePushNotificationInCoroutine(serverUrl, type, channelId, ackId, isIdLoaded, notificationId, postId, signature)
            } catch (e: Exception) {
                JiguangOptibotLog.e("CustomPushNotification.onReceived coroutine failed", e)
            }
        }
    }

    private suspend fun handlePushNotificationInCoroutine(
            serverUrl: String?,
            type: String?,
            channelId: String?,
            ackId: String?,
            isIdLoaded: Boolean,
            notificationId: Int,
            postId: String?,
            signature: String?
    ) {
        if (ackId != null && serverUrl != null) {
            val response = ReceiptDelivery.send(ackId, serverUrl, postId, type, isIdLoaded)
            if (isIdLoaded && response != null) {
                val current = mNotificationProps.asBundle()
                if (!current.containsKey("server_url")) {
                    response.putString("server_url", serverUrl)
                }
                current.putAll(response)
                mNotificationProps = createProps(current)
            }
        }

        if (!CustomPushNotificationHelper.verifySignature(mContext, signature, serverUrl, ackId)) {
            JiguangOptibotLog.w("CustomPushNotification signature verification failed, skip notification")
            return
        }

        JiguangOptibotLog.i("CustomPushNotification signature verified, finishProcessing")
        finishProcessingNotification(serverUrl, type, channelId, notificationId)
    }

    override fun onOpened() {
        JiguangOptibotLog.i("CustomPushNotification.onOpened")
        mNotificationProps?.let {
            digestNotification()
            NotificationHelper.clearChannelOrThreadNotifications(mContext, it.asBundle())
        }
    }

    private suspend fun finishProcessingNotification(serverUrl: String?, type: String?, channelId: String?, notificationId: Int) {
        val isReactInit = mAppLifecycleFacade.isReactInitialized()
        val isAppVisible = mAppLifecycleFacade.isAppVisible()
        JiguangOptibotLog.i(
            "finishProcessingNotification type=$type channelId=$channelId notificationId=$notificationId " +
                "isReactInit=$isReactInit isAppVisible=$isAppVisible",
        )

        when (type) {
            CustomPushNotificationHelper.PUSH_TYPE_MESSAGE, CustomPushNotificationHelper.PUSH_TYPE_SESSION -> {
                val currentActivityName = mAppLifecycleFacade.runningReactContext?.currentActivity?.componentName?.className ?: ""
                val shouldShowNotification = !isAppVisible || !currentActivityName.contains("MainActivity")
                JiguangOptibotLog.i(
                    "finishProcessingNotification message/session currentActivity=$currentActivityName " +
                        "shouldShowNotification=$shouldShowNotification",
                )
                if (shouldShowNotification) {
                    if (type == CustomPushNotificationHelper.PUSH_TYPE_MESSAGE) {
                        channelId?.let {
                            val notificationBundle = mNotificationProps.asBundle()
                            serverUrl?.let {
                                val notificationResult = dataHelper.fetchAndStoreDataForPushNotification(notificationBundle, isReactInit)
                                notificationResult?.let { result ->
                                    notificationBundle.putBundle("data", result)
                                    mNotificationProps = createProps(notificationBundle)
                                    JiguangOptibotLog.d("finishProcessingNotification enriched notification data from local DB")
                                }
                            }
                        }
                    }
                    buildLatestOnlyNotification()
                } else {
                    JiguangOptibotLog.i("finishProcessingNotification skip local notification, app in foreground MainActivity")
                }
            }
            CustomPushNotificationHelper.PUSH_TYPE_CLEAR -> {
                JiguangOptibotLog.i("finishProcessingNotification clear notifications for channel/thread")
                NotificationHelper.clearChannelOrThreadNotifications(mContext, mNotificationProps.asBundle())
            }
        }

        if (isReactInit) {
            JiguangOptibotLog.d("finishProcessingNotification notifyReceivedToJS")
            notifyReceivedToJS()
        }
    }

    private fun buildLatestOnlyNotification() {
        val bundle = mNotificationProps.asBundle()
        JiguangOptibotLog.i(
            "buildLatestOnlyNotification title=${bundle.getString("title")} " +
                "message=${bundle.getString("message")} fixedId=$FIXED_LATEST_MESSAGE_NOTIFICATION_ID",
        )
        val pendingIntent = NotificationIntentAdapter.createPendingNotificationIntent(mContext, mNotificationProps)
        val notification = CustomPushNotificationHelper.createLatestOnlyNotificationBuilder(
            mContext,
            pendingIntent,
            bundle,
        ).build()
        NotificationManagerCompat.from(mContext).cancel(FIXED_LATEST_MESSAGE_NOTIFICATION_ID)
        JiguangOptibotLog.i("buildLatestOnlyNotification cancel then post fixedId=$FIXED_LATEST_MESSAGE_NOTIFICATION_ID")
        super.postNotification(notification, FIXED_LATEST_MESSAGE_NOTIFICATION_ID)
    }

    override fun getNotificationBuilder(intent: PendingIntent): NotificationCompat.Builder {
        val bundle = mNotificationProps.asBundle()
        return CustomPushNotificationHelper.createLatestOnlyNotificationBuilder(mContext, intent, bundle)
    }

    private fun notifyReceivedToJS() {
        mJsIOHelper.sendEventToJS(NOTIFICATION_RECEIVED_EVENT_NAME, mNotificationProps.asBundle(), mAppLifecycleFacade.runningReactContext)
    }

    private fun addServerUrlToBundle(bundle: Bundle): String? {
        val dbHelper = DatabaseHelper.instance
        val serverId = bundle.getString("server_id")
        var serverUrl: String? = null

        dbHelper?.let {
            serverUrl = if (serverId == null) {
                it.onlyServerUrl
            } else {
                it.getServerUrlForIdentifier(serverId)
            }

            if (!serverUrl.isNullOrEmpty()) {
                bundle.putString("server_url", serverUrl)
                mNotificationProps = createProps(bundle)
            }
        }
        return serverUrl
    }
}
