package com.optibot.cn

import android.util.Log
import com.mattermost.turbolog.TurboLog

/**
 * 极光推送（JPush）调试日志，Logcat 过滤 tag: JIGUANG_OPTIBOT。
 */
object JiguangOptibotLog {
    private const val LOG_TAG = "JIGUANG_OPTIBOT"
    private const val PREFIX = "[JIGUANG_OPTIBOT]"

    @JvmStatic
    fun d(message: String) {
        Log.d(LOG_TAG, format(message))
    }

    @JvmStatic
    fun i(message: String) {
        val msg = format(message)
        Log.i(LOG_TAG, msg)
        TurboLog.i(LOG_TAG, msg)
    }

    @JvmStatic
    fun w(message: String) {
        val msg = format(message)
        Log.w(LOG_TAG, msg)
        TurboLog.i(LOG_TAG, msg)
    }

    @JvmStatic
    fun e(message: String, throwable: Throwable? = null) {
        val msg = if (throwable != null) {
            format("$message | ${throwable.message}")
        } else {
            format(message)
        }
        Log.e(LOG_TAG, msg, throwable)
        TurboLog.e(LOG_TAG, msg)
    }

    private fun format(message: String): String = "$PREFIX $message"
}
