package com.optibot.cn

import android.os.Process.myPid
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.BufferedReader
import java.io.InputStreamReader
import java.util.concurrent.atomic.AtomicBoolean

class LogcatBridgeModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext), LifecycleEventListener {

    companion object {
        private const val EVENT_LINE = "LogcatBridge.line"
    }

    private val running = AtomicBoolean(false)
    private var process: java.lang.Process? = null
    private var worker: Thread? = null
    private val filterKeywords: List<String> by lazy {
        BuildConfig.LOGCAT_FILTER_KEYWORDS
            .split(",")
            .map { it.trim() }
            .filter { it.isNotEmpty() }
    }

    init {
        reactContext.addLifecycleEventListener(this)
    }

    override fun getName(): String = "LogcatBridge"

    @ReactMethod
    fun start(promise: Promise) {
        if (running.get()) {
            promise.resolve(true)
            return
        }

        try {
            running.set(true)
            worker = Thread {
                runLogcatReader()
            }.apply {
                name = "LogcatBridgeReader"
                start()
            }
            promise.resolve(true)
        } catch (e: Exception) {
            running.set(false)
            promise.reject("LOGCAT_START_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun stop(promise: Promise) {
        stopInternal()
        promise.resolve(true)
    }

    // Required by NativeEventEmitter contract
    @ReactMethod
    fun addListener(eventName: String) {
        // no-op
    }

    // Required by NativeEventEmitter contract
    @ReactMethod
    fun removeListeners(count: Int) {
        // no-op
    }

    private fun runLogcatReader() {
        try {
            val pid = myPid().toString()
            process = ProcessBuilder(
                "logcat",
                "-v",
                "time",
                "--pid=$pid",
                "*:V",
            ).redirectErrorStream(true).start()

            BufferedReader(InputStreamReader(process?.inputStream)).use { reader ->
                while (running.get()) {
                    val line = reader.readLine() ?: break
                    if (shouldEmitLine(line)) {
                        emitLine(line)
                    }
                }
            }
        } catch (e: Exception) {
            emitLine("LogcatBridge error: ${e.message ?: "unknown error"}")
        } finally {
            stopInternal()
        }
    }

    private fun shouldEmitLine(line: String): Boolean {
        if (filterKeywords.isEmpty()) {
            return true
        }

        return filterKeywords.any { keyword ->
            line.contains(keyword, ignoreCase = true)
        }
    }

    private fun emitLine(line: String) {
        if (!reactContext.hasActiveReactInstance()) {
            return
        }

        val payload = Arguments.createMap().apply {
            putString("line", line)
            putDouble("timestamp", System.currentTimeMillis().toDouble())
        }

        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(EVENT_LINE, payload)
    }

    private fun stopInternal() {
        running.set(false)
        try {
            process?.destroy()
        } catch (_: Exception) {
            // no-op
        } finally {
            process = null
        }

        try {
            worker?.interrupt()
        } catch (_: Exception) {
            // no-op
        } finally {
            worker = null
        }
    }

    override fun onHostResume() = Unit

    override fun onHostPause() = Unit

    override fun onHostDestroy() {
        stopInternal()
    }
}
