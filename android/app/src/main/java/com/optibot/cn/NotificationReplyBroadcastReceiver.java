package com.optibot.cn;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.RemoteInput;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;

import com.mattermost.helpers.*;
import com.wix.reactnativenotifications.core.NotificationIntentAdapter;
import com.wix.reactnativenotifications.core.notification.PushNotificationProps;

public class NotificationReplyBroadcastReceiver extends BroadcastReceiver {
    private Context mContext;
    private Bundle bundle;
    private NotificationManager notificationManager;

    @Override
    public void onReceive(Context context, Intent intent) {
        MessageNotificationChannel.purgeOnNotificationReceived(context);
        try {
            final CharSequence message = getReplyMessage(intent);
            if (message == null) {
                JiguangOptibotLog.i("NotificationReply.onReceive empty reply message, skip");
                return;
            }

            mContext = context;
            bundle = intent.getBundleExtra(CustomPushNotificationHelper.NOTIFICATION);
            notificationManager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);

            final int notificationId = intent.getIntExtra(CustomPushNotificationHelper.NOTIFICATION_ID, -1);
            final String serverUrl = bundle != null ? bundle.getString("server_url") : null;
            final String channelId = bundle != null ? bundle.getString("channel_id") : null;
            JiguangOptibotLog.i(String.format(
                    "NotificationReply.onReceive notificationId=%d channelId=%s serverUrlPresent=%s replyLen=%d",
                    notificationId,
                    channelId,
                    serverUrl != null,
                    message.length()
            ));
            Network.init(context);
            if (serverUrl != null) {
                    replyToMessage(serverUrl, notificationId, message);
            } else {
                JiguangOptibotLog.w("NotificationReply.onReceive missing server_url");
                onReplyFailed(notificationId);
            }
        } catch (Exception e) {
            JiguangOptibotLog.e("NotificationReply.onReceive failed", e);
        }
    }

    protected void replyToMessage(final String serverUrl, final int notificationId, final CharSequence message) {
        final String channelId = bundle.getString("channel_id");
        final String postId = bundle.getString("post_id");
        String rootId = bundle.getString("root_id");
        if (android.text.TextUtils.isEmpty(rootId)) {
            rootId = postId;
        }

        if (serverUrl == null) {
            onReplyFailed(notificationId);
            return;
        }

        JiguangOptibotLog.i(String.format(
                "NotificationReply.replyToMessage channelId=%s postId=%s rootId=%s",
                channelId,
                postId,
                rootId
        ));

        WritableMap headers = Arguments.createMap();
        headers.putString("Content-Type", "application/json");

        WritableMap body = Arguments.createMap();
        body.putString("channel_id", channelId);
        body.putString("message", message.toString());
        body.putString("root_id", rootId);

        WritableMap options = Arguments.createMap();
        options.putMap("headers", headers);
        options.putMap("body", body);

        String postsEndpoint = "/api/v4/posts?set_online=false";
        Network.post(serverUrl, postsEndpoint, options, new ResolvePromise() {
            private boolean isSuccessful(int statusCode) {
                return statusCode >= 200 && statusCode < 300;
            }
            @Override
            public void resolve(@Nullable Object value) {
                if (value != null) {
                    ReadableMap response = (ReadableMap)value;
                    ReadableMap data = response.getMap("data");
                    if (data != null && data.hasKey("status_code") && !isSuccessful(data.getInt("status_code"))) {
                        JiguangOptibotLog.w(String.format(
                                "NotificationReply.reply FAILED status=%s message=%s",
                                data.getInt("status_code"),
                                data.getString("message")
                        ));
                        onReplyFailed(notificationId);
                        return;
                    }
                    onReplySuccess(notificationId, message);
                    JiguangOptibotLog.i("NotificationReply.reply SUCCESS");
                } else {
                    JiguangOptibotLog.w("NotificationReply.reply FAILED resolved without value");
                    onReplyFailed(notificationId);
                }
            }

            @Override
            public void reject(@NonNull Throwable reason) {
                JiguangOptibotLog.e(String.format(
                        "NotificationReply.reply FAILED exception %s",
                        reason.getMessage()
                ), reason);
                onReplyFailed(notificationId);
            }

            @Override
            public void reject(@NonNull String code, String message) {
                JiguangOptibotLog.w(String.format(
                        "NotificationReply.reply FAILED status %s BODY %s",
                        code,
                        message
                ));
                onReplyFailed(notificationId);
            }
        });
    }

    protected void onReplyFailed(int notificationId) {
        JiguangOptibotLog.i("NotificationReply.onReplyFailed notificationId=" + notificationId);
        recreateNotification(notificationId, "Message failed to send.");
    }

    protected void onReplySuccess(int notificationId, final CharSequence message) {
        JiguangOptibotLog.i("NotificationReply.onReplySuccess notificationId=" + notificationId);
        recreateNotification(notificationId, message);
    }

    private void recreateNotification(int notificationId, final CharSequence message) {
        final PushNotificationProps notificationProps = new PushNotificationProps(bundle);
        final PendingIntent pendingIntent = NotificationIntentAdapter.createPendingNotificationIntent(mContext, notificationProps);
        bundle.putString("message", message.toString());
        NotificationCompat.Builder builder = CustomPushNotificationHelper.createLatestOnlyNotificationBuilder(mContext, pendingIntent, bundle);
        Notification notification = builder.build();
        JiguangOptibotLog.i(String.format(
                "NotificationReply.recreateNotification incomingId=%d fixedId=%d message=%s",
                notificationId,
                CustomPushNotificationHelper.FIXED_LATEST_MESSAGE_NOTIFICATION_ID,
                message
        ));
        notificationManager.notify(CustomPushNotificationHelper.FIXED_LATEST_MESSAGE_NOTIFICATION_ID, notification);
    }

    private CharSequence getReplyMessage(Intent intent) {
        Bundle remoteInput = RemoteInput.getResultsFromIntent(intent);
        if (remoteInput != null) {
            return remoteInput.getCharSequence(CustomPushNotificationHelper.KEY_TEXT_REPLY);
        }
        return null;
    }
}
