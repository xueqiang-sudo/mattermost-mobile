package com.mattermost.helpers;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;

import androidx.core.app.NotificationManagerCompat;

/**
 * 通知渠道辅助类：创建应用内基本的通知渠道（JPush 新消息通知 + 其他通知）。
 * 通知展示已由 JPush SDK 接管，本类仅负责渠道创建。
 */
public class CustomPushNotificationHelper {
    public static final String CHANNEL_HIGH_IMPORTANCE_ID = "channel_01";
    public static final String CHANNEL_MIN_IMPORTANCE_ID = "channel_02";
    /** JPush 新消息通知渠道（与 OptibotJPushNotificationBuilder 中配置一致） */
    public static final String CHANNEL_JPUSH_NEW_MESSAGE_ID = "jpush_new_message_v5";

    private static NotificationChannel mHighImportanceChannel;
    private static NotificationChannel mMinImportanceChannel;

    /** 创建基本的通知渠道（HIGH 和 MIN 两个渠道） */
    public static void createNotificationChannels(Context context) {
        // Notification channels are not supported in Android Nougat and below
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        final NotificationManagerCompat notificationManager = NotificationManagerCompat.from(context);

        // 创建 HIGH 重要性渠道（新消息通知，支持横幅/锁屏/响铃）
        if (mHighImportanceChannel == null) {
            NotificationChannel existingChannel = notificationManager.getNotificationChannel(CHANNEL_JPUSH_NEW_MESSAGE_ID);
            if (existingChannel != null) {
                mHighImportanceChannel = existingChannel;
            } else {
                NotificationChannel channel = new NotificationChannel(
                    CHANNEL_JPUSH_NEW_MESSAGE_ID,
                    "新消息通知",
                    NotificationManager.IMPORTANCE_HIGH
                );
                channel.setDescription("新消息通知");
                channel.setShowBadge(true);
                channel.enableVibration(true);
                channel.enableLights(true);
                channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                notificationManager.createNotificationChannel(channel);
                mHighImportanceChannel = channel;
            }
        }

        // 创建 MIN 重要性渠道（其他通知）
        if (mMinImportanceChannel == null) {
            NotificationChannel existingChannel = notificationManager.getNotificationChannel(CHANNEL_MIN_IMPORTANCE_ID);
            if (existingChannel != null) {
                mMinImportanceChannel = existingChannel;
            } else {
                NotificationChannel channel = new NotificationChannel(
                    CHANNEL_MIN_IMPORTANCE_ID,
                    "其他通知",
                    NotificationManager.IMPORTANCE_DEFAULT
                );
                channel.setDescription("其他通知");
                channel.setShowBadge(true);
                channel.enableVibration(false);
                channel.setSound(null, null);
                notificationManager.createNotificationChannel(channel);
                mMinImportanceChannel = channel;
            }
        }
    }
}