package com.mattermost.voicerecorder

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = VoiceRecorderModuleImpl.NAME)
class VoiceRecorderModule(context: ReactApplicationContext) :
    NativeVoiceRecorderSpec(context) {
    private var implementation: VoiceRecorderModuleImpl = VoiceRecorderModuleImpl(context)

    override fun getName(): String = VoiceRecorderModuleImpl.NAME

    override fun getTypedExportedConstants(): MutableMap<String, Any> = implementation.getTypedExportedConstants()

    override fun addListener(eventType: String?) {
    }

    override fun removeListeners(count: Double) {
    }

    /**
     * 开始录音
     * @param options - 录音配置选项对象
     * @param promise - Promise 回调
     */
    override fun startRecording(options: ReadableMap?, promise: Promise) {
        implementation.startRecording(options, promise)
    }

    override fun stopRecording(promise: Promise) {
        implementation.stopRecording(promise)
    }

    override fun cancelRecording(promise: Promise) {
        implementation.cancelRecording(promise)
    }

    /**
     * 删除指定的录音文件
     * @param filePath - 要删除的文件路径
     * @param promise - Promise 回调
     */
    override fun deleteRecordingFile(filePath: String, promise: Promise) {
        implementation.deleteRecordingFile(filePath, promise)
    }

    /**
     * 清理指定前缀的过期临时录音文件
     * @param prefix - 文件前缀
     * @param maxAgeMs - 文件最大保留时间（毫秒）
     * @param promise - Promise 回调
     */
    override fun cleanExpiredRecordingFiles(prefix: String, maxAgeMs: Double, promise: Promise) {
        implementation.cleanExpiredRecordingFiles(prefix, maxAgeMs, promise)
    }
}
