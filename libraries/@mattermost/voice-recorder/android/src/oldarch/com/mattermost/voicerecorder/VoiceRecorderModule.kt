package com.mattermost.voicerecorder

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap

class VoiceRecorderModule(context: ReactApplicationContext) :
    ReactContextBaseJavaModule(context) {
    private var implementation: VoiceRecorderModuleImpl = VoiceRecorderModuleImpl(context)

    override fun getName(): String = VoiceRecorderModuleImpl.NAME

    override fun getConstants(): MutableMap<String, Any> = implementation.getTypedExportedConstants()

    @ReactMethod
    fun addListener(eventType: String?) {
    }

    @ReactMethod
    fun removeListeners(count: Double) {
    }

    /**
     * 开始录音
     * @param options - 录音配置选项对象
     * @param promise - Promise 回调
     */
    @ReactMethod
    fun startRecording(options: ReadableMap?, promise: Promise) {
        implementation.startRecording(options, promise)
    }

    @ReactMethod
    fun stopRecording(promise: Promise) {
        implementation.stopRecording(promise)
    }

    @ReactMethod
    fun cancelRecording(promise: Promise) {
        implementation.cancelRecording(promise)
    }

    /**
     * 删除指定的录音文件
     * @param filePath - 要删除的文件路径
     * @param promise - Promise 回调
     */
    @ReactMethod
    fun deleteRecordingFile(filePath: String, promise: Promise) {
        implementation.deleteRecordingFile(filePath, promise)
    }

    /**
     * 清理指定前缀的过期临时录音文件
     * @param prefix - 文件前缀
     * @param maxAgeMs - 文件最大保留时间（毫秒）
     * @param promise - Promise 回调
     */
    @ReactMethod
    fun cleanExpiredRecordingFiles(prefix: String, maxAgeMs: Double, promise: Promise) {
        implementation.cleanExpiredRecordingFiles(prefix, maxAgeMs, promise)
    }
}
